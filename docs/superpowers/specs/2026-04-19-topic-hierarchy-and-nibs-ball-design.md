# Topic Hierarchy + Nibs Ball + Global Nav — Design Spec

**Date:** 2026-04-19
**Branch:** `redesign-topic-hierarchy` (base: `cf896d0` on `main`)
**Execution model:** Four independent phases, each shipping its own PR.

## Problem

The working app shipped overnight has surfaced usability issues on real usage:

1. The 5 hardcoded feed videos and Khan-Academy-adjacent seed videos routinely fail to embed (YouTube embed restrictions).
2. The hierarchy is too flat — `/home` lists "courses" which are actually single-video entries. Users expect `topic → course → video`.
3. Course rows show only emoji — no thumbnail. Looks unfinished.
4. YouTube player has controls stripped (no fullscreen, no volume).
5. Play-time counter only updates on 15s server heartbeat, causing visibly jumpy increments (users expect per-second tick).
6. No global navigation — `/progress` is reachable only via the jar-chip, which users do not recognize as a link.
7. `NibsHandle` was an edge-pinned handle whose `onSummon` was a no-op — and the edge position conflicts with iOS swipe-back.
8. Feed uses a "next" button rather than TikTok-style vertical swipe.
9. Feed exit is a plain "done now" button rather than the themed Angel-return-to-learning interaction.

## Goal

Restructure the app into a three-level content hierarchy seeded with real Khan Academy content, add global bottom navigation, replace the broken NibsHandle with a draggable floating ball that drives the break-time flow, and redo the feed as a vertically-swiped stack with an Angel handle for returning to learning.

## Non-Goals (out of scope)

- Onboarding redesign (parallel worktree territory)
- Real Nibs chat (beyond the break-entry sheet)
- AI-driven content recommendation
- Playlist import for `/add` (still single-video only)
- Offline / service worker
- Theming changes (Linear-light palette is locked)

## Phase Plan

Each phase ships a green, runnable app. The user verifies each phase before we move to the next.

| # | Phase | Scope | Result |
|---|-------|-------|--------|
| 1 | **Data layer + seed** | New `topics` table, `courses.topic_id` FK, Khan Academy seed | Home lists 5 real topics from Supabase, each links to a topic detail page (new route) that lists real courses |
| 2 | **Page surfaces + global nav** | `/topic/[id]` new page, `/home` rewrite, `/course/[id]` thumbnail polish, `/lesson/[id]` native YT controls + 1s client tick, `<BottomNav />` component mounted in root layout | Users can navigate topic → course → lesson fluidly; progress page reachable from any non-immersive page |
| 3 | **Nibs floating ball** | New `<NibsBall />` global component with drag + tap-to-summon; bottom-sheet break-entry flow; `/budget` route is kept as fallback but no longer the primary entry | Break flow starts by tapping the Nibs ball, same data flow into `/feed` |
| 4 | **Feed redesign** | Vertical-swipe feed list, Angel handle in top-left for return-to-learning | Feed feels native to TikTok-style content; exit interaction matches Nibs/Angel theme |

## Phase 1: Data Layer + Seed

### Schema changes

New migration `0005_topics.sql`:

```sql
-- Create topics table.
create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  is_preset boolean not null default false,
  title text not null,
  icon text,
  color text,           -- hex string for topic accent e.g. '#5e6ad2'
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.topics enable row level security;

-- Read policy: owner or preset.
create policy topics_read on public.topics
for select using (
  owner_id = (select auth.uid())
  or is_preset = true
);

-- Write policies: owner only on owned rows; presets are seeded via service role.
create policy topics_insert on public.topics
for insert with check (owner_id = (select auth.uid()) and is_preset = false);
create policy topics_update on public.topics
for update using (owner_id = (select auth.uid()) and is_preset = false);
create policy topics_delete on public.topics
for delete using (owner_id = (select auth.uid()) and is_preset = false);

-- Add topic_id to courses.
alter table public.courses
  add column if not exists topic_id uuid references public.topics(id) on delete set null,
  add column if not exists position integer not null default 0;

create index if not exists idx_courses_topic_id on public.courses(topic_id);

-- Update courses.lessons_read RLS policy is unchanged (still reads through course).
-- Add a "topic readable" predicate for course reads so non-topic courses still
-- readable when owned or preset (keeps legacy data working).
```

**Data invariants:**
- A preset course MUST have `topic_id` pointing to a preset topic.
- A user-created course MAY have `topic_id = null` (goes under "Other / My library"). This preserves backward compat with the `/add` flow.
- `lessons.course_id` FK unchanged.

### Seed content

Replace the existing preset courses. The seed sets `is_preset=true`, `owner_id=null`. Seed values below are the fixed canonical set for preset content; adding more comes later via `/add` or admin tooling.

