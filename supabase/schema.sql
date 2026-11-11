-- One private snapshot per Supabase Auth user. Run in Supabase SQL Editor.
create table if not exists public.learner_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.learner_backups enable row level security;

-- Keep exactly one admin identity in the application allowlist. Create the Auth
-- user in Supabase first, then insert its UUID using the SQL below.
create table if not exists public.backend_atlas_admins (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade
);
alter table public.backend_atlas_admins enable row level security;
revoke all on table public.backend_atlas_admins from anon, authenticated;

create or replace function public.backend_atlas_is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1 from public.backend_atlas_admins
    where singleton = true and user_id = auth.uid()
  )
$$;
revoke all on function public.backend_atlas_is_admin() from public, anon;
grant execute on function public.backend_atlas_is_admin() to authenticated;

drop policy if exists "Users can read their own learner backup" on public.learner_backups;
drop policy if exists "Users can create their own learner backup" on public.learner_backups;
drop policy if exists "Users can update their own learner backup" on public.learner_backups;

create policy "Users can read their own learner backup"
  on public.learner_backups for select to authenticated
  using ((select auth.uid()) = user_id and (select public.backend_atlas_is_admin()));

create policy "Users can create their own learner backup"
  on public.learner_backups for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.backend_atlas_is_admin()));

create policy "Users can update their own learner backup"
  on public.learner_backups for update to authenticated
  using ((select auth.uid()) = user_id and (select public.backend_atlas_is_admin()))
  with check ((select auth.uid()) = user_id and (select public.backend_atlas_is_admin()));

grant select, insert, update on public.learner_backups to authenticated;

-- A minimal read-only API check for the app's Database status page.
create or replace function public.backend_atlas_healthcheck()
returns text
language sql
security invoker
set search_path = public
as $$ select 'ok'::text $$;

grant execute on function public.backend_atlas_healthcheck() to anon, authenticated;

-- Run after creating the single admin user in Supabase Auth. Replace the email.
-- INSERT INTO public.backend_atlas_admins (user_id)
-- SELECT id FROM auth.users WHERE lower(email) = lower('admin@example.com')
-- ON CONFLICT (singleton) DO UPDATE SET user_id = EXCLUDED.user_id;
