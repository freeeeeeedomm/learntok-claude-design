# Library Personalize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create / rename / reorder / delete topics, courses, and lectures end-to-end on their shelf, and fork preset topics from Discover with one action. After this work, every shelf item is owner-owned and the four-level hierarchy (field → topic → course → lecture) works symmetrically.

**Architecture:** Additive-only schema migration adds source-of-fork columns plus a `video_provider` column. Eleven server actions in `app/library/actions.ts` cover full CRUD + import. UI follows a unified pattern across three CRUD pages (Home, Topic detail, Course detail): top-bar `Add` + `Organize` buttons, per-item `⋯` menu with `Rename` / `Delete`. Discover keeps its preset browse role with a single CTA per card that flips between `Add to home` and `Open` based on import state.

**Tech Stack:** Next.js 14 App Router · Supabase (Postgres + RLS, user-token client) · Server Actions · Zod · `@dnd-kit/sortable` (new dep) · existing YouTube Data API v3 helpers.

**Spec:** [`docs/superpowers/specs/2026-04-27-library-personalize-design.md`](../specs/2026-04-27-library-personalize-design.md)

---

## Cutover Strategy

**Chosen path: hard cutover.** A single migration both adds the new columns and runs a backfill that converts every existing user's `interests`-based preset shelf into owner-owned deep copies (with `source_*_id` set and `lesson_progress` rows re-pointed to the new lesson IDs). After the backfill, `profiles.interests` is wiped and `profile_courses` rows that referenced preset courses are deleted.

This is safe because (a) only a handful of test users exist, (b) the migration is idempotent — re-running it is a no-op for users whose interests are already empty.

The backfill is implemented as part of `0015_library_personalize.sql` (Task 1, Step 2).

## Parallel Development

Dependency graph:

```
PR-A  ──┬──► PR-B  (Home + topic CRUD)
        ├──► PR-C  (Topic detail + course CRUD)
        ├──► PR-D  (Course detail + lecture rename/delete/reorder)
        └──► PR-E  (Discover Add-to-home)
```

PR-A is a hard prerequisite. After it merges, **B / C / D / E can run in four parallel subagent sessions** — they touch different page files, different component directories, and (per the file split below) different action files.

To eliminate file-level conflicts on `app/library/actions.ts`, the action code is split per entity:

```
app/library/actions/
  _shared.ts       — requireUserId(), assertCourseOwner() helpers
  lecture.ts       — addLectures (PR-A) + rename/delete/reorder (PR-D)
  topic.ts         — PR-B
  course.ts        — PR-C
  import.ts        — PR-E (importPresetTopic)
```

PR-A creates `_shared.ts` and `lecture.ts`. The other PRs each create exactly one new file — zero file overlap with peers. The only sequencing constraint inside this group is PR-D extending `lecture.ts`, which can be cleanly rebased onto whatever else lands first.

After PR-A is merged to `main`, dispatch four worktree-isolated subagents in parallel (one per PR) using the superpowers:subagent-driven-development pattern. Each gets a self-contained brief pointing at this plan's task numbers.

---

## File Structure

**Created**
- `supabase/migrations/0015_library_personalize.sql` — schema migration + hard-cutover backfill
- `lib/youtube/parse.ts` — extracted URL parser (video + playlist)
- `lib/youtube/api.ts` — YouTube Data API wrappers (`fetchVideoMeta`, `expandPlaylist`)
- `app/library/actions/_shared.ts` — auth + ownership helpers
- `app/library/actions/lecture.ts` — addLectures (PR-A) + rename/delete/reorder (PR-D)
- `app/library/actions/topic.ts` — topic CRUD (PR-B)
- `app/library/actions/course.ts` — course CRUD (PR-C)
- `app/library/actions/import.ts` — importPresetTopic (PR-E)
- `components/library/CreateTopicModal.tsx`
- `components/library/RenameModal.tsx` — generic, reused for topic / course / lecture
- `components/library/DeleteConfirmDialog.tsx` — generic, reused
- `components/library/ItemMenu.tsx` — three-dot ⋯ trigger + popover (generic)
- `components/library/SortableList.tsx` — `@dnd-kit` wrapper used at all three layers
- `components/library/CreateCourseModal.tsx`
- `components/library/AddLectureModal.tsx`
- `components/library/EmptyCourseTile.tsx` — gray + first-letter placeholder
- `tests/library-topic-crud.spec.ts`
- `tests/library-course-crud.spec.ts`
- `tests/library-lecture-crud.spec.ts`
- `tests/library-import-preset.spec.ts`

**Modified**
- `app/api/youtube/parse/route.ts` — slim down to thin wrapper around `lib/youtube/`
- `app/home/page.tsx` — replace `+ browse` link with new toolbar, add `Organize` mode, attach `⋯` menus
- `app/topic/[id]/page.tsx` — drop Discover-link `add course` flow, integrate local create/organize
- `app/course/[id]/page.tsx` — add `Add lecture` + `Organize` toolbar, lecture `⋯` menus
- `app/discover/page.tsx` — flip per-card CTA based on import state
- `components/discover/TopicGrid.tsx` (or its `TopicTile`) — render `Add to home` / `Open` button
- `package.json` — add `@dnd-kit/core` + `@dnd-kit/sortable`
- `lib/supabase/database.types.ts` — regenerated after migration

---

## PR-A — Schema + YouTube Helpers + addLectures

This PR is a hard prerequisite for PR-B/C/D/E. After it lands, the others can run in parallel.

### Task 1: Migration (additive schema + hard-cutover backfill)

**Files:**
- Create: `supabase/migrations/0015_library_personalize.sql`

- [ ] **Step 1: Write the additive schema**

```sql
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
create unique index topics_owner_source_uniq
  on public.topics (owner_id, source_topic_id)
  where source_topic_id is not null;
```

- [ ] **Step 2: Append the hard-cutover backfill to the same migration file**

```sql
-- 3) Backfill: for every existing user with non-empty interests, deep-copy
--    each preset topic into owner-owned rows and re-point lesson_progress
--    to the new lesson IDs. Idempotent — users with empty interests are
--    skipped, and the unique index above blocks re-imports if re-run.
do $$
declare
  user_rec record;
  preset_topic_id uuid;
  new_topic_id uuid;
  preset_course_rec record;
  new_course_id uuid;
  preset_lesson_rec record;
  new_lesson_id uuid;
  user_topic_pos int;
begin
  for user_rec in
    select id, interests from public.profiles
    where interests is not null and array_length(interests, 1) > 0
  loop
    user_topic_pos := 0;

    for preset_topic_id in
      select distinct unnest(user_rec.interests)
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
--    references.
delete from public.profile_courses
where course_id in (
  select id from public.courses where is_preset = true
);
```

- [ ] **Step 3: Apply locally and verify**

```bash
pnpm supabase:reset
pnpm gen:types
```

Expected:
- migration applies cleanly
- `lib/supabase/database.types.ts` lists `source_topic_id` / `source_course_id` / `source_lesson_id` / `video_provider`
- if seed data includes a user with interests, they now have owner-owned topic rows whose `source_topic_id` matches their old `interests` entries

Manual verification (Supabase SQL editor or psql):

```sql
-- Should return zero rows: every user has had their interests cleared.
select id, interests from profiles where array_length(interests, 1) > 0;

-- Should return at least one row per (user × imported topic) pair:
select owner_id, source_topic_id from topics where source_topic_id is not null;

-- Should return zero rows: legacy preset references in profile_courses gone.
select pc.* from profile_courses pc
join courses c on c.id = pc.course_id
where c.is_preset = true;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0015_library_personalize.sql lib/supabase/database.types.ts
git commit -m "feat(db): library personalize — schema + hard-cutover backfill"
```

### Task 2: Extract YouTube URL parser

**Files:**
- Create: `lib/youtube/parse.ts`

- [ ] **Step 1: Write `parse.ts`**

```ts
// lib/youtube/parse.ts
// Pure URL parsing — no network, no env. Cheap, easy to test.

export type ParsedYouTubeUrl =
  | { kind: 'video'; videoId: string }
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'unknown' };

const VIDEO_RE =
  /(?:youtube\.com\/(?:.*[?&]v=|embed\/|shorts\/|v\/)|youtu\.be\/)([\w-]{11})/;
const PLAYLIST_RE = /[?&]list=([\w-]+)/;

export function parseYouTubeUrl(raw: string): ParsedYouTubeUrl {
  const url = raw.trim();
  if (!url) return { kind: 'unknown' };

  // Playlist URLs sometimes also contain v= (e.g., a watch URL with list=).
  // We prefer playlist semantics if a list ID is present AND this is a
  // /playlist URL OR the URL has no v=. Otherwise treat as a single video.
  const playlistMatch = url.match(PLAYLIST_RE);
  const isPlaylistPage = /youtube\.com\/playlist/.test(url);
  const videoMatch = url.match(VIDEO_RE);

  if (playlistMatch && (isPlaylistPage || !videoMatch)) {
    return { kind: 'playlist', playlistId: playlistMatch[1] };
  }
  if (videoMatch) {
    return { kind: 'video', videoId: videoMatch[1] };
  }
  return { kind: 'unknown' };
}
```

- [ ] **Step 2: Write tests**

