-- Migration 004 — Clockify-style projects.
-- Adds a `projects` table, links tasks via `project_id`, and migrates existing
-- `client_project` text values into projects so historical data isn't lost.
-- Safe to run multiple times.

create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text not null default '#6366f1',
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists projects_creator_idx on public.projects(created_by);

-- One project name per creator (case-insensitive). Prevents duplicates from
-- the auto-save flow.
create unique index if not exists projects_creator_name_idx
  on public.projects(created_by, lower(name));

alter table public.projects enable row level security;

drop policy if exists "projects readable by authenticated" on public.projects;
create policy "projects readable by authenticated"
  on public.projects for select
  to authenticated using (true);

drop policy if exists "projects insertable by authenticated" on public.projects;
create policy "projects insertable by authenticated"
  on public.projects for insert
  to authenticated with check (created_by = auth.uid());

drop policy if exists "creator updates projects" on public.projects;
create policy "creator updates projects"
  on public.projects for update
  to authenticated using (created_by = auth.uid());

drop policy if exists "creator deletes projects" on public.projects;
create policy "creator deletes projects"
  on public.projects for delete
  to authenticated using (created_by = auth.uid());

-- Link tasks to projects.
alter table public.tasks add column if not exists project_id uuid
  references public.projects(id) on delete set null;

-- Backfill: for each unique (creator, client_project text) pair, create a project.
insert into public.projects (name, color, created_by)
select distinct
  trim(t.client_project),
  '#6366f1',
  t.created_by
from public.tasks t
where t.client_project is not null
  and trim(t.client_project) <> ''
  and t.project_id is null
on conflict (created_by, lower(name)) do nothing;

-- Link tasks to the newly-created (or pre-existing) projects.
update public.tasks t
set project_id = p.id
from public.projects p
where t.project_id is null
  and t.client_project is not null
  and trim(t.client_project) <> ''
  and p.created_by = t.created_by
  and lower(p.name) = lower(trim(t.client_project));

-- Add projects to realtime publication (ignore if already added).
do $$
begin
  begin
    alter publication supabase_realtime add table public.projects;
  exception when duplicate_object then null;
  end;
end$$;
