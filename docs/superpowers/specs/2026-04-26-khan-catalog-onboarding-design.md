# Khan Academy Catalog + Onboarding Group-Picker — Design

**Status:** Ready for review
**Author:** Claude (autonomous, awaiting user approval)
**Sub-project:** PR2 of 4 in the catalog-expansion roadmap (see `2026-04-26-catalog-expansion-roadmap.md`)
**Depends on:** PR1 (`topic_groups` table + `topics.group_id` FK) merged first
**Block on user input before implementing:** see "Open items" at end

## Goal

Replace the current 5-topic / 10-course / 21-lesson placeholder seed with a curated 24-topic / ~170-course / ~1,700-lesson catalog imported from Khan Academy via the YouTube Data API, and refactor onboarding so the user picks 5 super-category groups instead of 5 topics.

After this PR ships, `/home` will render real, large-scale Khan Academy content (filtered by the user's onboarding picks via `profile_courses` shelf).

## Non-goals

- The `/topics` plaza page where users grow their shelf after onboarding (PR3)
- Fixing `/add` to write `profile_courses` (PR4)
- Visual design changes to home rails or stats card (already finalized in PR #17)
- User-defined topic groups (`topic_groups` schema supports it; UI deferred to a much later PR)
- Lesson chapter-pages (Khan playlist sub-structure beyond playlist-as-course is flattened)

## Architecture

Three orthogonal pieces that ship together because none is meaningful alone:

```
                      ┌──────────────────────────────┐
                      │ scripts/import-khan.ts       │
   research JSON ───▶ │  (one-time, run by dev)      │ ─▶ supabase/seed.sql
   YouTube API   ───▶ │                              │    (committed to repo)
                      └──────────────────────────────┘

                      ┌──────────────────────────────┐
   user clicks group  │ app/onboarding/actions.ts    │
   chips             ─▶ completeOnboarding(groupKeys)│ ─▶ profiles.interests
                      │  derive 2 topics × 3 courses │ ─▶ profile_courses
                      └──────────────────────────────┘

                      ┌──────────────────────────────┐
                      │ /home (unchanged from #19)   │
                      │  joins profile_courses to    │ ─▶ rails per topic
                      │  filter rails to shelf       │
                      └──────────────────────────────┘
```

## Component 1: Khan import script

### File: `scripts/import-khan.ts`

A one-shot CLI script run by a developer (not in CI, not at runtime). Inputs:

- `docs/research/khan-academy-playlists.json` — the curated subset of 24 Khan subjects (see "Curated content" below) — already produced by browser scraping during the brainstorming session, lives in the repo.
- `process.env.YOUTUBE_API_KEY` — for `playlistItems.list` and `videos.list` calls.

Outputs:

- `docs/research/khan-academy-import.json` — intermediate normalized data (committed for review and idempotent re-runs)
- Direct write of `supabase/seed.sql` is NOT done by this script; instead, a sibling step `scripts/build-seed.ts` reads the import JSON and emits SQL.

Two-script split:

```
import-khan.ts   ── fetches from YouTube API, writes import JSON (slow, network)
build-seed.ts    ── reads import JSON, writes seed.sql (fast, deterministic)
```

This separates the slow + flaky network step from the deterministic seed-file generation, so contributors can re-build the seed without re-fetching.

### Curated content (24 Khan subjects under 5 groups)

Decided during brainstorming, ratified by user:

| Group key | 中文 | Khan subjects (each = LearnTok topic) | playlists | est. videos |
|---|---|---|---:|---:|
| `finance` | 经济金融 | Microeconomics / Macroeconomics / Finance and Capital Markets | 23 | ~419 |
| `humanities` | 人文历史 | World History / US History / Art History / US government and civics | 33 | ~1,219 |
| `stem` | 理工 | Physics / Chemistry / Biology / Cosmology & Astronomy / Electrical Engineering / Computer Animation | 37 | ~338 |
| `math` | 数学 | Algebra Basics / Pre-Algebra / Geometry / Trigonometry / AP Calculus AB / AP Calculus BC / Linear Algebra / Multivariable Calculus / Differential Equations | 70 | ~2,080 |
| `cs` | 编程 | Computer Programming / Computer Science | 8 | ~172 |

**Totals:** 24 topics, 171 playlists (= courses), ~4,200 videos pre-cap.

### Lesson cap policy

The brainstorming sidestepped a hard cap by introducing the library model — but a sanity cap is still wise to keep the seed file size reasonable:

- **Per course (= playlist) cap: 30 lessons.** Long playlists (e.g. some Calc AB chapters with 60+ videos, Art History with 100+) get truncated at 30. Truncation logged so the human knows what was cut.
- **Estimated post-cap total: ~1,700 lessons** (down from raw ~4,200).

Cap value of 30 was chosen to balance:
- Single-rail readability (a course with > 30 lessons becomes a wall in the lesson list)
- Keeping import small enough to commit (seed.sql with 1,700 INSERTs is ~150 KB; 4,200 would be ~370 KB)
- Honoring Khan playlist structure (a 30-lesson playlist still represents a coherent chapter)

If the user prefers a different cap, change one constant in `build-seed.ts` and re-run.

### YouTube Data API usage

Quota math:

- `playlistItems.list` per playlist: 1 unit per call, paginated 50 items/page → 1–2 calls per playlist × 171 playlists = ~250 units
- `videos.list` for duration: 1 unit per call, batched 50 IDs/page → ~50 calls × 1 unit = 50 units
- **Total: ~300 units. Daily quota free tier = 10,000.** Plenty of headroom.

Resilience:
- Exponential backoff on 429 / 5xx
- Caches per-playlist responses to disk so re-runs don't waste quota
- If a playlist is private/deleted, log and skip (don't crash)

### Output JSON shape (`khan-academy-import.json`)

```ts
type ImportData = {
  importedAt: string; // ISO timestamp
  groups: GroupSeed[];
};
type GroupSeed = {
  key: 'finance' | 'humanities' | 'stem' | 'math' | 'cs';
  title: string;
  position: number;
  icon: string;
  topics: TopicSeed[];
};
type TopicSeed = {
  id: string;          // generated UUID, stable across re-runs (see "ID generation")
  title: string;       // Khan subject name (e.g. "Physics")
  position: number;    // within group
  icon: string;        // emoji chosen from a curated list (see below)
  courses: CourseSeed[];
};
type CourseSeed = {
  id: string;
  title: string;       // playlist title, "| Subject" suffix stripped
  position: number;    // Khan playlist order within subject
  ytPlaylistId: string;// preserved for traceability, not stored in DB
  truncatedFrom: number | null; // raw video count if capped, else null
  lessons: LessonSeed[];
};
type LessonSeed = {
  id: string;
  title: string;
  ytId: string;         // YouTube videoId
  durationSeconds: number;
  position: number;
};
```

### ID generation

Stable UUIDs are generated using **UUIDv5 with a fixed namespace** so re-running the import produces the same IDs (idempotent seed):

```ts
const NS = 'b1e9f5e8-7a4c-4a1d-9e7e-7a3a1e1c0d99'; // arbitrary stable namespace
const uuidV5 = (name: string) => v5(name, NS);

topic.id  = uuidV5(`khan:topic:${subjectKey}`);          // e.g. khan:topic:physics
course.id = uuidV5(`khan:course:${ytPlaylistId}`);
lesson.id = uuidV5(`khan:lesson:${ytPlaylistId}:${ytId}`);
```

This means re-running the import after, say, fixing a title typo regenerates the same IDs and the upsert pattern in seed.sql works without breaking `profile_courses` references.

### Topic icons

The 5 existing topics had hand-picked emojis (🧲 🧬 💰 📐 💻). For 24 new topics, hand-pick once during this PR:

- Physics 🧲 / Chemistry ⚗ / Biology 🧬 / Cosmology & Astronomy 🌌 / Electrical Engineering ⚡ / Computer Animation 🎬
- Algebra Basics ➕ / Pre-Algebra 🔢 / Geometry 📐 / Trigonometry 📏 / Calc AB 📈 / Calc BC 🧮 / Linear Algebra ⛓ / Multi Calc 🧱 / Diff Eq ∂
- Computer Programming 💻 / Computer Science 🖥
- Microeconomics 💸 / Macroeconomics 🌍 / Finance and Capital Markets 💼
- World History 🌎 / US History 🗽 / Art History 🎨 / US gov & civics ⚖

(B&W theme renders these as flat emojis without color background — visual consistency preserved.)

## Component 2: Onboarding group picker refactor

### Server action: `app/onboarding/actions.ts`

Current signature: `completeOnboarding({ rate: number, topicIds: string[] })`.
New signature: `completeOnboarding({ rate: number, groupKeys: string[] })`.

Validation:
- `rate ∈ [0.083, 0.5]` (unchanged from #19)
- `groupKeys`: 0–5 elements from the fixed set `['finance', 'humanities', 'stem', 'math', 'cs']`

Server-side derivation (run inside the action):

```ts
// Step 1: validate group keys against topic_groups table (preset only).
const { data: groups } = await supabase
  .from('topic_groups')
  .select('id, key')
  .eq('is_preset', true)
  .in('key', groupKeys);
if (groups.length !== groupKeys.length) throw new Error('invalid_group');

// Step 2: for each picked group, take top-2 topics by position.
const { data: topicsInGroups } = await supabase
  .from('topics')
  .select('id, group_id, position')
  .eq('is_preset', true)
  .in('group_id', groups.map(g => g.id))
  .order('position', { ascending: true });

const topicsByGroup = new Map<string, typeof topicsInGroups>();
for (const t of topicsInGroups ?? []) {
  if (!topicsByGroup.has(t.group_id)) topicsByGroup.set(t.group_id, []);
  topicsByGroup.get(t.group_id)!.push(t);
}
const pickedTopicIds = groups.flatMap(g =>
  (topicsByGroup.get(g.id) ?? []).slice(0, 2).map(t => t.id)
);

// Step 3: top-3 courses per picked topic.
const { data: coursesInTopics } = await supabase
  .from('courses')
  .select('id, topic_id, position')
  .eq('is_preset', true)
  .in('topic_id', pickedTopicIds)
  .order('position', { ascending: true });

const coursesByTopic = new Map<string, typeof coursesInTopics>();
for (const c of coursesInTopics ?? []) {
  if (!c.topic_id) continue;
  if (!coursesByTopic.has(c.topic_id)) coursesByTopic.set(c.topic_id, []);
  coursesByTopic.get(c.topic_id)!.push(c);
}
const starterCourseIds = pickedTopicIds.flatMap(tid =>
  (coursesByTopic.get(tid) ?? []).slice(0, 3).map(c => c.id)
);

// Step 4: write profile + shelf (existing pattern from #19).
await supabase.from('profiles').update({ rate, interests: pickedTopicIds, onboarded: true }).eq('id', user.id);
const shelfRows = starterCourseIds.map((courseId, idx) => ({
  user_id: user.id, course_id: courseId, position: idx,
}));
await supabase.from('profile_courses').upsert(shelfRows, { onConflict: 'user_id,course_id' });
```

### UI: `components/onboarding/Onboarding.tsx`

Replace the topic-chip step (currently shows 5 topic chips) with a group-chip step that shows 5 group chips. Each chip displays:
- Group icon (emoji from `topic_groups.icon`)
- Group title (`topic_groups.title`, Chinese)
- Subtitle: count of topics in the group (e.g. "理工 · 6 学科")

Layout: same as today's topic chips (flex-wrap grid; 1–2 per row depending on viewport).

The "rate slider" first page is unchanged.

### Page query: `app/onboarding/page.tsx`

Currently selects topics from `topics` table. Change to:

```ts
const { data: groupsData } = await supabase
  .from('topic_groups')
  .select('id, key, title, icon, position')
  .eq('is_preset', true)
  .order('position', { ascending: true });

// Also fetch topic counts per group for the chip subtitle.
const { data: topicCounts } = await supabase
  .from('topics')
  .select('group_id')
  .eq('is_preset', true)
  .not('group_id', 'is', null);

const countByGroup = new Map<string, number>();
for (const t of topicCounts ?? []) {
  countByGroup.set(t.group_id!, (countByGroup.get(t.group_id!) ?? 0) + 1);
}
```

## Component 3: Seed wipe + replace

The new `seed.sql` replaces all preset content. Strategy:

```sql
-- ===== Wipe existing preset content =====
-- Cascades through lessons (FK to courses) and profile_courses (FK to courses).
-- Does NOT cascade to profile_courses for non-preset courses (user-paste content).
delete from public.lessons where course_id in (select id from public.courses where is_preset = true);
delete from public.profile_courses where course_id in (select id from public.courses where is_preset = true);
delete from public.lesson_progress where lesson_id in (
  select l.id from public.lessons l
  join public.courses c on c.id = l.course_id
  where c.is_preset = true
);
delete from public.courses where is_preset = true;
delete from public.topics where is_preset = true;
-- topic_groups already exist from PR1 seed; will be upserted.

-- ===== New preset data (generated by build-seed.ts) =====
-- ... 5 groups, 24 topics, ~170 courses, ~1700 lessons
```

**Note: this destroys user `lesson_progress` for any preset lesson.** Discussed and accepted by user during brainstorming.

### Existing dev users

After the seed change, any existing user's `profile_courses` references the OLD course UUIDs which are now deleted. Two options:

- **A. Delete + auto-restore on next login**: also wipe `profile_courses` for preset courses, and on next login, dev users re-onboard
- **B. Migrate existing dev users**: best-effort map old course IDs to similar new course IDs; risky, mostly meaningless for placeholder data

Going with **A** (cleaner). `/api/dev/login` will be updated to re-seed dev user shelf using the new pattern.

### `/api/dev/login` updates

Currently seeds dev user with all 5 preset topics + their 10 courses. New behavior:
- Pick all 5 preset groups
- Run the same derivation as `completeOnboarding` (top-2 topics × top-3 courses per group = 30 starter courses across 10 topic rails)
- Write `profile.interests` and `profile_courses` accordingly

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| YouTube API quota exceeded | Low (~300 units of 10,000) | Cache per-playlist results; re-run only fetches missing pieces |
| Khan playlist is private / deleted between research and import | Low (catalog is mature) | Skip + log; spec lists subjects so any drop is reviewable |
| `seed.sql` becomes too large to parse easily | Medium (~150 KB) | Split into multiple files (`seed-topics.sql`, `seed-courses.sql`, `seed-lessons.sql`) loaded by master `seed.sql` if size exceeds 200 KB |
| Existing `profile_courses` rows reference deleted course IDs after seed swap | High by design | Wipe `profile_courses` for preset courses as part of the swap; document loss in handoff |
| Onboarding test (`tests/onboarding.spec.ts`) fixtures break | High | Tests need rewriting for the new group-chip flow; included in plan |
| Build-seed runs before PR1 ships and hits "topic_groups doesn't exist" | Medium | Check at script start: `SELECT 1 FROM topic_groups LIMIT 1` and fail loudly with instructions |

## Test plan

- [ ] **Import script smoke**: `npx tsx scripts/import-khan.ts` runs to completion, produces `khan-academy-import.json` with 5 groups, 24 topics, 171 courses, ~1,700 lessons (after 30-cap)
- [ ] **Build-seed determinism**: running `build-seed.ts` twice produces byte-identical `seed.sql`
- [ ] **Migration apply**: `npm run supabase:reset` applies cleanly
- [ ] **Onboarding action**: `tests/onboarding.spec.ts` rewritten — pick 2 groups, verify `profile.interests` has 4 topic UUIDs, `profile_courses` has 12 rows
- [ ] **Onboarding empty pick**: pick 0 groups, verify `profile.interests = []` and `profile_courses` empty
- [ ] **Home render**: log in, complete onboarding picking `stem`, verify home shows 2 rails (top 2 of 6 stem topics by position) with 3 courses each
- [ ] **Manual: dev login refreshes shelf**: log out, hit `/api/dev/login`, verify dev user has 30 shelf courses across 10 rails
- [ ] **Build passes**: `npm run build` succeeds (catches TypeScript errors against new schema)

## Open items (need user input before implementation)

1. **Lesson cap value**: 30 chosen as default. User may want 15 (very lean) or 50 (more complete) — easy to change.
2. **Topic icons**: hand-picked above. User may want to swap any.
3. **Onboarding chip subtitle**: "理工 · 6 学科" or just "理工"? Or include 1–2 example topic names for context?
4. **Group icon for `cs`**: Currently 💻 — same as Computer Programming topic icon. Visual collision in onboarding chip vs topic rail. Maybe 🖥 for the group?
5. **Existing dev users in production**: any real signups beyond the dev user need their `profile_courses` cleared too. PR2 includes a one-time wipe in the migration; OK?

These items are bounded and small — implementer can defer to user during implementation rather than block the spec.

## Estimated implementation effort

- Component 1 (import + build-seed): 4–6 hours including API fetching wait time
- Component 2 (onboarding refactor): 2–3 hours including test rewrite
- Component 3 (seed swap + dev/login update): 1 hour
- Verification: 1–2 hours

Total: ~1 day of focused work.