```sql
-- 5 preset topics (position 0..4 for display order).
insert into topics (id, is_preset, title, icon, color, position) values
  ('10000000-0000-0000-0000-000000000001', true, 'Physics',    '🧲', '#5e6ad2', 0),
  ('10000000-0000-0000-0000-000000000002', true, 'Biology',    '🧬', '#10b981', 1),
  ('10000000-0000-0000-0000-000000000003', true, 'Economics',  '💰', '#f4c874', 2),
  ('10000000-0000-0000-0000-000000000004', true, 'Math',       '📐', '#d96f3d', 3),
  ('10000000-0000-0000-0000-000000000005', true, 'Programming','💻', '#4c56c4', 4);
```

**Per-topic course seed (10 courses total, 2 per topic).** Every course ships with at least 1 verified YouTube video ID. Secondary courses ("Motion & Energy", etc.) start with 1-2 IDs and can be extended later via `/add` or a follow-up seed pass. No seed-time network calls — all IDs are hardcoded in `supabase/seed.sql`.

Concrete IDs (verified via search during brainstorming):

| Topic | Course | Seed video IDs | Count |
|-------|--------|----------------|-------|
| Physics | Forces & Newton's Laws | `rjkQcfw5fkM`, `CQYELiTtUs8`, `Bkl6Mn1Y23Q`, `IgYUR7aFY-c` | 4 |
| Physics | Motion & Energy | *Phase 1 execution: search + verify 1-2 IDs from `PLqwfRVlgGdFCqqzN5kxklreTBOnILQLiq`. If search fails, ship with 1 ID: `IgYUR7aFY-c` (reuse; not ideal but avoids empty course)* | ≥1 |
| Biology | Cell Structure | `5KfHxF6Vhps`, `Hmwvj9X4GNY`, `zk3vlhz1b6k` | 3 |
| Biology | Cell Theory & Parts | *Phase 1 execution: 1-2 IDs from `PLSQl0a2vh4HDmOg7VVnL5kiEh7tKB-jJh`. Fallback: reuse `zk3vlhz1b6k`* | ≥1 |
| Economics | Intro to Economics | `wCHm5SdNO5U`, `8JYP_wU1JTU` | 2 |
| Economics | Supply & Demand | *Phase 1 execution: 1-2 IDs from `PLSQl0a2vh4HDERCw_ddanXbsDpFWcpL-S`. Fallback: reuse `8JYP_wU1JTU`* | ≥1 |
| Math | Intro to Limits | `riXcZT2ICjA` | 1 |
| Math | Algebra Basics | `vDqOoI-4Z6M` | 1 |
| Programming | Intro to CS (Python) | `rJCRGiEidZ4` | 1 |
| Programming | Algorithms | *Phase 1 execution: 1 ID from same playlist. Fallback: reuse `rJCRGiEidZ4`* | ≥1 |

**Execution policy:** Phase 1 implementer does ONE round of web search to fill the `*Phase 1 execution*` rows with concrete IDs before writing the seed SQL. If any search turns up empty, the fallback ID is used (no empty courses ship).

**Duration:** seed with `duration_seconds = 0`. The `/course/[id]` page renders "—" for zero-duration lessons, already wired from overnight PRs. Operators can later set `YOUTUBE_API_KEY` and re-run a seed-update script to fill durations — out of scope for Phase 1.

**Implementation note:** The seed lives in `supabase/seed.sql`. The new seed deletes all preset `courses` and `lessons` (via `where is_preset = true`), creates 5 topics with fixed UUIDs (listed above), then creates 10 courses and their lessons keyed to fixed UUIDs. Re-running `pnpm supabase:reset` is idempotent.

### API + page ripple

- `/home` query changes from `courses` list to `topics` list (with nested course count via a join or separate query).
- New route `/topic/[id]` lists courses belonging to that topic. RLS-protected (topics_read policy).
- `/course/[id]` unchanged in behavior; adds topic_id breadcrumb.
- `/api/youtube/parse` unchanged.
- `/add` flow: when a user adds a video, ask for a topic (dropdown of all visible topics + "no topic"). Default to no topic. Course gets `topic_id` set accordingly.
- `lib/supabase/database.types.ts` regenerated via `pnpm gen:types`.

### Testing (Phase 1)

- Unit-ish: one smoke test that seeds DB, logs in, visits `/home`, asserts 5 topic rows render with correct titles.
- One smoke test that clicks a topic and lands on `/topic/[id]` with the expected courses listed.
- Existing tests remain green (home, course, lesson, feed, progress, add).

## Phase 2: Page Surfaces + Global Nav

### `/home` rewrite

