-- Migration 003 — store user email on profiles so we can send notifications.
-- Safe to run multiple times.

alter table public.profiles add column if not exists email text;

-- Backfill from auth.users for accounts that existed before this migration.
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- Replace the new-user trigger to also copy email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'client'),
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.email
  );
  return new;
end;
$$;
