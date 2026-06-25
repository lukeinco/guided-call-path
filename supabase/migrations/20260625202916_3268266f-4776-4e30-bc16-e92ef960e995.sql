
create or replace function public.gen_join_code()
returns text language sql volatile set search_path = public as $$
  select upper(translate(substr(gen_random_uuid()::text, 1, 8), '-', 'X'));
$$;

revoke execute on function public.gen_join_code() from public, anon, authenticated;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.current_org() from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
