-- Jarhead Lab Task Hub — Supabase schema
-- Run this in the Supabase SQL Editor (one project, one run).

-- ----------------------------------------
-- Profiles: one row per auth.users row.
-- ----------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('client', 'va')),
  name       text not null,
  created_at timestamptz not null default now()
);

-- Auto-create a profile when a user signs up.
-- The signup call must pass `role` and `name` in options.data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'client'),
    coalesce(new.raw_user_meta_data->>'name', new.email)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------
-- Projects (Clockify-style)
-- ----------------------------------------
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text not null default '#6366f1',
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists projects_creator_idx on public.projects(created_by);
create unique index if not exists projects_creator_name_idx
  on public.projects(created_by, lower(name));

alter table public.projects enable row level security;

drop policy if exists "projects readable by authenticated" on public.projects;
create policy "projects readable by authenticated"
  on public.projects for select to authenticated using (true);

drop policy if exists "projects insertable by authenticated" on public.projects;
create policy "projects insertable by authenticated"
  on public.projects for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "creator updates projects" on public.projects;
create policy "creator updates projects"
  on public.projects for update to authenticated using (created_by = auth.uid());

drop policy if exists "creator deletes projects" on public.projects;
create policy "creator deletes projects"
  on public.projects for delete to authenticated using (created_by = auth.uid());

-- ----------------------------------------
-- Tasks
-- ----------------------------------------
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  client_project  text,
  notes           text,
  due             date,
  status          text not null default 'pending' check (status in ('pending', 'in-progress', 'done')),
  start_time      timestamptz,
  end_time        timestamptz,
  assignee_id     uuid references public.profiles(id) on delete set null,
  created_by      uuid not null references public.profiles(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Safe for older databases too: add columns if running on a pre-004 schema.
alter table public.tasks add column if not exists client_project text;
alter table public.tasks add column if not exists start_time    timestamptz;
alter table public.tasks add column if not exists end_time      timestamptz;
alter table public.tasks add column if not exists project_id    uuid references public.projects(id) on delete set null;

create index if not exists tasks_assignee_idx on public.tasks(assignee_id);
create index if not exists tasks_creator_idx  on public.tasks(created_by);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute procedure public.set_updated_at();

-- ----------------------------------------
-- Row Level Security
-- ----------------------------------------
alter table public.profiles enable row level security;
alter table public.tasks    enable row level security;

-- Profiles: any signed-in user can see the directory (so clients can pick VAs).
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select
  to authenticated using (true);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  to authenticated using (id = auth.uid());

-- Tasks: clients see what they created, VAs see what is assigned to them.
drop policy if exists "select own created tasks"  on public.tasks;
create policy "select own created tasks"
  on public.tasks for select
  to authenticated using (created_by = auth.uid());

drop policy if exists "select assigned tasks" on public.tasks;
create policy "select assigned tasks"
  on public.tasks for select
  to authenticated using (assignee_id = auth.uid());

drop policy if exists "client creates tasks"  on public.tasks;
create policy "client creates tasks"
  on public.tasks for insert
  to authenticated with check (created_by = auth.uid());

drop policy if exists "creator updates tasks" on public.tasks;
create policy "creator updates tasks"
  on public.tasks for update
  to authenticated using (created_by = auth.uid());

drop policy if exists "assignee updates tasks" on public.tasks;
create policy "assignee updates tasks"
  on public.tasks for update
  to authenticated using (assignee_id = auth.uid());

drop policy if exists "creator deletes tasks"  on public.tasks;
create policy "creator deletes tasks"
  on public.tasks for delete
  to authenticated using (created_by = auth.uid());

-- ----------------------------------------
-- Realtime: enable so the dashboard can subscribe to task & project changes.
-- ----------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.tasks;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.projects;
  exception when duplicate_object then null;
  end;
end$$;
