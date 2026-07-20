-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Phase A: adds the profiles table + role, does NOT change data access.
-- The database stays fully open until you separately run
-- supabase_lock_down_rls.sql — do that only after confirming login works.

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'accountant' check (role in ('admin', 'accountant')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles_select_authenticated" on profiles
  for select using (auth.uid() is not null);

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-create a profile row (default role: accountant) whenever a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'accountant');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- After creating your first account (Supabase Dashboard → Authentication →
-- Users → Add User), promote yourself to admin:
--
-- update profiles set role = 'admin' where user_id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
