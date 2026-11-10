-- Existing-project update for consultant accounts.
-- Run the enum command by itself first and confirm it. Then run the consultant policy.
alter type public.app_role add value if not exists 'consultant';

create policy "Consultants insert their own action reports"
on public.action_reports for insert to authenticated
with check (
  supervisor_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.role = 'consultant'
  )
);

-- Public app registrations always receive the consultant role. Roles are never
-- accepted from browser input. Admin and supervisor invitation flows keep
-- creating profiles through the existing server-side function.
create or replace function public.create_public_consultant_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id text;
  v_full_name text;
begin
  if (new.raw_user_meta_data ->> 'signup_source') is distinct from 'public_app' then
    return new;
  end if;

  v_team_id := new.raw_user_meta_data ->> 'team_id';
  v_full_name := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');

  if v_full_name is null or not exists (select 1 from public.teams t where t.id = v_team_id) then
    raise exception 'Cadastro público inválido';
  end if;

  insert into public.profiles (user_id, full_name, role, team_id)
  values (new.id, v_full_name, 'consultant', v_team_id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_public_consultant_signup on auth.users;
create trigger on_public_consultant_signup
after insert on auth.users
for each row execute function public.create_public_consultant_profile();
