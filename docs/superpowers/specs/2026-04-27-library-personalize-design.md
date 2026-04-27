# Library Personalize Design

**Status:** Approved (brainstorm complete 2026-04-27)
**Author flow:** brainstorm → spec → plan (next)

## Goal

Let users own their `Home` shelf end-to-end: create topics / courses / lectures from scratch, fork preset content from Discover with a single action, and rename / reorder / delete anything they own. The admin-curated preset library remains a read-only catalog browsed via Discover.

## Mental Model

Four levels, owner-on-add:

```
field   →  topic   →  course   →  lecture
(group)    (shelf      (curriculum  (single video,
            card)       inside       e.g. YouTube)
                        topic)
```

- **field** is *only* used by Discover to group preset topics into sections (e.g. "Math & Science", "Languages"). It is never shown in user-facing flows. User-created topics have `group_id = null`.
- Every other level is owned: a row is either preset (`is_preset = true, owner_id = null`) or user-owned (`is_preset = false, owner_id = user`). Once a user "adds" preset content to their shelf, that content is **deep-copied** into user-owned rows. From that point forward the user has full edit ownership.

This means the preset library and user shelves are fully decoupled: admins can rename, restructure, or delete preset rows without disturbing any user data; users can edit anything on their shelf without RLS gymnastics, because every row they touch has `owner_id = self`.

## Naming

Codebase keeps current names — `topic_groups`, `topics`, `courses`, `lessons`. Conceptually we call them field / topic / course / lecture. No table renames in this work; rename can be a separate cosmetic PR later if it ever feels worthwhile.

## Schema Changes

One migration, additive only:

```sql
-- Source-of-fork tracing for deep-copies. NULL on rows the user authored
-- from scratch; non-null when the row was forked from a preset.
alter table public.topics
  add column source_topic_id uuid references public.topics(id) on delete set null;
alter table public.courses
  add column source_course_id uuid references public.courses(id) on delete set null;
alter table public.lessons
  add column source_lesson_id uuid references public.lessons(id) on delete set null;

-- Future-proof video provider. Defaults to youtube so existing rows stay valid.
alter table public.lessons
  add column video_provider text not null default 'youtube';

-- Prevent the same user from forking the same preset topic twice.
-- Discover uses this to switch the CTA between "Add to home" and "Open".
create unique index topics_owner_source_uniq
  on public.topics (owner_id, source_topic_id)
  where source_topic_id is not null;
```

No RLS changes needed. Existing policies (`*_read`, `*_insert_own`, `*_update_own`, `*_delete_own`) already cover everything because every action runs against owner-owned rows.

`profile_courses` is **not** dropped in this work. It still gets written on shelf-add for backward compatibility with the current Home query path. A follow-up cleanup PR can remove it once nothing reads it. (Querying `courses where owner_id = user order by position` is the long-term shape.)

## Unified UI Pattern

Three CRUD pages share the exact same structure. The only thing that varies is which entity each level operates on.

| Page | Top-bar buttons | Per-item ⋯ menu |
|---|---|---|
| `/home` (topic shelf) | **Add topic**, **Organize** | Rename, Delete |
| `/topic/[id]` (course list) | **Add course**, **Organize** | Rename, Delete |
| `/course/[id]` (lecture list) | **Add lecture**, **Organize** | Rename, Delete |

`/discover` stays focused on browsing preset topics. Each preset topic card has a single CTA:
- **Add to home** if not yet imported
- **Open** if already imported (links to the user-owned topic page)

No three-dot menu on Discover cards — there's only one action per state.

## Behaviors

### Create new topic
Modal: title (1–40 chars), optional icon (Lucide picker), optional color (palette swatch).
Server: `insert into topics(owner_id=user, is_preset=false, group_id=null, position=max+1, ...)`.

### Add to home (Discover preset topic)
Server: deep-copy the entire subtree.
1. Insert new `topics` row, `owner_id=user`, `source_topic_id=preset.id`, copy title/icon/color.
2. For each preset course under that topic: insert new `courses` row with `source_course_id=preset_course.id`, copy title/icon.
3. For each preset lesson under each course: insert new `lessons` row with `source_lesson_id=preset_lesson.id`, copy title/yt_id/duration_seconds, set `video_provider='youtube'`.
4. All in one transaction. The unique index makes step 1 fail loudly if the user already imported this topic, which is the right behavior (UI should already show "Open" instead of "Add to home").

### Create empty course
Modal: title only (1–60 chars).
Server: `insert into courses(owner_id=user, topic_id, is_preset=false, position=max+1, title, icon=null)`.
Render: when `icon is null`, course tile shows a gray background with the uppercase first letter of the title centered. No image.

### Add lecture(s)
Modal: textarea accepts up to 50 lines. Each line is a YouTube URL — either a video URL or a playlist URL.
Server `addLectures(courseId, urls)`:
1. Validate `courseId` owner = user.
2. Parse each URL with a single regex pass:
   - Video URL → resolve to `videoId`.
   - Playlist URL → resolve to `playlistId`, expand via `playlistItems.list` (paginated, hard cap 50 items per playlist).
3. De-duplicate `videoId`s within the batch.
4. Single `videos.list` call for the union of all videoIds → fetch title + duration_seconds.
5. Bulk insert into `lessons`, position = `max(position)+1, +2, +3...`, in submission order, `video_provider='youtube'`.

The total number of resulting lectures is also capped at 50 per submission (so a 50-item playlist or 50 individual URLs both work, but a 50-item playlist + 5 URLs would be rejected with a clear error).

### Rename
Inline modal with a text input pre-filled with the current name.
Limits: topic 1–40, course 1–60, lecture 1–120.