Before:
```
[hey, {name}]  [jar chip →/progress]
[continue card]
[take a break card]       ← removed
[your topics]             ← re-uses 'topics' label but lists courses
[course rows]             ← now topic rows
[+ paste YouTube link]
```

After:
```
[hey, {name}]  [jar chip →/progress]  (jar-chip keeps link; deprioritized visually)
[continue card]           ← points to 'next undone lesson' across all preset topics
[your topics]
[topic rows w/ thumbnail + course count + lesson count]
[+ paste YouTube link]    ← stays
```

Topic row anatomy:
```
┌──────────────────────────────────────────────┐
│ ┌──────┐  Physics                       ›   │
│ │ IMG  │  2 courses · 7 lessons · 2/7 done  │
│ └──────┘                                    │
└──────────────────────────────────────────────┘
```

Thumbnail: `https://i.ytimg.com/vi/<topic's first course's first lesson yt_id>/hqdefault.jpg`. If none, fall back to topic emoji on a colored background.

### `/topic/[id]` (new)

```
[‹ back]   Physics        [jar chip]
──────────────────────────────────
[course card: Forces & Newton's Laws]
 └ thumbnail + title + progress bar + done/total
[course card: Motion & Energy]
 └ thumbnail + title + progress bar + done/total
```

Each course card links to `/course/[id]`.

### `/course/[id]` polish

- Add thumbnail on each lesson row: `https://i.ytimg.com/vi/<lesson.yt_id>/mqdefault.jpg` (320×180, lighter than hq).
- Keep existing current/future/done indicators.

### `/lesson/[id]` upgrades

1. **Restore YT controls.** Current iframe URL strips controls. Set the embed URL to include `controls=1&rel=0&modestbranding=1&enablejsapi=1`. This gives back fullscreen, volume, scrubber, picture-in-picture.
2. **Client-side 1s tick.** Add a `useEffect` with `setInterval(1000)` that increments a local display counter while `playing === true`. The counter is purely cosmetic; the authoritative balance remains `profiles.jar_balance_cached` (reconciled on every heartbeat success). On heartbeat response, replace local counter with server value to avoid drift.
3. **Keep pause → stop timer.** Existing behavior. 5-min idle upgrade deferred.

### `<BottomNav />` global

```
┌───────────────────┐
│    🏠          📊 │
│   home      progress│
└───────────────────┘
```

- Mount in `app/layout.tsx`.
- Hide on `/lesson/*` and `/feed` (check `usePathname`).
- Hide on `/login` and `/` (splash).
- 56px tall, `border-top: 1px solid var(--line)`, `background: var(--bg)`.
- Active state: indigo (`var(--accent)`), muted when inactive.
- Testids: `nav-home`, `nav-progress`.

### Testing (Phase 2)

- Topic page smoke: seed → login → visit `/topic/[id]` → 2 course cards visible → click one lands on `/course/[id]`.
- Home smoke updated: 5 topic rows (not course rows).
- Bottom nav smoke: on `/home`, nav visible; on `/lesson/[id]`, nav hidden.
- Lesson page: still passes existing heartbeat + mark-done tests.

## Phase 3: Nibs Floating Ball

### `<NibsBall />` component

Location: `components/characters/NibsBall.tsx` (new). Replaces `NibsHandle`.

```tsx
'use client';
// Pseudocode:
// - usePathname(): if '/lesson/' or '/feed' → return null.
// - useState<{x:number, y:number}>, initialized from localStorage or default bottom-right.
// - Pointer events: onPointerDown records start, threshold 6px to distinguish drag vs tap.
//   - Drag: update position in state, clamp to viewport.
//   - Tap: open BreakSheet.
// - onPointerUp: if drag, persist position to localStorage ('nibs-ball-pos').
// - Resize listener: clamp current pos into new viewport bounds.
// - Render: 56px circle, red-orange gradient, Nibs face inside (simple SVG or emoji 😈 for v1).
// - When BreakSheet open, ball itself fades to 0.3 opacity.
```

**Tap vs drag:** use a 6px pointer-movement threshold over the pointerdown→pointerup window. If movement < 6px OR total duration < 200ms → tap; else drag.

**Position persistence:** `localStorage.setItem('nibs-ball-pos', JSON.stringify({x,y}))`. On mount, read and clamp into current viewport.

**Default position:** bottom-right. `x = window.innerWidth - 56 - 16`, `y = window.innerHeight - 56 - 120` (leaves room for bottom nav).

**Accessibility:** `role="button"`, `aria-label="summon nibs"`.

### BreakSheet component

Location: `components/characters/BreakSheet.tsx` (new).

