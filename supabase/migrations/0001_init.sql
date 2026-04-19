-- 0001_init.sql
-- Base schema for LearnTok

create extension if not exists "pgcrypto";

-- Profiles: one row per auth user
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  interests text[] default '{}',
  rate numeric(3,1) not null default 1.0,         -- min of play per min of learn
  jar_balance_cached int not null default 300,    -- seconds, updated by trigger
  streak int not null default 0,
  last_study_date date,
  nudge_at_seconds int not null default 60,
  show_timer boolean not null default false,
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

-- Courses: either user-owned or a preset visible to all
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade, -- null if preset
  is_preset boolean not null default false,
  title text not null,
  topic text,
  icon text,
  created_at timestamptz not null default now()
);
create index on public.courses (owner_id);
create index on public.courses (is_preset);

-- Lessons: belong to a course
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  position int not null,
  title text not null,
  yt_id text not null,
  duration_seconds int not null,
  created_at timestamptz not null default now()
);
create index on public.lessons (course_id, position);

-- Per-user completion
create table public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);

-- Ledger: single source of truth for jar balance
-- delta_seconds: positive = earned, negative = spent
create table public.ledger_entries (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta_seconds int not null,
  label text not null,                    -- 'lesson', 'feed', 'welcome_gift', 'manual'
  ref_id uuid,                            -- lesson_id or session_id
  created_at timestamptz not null default now()
);
create index on public.ledger_entries (user_id, created_at desc);

-- Sessions: learning or feed sessions (for analytics + idle detection)
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('learn', 'feed')),
  lesson_id uuid references public.lessons(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_heartbeat_at timestamptz not null default now(),
  budget_seconds int,                     -- only for feed sessions
  earned_or_spent_seconds int not null default 0
);
create index on public.sessions (user_id, started_at desc);
