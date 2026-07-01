
-- Extend handle_new_user to also grant superadmin to the fixed owner email.
-- Everything the existing trigger did stays exactly the same; we just append
-- one conditional insert into user_roles at the end.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Fixed superadmin grant. Email is only compared here at signup; RLS never reads it.
  if lower(new.email) = 'lukeinco@gmail.com' then
    insert into public.user_roles (user_id, role)
    values (new.id, 'superadmin')
    on conflict do nothing;
  end if;

  return new;
end;
$function$;

-- Backfill: if the account already exists, grant it now.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'superadmin'::public.app_role
FROM auth.users u
WHERE lower(u.email) = 'lukeinco@gmail.com'
ON CONFLICT DO NOTHING;