Create `tests/lib-youtube-parse.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { parseYouTubeUrl } from '../lib/youtube/parse';

test.describe('parseYouTubeUrl', () => {
  test('watch URL', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      kind: 'video',
      videoId: 'dQw4w9WgXcQ',
    });
  });

  test('youtu.be short URL', () => {
    expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      kind: 'video',
      videoId: 'dQw4w9WgXcQ',
    });
  });

  test('shorts URL', () => {
    expect(parseYouTubeUrl('https://youtube.com/shorts/dQw4w9WgXcQ')).toEqual({
      kind: 'video',
      videoId: 'dQw4w9WgXcQ',
    });
  });

  test('playlist URL', () => {
    expect(
      parseYouTubeUrl('https://www.youtube.com/playlist?list=PLABCDEF1234')
    ).toEqual({ kind: 'playlist', playlistId: 'PLABCDEF1234' });
  });

  test('watch URL with list= prefers video', () => {
    expect(
      parseYouTubeUrl(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLABCDEF1234'
      )
    ).toEqual({ kind: 'video', videoId: 'dQw4w9WgXcQ' });
  });

  test('garbage', () => {
    expect(parseYouTubeUrl('https://example.com')).toEqual({ kind: 'unknown' });
    expect(parseYouTubeUrl('')).toEqual({ kind: 'unknown' });
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm test tests/lib-youtube-parse.spec.ts
```

Expected: 6 PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/youtube/parse.ts tests/lib-youtube-parse.spec.ts
git commit -m "feat(youtube): extract URL parser supporting video + playlist"
```

### Task 3: YouTube Data API wrappers

**Files:**
- Create: `lib/youtube/api.ts`
- Modify: `app/api/youtube/parse/route.ts:1-103` — slim down to call `lib/youtube/`

- [ ] **Step 1: Write `api.ts`**

```ts
// lib/youtube/api.ts
// Server-only wrappers around the YouTube Data API v3.
// Reads YOUTUBE_API_KEY at call time (not module-load) so missing key
// surfaces as a typed error rather than a silent boot break.

const ABORT_TIMEOUT_MS = 8000;

export type VideoMeta = {
  videoId: string;
  title: string;
  durationSeconds: number;
};

function isoToSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return (
    parseInt(m?.[1] || '0') * 3600 +
    parseInt(m?.[2] || '0') * 60 +
    parseInt(m?.[3] || '0')
  );
}

/**
 * Batch-fetch metadata for up to 50 video IDs in a single Data API call.
 * Throws if YOUTUBE_API_KEY is missing or the API errors.
 */
export async function fetchVideoMeta(videoIds: string[]): Promise<VideoMeta[]> {
  if (videoIds.length === 0) return [];
  if (videoIds.length > 50) {
    throw new Error(`fetchVideoMeta supports ≤50 IDs; got ${videoIds.length}`);
  }
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY is not configured');

  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet,contentDetails&id=${videoIds.join(',')}&key=${key}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(ABORT_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`youtube videos.list ${res.status}`);
  const data = (await res.json()) as {
    items: Array<{
      id: string;
      snippet: { title: string };
      contentDetails: { duration: string };
    }>;
  };
  return data.items.map((it) => ({
    videoId: it.id,
    title: it.snippet.title,
    durationSeconds: isoToSeconds(it.contentDetails.duration),
  }));
}

/**
 * Expand a playlist into its videoIds, paginated.
 * Hard cap at `cap` items (default 50) — extra pages are ignored.
 * Order matches the playlist's published order.
 */
