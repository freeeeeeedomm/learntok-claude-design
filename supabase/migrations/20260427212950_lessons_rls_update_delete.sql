-- 20260427212950_lessons_rls_update_delete.sql
-- Add UPDATE and DELETE row-level security policies on public.lessons.
--
-- The original schema (0003_rls.sql) only granted SELECT and INSERT on
-- lessons because no UI flow needed to mutate them — preset lessons were
-- read-only and user-created lessons were inserted via /add. After the
-- library-personalize work (PR-D), users own lectures inside owner-owned
-- courses and need to rename / delete / reorder them. Without these
-- policies, those writes are silently denied by RLS even though the
-- caller owns the parent course.
--
-- The check matches lessons_insert_own's shape: the caller must own the
-- parent course (via courses.owner_id = auth.uid()).

create policy "lessons_update_own" on public.lessons
  for update using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and c.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.courses c
      where c.id = course_id and c.owner_id = auth.uid()
    )
  );

create policy "lessons_delete_own" on public.lessons
  for delete using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and c.owner_id = auth.uid()
    )
  );
