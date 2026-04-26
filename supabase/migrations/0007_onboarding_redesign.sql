-- 0007_onboarding_redesign.sql
-- (1) User's "shelf": references to courses they're following.
--     Preset courses are NOT cloned — multiple users reference the same row.
-- (2) Widen profiles.rate to allow the new ratio range (5/learnMinutes, min ~0.083).

create table if not exists public.profile_courses (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  position  integer not null default 0,
  added_at  timestamptz not null default now(),
  primary key (user_id, course_id)
);

create index if not exists profile_courses_user_position_idx
  on public.profile_courses (user_id, position);

alter table public.profile_courses enable row level security;

create policy profile_courses_read_own on public.profile_courses
  for select using (user_id = auth.uid());

create policy profile_courses_insert_own on public.profile_courses
  for insert with check (user_id = auth.uid());

-- update policy exists to support upsert(on_conflict='user_id,course_id') in
-- the completeOnboarding server action; no direct UPDATE callers today.
create policy profile_courses_update_own on public.profile_courses
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy profile_courses_delete_own on public.profile_courses
  for delete using (user_id = auth.uid());

-- Widen rate precision (was numeric(3,1) — only 1 decimal).
alter table public.profiles
  alter column rate type numeric(5,3) using rate::numeric(5,3);
