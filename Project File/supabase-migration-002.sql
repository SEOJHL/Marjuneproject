-- Migration 002 — add client/project and time tracking to tasks.
-- Safe to run multiple times. Run in Supabase SQL Editor.

alter table public.tasks add column if not exists client_project text;
alter table public.tasks add column if not exists start_time    timestamptz;
alter table public.tasks add column if not exists end_time      timestamptz;
