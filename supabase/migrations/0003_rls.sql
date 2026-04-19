-- 0003_rls.sql
-- Row-level security policies

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.sessions enable row level security;

-- Profiles: user can read/update their own row
create policy "profiles_self_read" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id);

-- Courses: user sees own + presets; user can insert their own
create policy "courses_read" on public.courses
  for select using (owner_id = auth.uid() or is_preset = true);
create policy "courses_insert_own" on public.courses
  for insert with check (owner_id = auth.uid() and is_preset = false);
create policy "courses_update_own" on public.courses
  for update using (owner_id = auth.uid());
create policy "courses_delete_own" on public.courses
  for delete using (owner_id = auth.uid());

-- Lessons: readable if parent course is readable
create policy "lessons_read" on public.lessons
  for select using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and (c.owner_id = auth.uid() or c.is_preset = true)
    )
  );
create policy "lessons_insert_own" on public.lessons
  for insert with check (
    exists (select 1 from public.courses c where c.id = course_id and c.owner_id = auth.uid())
  );

-- Lesson progress: only your own
create policy "progress_own" on public.lesson_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Ledger: read-only for user; writes are server-side (service role bypasses RLS)
create policy "ledger_self_read" on public.ledger_entries
  for select using (user_id = auth.uid());
-- no client-side insert/update/delete policy on purpose

-- Sessions: user can see own; inserts/updates via server routes
create policy "sessions_self_read" on public.sessions
  for select using (user_id = auth.uid());