### Delete
Confirm dialog with cascade preview:
> Delete "Math"? This will also remove 3 courses, 47 lectures, and your progress on them. This cannot be undone.

The counts are computed server-side at the moment the dialog is opened (small query) so the user sees the actual blast radius. `ledger_entries` is not touched (jar balance survives).

### Organize (toggle mode)
Click the **Organize** button on any of the three pages → the list enters edit mode:
- Each item shows a drag handle on the left.
- Each item shows an inline trash button on the right (still requires the same delete confirmation).
- The button label flips to **Done**; clicking it exits edit mode.

Drag library: `@dnd-kit/sortable`. Pointer-event-based, Capacitor-ready (per `CLAUDE.md`).

Reorder commit strategy: when the user finishes a drag, the entire list's positions are rewritten as a contiguous `0..N` sequence in a single batch update. Lists are small enough (typically <50) that dense renumbering is simpler than sparse positions.

## Server Actions

All in `app/library/actions.ts`, `'use server'`, using `createClient()` (user token, RLS enforces ownership). Every action ends with `revalidatePath` for the affected route.

```ts
// Topic
createTopic({ title, icon?, color? }) -> { id }
renameTopic({ topicId, newTitle })
deleteTopic({ topicId })                              // cascades courses + lectures + progress
reorderTopics({ orderedIds })
importPresetTopic({ presetTopicId }) -> { topicId }   // deep-copy 3 levels

// Course
createCourse({ topicId, title }) -> { id }            // empty
renameCourse({ courseId, newTitle })
deleteCourse({ courseId })                            // cascades lectures + progress
reorderCourses({ topicId, orderedIds })

// Lecture
addLectures({ courseId, urls: string[] }) -> { ids: string[] }
renameLecture({ lectureId, newTitle })
deleteLecture({ lectureId })
reorderLectures({ courseId, orderedIds })
```

Eleven actions total. Each is straightforward — a Zod schema, an ownership check, the write, a revalidate.

YouTube API helpers live in `lib/youtube/` (or wherever the existing key-using code lives) and are shared between `addLectures` and `importPresetTopic` (the latter doesn't actually need YouTube — it just copies existing rows, but the helper might find use elsewhere).

## PR Decomposition

Five PRs, A is a hard prerequisite, B/C/D/E are independent after A:

1. **PR-A — Schema + addLectures helper**
   - The migration above (one file).
   - `lib/youtube/` resolver helpers: `parseYouTubeUrl(url)` returning `{ kind: 'video'|'playlist', id }`, plus `fetchVideoMeta(ids)` and `expandPlaylist(playlistId)` thin wrappers over the YouTube Data API.
   - The `addLectures` server action (it's needed by D, but the helper is general so it fits here).
   - Tests for URL parsing and the resolver wrappers (mocked YT responses).

2. **PR-B — Topic CRUD + Home redesign**
   - `createTopic` / `renameTopic` / `deleteTopic` / `reorderTopics`.
   - Home page: replace the "Browse" button next to "your topics" with **Add topic** + **Organize**.
   - Per-topic ⋯ menu with Rename / Delete.
   - Organize-mode toggle with `@dnd-kit/sortable`.

3. **PR-C — Course CRUD + Topic detail redesign**
   - `createCourse` / `renameCourse` / `deleteCourse` / `reorderCourses`.
   - Topic detail page: drop the "Add course → Discover" link; replace with local **Add course** modal (title only).
   - Empty-course tile renders gray + first letter.

4. **PR-D — Lecture CRUD + Course detail redesign**
   - `renameLecture` / `deleteLecture` / `reorderLectures` (plus `addLectures` from PR-A wired to UI).
   - Course detail page: **Add lecture** modal with textarea, **Organize** toggle.

5. **PR-E — Discover three-dot replacement + import**
   - `importPresetTopic` server action.
   - Each preset topic card on Discover gets a single CTA whose label depends on whether `topics where owner_id=user and source_topic_id=card.id` exists: **Add to home** vs **Open**.

After A is merged, the rest can be parallelized. They all touch different files; no merge conflicts expected.

## Open Items / Deferred

- **Re-import upstream changes**: when admin updates a preset topic that some users have already forked, those users' copies don't see the change. We have the `source_*_id` link to surface "Upstream has 3 new lectures — import them?" later, but no UI for it in this work.
- **Multi-source video providers**: `video_provider` column is in place, but only `'youtube'` is wired. B站 / Vimeo / etc. are future PRs that add a resolver per provider and a UI to select.
- **profile_courses cleanup**: kept for now to avoid breaking existing Home queries. Drop in a separate PR after auditing all callers.
- **Field selection on user-created topics**: hidden in v1 (always null). If we later want user-owned topics to appear on Discover or in any grouped view, we'll add a field-picker UI then.
- **Rename / delete on lectures before MVP video player change**: the video player still references `lessons.yt_id`. Lecture rename only touches `title`, so this is fine; lecture delete cascades through `lesson_progress` which is also fine. No player-side changes needed.

## Self-Review

- **Placeholders**: none — every action has a precise signature, every CTA label is fixed, every limit (40/60/120/50/50) is concrete.
- **Internal consistency**: `source_*_id` is added on all three content tables; `importPresetTopic` writes all three; Discover reads only `topics.source_topic_id` for the CTA decision (consistent with the unique index on that column).
- **Scope**: one PR per CRUD layer plus schema/import keeps each PR ~200–400 LOC. Implementable in one focused session each.
- **Ambiguity**: the only borderline call was "playlist + individual URLs in the same submission" — resolved by capping the *total* resulting lecture count at 50, so the rule is uniform.
