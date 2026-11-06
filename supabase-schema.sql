-- Confiauto Territórios Serra: shared accounts and field action reports.
-- Run in Supabase SQL Editor after creating a project.

create type public.app_role as enum ('admin', 'supervisor', 'consultant');

create table public.teams (
  id text primary key,
  name text not null,
  color text not null,
  created_at timestamptz not null default now()
);

insert into public.teams (id, name, color) values
  ('team-blue', 'Xtreme', '#2563eb'),
  ('team-green', 'Jato', '#e11d48'),
  ('team-orange', 'Bravos', '#059669'),
  ('team-caveira', 'Caveira', '#7c3aed'),
  ('team-alta-performance', 'Alta Performance', '#ea580c')
on conflict (id) do update set name = excluded.name, color = excluded.color;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'supervisor',
  team_id text references public.teams(id) on delete set null,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.action_reports (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references public.profiles(user_id) on delete cascade,
  area_id text not null,
  area_name text not null,
  action_date date not null,
  consultants text[] not null default '{}',
  observation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supervisor_id, area_id, action_date)
);

create index action_reports_area_date_idx on public.action_reports (area_id, action_date desc);
create index action_reports_supervisor_date_idx on public.action_reports (supervisor_id, action_date desc);

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;


alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.action_reports enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, avatar_path, updated_at) on public.profiles to authenticated;
-- Only admins can change roles or team assignments through Supabase SQL Editor.
grant select on public.teams to authenticated;
grant insert, update, delete on public.teams to authenticated;
grant select, insert, update, delete on public.action_reports to authenticated;

create policy "Signed in users can view sales teams"
on public.teams for select to authenticated
using (true);

create policy "Admins manage sales teams"
on public.teams for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "Users can view own profile and admins can view all profiles"
on public.profiles for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "Users update their own profile or admins update any profile"
on public.profiles for update to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()))
with check (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "Admins see all reports; supervisors see their own"
on public.action_reports for select to authenticated
using (supervisor_id = (select auth.uid()) or (select public.is_admin()));

create policy "Supervisors insert their own action reports"
on public.action_reports for insert to authenticated
with check (
  supervisor_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.role in ('supervisor', 'consultant'))
);

create policy "Owners or admins update action reports"
on public.action_reports for update to authenticated
using (supervisor_id = (select auth.uid()) or (select public.is_admin()))
with check (supervisor_id = (select auth.uid()) or (select public.is_admin()));

create policy "Owners or admins delete action reports"
on public.action_reports for delete to authenticated
using (supervisor_id = (select auth.uid()) or (select public.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "Authenticated users upload their profile photo"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Authenticated users update their profile photo"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Admins delete any profile photo; users delete their own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
);

create policy "Signed in users can view profile photos"
on storage.objects for select to authenticated
using (bucket_id = 'profile-photos');

-- Accounts are invite-only. Create the initial admin in Supabase Auth,
-- then set that user's UUID as admin in the Table Editor before inviting supervisors.

-- Enable live dashboard updates for report inserts and edits.
alter publication supabase_realtime add table public.action_reports;
