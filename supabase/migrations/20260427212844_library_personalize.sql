-- 0015_library_personalize.sql
-- Source-of-fork tracing + future-proof video provider + one-shot
-- backfill that converts every existing user's interest-based preset
-- shelf into owner-owned deep copies.

-- 1) Additive columns. No existing rows touched.
alter table public.topics
  add column source_topic_id uuid references public.topics(id) on delete set null;

alter table public.courses
  add column source_course_id uuid references public.courses(id) on delete set null;

alter table public.lessons
  add column source_lesson_id uuid references public.lessons(id) on delete set null;

alter table public.lessons
  add column video_provider text not null default 'youtube';

-- 2) Prevent the same user from forking the same preset topic twice.
--    Discover's per-card CTA reads this to flip between
--    "Add to home" and "Open".
create unique index topics_owner_source_uniq
  on public.topics (owner_id, source_topic_id)
  where source_topic_id is not null;

-- 3) Hard-cutover backfill: for every existing user with non-empty
--    interests, deep-copy each preset topic into owner-owned rows and
--    re-point matching lesson_progress to the new lesson IDs. Idempotent
--    — users with empty interests are skipped, and the unique index above
--    blocks re-imports on re-run.
--
--    profiles.interests stores UUIDs as text (column type text[]), so
--    the unnest result needs an explicit ::uuid cast before comparison.
do $$
declare
  user_rec        record;
  preset_topic_id uuid;
  new_topic_id    uuid;
  preset_course_rec record;
  new_course_id   uuid;
  preset_lesson_rec record;
  new_lesson_id   uuid;
  user_topic_pos  int;
begin
  for user_rec in
    select id, interests from public.profiles
    where interests is not null and array_length(interests, 1) > 0
  loop
    user_topic_pos := 0;

    for preset_topic_id in
      select distinct unnest(user_rec.interests)::uuid
    loop
      -- Defensive: the interest must reference a real preset topic.
      if not exists (
        select 1 from public.topics
        where id = preset_topic_id and is_preset = true
      ) then
        continue;
      end if;

      -- Idempotent skip: already imported.
      if exists (
        select 1 from public.topics
        where owner_id = user_rec.id and source_topic_id = preset_topic_id
      ) then
        continue;
      end if;

      -- Copy the topic.
      insert into public.topics (
        owner_id, is_preset, title, icon, color, position, source_topic_id
      )
      select user_rec.id, false, title, icon, color, user_topic_pos, id
      from public.topics where id = preset_topic_id
      returning id into new_topic_id;

      user_topic_pos := user_topic_pos + 1;

      -- Copy each preset course under this topic.
      for preset_course_rec in
        select id, title, icon, position
        from public.courses
        where topic_id = preset_topic_id and is_preset = true
        order by position
      loop
        insert into public.courses (
          owner_id, topic_id, is_preset, title, icon, position, source_course_id
        ) values (
          user_rec.id, new_topic_id, false,
          preset_course_rec.title, preset_course_rec.icon,
          preset_course_rec.position, preset_course_rec.id
        )
        returning id into new_course_id;

        -- Copy each lesson under this preset course, migrating progress.
        for preset_lesson_rec in
          select id, title, yt_id, duration_seconds, position
          from public.lessons
          where course_id = preset_course_rec.id
          order by position
        loop
          insert into public.lessons (
            course_id, position, title, yt_id, duration_seconds,
            video_provider, source_lesson_id
          ) values (
            new_course_id, preset_lesson_rec.position,
            preset_lesson_rec.title, preset_lesson_rec.yt_id,
            preset_lesson_rec.duration_seconds, 'youtube', preset_lesson_rec.id
          )
          returning id into new_lesson_id;

          -- Re-point this user's progress on the preset lesson to the new
          -- owner-owned lesson. Composite PK (user_id, lesson_id) prevents
          -- collisions because new_lesson_id is unique.
          update public.lesson_progress
          set lesson_id = new_lesson_id
          where user_id = user_rec.id
            and lesson_id = preset_lesson_rec.id;
        end loop;
      end loop;
    end loop;

    -- Wipe the user's interests so re-runs are no-ops and so the new
    -- code doesn't double-render preset topics for legacy users.
    update public.profiles set interests = '{}'::text[] where id = user_rec.id;
  end loop;
end $$;

-- 4) Drop legacy profile_courses rows pointing at preset courses. The new
--    owner-owned course rows are now the source of truth for these users'
--    shelves; profile_courses entries pointing at preset courses are dead
--    references after the backfill above.
delete from public.profile_courses
where course_id in (
  select id from public.courses where is_preset = true
);
