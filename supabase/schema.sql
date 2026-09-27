-- Apply this once in the Supabase SQL editor.
-- The API uses the service role key, which bypasses row level security.
-- The anon key is not used by the app.

create extension if not exists pgcrypto;

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  employee_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists face_templates (
  staff_id uuid primary key references staff(id) on delete cascade,
  embedding jsonb not null,
  image_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  marked_at timestamptz not null default now(),
  selfie_path text not null,
  latitude double precision not null,
  longitude double precision not null,
  similarity double precision not null
);

create index if not exists attendance_staff_marked_idx
  on attendance (staff_id, marked_at desc);

alter table staff enable row level security;
alter table face_templates enable row level security;
alter table attendance enable row level security;

insert into storage.buckets (id, name, public)
values
  ('enrollments', 'enrollments', false),
  ('attendance-selfies', 'attendance-selfies', false)
on conflict (id) do nothing;
