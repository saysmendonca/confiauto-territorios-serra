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