State machine:
```
idle → open-ask → (user clicks "好啊") → open-budget → (user submits) → posting → done/navigate
                                                              │
                   (user clicks "再学一下") → close           │
                                                              ▼
                                                         POST /api/sessions/start
                                                         {kind: 'feed', budgetSeconds}
                                                              │
                                                              ▼
                                                         router.push('/feed')
```

Stage A ("open-ask"):
```
┌──────────────────────────────┐
│           😈                 │
│   想休息一下吗？             │
│                              │
│  [ 再学一下 ]  [  好啊  ]   │
└──────────────────────────────┘
```

Stage B ("open-budget"):
Reuses the logic and chip layout currently in `app/budget/BudgetForm.tsx` — but as a bottom sheet, not a page. The `BudgetForm` component already exists; extract its body into a `<BudgetPicker />` primitive that both the sheet AND the standalone `/budget` page use.

### Changes to `/home` and `/budget`

- Remove the "take a break" dashed card from `/home` (already flagged in Phase 2, but committed here for scope clarity).
- Keep `/budget` route. It's still reachable via direct URL and serves as a fallback if user lands there from an old bookmark. UI change: add a note at the top "or pull up Nibs from anywhere →".

### Testing (Phase 3)

- Ball render smoke: on `/home`, `[data-testid="nibs-ball"]` visible; on `/lesson/x`, not visible.
- Tap flow: tap the ball → BreakSheet ask-stage visible; click "好啊" → budget-stage visible; choose preset and submit → navigates to `/feed` with session created (assert on session row).
- Drag flow: drag 100px right → localStorage `nibs-ball-pos.x` increased by ~100. (Position assertion is fuzzy because Playwright pointer events aren't pixel-exact on all platforms; use a tolerance.)

## Phase 4: Feed Redesign

### Vertical swipe

Replace the "↓ next" button with a scrollable stack:

```tsx
// Pseudocode:
<div className="feed-stack">
  {VIDEOS.map((v, i) => (
    <section key={v.id} className="feed-snap-item">
      <iframe ... />
    </section>
  ))}
</div>
```

CSS:
```css
.feed-stack {
  overflow-y: scroll;
  scroll-snap-type: y mandatory;
  height: 100dvh;
}
.feed-snap-item {
  scroll-snap-align: start;
  scroll-snap-stop: always;
  height: 100dvh;
}
```

### Play/pause coordination

Use `IntersectionObserver` on each `<section>` with `threshold: 0.7`. When a section becomes "most visible," postMessage `playVideo` to its iframe; postMessage `pauseVideo` to all others.

### AngelHandle top-left

```tsx
// components/characters/AngelHandle.tsx
// - Fixed top-left (16px / 16px).
// - 56px yellow (#f4c874) pill containing small angel emoji/SVG + "back to learning" label.
// - Tap → opens AngelReturnSheet.
```

AngelReturnSheet (mirror of BreakSheet):
```
┌──────────────────────────────┐
│           👼                 │
│   回去学习吗？               │
│                              │
│  [ 再逛一下 ]  [  好  ]    │
└──────────────────────────────┘
```

Click "好" → POST `/api/sessions/end` → router.push('/home'). Matches the existing `doneNow` flow.

### Remove bottom "done now" button

Delete `feed-done-bar` component. Replace with nothing — AngelHandle is the exit.

### Keep

- Server heartbeat every 15s (unchanged).
- Local 1s countdown in top-right (exists).
- Budget-exhausted auto-end overlay (exists).

### Testing (Phase 4)

- Feed smoke updated: click AngelHandle → sheet → confirm → navigates to `/home` and session is ended.
- Vertical swipe is not automatically asserted (Playwright scroll-snap is brittle); manual verification on the user's device.

## Open Risks & Mitigations

1. **Topic migration may leave orphan courses.** Existing `courses` rows without `topic_id` remain visible under a synthetic "Other" on `/home`. We don't delete them.
2. **Seed idempotency requires fixed UUIDs.** The seed hardcodes topic UUIDs; if a previous seed ran, re-running must UPSERT, not INSERT. Use `insert ... on conflict (id) do update`.
3. **Nibs ball might block YT controls.** Ball is hidden on `/lesson` and `/feed`, so no conflict in practice. Verified via `usePathname()` check.
4. **Bottom nav on mobile can be covered by iOS home bar.** Add `padding-bottom: env(safe-area-inset-bottom)`.
5. **Scroll-snap + YouTube iframe has known jankiness on iOS Safari** — the iframe ignores scroll events during initial load. Acceptable; not fixing in this spec.

## Rollout order

1. Branch `redesign-topic-hierarchy` off `main` (done).
2. Phase 1 → own commit range, review, merge.
3. Phase 2 → commits, review, merge.
4. Phase 3 → commits, review, merge.
5. Phase 4 → commits, review, merge.

No single phase requires the next to be usable.
