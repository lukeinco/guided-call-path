
-- Enums
create type public.app_role as enum ('admin', 'caller');
create type public.entry_scenario as enum ('gatekeeper', 'direct_contact', 'no_name', 'cell_vs_company');
create type public.event_type as enum ('response_selected', 'off_script');

-- Helpers: random join code
create or replace function public.gen_join_code()
returns text language sql volatile as $$
  select upper(substr(encode(gen_random_bytes(6), 'base32'), 1, 8));
$$;

-- Orgs
create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique default public.gen_join_code(),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.orgs to authenticated;
grant all on public.orgs to service_role;
alter table public.orgs enable row level security;

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
create index profiles_org_id_idx on public.profiles(org_id);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- User roles (separate table, source of truth)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- Security-definer helpers (avoid RLS recursion)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.current_org()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid()
$$;

-- Scripts
create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  version int not null default 1,
  is_active boolean not null default false,
  definition jsonb not null default '{"steps":[]}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, name, version)
);
create index scripts_org_id_idx on public.scripts(org_id);
grant select, insert, update, delete on public.scripts to authenticated;
grant all on public.scripts to service_role;
alter table public.scripts enable row level security;

-- Call runs
create table public.call_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  script_id uuid not null references public.scripts(id) on delete cascade,
  caller_id uuid not null references auth.users(id) on delete cascade,
  scenario public.entry_scenario not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index call_runs_org_id_idx on public.call_runs(org_id);
grant select, insert, update, delete on public.call_runs to authenticated;
grant all on public.call_runs to service_role;
alter table public.call_runs enable row level security;

-- Events (append-only)
create table public.events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.call_runs(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  step_id text not null,
  type public.event_type not null,
  response_label text,
  created_at timestamptz not null default now()
);
create index events_run_id_idx on public.events(run_id);
create index events_org_id_idx on public.events(org_id);
grant select, insert on public.events to authenticated;
grant all on public.events to service_role;
alter table public.events enable row level security;

-- ============ RLS POLICIES ============

-- orgs
create policy "members read own org" on public.orgs
  for select to authenticated using (id = public.current_org());
create policy "admins update own org" on public.orgs
  for update to authenticated using (id = public.current_org() and public.has_role(auth.uid(), 'admin'));

-- profiles
create policy "read same-org profiles" on public.profiles
  for select to authenticated using (org_id = public.current_org());
create policy "insert own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- user_roles
create policy "read own roles or same-org" on public.user_roles
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = user_roles.user_id and p.org_id = public.current_org())
  );

-- scripts
create policy "read same-org scripts" on public.scripts
  for select to authenticated using (org_id = public.current_org());
create policy "admins insert scripts" on public.scripts
  for insert to authenticated with check (org_id = public.current_org() and public.has_role(auth.uid(), 'admin'));
create policy "admins update scripts" on public.scripts
  for update to authenticated using (org_id = public.current_org() and public.has_role(auth.uid(), 'admin'));
create policy "admins delete scripts" on public.scripts
  for delete to authenticated using (org_id = public.current_org() and public.has_role(auth.uid(), 'admin'));

-- call_runs
create policy "read same-org runs" on public.call_runs
  for select to authenticated using (org_id = public.current_org());
create policy "caller inserts own run" on public.call_runs
  for insert to authenticated with check (org_id = public.current_org() and caller_id = auth.uid());
create policy "caller updates own run" on public.call_runs
  for update to authenticated using (caller_id = auth.uid()) with check (caller_id = auth.uid());

-- events
create policy "read same-org events" on public.events
  for select to authenticated using (org_id = public.current_org());
create policy "insert event for own active run" on public.events
  for insert to authenticated with check (
    org_id = public.current_org()
    and exists (select 1 from public.call_runs r where r.id = events.run_id and r.caller_id = auth.uid())
  );

-- ============ SIGNUP TRIGGER ============
-- Minimal: create org (if no join code) or join existing one, then profile + role.
-- Join code is passed via raw_user_meta_data.join_code at signup.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_join_code text := nullif(trim(new.raw_user_meta_data->>'join_code'), '');
  v_display_name text := nullif(trim(new.raw_user_meta_data->>'display_name'), '');
  v_org_id uuid;
  v_role public.app_role;
begin
  if v_join_code is not null then
    select id into v_org_id from public.orgs where join_code = upper(v_join_code);
    if v_org_id is null then
      raise exception 'Invalid join code';
    end if;
    v_role := 'caller';
  else
    insert into public.orgs (name)
    values (coalesce(v_display_name, split_part(new.email, '@', 1)) || '''s org')
    returning id into v_org_id;
    v_role := 'admin';
  end if;

  insert into public.profiles (id, org_id, display_name)
  values (new.id, v_org_id, coalesce(v_display_name, split_part(new.email, '@', 1)));

  insert into public.user_roles (user_id, role) values (new.id, v_role);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
