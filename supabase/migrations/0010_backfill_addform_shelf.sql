-- 0010_backfill_addform_shelf.sql
-- (Originally numbered 0009; bumped to 0010 because PR #20 took 0008 and
--  PR #21 took 0009 while this branch was being prepared.)
-- One-time backfill: any user-created course (`is_preset = false`,
-- `owner_id is not null`) that has no corresponding `profile_courses`
-- row gets one inserted at position 0. Idempotent — safe to re-run.
--
-- Closes the deferred "/add writes shelf" item from PR #19's spec.
-- Existing courses created via /add before this fix were orphaned (created
-- the course + lesson but never added to shelf, so home didn't render them).

insert into public.profile_courses (user_id, course_id, position)
select c.owner_id, c.id, 0
from public.courses c
where c.owner_id is not null
  and c.is_preset = false
  and not exists (
    select 1 from public.profile_courses pc
    where pc.user_id = c.owner_id and pc.course_id = c.id
  )
on conflict do nothing;