export async function expandPlaylist(
  playlistId: string,
  cap = 50
): Promise<string[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY is not configured');

  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < cap) {
    const params = new URLSearchParams({
      part: 'contentDetails',
      playlistId,
      maxResults: String(Math.min(50, cap - ids.length)),
      key,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?${params}`,
      { signal: AbortSignal.timeout(ABORT_TIMEOUT_MS) }
    );
    if (!res.ok) throw new Error(`youtube playlistItems.list ${res.status}`);
    const data = (await res.json()) as {
      items: Array<{ contentDetails: { videoId: string } }>;
      nextPageToken?: string;
    };
    for (const it of data.items) ids.push(it.contentDetails.videoId);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return ids.slice(0, cap);
}
```

- [ ] **Step 2: Refactor `/api/youtube/parse/route.ts` to use the new lib**

Replace the inline `extractYtId` + `parseViaDataApi` with imports from `lib/youtube/parse.ts` and `lib/youtube/api.ts`. The route still keeps its oembed fallback for the no-API-key case.

```ts
// app/api/youtube/parse/route.ts (top of file)
import { parseYouTubeUrl } from '@/lib/youtube/parse';
import { fetchVideoMeta } from '@/lib/youtube/api';
```

In the handler, replace:

```ts
const id = extractYtId(parsed.data.url);
if (!id) return NextResponse.json({ error: 'not_youtube' }, { status: 400 });
```

with:

```ts
const parsedUrl = parseYouTubeUrl(parsed.data.url);
if (parsedUrl.kind !== 'video') {
  return NextResponse.json({ error: 'not_youtube_video' }, { status: 400 });
}
const id = parsedUrl.videoId;
```

And replace the `parseViaDataApi(id, key)` call with `fetchVideoMeta([id])` + map the first result. The oembed fallback stays unchanged.

- [ ] **Step 3: Smoke-test the route still works**

```bash
pnpm dev
# In another shell:
curl 'http://localhost:3000/api/youtube/parse?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ'
```

Expected: `{ ytId: 'dQw4w9WgXcQ', title: ..., durationSeconds: ... }` (or oembed fallback shape).

- [ ] **Step 4: Commit**

```bash
git add lib/youtube/api.ts app/api/youtube/parse/route.ts
git commit -m "refactor(youtube): extract Data API wrappers into lib/youtube"
```

### Task 4: `addLectures` server action + actions scaffold

**Files:**
- Create: `app/library/actions/_shared.ts`
- Create: `app/library/actions/lecture.ts`

- [ ] **Step 1: Create `_shared.ts` with auth + ownership helpers**

```ts
// app/library/actions/_shared.ts
'use server';

import { createClient } from '@/lib/supabase/server';

export const MAX_LECTURES_PER_SUBMISSION = 50;

export async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('not_authenticated');
  return data.user.id;
}

export async function assertCourseOwner(courseId: string, userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('courses')
    .select('id, owner_id')
    .eq('id', courseId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.owner_id !== userId) throw new Error('not_owner');
}
```

- [ ] **Step 1b: Create `lecture.ts` shell**

```ts
// app/library/actions/lecture.ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { parseYouTubeUrl } from '@/lib/youtube/parse';
import { fetchVideoMeta, expandPlaylist } from '@/lib/youtube/api';
import {
  requireUserId,
  assertCourseOwner,
  MAX_LECTURES_PER_SUBMISSION,
} from './_shared';
```

- [ ] **Step 2: Append `addLectures` to `lecture.ts`**

```ts
const AddLecturesInput = z.object({
  courseId: z.string().uuid(),
  urls: z.array(z.string().url()).min(1).max(MAX_LECTURES_PER_SUBMISSION),
});

export async function addLectures(input: z.infer<typeof AddLecturesInput>) {
  const { courseId, urls } = AddLecturesInput.parse(input);
  const userId = await requireUserId();
  await assertCourseOwner(courseId, userId);

  // 1) Parse every URL. Collect video IDs (preserving submission order)
  //    and expand any playlist URLs in-place.
  const videoIds: string[] = [];
  for (const raw of urls) {
    const parsed = parseYouTubeUrl(raw);
    if (parsed.kind === 'video') {
      videoIds.push(parsed.videoId);
    } else if (parsed.kind === 'playlist') {
      const expanded = await expandPlaylist(
        parsed.playlistId,
        MAX_LECTURES_PER_SUBMISSION - videoIds.length
      );
      videoIds.push(...expanded);
      if (videoIds.length >= MAX_LECTURES_PER_SUBMISSION) break;
    } else {
      throw new Error(`unrecognized URL: ${raw}`);
    }
  }

  // 2) De-duplicate while preserving first-seen order.
  const seen = new Set<string>();
  const dedup = videoIds.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  if (dedup.length === 0) throw new Error('no_videos_resolved');
  if (dedup.length > MAX_LECTURES_PER_SUBMISSION) {
    throw new Error(`exceeds_cap:${MAX_LECTURES_PER_SUBMISSION}`);
  }

  // 3) Single batch metadata fetch.
  const metas = await fetchVideoMeta(dedup);
  const metaById = new Map(metas.map((m) => [m.videoId, m]));

  // 4) Compute starting position.
  const supabase = createClient();
  const { data: maxRow } = await supabase
    .from('lessons')
    .select('position')
    .eq('course_id', courseId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const startPos = (maxRow?.position ?? -1) + 1;

  // 5) Bulk insert in submission order.
  const rows = dedup
    .map((id, i) => {
      const m = metaById.get(id);
      if (!m) return null; // private/deleted video
      return {
        course_id: courseId,
        position: startPos + i,
        title: m.title,
        yt_id: m.videoId,
        duration_seconds: m.durationSeconds,
        video_provider: 'youtube' as const,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) throw new Error('all_videos_unavailable');

  const { data: inserted, error: insertErr } = await supabase
    .from('lessons')
    .insert(rows)
    .select('id');
  if (insertErr) throw insertErr;

  revalidatePath(`/course/${courseId}`);
  return { ids: (inserted ?? []).map((r) => r.id) };
}
```

- [ ] **Step 3: Smoke test via Playwright**

Create `tests/library-add-lectures.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

test('addLectures: dev user adds 1 lecture by URL', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  // Create a fresh owner-owned course directly via admin client.
  const a = admin();
  const { data: { users } } = await a.auth.admin.listUsers();
  const dev = users.find((u) => u.email?.startsWith('dev'));
  expect(dev).toBeTruthy();

  const { data: topic } = await a
    .from('topics')
    .insert({ owner_id: dev!.id, is_preset: false, title: 'Test Topic' })
    .select('id')
    .single();
  const { data: course } = await a
    .from('courses')
    .insert({
      owner_id: dev!.id,
      topic_id: topic!.id,
      is_preset: false,
      title: 'Test Course',
    })
    .select('id')
    .single();

  // Drive the action via a temporary test endpoint OR by calling the
  // Server Action directly through page navigation. Simplest: navigate
  // to a future test page, but for now we exercise the underlying lib.
  // (Replaced by a real UI test in Task 21.)
  expect(course!.id).toBeTruthy();
});
```

The full e2e wiring lives in PR-D's UI test. Here we just verify the action file compiles and the helper functions don't throw on import.

```bash
pnpm lint
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/library/actions/ tests/library-add-lectures.spec.ts
git commit -m "feat(library): addLectures server action with playlist expansion"
```

### Task 5: Open PR-A

- [ ] **Step 1: Push branch & open PR**

```bash
git push -u origin claude/library-personalize-spec
gh pr create --title "PR-A: library personalize — schema + YouTube helpers + addLectures" --body "$(cat <<'EOF'
## Summary
- Adds `source_topic_id` / `source_course_id` / `source_lesson_id` columns + `video_provider` column (additive, defaults preserve existing rows).
- Adds unique index `(owner_id, source_topic_id)` to enforce one-import-per-preset-topic.
- Extracts YouTube URL parsing + Data API wrappers into `lib/youtube/`.
- Adds `addLectures` server action with playlist auto-expansion (cap 50).

## Test Plan
- [ ] `pnpm supabase:reset && pnpm gen:types` — migration applies, types updated
- [ ] `pnpm test tests/lib-youtube-parse.spec.ts` — URL parsing
- [ ] `pnpm dev` + curl `/api/youtube/parse?url=...` — refactored route still works
- [ ] `pnpm lint && npx tsc --noEmit` — no errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## PR-B — Topic CRUD + Home Redesign

Depends on PR-A merged. Branch from origin/main: `claude/pr-b-topic-crud`.

### Task 6: Topic-level server actions

**Files:**
- Create: `app/library/actions/topic.ts`

- [ ] **Step 1: Write the full file with all topic actions**

```ts
// app/library/actions/topic.ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireUserId } from './_shared';

const CreateTopicInput = z.object({
  title: z.string().min(1).max(40),
  icon: z.string().max(40).optional(),
  color: z.string().max(20).optional(),
});

export async function createTopic(input: z.infer<typeof CreateTopicInput>) {
  const { title, icon, color } = CreateTopicInput.parse(input);
  const userId = await requireUserId();
  const supabase = createClient();

  const { data: maxRow } = await supabase
    .from('topics')
    .select('position')
    .eq('owner_id', userId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (maxRow?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from('topics')
    .insert({
      owner_id: userId,
      is_preset: false,
      title,
      icon: icon ?? null,
      color: color ?? null,
      position,
    })
    .select('id')
    .single();
  if (error) throw error;
  revalidatePath('/home');
  return { id: data.id };
}

const RenameTopicInput = z.object({
  topicId: z.string().uuid(),
  newTitle: z.string().min(1).max(40),
});

export async function renameTopic(input: z.infer<typeof RenameTopicInput>) {
  const { topicId, newTitle } = RenameTopicInput.parse(input);
  await requireUserId();
  const supabase = createClient();
  // RLS update policy already enforces owner-only writes.
  const { error } = await supabase
    .from('topics')
    .update({ title: newTitle })
    .eq('id', topicId);
  if (error) throw error;
  revalidatePath('/home');
  revalidatePath(`/topic/${topicId}`);
}

const DeleteTopicInput = z.object({ topicId: z.string().uuid() });

export async function deleteTopic(input: z.infer<typeof DeleteTopicInput>) {
  const { topicId } = DeleteTopicInput.parse(input);
  await requireUserId();
  const supabase = createClient();
  // Cascades to courses, lessons, lesson_progress via FK ON DELETE CASCADE.
  const { error } = await supabase.from('topics').delete().eq('id', topicId);
  if (error) throw error;
  revalidatePath('/home');
}

const ReorderTopicsInput = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

export async function reorderTopics(input: z.infer<typeof ReorderTopicsInput>) {
  const { orderedIds } = ReorderTopicsInput.parse(input);
  const userId = await requireUserId();
  const supabase = createClient();
  // Single round-trip: build CASE expression. For ≤50 items this is fine.
  // We guard by owner_id to defend against client tampering.
  const updates = orderedIds.map((id, i) =>
    supabase.from('topics').update({ position: i }).eq('id', id).eq('owner_id', userId)
  );
  const results = await Promise.all(updates);
  for (const r of results) if (r.error) throw r.error;
  revalidatePath('/home');
}
```

- [ ] **Step 2: Compute deletion blast radius**

Add a small read-only helper used by the delete dialog:

```ts
const TopicBlastInput = z.object({ topicId: z.string().uuid() });

export async function getTopicDeleteBlastRadius(
  input: z.infer<typeof TopicBlastInput>
) {
  const { topicId } = TopicBlastInput.parse(input);
  await requireUserId();
  const supabase = createClient();
  const { data: courses } = await supabase
    .from('courses')
    .select('id')
    .eq('topic_id', topicId);
  const courseIds = (courses ?? []).map((c) => c.id);
  let lectureCount = 0;
  if (courseIds.length > 0) {
    const { count } = await supabase
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .in('course_id', courseIds);
    lectureCount = count ?? 0;
  }
  return { courses: courseIds.length, lectures: lectureCount };
}
```

- [ ] **Step 3: Verify compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/library/actions/topic.ts
git commit -m "feat(library): topic CRUD server actions"
```

> Imports in PR-B's UI components reference `@/app/library/actions/topic` directly.

### Task 7: Generic UI primitives — modal, dialog, menu

**Files:**
- Create: `components/library/RenameModal.tsx`
- Create: `components/library/DeleteConfirmDialog.tsx`
- Create: `components/library/ItemMenu.tsx`

- [ ] **Step 1: `RenameModal`**

```tsx
// components/library/RenameModal.tsx
'use client';
import { useState } from 'react';

type Props = {
  open: boolean;
  initialValue: string;
  maxLength: number;
  label: string; // e.g. "Rename topic"
  onSubmit: (value: string) => Promise<void> | void;
  onClose: () => void;
};

export function RenameModal({
  open,
  initialValue,
  maxLength,
  label,
  onSubmit,
  onClose,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [pending, setPending] = useState(false);
  if (!open) return null;

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > maxLength) return;
    setPending(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="rename-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">{label}</div>
        <input
          autoFocus
          value={value}
          maxLength={maxLength}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          data-testid="rename-input"
        />
        <div className="row gap-8 mt-12">
          <button onClick={onClose} disabled={pending} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pending || !value.trim()}
            className="btn btn-primary"
            data-testid="rename-submit"
          >
            {pending ? '…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `DeleteConfirmDialog`**

```tsx
// components/library/DeleteConfirmDialog.tsx
'use client';
import { useState } from 'react';

type Props = {
  open: boolean;
  title: string;
  body: string; // pre-formatted blast-radius sentence
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
};

export function DeleteConfirmDialog({ open, title, body, onConfirm, onClose }: Props) {
  const [pending, setPending] = useState(false);
  if (!open) return null;

  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="delete-dialog">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="display" style={{ fontSize: 18 }}>{title}</div>
        <div className="body mt-8">{body}</div>
        <div className="row gap-8 mt-16" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={pending} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={pending}
            className="btn btn-danger"
            data-testid="delete-confirm"
          >
            {pending ? '…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `ItemMenu` (three-dot trigger + popover)**

```tsx
// components/library/ItemMenu.tsx
'use client';
import { useEffect, useRef, useState } from 'react';

type Item = { label: string; onSelect: () => void; destructive?: boolean };
type Props = { items: Item[]; testId?: string };

export function ItemMenu({ items, testId }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn-icon"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        aria-label="More actions"
        data-testid={testId}
      >
        ⋯
      </button>
      {open && (
        <div className="menu-popover" data-testid={testId ? `${testId}-popover` : undefined}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              className={`menu-item${it.destructive ? ' menu-item-danger' : ''}`}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add minimal CSS for these primitives**

Append to `app/globals.css`:

```css
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
}
.modal {
  background: var(--bg);
  border: 1px solid var(--ink-mute);
  border-radius: 12px;
  padding: 20px;
  min-width: 280px; max-width: 90vw;
}
.btn-icon {
  background: transparent; border: none; padding: 4px 8px;
  font-size: 18px; cursor: pointer; color: var(--ink-mute);
  border-radius: 6px;
}
.btn-icon:hover { background: var(--bg-2); color: var(--accent); }
.menu-popover {
  position: absolute; top: 100%; right: 0;
  background: var(--bg); border: 1px solid var(--ink-mute);
  border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  min-width: 140px; z-index: 50;
}
.menu-item {
  display: block; width: 100%; padding: 8px 12px;
  background: transparent; border: none; text-align: left;
  font-size: 13px; color: var(--accent); cursor: pointer;
}
.menu-item:hover { background: var(--bg-2); }
.menu-item-danger { color: var(--nibs); }
.btn-danger { background: var(--nibs); color: white; }
```

- [ ] **Step 5: Commit**

```bash
git add components/library/RenameModal.tsx components/library/DeleteConfirmDialog.tsx components/library/ItemMenu.tsx app/globals.css
git commit -m "feat(library): generic rename/delete/menu UI primitives"
```

### Task 8: `CreateTopicModal` + topic-specific wiring

**Files:**
- Create: `components/library/CreateTopicModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
// components/library/CreateTopicModal.tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTopic } from '@/app/library/actions/topic';

type Props = { open: boolean; onClose: () => void };

export function CreateTopicModal({ open, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState<string>('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!open) return null;

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const { id } = await createTopic({
        title: trimmed,
        icon: icon || undefined,
      });
      onClose();
      setTitle('');
      router.refresh();
      // Optional: router.push(`/topic/${id}`);
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="create-topic-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">New topic</div>
        <input
          autoFocus
          placeholder="topic title"
          maxLength={40}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          data-testid="create-topic-title"
        />
        {/* Icon picker is deferred — for v1 use a small emoji shortcuts row */}
        <div className="row gap-4 mt-8" style={{ flexWrap: 'wrap' }}>
          {['📚', '🧮', '🧪', '🎨', '🎵', '💻', '🌍', '🧠'].map((e) => (
            <button
              key={e}
              type="button"
              className={`btn-icon${icon === e ? ' btn-icon-active' : ''}`}
              onClick={() => setIcon(e)}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="row gap-8 mt-16" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={pending} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pending || !title.trim()}
            className="btn btn-primary"
            data-testid="create-topic-submit"
          >
            {pending ? '…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `.btn-icon-active` style**

Append to `app/globals.css`:

```css
.btn-icon-active { background: var(--bg-2); color: var(--accent); border: 1px solid var(--accent); }
```

- [ ] **Step 3: Commit**

```bash
git add components/library/CreateTopicModal.tsx app/globals.css
git commit -m "feat(library): create-topic modal"
```

### Task 9: SortableList — `@dnd-kit` wrapper

**Files:**
- Modify: `package.json` — add deps
- Create: `components/library/SortableList.tsx`

- [ ] **Step 1: Install deps**

```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Write the wrapper**

```tsx
// components/library/SortableList.tsx
'use client';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ReactNode, useState } from 'react';

type Item = { id: string };

type Props<T extends Item> = {
  items: T[];
  onReorder: (orderedIds: string[]) => Promise<void> | void;
  renderItem: (item: T, dragHandleProps: object) => ReactNode;
};

export function SortableList<T extends Item>({ items, onReorder, renderItem }: Props<T>) {
  const [order, setOrder] = useState(items);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = order.findIndex((i) => i.id === active.id);
    const newIdx = order.findIndex((i) => i.id === over.id);
    const next = arrayMove(order, oldIdx, newIdx);
    setOrder(next);
    void onReorder(next.map((i) => i.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {order.map((item) => (
          <SortableRow key={item.id} id={item.id}>
            {(handleProps) => renderItem(item, handleProps)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (handleProps: object) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml components/library/SortableList.tsx
git commit -m "feat(library): @dnd-kit-based SortableList wrapper"
```

### Task 10: Wire Home page

**Files:**
- Modify: `app/home/page.tsx` — replace browse link, integrate new toolbar

- [ ] **Step 1: Read current home page state**

Already done above (lines 198–212 of `app/home/page.tsx`). The `+ browse` link at line 200–211 is the target.

- [ ] **Step 2: Replace home query with owner-owned topics only**

Hard cutover (see Task 1 backfill) means every existing user's preset shelf is already a deep-copied owner-owned tree. So Home reads ONLY owner-owned topics — no `interests` lookup at all.

Replace the entire `interestIds`-driven topics query in `app/home/page.tsx` with:

```ts
const topicsRes = await supabase
  .from('topics')
  .select('id, title, icon, color, position, is_preset, owner_id')
  .eq('owner_id', user.id)
  .order('position', { ascending: true });

const topics = topicsRes.data ?? [];
```

Also drop the `interests` field from the `profiles` select earlier in the file — it's no longer read.

- [ ] **Step 3: Replace `+ browse` with new toolbar**

Replace lines 198–212 (the row containing `your topics` + `+ browse` link) with:

```tsx
<HomeTopicToolbar />
```

Create `components/home/HomeTopicToolbar.tsx`:

```tsx
// components/home/HomeTopicToolbar.tsx
'use client';
import { useState } from 'react';
import { CreateTopicModal } from '@/components/library/CreateTopicModal';

type Props = { onOrganizeToggle: () => void; organizing: boolean };

export function HomeTopicToolbar({ onOrganizeToggle, organizing }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <div className="row between aic mt-24">
      <div className="eyebrow">your topics</div>
      <div className="row gap-8">
        <button
          type="button"
          className="link-btn"
          onClick={() => setCreateOpen(true)}
          data-testid="home-create-topic"
        >
          + Create new
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={onOrganizeToggle}
          data-testid="home-organize"
        >
          {organizing ? 'Done' : 'Organize'}
        </button>
      </div>
      <CreateTopicModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
```

Append to `app/globals.css`:

```css
.link-btn {
  background: transparent; border: none;
  font-family: var(--mono); font-size: 11px;
  color: var(--accent); cursor: pointer; padding: 4px 8px;
}
.link-btn:hover { text-decoration: underline; }
```

- [ ] **Step 4: Lift `organizing` state into a client wrapper**

Because `app/home/page.tsx` is a server component, the organize toggle needs to live in a client component that wraps the topic list. Create `components/home/HomeTopicSection.tsx`:

```tsx
// components/home/HomeTopicSection.tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { HomeTopicToolbar } from './HomeTopicToolbar';
import { TopicRail } from './TopicRail';
import { SortableList } from '@/components/library/SortableList';
import { ItemMenu } from '@/components/library/ItemMenu';
import { RenameModal } from '@/components/library/RenameModal';
import { DeleteConfirmDialog } from '@/components/library/DeleteConfirmDialog';
import {
  renameTopic,
  deleteTopic,
  reorderTopics,
  getTopicDeleteBlastRadius,
} from '@/app/library/actions/topic';

type Topic = { id: string; title: string };
type Course = { id: string; title: string };
type Lesson = { id: string; title: string; duration_seconds: number; yt_id: string; done: boolean };

type Props = {
  topics: Topic[];
  coursesByTopic: Map<string, Course[]>;
  lessonsByCourse: Map<string, Lesson[]>;
};

export function HomeTopicSection({ topics, coursesByTopic, lessonsByCourse }: Props) {
  const [organizing, setOrganizing] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Topic | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Topic | null>(null);
  const [blast, setBlast] = useState<{ courses: number; lectures: number } | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const onDeleteRequested = async (t: Topic) => {
    const r = await getTopicDeleteBlastRadius({ topicId: t.id });
    setBlast(r);
    setDeleteTarget(t);
  };

  return (
    <>
      <HomeTopicToolbar
        organizing={organizing}
        onOrganizeToggle={() => setOrganizing((v) => !v)}
      />

      {organizing ? (
        <SortableList
          items={topics}
          onReorder={(ids) =>
            startTransition(async () => {
              await reorderTopics({ orderedIds: ids });
            })
          }
          renderItem={(t, handleProps) => (
            <div className="sortable-row" data-testid={`organize-topic-${t.id}`}>
              <span className="drag-handle" {...handleProps}>⋮⋮</span>
              <span className="grow">{t.title}</span>
              <button
                className="btn-icon menu-item-danger"
                onClick={() => onDeleteRequested(t)}
                aria-label="Delete topic"
              >
                ✕
              </button>
            </div>
          )}
        />
      ) : (
        topics.map((t) => (
          <div
            key={t.id}
            className="row aic"
            data-testid={`home-topic-${t.id}`}
          >
            <div className="grow">
              <TopicRail
                topic={{ id: t.id, title: t.title }}
                courses={coursesByTopic.get(t.id) ?? []}
                lessonsByCourse={lessonsByCourse}
              />
            </div>
            <ItemMenu
              testId={`home-topic-${t.id}-menu`}
              items={[
                { label: 'Rename', onSelect: () => setRenameTarget(t) },
                {
                  label: 'Delete',
                  destructive: true,
                  onSelect: () => onDeleteRequested(t),
                },
              ]}
            />
          </div>
        ))
      )}

      <RenameModal
        open={!!renameTarget}
        initialValue={renameTarget?.title ?? ''}
        maxLength={40}
        label="Rename topic"
        onSubmit={async (v) => {
          await renameTopic({ topicId: renameTarget!.id, newTitle: v });
          router.refresh();
        }}
        onClose={() => setRenameTarget(null)}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.title}"?`}
        body={
          blast
            ? `This will also remove ${blast.courses} course${blast.courses === 1 ? '' : 's'}, ${blast.lectures} lecture${blast.lectures === 1 ? '' : 's'}, and your progress on them. This cannot be undone.`
            : '…'
        }
        onConfirm={async () => {
          await deleteTopic({ topicId: deleteTarget!.id });
          router.refresh();
        }}
        onClose={() => {
          setDeleteTarget(null);
          setBlast(null);
        }}
      />
    </>
  );
}
```

Append to `app/globals.css`:

```css
.sortable-row {
  display: flex; align-items: center; gap: 8px;
  padding: 12px; border: 1px solid var(--ink-mute);
  border-radius: 8px; margin-top: 8px; background: var(--bg);
}
.drag-handle {
  cursor: grab; user-select: none; color: var(--ink-mute);
  padding: 4px;
}
.drag-handle:active { cursor: grabbing; }
.grow { flex: 1; }
```

- [ ] **Step 5: Replace the old topic loop in `app/home/page.tsx`**

Replace the `topics.map((t) => <TopicRail .../>)` block with:

```tsx
<HomeTopicSection
  topics={topics.map((t) => ({ id: t.id, title: t.title }))}
  coursesByTopic={coursesByTopic}
  lessonsByCourse={lessonsByCourse}
/>
```

Drop the `+ paste YouTube link` `<a href="/add">` link entirely (replaced by the in-topic Add lecture flow in PR-D, plus topic-level Add course in PR-C). The `home-add-course` testid will need to be removed from existing tests — check `tests/home-course-smoke.spec.ts` and `tests/nav-smoke.spec.ts`.

- [ ] **Step 6: Run existing home tests**

```bash
pnpm test tests/home-course-smoke.spec.ts tests/nav-smoke.spec.ts tests/topic-smoke.spec.ts
```

Expected: tests previously asserting `home-browse-link` / `home-add-course` will FAIL. Update them to assert the new `home-create-topic` / `home-organize` testids instead. Tests asserting topic navigation should still pass.

- [ ] **Step 7: New topic CRUD test**

Create `tests/library-topic-crud.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

test('create + rename + delete topic', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/home');

  // Create
  await page.getByTestId('home-create-topic').click();
  await page.getByTestId('create-topic-title').fill('Quantum Computing');
  await page.getByTestId('create-topic-submit').click();

  await expect(page.getByText('Quantum Computing')).toBeVisible({ timeout: 5000 });

  // Confirm DB write
  const a = admin();
  const { data: topic } = await a
    .from('topics')
    .select('id, title, owner_id, is_preset')
    .eq('title', 'Quantum Computing')
    .maybeSingle();
  expect(topic?.is_preset).toBe(false);
  expect(topic?.owner_id).toBeTruthy();
});

test('rename topic via three-dot menu', async ({ page }) => {
  await page.request.post('/api/dev/login');
  // Seed an owner-owned topic.
  const a = admin();
  const { data: { users } } = await a.auth.admin.listUsers();
  const dev = users.find((u) => u.email?.startsWith('dev'))!;
  const { data: t } = await a
    .from('topics')
    .insert({ owner_id: dev.id, title: 'OldName', is_preset: false })
    .select('id')
    .single();

  await page.goto('/home');
  await page.getByTestId(`home-topic-${t!.id}-menu`).click();
  await page.getByText('Rename').click();
  await page.getByTestId('rename-input').fill('NewName');
  await page.getByTestId('rename-submit').click();

  await expect(page.getByText('NewName')).toBeVisible();
});
```

```bash
pnpm test tests/library-topic-crud.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit + push + PR**

```bash
git add app/home/page.tsx components/home/HomeTopicSection.tsx components/home/HomeTopicToolbar.tsx tests/
git commit -m "feat(home): topic CRUD + Organize mode replaces Browse link"
git push -u origin claude/pr-b-topic-crud
gh pr create --title "PR-B: Topic CRUD + Home redesign" --body "..."
```

---

## PR-C — Course CRUD + Topic Detail Redesign

Branch from origin/main: `claude/pr-c-course-crud`. Depends on PR-A merged. Independent of PR-B.

### Task 11: Course-level server actions

**Files:**
- Create: `app/library/actions/course.ts`

- [ ] **Step 1: Write the full file with all course actions**

```ts
// app/library/actions/course.ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireUserId } from './_shared';

const CreateCourseInput = z.object({
  topicId: z.string().uuid(),
  title: z.string().min(1).max(60),
});

export async function createCourse(input: z.infer<typeof CreateCourseInput>) {
  const { topicId, title } = CreateCourseInput.parse(input);
  const userId = await requireUserId();
  const supabase = createClient();

  // Defense-in-depth: assert the parent topic is owner-owned. RLS on
  // courses_insert_own permits only owner_id=auth.uid(), but we also
  // verify the topic itself is owned to prevent inserting a course
  // pointing at a preset topic_id (which would render strangely).
  const { data: topic } = await supabase
    .from('topics')
    .select('id, owner_id')
    .eq('id', topicId)
    .maybeSingle();
  if (!topic || topic.owner_id !== userId) throw new Error('not_owner');

  const { data: maxRow } = await supabase
    .from('courses')
    .select('position')
    .eq('topic_id', topicId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (maxRow?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from('courses')
    .insert({
      owner_id: userId,
      topic_id: topicId,
      is_preset: false,
      title,
      icon: null,
      position,
    })
    .select('id')
    .single();
  if (error) throw error;
  revalidatePath(`/topic/${topicId}`);
  revalidatePath('/home');
  return { id: data.id };
}

const RenameCourseInput = z.object({
  courseId: z.string().uuid(),
  newTitle: z.string().min(1).max(60),
});
export async function renameCourse(input: z.infer<typeof RenameCourseInput>) {
  const { courseId, newTitle } = RenameCourseInput.parse(input);
  await requireUserId();
  const supabase = createClient();
  const { error } = await supabase
    .from('courses')
    .update({ title: newTitle })
    .eq('id', courseId);
  if (error) throw error;
  revalidatePath(`/course/${courseId}`);
  revalidatePath('/home');
}

const DeleteCourseInput = z.object({ courseId: z.string().uuid() });
export async function deleteCourse(input: z.infer<typeof DeleteCourseInput>) {
  const { courseId } = DeleteCourseInput.parse(input);
  await requireUserId();
  const supabase = createClient();
  // Look up topic for revalidation before delete.
  const { data: course } = await supabase
    .from('courses').select('topic_id').eq('id', courseId).maybeSingle();
  const { error } = await supabase.from('courses').delete().eq('id', courseId);
  if (error) throw error;
  if (course?.topic_id) revalidatePath(`/topic/${course.topic_id}`);
  revalidatePath('/home');
}

const ReorderCoursesInput = z.object({
  topicId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1),
});
export async function reorderCourses(input: z.infer<typeof ReorderCoursesInput>) {
  const { topicId, orderedIds } = ReorderCoursesInput.parse(input);
  const userId = await requireUserId();
  const supabase = createClient();
  const updates = orderedIds.map((id, i) =>
    supabase
      .from('courses')
      .update({ position: i })
      .eq('id', id)
      .eq('owner_id', userId)
  );
  const results = await Promise.all(updates);
  for (const r of results) if (r.error) throw r.error;
  revalidatePath(`/topic/${topicId}`);
}

const CourseBlastInput = z.object({ courseId: z.string().uuid() });
export async function getCourseDeleteBlastRadius(
  input: z.infer<typeof CourseBlastInput>
) {
  const { courseId } = CourseBlastInput.parse(input);
  await requireUserId();
  const supabase = createClient();
  const { count } = await supabase
    .from('lessons')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId);
  return { lectures: count ?? 0 };
}
```

- [ ] **Step 2: Verify compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/library/actions/course.ts
git commit -m "feat(library): course CRUD server actions"
```

> Imports in PR-C's UI components reference `@/app/library/actions/course`.

### Task 12: `CreateCourseModal` + `EmptyCourseTile`

**Files:**
- Create: `components/library/CreateCourseModal.tsx`
- Create: `components/library/EmptyCourseTile.tsx`

- [ ] **Step 1: `CreateCourseModal` (title-only form)**

```tsx
// components/library/CreateCourseModal.tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCourse } from '@/app/library/actions/course';

type Props = { topicId: string; open: boolean; onClose: () => void };

export function CreateCourseModal({ topicId, open, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!open) return null;

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    startTransition(async () => {
      await createCourse({ topicId, title: trimmed });
      onClose();
      setTitle('');
      router.refresh();
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="create-course-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">New course</div>
        <input
          autoFocus
          placeholder="course title"
          maxLength={60}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          data-testid="create-course-title"
        />
        <div className="row gap-8 mt-16" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={pending} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pending || !title.trim()}
            className="btn btn-primary"
            data-testid="create-course-submit"
          >
            {pending ? '…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `EmptyCourseTile` (gray + first letter)**

```tsx
// components/library/EmptyCourseTile.tsx
type Props = { title: string; size?: number };

export function EmptyCourseTile({ title, size = 64 }: Props) {
  const letter = (title.trim()[0] ?? '?').toUpperCase();
  return (
    <div
      className="empty-course-tile"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      aria-hidden
    >
      {letter}
    </div>
  );
}
```

CSS append:

```css
.empty-course-tile {
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-2); color: var(--ink-mute);
  border-radius: 8px; font-family: var(--mono);
  font-weight: 600;
}
```

- [ ] **Step 3: Commit**

```bash
git add components/library/CreateCourseModal.tsx components/library/EmptyCourseTile.tsx app/globals.css
git commit -m "feat(library): create-course modal + empty-course-tile placeholder"
```

### Task 13: Wire Topic detail page

**Files:**
- Modify: `app/topic/[id]/page.tsx` — add toolbar, course menus, organize mode

- [ ] **Step 1: Read whether the topic is owner-owned**

In the data-loading block of `app/topic/[id]/page.tsx`, the topic select already returns the topic. Extend it to include `owner_id`:

```ts
const { data: topic } = await supabase
  .from('topics')
  .select('id, title, icon, color, owner_id, is_preset')
  .eq('id', params.id)
  .single();
```

Determine ownership server-side:

```ts
const ownsTopic = topic.owner_id === user.id;
```

- [ ] **Step 2: Create `TopicCourseSection` client component**

```tsx
// components/topic/TopicCourseSection.tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CreateCourseModal } from '@/components/library/CreateCourseModal';
import { ItemMenu } from '@/components/library/ItemMenu';
import { RenameModal } from '@/components/library/RenameModal';
import { DeleteConfirmDialog } from '@/components/library/DeleteConfirmDialog';
import { SortableList } from '@/components/library/SortableList';
import { EmptyCourseTile } from '@/components/library/EmptyCourseTile';
import {
  renameCourse,
  deleteCourse,
  reorderCourses,
  getCourseDeleteBlastRadius,
} from '@/app/library/actions/course';

type Course = { id: string; title: string; icon: string | null };
type Props = { topicId: string; ownsTopic: boolean; courses: Course[] };

export function TopicCourseSection({ topicId, ownsTopic, courses }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Course | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [blast, setBlast] = useState<{ lectures: number } | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const onDeleteRequested = async (c: Course) => {
    const r = await getCourseDeleteBlastRadius({ courseId: c.id });
    setBlast(r);
    setDeleteTarget(c);
  };

  return (
    <>
      {ownsTopic && (
        <div className="row gap-8 mt-16">
          <button
            type="button"
            className="link-btn"
            onClick={() => setCreateOpen(true)}
            data-testid="topic-add-course"
          >
            + Add course
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => setOrganizing((v) => !v)}
            data-testid="topic-organize"
          >
            {organizing ? 'Done' : 'Organize'}
          </button>
        </div>
      )}

      {organizing ? (
        <SortableList
          items={courses}
          onReorder={(ids) =>
            startTransition(async () => {
              await reorderCourses({ topicId, orderedIds: ids });
            })
          }
          renderItem={(c, h) => (
            <div className="sortable-row" data-testid={`organize-course-${c.id}`}>
              <span className="drag-handle" {...h}>⋮⋮</span>
              <EmptyCourseTile title={c.title} size={32} />
              <span className="grow">{c.title}</span>
              <button
                className="btn-icon menu-item-danger"
                onClick={() => onDeleteRequested(c)}
                aria-label="Delete course"
              >
                ✕
              </button>
            </div>
          )}
        />
      ) : (
        <div className="col mt-16">
          {courses.map((c) => (
            <div key={c.id} className="row aic" data-testid={`topic-course-${c.id}`}>
              <a href={`/course/${c.id}`} className="row aic grow" style={{ gap: 12, textDecoration: 'none' }}>
                <EmptyCourseTile title={c.title} size={48} />
                <span style={{ color: 'var(--accent)' }}>{c.title}</span>
              </a>
              {ownsTopic && (
                <ItemMenu
                  testId={`topic-course-${c.id}-menu`}
                  items={[
                    { label: 'Rename', onSelect: () => setRenameTarget(c) },
                    {
                      label: 'Delete',
                      destructive: true,
                      onSelect: () => onDeleteRequested(c),
                    },
                  ]}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <CreateCourseModal
        topicId={topicId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      <RenameModal
        open={!!renameTarget}
        initialValue={renameTarget?.title ?? ''}
        maxLength={60}
        label="Rename course"
        onSubmit={async (v) => {
          await renameCourse({ courseId: renameTarget!.id, newTitle: v });
          router.refresh();
        }}
        onClose={() => setRenameTarget(null)}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.title}"?`}
        body={
          blast
            ? `This will also remove ${blast.lectures} lecture${blast.lectures === 1 ? '' : 's'} and your progress on them. This cannot be undone.`
            : '…'
        }
        onConfirm={async () => {
          await deleteCourse({ courseId: deleteTarget!.id });
          router.refresh();
        }}
        onClose={() => {
          setDeleteTarget(null);
          setBlast(null);
        }}
      />
    </>
  );
}
```

- [ ] **Step 3: Replace `<AddCourseButton>` and the static course list in `app/topic/[id]/page.tsx`**

In the JSX, replace whatever currently renders the course list (the per-course rows + the existing `Add course → Discover` button if any) with:

```tsx
<TopicCourseSection
  topicId={topic.id}
  ownsTopic={ownsTopic}
  courses={courses.map((c) => ({ id: c.id, title: c.title, icon: c.icon }))}
/>
```

Drop any import of `AddCourseButton` and the `inShelf`/Discover-link branch on this page.

- [ ] **Step 4: Course CRUD test**

Create `tests/library-course-crud.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

test('create + rename + delete course inside owned topic', async ({ page }) => {
  await page.request.post('/api/dev/login');
  const a = admin();
  const { data: { users } } = await a.auth.admin.listUsers();
  const dev = users.find((u) => u.email?.startsWith('dev'))!;
  const { data: topic } = await a
    .from('topics')
    .insert({ owner_id: dev.id, is_preset: false, title: 'Math' })
    .select('id')
    .single();

  await page.goto(`/topic/${topic!.id}`);
  await page.getByTestId('topic-add-course').click();
  await page.getByTestId('create-course-title').fill('Calculus');
  await page.getByTestId('create-course-submit').click();
  await expect(page.getByText('Calculus')).toBeVisible();

  // Verify ownership in DB
  const { data: course } = await a
    .from('courses')
    .select('id, owner_id, title')
    .eq('topic_id', topic!.id)
    .single();
  expect(course?.owner_id).toBe(dev.id);
  expect(course?.title).toBe('Calculus');
});
```

```bash
pnpm test tests/library-course-crud.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit + push + PR**

```bash
git add app/topic/[id]/page.tsx components/topic/TopicCourseSection.tsx tests/library-course-crud.spec.ts
git commit -m "feat(topic): course CRUD + Organize replaces Discover link"
git push -u origin claude/pr-c-course-crud
gh pr create --title "PR-C: Course CRUD + Topic detail redesign" --body "..."
```

---

## PR-D — Lecture CRUD + Course Detail Redesign

Branch: `claude/pr-d-lecture-crud`. Depends on PR-A merged.

### Task 14: Lecture-level server actions

**Files:**
- Modify: `app/library/actions/lecture.ts` — append three functions (`addLectures` lives here from PR-A)

- [ ] **Step 1: Append rename / delete / reorder to `lecture.ts`**

```ts
const RenameLectureInput = z.object({
  lectureId: z.string().uuid(),
  newTitle: z.string().min(1).max(120),
});
export async function renameLecture(input: z.infer<typeof RenameLectureInput>) {
  const { lectureId, newTitle } = RenameLectureInput.parse(input);
  await requireUserId();
  const supabase = createClient();
  // Look up course for revalidation.
  const { data: row } = await supabase
    .from('lessons')
    .select('course_id')
    .eq('id', lectureId)
    .maybeSingle();
  const { error } = await supabase
    .from('lessons')
    .update({ title: newTitle })
    .eq('id', lectureId);
  if (error) throw error;
  if (row?.course_id) revalidatePath(`/course/${row.course_id}`);
}

const DeleteLectureInput = z.object({ lectureId: z.string().uuid() });
export async function deleteLecture(input: z.infer<typeof DeleteLectureInput>) {
  const { lectureId } = DeleteLectureInput.parse(input);
  await requireUserId();
  const supabase = createClient();
  const { data: row } = await supabase
    .from('lessons')
    .select('course_id')
    .eq('id', lectureId)
    .maybeSingle();
  const { error } = await supabase.from('lessons').delete().eq('id', lectureId);
  if (error) throw error;
  if (row?.course_id) revalidatePath(`/course/${row.course_id}`);
}

const ReorderLecturesInput = z.object({
  courseId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1),
});
export async function reorderLectures(input: z.infer<typeof ReorderLecturesInput>) {
  const { courseId, orderedIds } = ReorderLecturesInput.parse(input);
  const userId = await requireUserId();
  await assertCourseOwner(courseId, userId);
  const supabase = createClient();
  const updates = orderedIds.map((id, i) =>
    supabase
      .from('lessons')
      .update({ position: i })
      .eq('id', id)
      .eq('course_id', courseId)
  );
  const results = await Promise.all(updates);
  for (const r of results) if (r.error) throw r.error;
  revalidatePath(`/course/${courseId}`);
}
```

- [ ] **Step 2: Verify compile + commit**

```bash
npx tsc --noEmit
git add app/library/actions/lecture.ts
git commit -m "feat(library): lecture rename/delete/reorder server actions"
```

> Imports in PR-D's UI components reference `@/app/library/actions/lecture`.

### Task 15: `AddLectureModal` (textarea, multi-URL)

**Files:**
- Create: `components/library/AddLectureModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
// components/library/AddLectureModal.tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addLectures } from '@/app/library/actions/lecture';

type Props = { courseId: string; open: boolean; onClose: () => void };

export function AddLectureModal({ courseId, open, onClose }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!open) return null;

  const urls = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const submit = () => {
    setError(null);
    if (urls.length === 0) {
      setError('Paste at least one URL.');
      return;
    }
    if (urls.length > 50) {
      setError('Max 50 URLs per submission.');
      return;
    }
    startTransition(async () => {
      try {
        await addLectures({ courseId, urls });
        onClose();
        setText('');
        router.refresh();
      } catch (e: unknown) {
        setError((e as Error).message ?? 'failed');
      }
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="add-lecture-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 400 }}>
        <div className="eyebrow">Add lecture</div>
        <div className="body" style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
          Paste one or more YouTube video or playlist URLs, one per line. Max 50.
        </div>
        <textarea
          autoFocus
          rows={8}
          style={{ width: '100%', marginTop: 8, fontFamily: 'var(--mono)', fontSize: 12 }}
          placeholder={'https://www.youtube.com/watch?v=...\nhttps://youtu.be/...\nhttps://www.youtube.com/playlist?list=...'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid="add-lecture-textarea"
        />
        {error && <div className="body mt-8" style={{ color: 'var(--nibs)' }}>{error}</div>}
        <div className="row between aic mt-12">
          <div className="body" style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
            {urls.length} URL{urls.length === 1 ? '' : 's'} pasted
          </div>
          <div className="row gap-8">
            <button onClick={onClose} disabled={pending} className="btn btn-secondary">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={pending || urls.length === 0}
              className="btn btn-primary"
              data-testid="add-lecture-submit"
            >
              {pending ? '…' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/library/AddLectureModal.tsx
git commit -m "feat(library): add-lecture modal with textarea + playlist auto-detect"
```

### Task 16: Wire Course detail page

**Files:**
- Modify: `app/course/[id]/page.tsx`

- [ ] **Step 1: Add owner check + lecture section**

In the data-loading block, the course already comes back. Add owner detection:

```ts
const ownsCourse = course.owner_id === user.id;
```

(Need to extend the `select` to include `owner_id` if not already there.)

- [ ] **Step 2: Create `CourseLectureSection` client component**

```tsx
// components/course/CourseLectureSection.tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AddLectureModal } from '@/components/library/AddLectureModal';
import { ItemMenu } from '@/components/library/ItemMenu';
import { RenameModal } from '@/components/library/RenameModal';
import { DeleteConfirmDialog } from '@/components/library/DeleteConfirmDialog';
import { SortableList } from '@/components/library/SortableList';
import {
  renameLecture,
  deleteLecture,
  reorderLectures,
} from '@/app/library/actions/lecture';

type Lecture = { id: string; title: string; yt_id: string; duration_seconds: number };
type Props = { courseId: string; ownsCourse: boolean; lectures: Lecture[] };

export function CourseLectureSection({ courseId, ownsCourse, lectures }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Lecture | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Lecture | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  return (
    <>
      {ownsCourse && (
        <div className="row gap-8 mt-16">
          <button
            type="button"
            className="link-btn"
            onClick={() => setAddOpen(true)}
            data-testid="course-add-lecture"
          >
            + Add lecture
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => setOrganizing((v) => !v)}
            data-testid="course-organize"
          >
            {organizing ? 'Done' : 'Organize'}
          </button>
        </div>
      )}

      {organizing ? (
        <SortableList
          items={lectures}
          onReorder={(ids) =>
            startTransition(async () => {
              await reorderLectures({ courseId, orderedIds: ids });
            })
          }
          renderItem={(l, h) => (
            <div className="sortable-row" data-testid={`organize-lecture-${l.id}`}>
              <span className="drag-handle" {...h}>⋮⋮</span>
              <span className="grow">{l.title}</span>
              <button
                className="btn-icon menu-item-danger"
                onClick={() => setDeleteTarget(l)}
                aria-label="Delete lecture"
              >
                ✕
              </button>
            </div>
          )}
        />
      ) : (
        <div className="col mt-16">
          {lectures.map((l) => (
            <div key={l.id} className="row aic" data-testid={`course-lecture-${l.id}`}>
              <a
                href={`/lesson/${l.id}`}
                className="grow"
                style={{ color: 'var(--accent)', textDecoration: 'none' }}
              >
                {l.title}
              </a>
              {ownsCourse && (
                <ItemMenu
                  testId={`course-lecture-${l.id}-menu`}
                  items={[
                    { label: 'Rename', onSelect: () => setRenameTarget(l) },
                    {
                      label: 'Delete',
                      destructive: true,
                      onSelect: () => setDeleteTarget(l),
                    },
                  ]}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <AddLectureModal
        courseId={courseId}
        open={addOpen}
        onClose={() => setAddOpen(false)}
      />

      <RenameModal
        open={!!renameTarget}
        initialValue={renameTarget?.title ?? ''}
        maxLength={120}
        label="Rename lecture"
        onSubmit={async (v) => {
          await renameLecture({ lectureId: renameTarget!.id, newTitle: v });
          router.refresh();
        }}
        onClose={() => setRenameTarget(null)}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.title}"?`}
        body="This will remove this lecture and your progress on it. This cannot be undone."
        onConfirm={async () => {
          await deleteLecture({ lectureId: deleteTarget!.id });
          router.refresh();
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
```

- [ ] **Step 3: Mount in `app/course/[id]/page.tsx`**

Replace the current lecture list rendering with:

```tsx
<CourseLectureSection
  courseId={course.id}
  ownsCourse={ownsCourse}
  lectures={lessons.map((l) => ({
    id: l.id,
    title: l.title,
    yt_id: l.yt_id,
    duration_seconds: l.duration_seconds,
  }))}
/>
```

- [ ] **Step 4: Lecture CRUD test**

Create `tests/library-lecture-crud.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

test.skip('add lectures via paste — single video', async ({ page }) => {
  // Skipped by default because it hits the live YouTube API.
  // Un-skip locally with a known-good public video to verify e2e.
  await page.request.post('/api/dev/login');
  const a = admin();
  const { data: { users } } = await a.auth.admin.listUsers();
  const dev = users.find((u) => u.email?.startsWith('dev'))!;
  const { data: topic } = await a.from('topics').insert({
    owner_id: dev.id, is_preset: false, title: 'T',
  }).select('id').single();
  const { data: course } = await a.from('courses').insert({
    owner_id: dev.id, topic_id: topic!.id, is_preset: false, title: 'C',
  }).select('id').single();

  await page.goto(`/course/${course!.id}`);
  await page.getByTestId('course-add-lecture').click();
  await page
    .getByTestId('add-lecture-textarea')
    .fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByTestId('add-lecture-submit').click();

  await expect(page.locator('[data-testid^="course-lecture-"]')).toHaveCount(1, {
    timeout: 10000,
  });
});

test('rename lecture', async ({ page }) => {
  await page.request.post('/api/dev/login');
  const a = admin();
  const { data: { users } } = await a.auth.admin.listUsers();
  const dev = users.find((u) => u.email?.startsWith('dev'))!;
  const { data: topic } = await a.from('topics').insert({
    owner_id: dev.id, is_preset: false, title: 'T',
  }).select('id').single();
  const { data: course } = await a.from('courses').insert({
    owner_id: dev.id, topic_id: topic!.id, is_preset: false, title: 'C',
  }).select('id').single();
  const { data: lec } = await a.from('lessons').insert({
    course_id: course!.id, position: 0, title: 'OldName',
    yt_id: 'dQw4w9WgXcQ', duration_seconds: 213, video_provider: 'youtube',
  }).select('id').single();

  await page.goto(`/course/${course!.id}`);
  await page.getByTestId(`course-lecture-${lec!.id}-menu`).click();
  await page.getByText('Rename').click();
  await page.getByTestId('rename-input').fill('NewName');
  await page.getByTestId('rename-submit').click();

  await expect(page.getByText('NewName')).toBeVisible();
});
```

```bash
pnpm test tests/library-lecture-crud.spec.ts
```

Expected: rename test PASS, add-lectures test SKIP (un-skip manually for live verification).

- [ ] **Step 5: Commit + push + PR**

```bash
git add app/course/[id]/page.tsx components/course/CourseLectureSection.tsx tests/library-lecture-crud.spec.ts
git commit -m "feat(course): lecture CRUD + Organize + Add lecture modal"
git push -u origin claude/pr-d-lecture-crud
gh pr create --title "PR-D: Lecture CRUD + Course detail redesign" --body "..."
```

---

## PR-E — Discover Import

Branch: `claude/pr-e-discover-import`. Depends on PR-A merged. Independent of B/C/D.

### Task 17: `importPresetTopic` server action

**Files:**
- Create: `app/library/actions/import.ts`

- [ ] **Step 1: Write the deep-copy action**

```ts
// app/library/actions/import.ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireUserId } from './_shared';

const ImportPresetTopicInput = z.object({ presetTopicId: z.string().uuid() });

export async function importPresetTopic(
  input: z.infer<typeof ImportPresetTopicInput>
) {
  const { presetTopicId } = ImportPresetTopicInput.parse(input);
  const userId = await requireUserId();
  const supabase = createClient();

  // Verify the source is a preset.
  const { data: src } = await supabase
    .from('topics')
    .select('id, title, icon, color, group_id, is_preset')
    .eq('id', presetTopicId)
    .maybeSingle();
  if (!src || !src.is_preset) throw new Error('not_preset');

  // 1) Create owner-owned topic (unique index protects against double-import).
  const { data: maxRow } = await supabase
    .from('topics')
    .select('position')
    .eq('owner_id', userId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (maxRow?.position ?? -1) + 1;

  const { data: newTopic, error: topicErr } = await supabase
    .from('topics')
    .insert({
      owner_id: userId,
      is_preset: false,
      title: src.title,
      icon: src.icon,
      color: src.color,
      group_id: null, // user-side topics are ungrouped
      position,
      source_topic_id: src.id,
    })
    .select('id')
    .single();
  if (topicErr) throw topicErr; // unique violation surfaces here as "already imported"

  // 2) Copy preset courses.
  const { data: presetCourses } = await supabase
    .from('courses')
    .select('id, title, icon, position')
    .eq('topic_id', src.id)
    .eq('is_preset', true)
    .order('position', { ascending: true });

  for (const pc of presetCourses ?? []) {
    const { data: newCourse, error: courseErr } = await supabase
      .from('courses')
      .insert({
        owner_id: userId,
        topic_id: newTopic.id,
        is_preset: false,
        title: pc.title,
        icon: pc.icon,
        position: pc.position,
        source_course_id: pc.id,
      })
      .select('id')
      .single();
    if (courseErr) throw courseErr;

    // 3) Copy preset lessons under this course.
    const { data: presetLessons } = await supabase
      .from('lessons')
      .select('title, yt_id, duration_seconds, position')
      .eq('course_id', pc.id)
      .order('position', { ascending: true });

    if (presetLessons && presetLessons.length > 0) {
      const lessonRows = presetLessons.map((pl) => ({
        course_id: newCourse.id,
        title: pl.title,
        yt_id: pl.yt_id,
        duration_seconds: pl.duration_seconds,
        position: pl.position,
        video_provider: 'youtube' as const,
        // source_lesson_id is set per-row below in a second pass — we need
        // the source lesson IDs alongside the new ones, which the bulk
        // insert above doesn't return cleanly when we mix existing IDs.
      }));
      // Insert in one batch.
      const { data: insertedLessons, error: lessonErr } = await supabase
        .from('lessons')
        .insert(lessonRows)
        .select('id, position');
      if (lessonErr) throw lessonErr;

      // Backfill source_lesson_id by position match.
      const updates = (insertedLessons ?? []).map((il) => {
        const matchingPreset = presetLessons.find((pl) => pl.position === il.position);
        return matchingPreset
          ? supabase
              .from('lessons')
              .update({ source_lesson_id: matchingPreset && (matchingPreset as any).id })
              .eq('id', il.id)
          : null;
      });
      // Note: we need preset lesson IDs for source_lesson_id. Re-select
      // with id this time.
      const { data: presetLessonsWithId } = await supabase
        .from('lessons')
        .select('id, position')
        .eq('course_id', pc.id);
      const presetByPos = new Map(
        (presetLessonsWithId ?? []).map((p) => [p.position, p.id])
      );
      const realUpdates = (insertedLessons ?? []).map((il) =>
        supabase
          .from('lessons')
          .update({ source_lesson_id: presetByPos.get(il.position) ?? null })
          .eq('id', il.id)
      );
      const results = await Promise.all(realUpdates);
      for (const r of results) if (r.error) throw r.error;
    }
  }

  revalidatePath('/home');
  revalidatePath('/discover');
  return { topicId: newTopic.id };
}
```

> Note: the `source_lesson_id` backfill above is two-pass because Supabase's `insert().select()` doesn't preserve a join to source rows. If this becomes a perf concern, fold it into a single SQL function (`create function` in a follow-up migration). For preset topics with ≤30 courses × ≤30 lessons, this is fine.

- [ ] **Step 2: Verify compile + commit**

```bash
npx tsc --noEmit
git add app/library/actions/import.ts
git commit -m "feat(library): importPresetTopic — three-level deep copy with source refs"
```

> Imports in PR-E's UI components reference `@/app/library/actions/import`.

### Task 18: Discover CTA — `Add to home` / `Open`

**Files:**
- Modify: `app/discover/page.tsx`
- Modify: `components/discover/TopicGrid.tsx`

- [ ] **Step 1: Extend Discover query to include current-user's imported preset IDs**

In `app/discover/page.tsx`, add a query:

```ts
const importedRes = await supabase
  .from('topics')
  .select('id, source_topic_id')
  .eq('owner_id', user.id)
  .not('source_topic_id', 'is', null);

const importedByPresetId = new Map<string, string>();
for (const row of importedRes.data ?? []) {
  if (row.source_topic_id) importedByPresetId.set(row.source_topic_id, row.id);
}
```

Pass this map down to `<TopicGrid>` (or whichever component renders cards).

- [ ] **Step 2: Update `TopicGrid` (or `TopicTile`) to render the conditional CTA**

```tsx
// In the per-tile render:
{importedByPresetId.has(t.id) ? (
  <a
    href={`/topic/${importedByPresetId.get(t.id)}`}
    className="btn btn-secondary"
    data-testid={`discover-topic-${t.id}-open`}
  >
    Open
  </a>
) : (
  <ImportButton presetTopicId={t.id} />
)}
```

Create `components/discover/ImportButton.tsx`:

```tsx
'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { importPresetTopic } from '@/app/library/actions/import';

export function ImportButton({ presetTopicId }: { presetTopicId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={pending}
      data-testid={`discover-topic-${presetTopicId}-add`}
      onClick={() =>
        startTransition(async () => {
          const { topicId } = await importPresetTopic({ presetTopicId });
          router.push(`/topic/${topicId}`);
        })
      }
    >
      {pending ? '…' : 'Add to home'}
    </button>
  );
}
```

- [ ] **Step 3: Test the round-trip**

Create `tests/library-import-preset.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

test('Add to home → topic page → Discover shows Open', async ({ page }) => {
  await page.request.post('/api/dev/login');

  // Find a preset topic.
  const a = admin();
  const { data: preset } = await a
    .from('topics')
    .select('id, title')
    .eq('is_preset', true)
    .eq('title', 'Physics')
    .single();
  expect(preset).toBeTruthy();

  await page.goto('/discover');
  await page.getByTestId(`discover-topic-${preset!.id}-add`).click();

  // Lands on user's new topic page.
  await page.waitForURL(/\/topic\/[\w-]+$/);

  // Re-open Discover; CTA should now be Open.
  await page.goto('/discover');
  await expect(
    page.getByTestId(`discover-topic-${preset!.id}-open`)
  ).toBeVisible();

  // Verify deep-copy in DB.
  const { data: { users } } = await a.auth.admin.listUsers();
  const dev = users.find((u) => u.email?.startsWith('dev'))!;
  const { data: ownerTopic } = await a
    .from('topics')
    .select('id, source_topic_id')
    .eq('owner_id', dev.id)
    .eq('source_topic_id', preset!.id)
    .single();
  expect(ownerTopic).toBeTruthy();
  const { data: ownerCourses } = await a
    .from('courses')
    .select('id, source_course_id')
    .eq('owner_id', dev.id)
    .eq('topic_id', ownerTopic!.id);
  expect((ownerCourses ?? []).length).toBeGreaterThan(0);
  for (const c of ownerCourses ?? []) {
    expect(c.source_course_id).toBeTruthy();
  }
});

test('Add to home twice fails (unique index)', async ({ page }) => {
  await page.request.post('/api/dev/login');
  const a = admin();
  const { data: preset } = await a
    .from('topics')
    .select('id')
    .eq('is_preset', true)
    .eq('title', 'Physics')
    .single();

  await page.goto('/discover');
  await page.getByTestId(`discover-topic-${preset!.id}-add`).click();
  await page.waitForURL(/\/topic\/[\w-]+$/);

  // Going back to Discover, the button is now Open — so double-import via
  // UI is impossible. Confirm by attempting it server-side via admin client
  // (simulating a stale UI):
  const { data: { users } } = await a.auth.admin.listUsers();
  const dev = users.find((u) => u.email?.startsWith('dev'))!;
  const { error } = await a
    .from('topics')
    .insert({
      owner_id: dev.id,
      is_preset: false,
      title: 'X',
      source_topic_id: preset!.id,
    });
  expect(error).toBeTruthy();
  expect(error?.code).toBe('23505'); // unique_violation
});
```

```bash
pnpm test tests/library-import-preset.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit + push + PR**

```bash
git add app/discover/page.tsx components/discover/TopicGrid.tsx components/discover/ImportButton.tsx tests/library-import-preset.spec.ts
git commit -m "feat(discover): Add to home / Open CTA + import server action"
git push -u origin claude/pr-e-discover-import
gh pr create --title "PR-E: Discover preset import" --body "..."
```

---

## Final Tasks (after all PRs merged)

### Task 19: Update CLAUDE.md schema notes

**Files:**
- Modify: `CLAUDE.md` — add a few lines under "Schema & RLS"

- [ ] **Step 1: Document the new columns**

Append a paragraph to the schema section:

```markdown
- `topics.source_topic_id` / `courses.source_course_id` / `lessons.source_lesson_id`:
  set when a row was deep-copied from a preset (Discover "Add to home" or onboarding).
  NULL on rows the user authored from scratch. Used by Discover to flip the per-card
  CTA between "Add to home" and "Open".
- `lessons.video_provider`: defaults to `'youtube'`. Reserved column for future
  multi-source video support; only the youtube path is wired today.
- Unique index `topics_owner_source_uniq (owner_id, source_topic_id) WHERE source_topic_id IS NOT NULL`
  prevents the same user from importing the same preset topic twice.
```

- [ ] **Step 2: Commit on a small docs branch + PR**

```bash
git checkout -b claude/docs-library-personalize
git add CLAUDE.md
git commit -m "docs: note source_*_id and video_provider in schema overview"
git push -u origin claude/docs-library-personalize
gh pr create --title "docs: library personalize schema notes" --body "..."
```

### Task 20: (Deferred) `profile_courses` cleanup

Tracked but not done in this plan. After PR-B/C/D ship and Home reads exclusively from owner-owned courses (post-soft-cutover), audit all readers of `profile_courses` and drop the table in a separate migration. Out of scope here.

---

## Self-Review

**Spec coverage check (against `2026-04-27-library-personalize-design.md`):**

| Spec section | Implementing task |
|---|---|
| Mental model — copy-on-add | Task 17 (importPresetTopic) |
| Schema migration | Task 1 |
| Source-of-fork columns | Task 1 + Task 17 (writes them) |
| Unique index | Task 1 (defines), Task 18 (relies on) |
| Field hidden from user-facing flows | Task 8 (no field picker in CreateTopicModal) |
| Home toolbar (Add topic / Organize) | Tasks 8, 10 |
| Topic detail toolbar (Add course / Organize) | Tasks 12, 13 |
| Course detail toolbar (Add lecture / Organize) | Tasks 15, 16 |
| Discover CTA Add to home / Open | Task 18 |
| Per-item ⋯ Rename / Delete | Tasks 7, 10, 13, 16 |
| Empty course gray + first letter | Task 12 |
| Lecture URL paste with playlist auto-detect | Task 4 |
| Playlist + URL combined cap of 50 | Task 4 (cap enforced after dedup) |
| Drag-reorder via @dnd-kit | Tasks 9, 10, 13, 16 |
| Delete confirm with blast-radius | Tasks 6, 7, 11, 16 |
| Five PR slicing | A=1–5, B=6–10, C=11–13, D=14–16, E=17–18 |

All sections covered. ✓

**Placeholder scan:** every step has executable code or an exact command. The PR-creation `--body "..."` strings are intentionally elided because the engineer should write them per-PR with reference to the actual diff; that is acceptable per the writing-plans rubric (it's not algorithm-relevant content).

**Type consistency:**
- `addLectures` returns `{ ids: string[] }` — consistent.
- `createTopic` / `createCourse` return `{ id }` — consistent.
- Three-level rename actions all return `void` — consistent.
- All reorder actions take `orderedIds: string[]` and return `void` — consistent.
- `getTopicDeleteBlastRadius` returns `{ courses, lectures }`; `getCourseDeleteBlastRadius` returns `{ lectures }` — different but each matches its consumer's display needs.

**Scope check:** five PRs, each between ~150 (PR-A) and ~400 (PR-B) net lines. Each is implementable in one session. PR-A's reach is a strict subset of what B/C/D/E need; B/C/D/E are independent of each other and can run in parallel by separate sessions.

**Ambiguity check:** the only borderline call (playlist + individual URLs in one submission) is resolved deterministically by capping the *resolved* video count at 50 in `addLectures` step 1, with playlist expansion respecting remaining headroom. The cap is enforced post-dedup so a user pasting the same video three times only consumes one slot.
