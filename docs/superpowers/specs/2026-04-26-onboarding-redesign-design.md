# Onboarding redesign

**Date:** 2026-04-26
**Author:** Luyin (via brainstorming with Claude)

## Goal

Replace the current 9-slide onboarding (`components/onboarding/Onboarding.tsx`) with a 2-page flow that does only what landing can't: set the rate, pick interests, and seed a personal "shelf" of courses. Landing already covers the emotional / conceptual arc, so onboarding stops trying to re-tell that story.

Onboarding's PM job is now narrowly defined:

1. **Make the deal concrete** — let the user touch the learn/scroll ratio while reading the value prop, not as a separate config step.
2. **Personalize home** — capture topic interests so home renders meaningful rails on first paint instead of a generic library.
3. **Seed a shelf** — for each picked topic, snapshot 2 starter courses into the user's bookshelf so home has content to show.
4. **Defer everything else** — gestures, characters, daily goals, notifications: not in onboarding. Taught in-context or later.

The aha moment (jar ticking up during a lesson) is delivered by the existing home `continueCard`, not a third onboarding page.

## Decisions (from brainstorming)

| # | Decision | Rationale |
|---|---|---|
| D1 | Cut from 9 slides to 2 pages | Landing already does scenes 1-5 (emotional arc, "the loop", "the deal"). Slides 6 (Nibs/Angel intro), 7 (chips), 8 (rate), 9 (welcome gift) collapse into 2 pages by merging "explain the deal" with "set the ratio" and skipping standalone character intros. |
| D2 | Page 1 = "the deal" + ratio slider in one screen | Reading the contract and signing it happen in the same moment. Stronger commitment than a separate config step. |
| D3 | Default ratio: 20 min learn = 5 min scroll (4:1) | Anchor effect: most users won't move the slider. 4:1 is strict enough to express the product's stance ("scroll less") without scaring users off. |
| D4 | Slider varies the "learn" minutes; "scroll" stays fixed at 5 min | "How much learning earns me 5 min of scroll?" is a concrete reading; "1 min learn = X min play" is abstract. Range 10–60 min, step 5. |
| D5 | Replace daily-goal page with nothing | The rate IS the commitment lever. Asking a daily-goal question on top is redundant ("you just told me 20 min, why ask again?") and conflicts with the streak loop, which is naturally driven by the economy itself ("want to scroll → must learn"). |
| D6 | Page 2 = pick from preset topics in DB (currently 5: Physics, Biology, Economics, Math, Programming) | Don't invent categories. Ship what content actually exists. New presets will appear automatically when seeded. |
| D7 | No minimum, no maximum on topic picks (0–5 allowed) | Forced minimums create false signal. Page sub-text tells the user they can add topics or paste a YouTube link later, so picking 0 is a real option, not a dead-end. |
| D8 | No order weighting on picks | With only 5 candidates the signal is noisy and the recommender doesn't yet exist. Add when there's something to recommend with. |
| D9 | Seed user's shelf with 2 starter courses per picked topic | Snapshot at onboarding time. Future preset additions don't auto-appear on existing shelves; that's surfaced later via a "X new in Physics" hint on home (out of scope here). |
| D10 | Drop the third "starter shelf reveal" page | After clarifying with the user, the reveal page added a step without a decision payoff. Home's existing `continueCard` already delivers the aha (tap → lesson → jar ticks). |
| D11 | All writes happen in one server action at the end (B2 timing) | Onboarding stays atomic: until the final commit, nothing is in the DB. Back-button changes are pure client state. No half-completed onboarding rows. |
| D12 | Page 2 tiles show emoji + topic name only — no "X courses · Y lessons" meta | Reduce cognitive load. Course-count is irrelevant to the pick decision; the user is picking interests, not shopping. |
| D13 | Replace `profiles.interests` semantics: stored value becomes topic UUIDs (as text), not free strings | Re-uses an existing column. RLS already correct. Old free-string values are pre-onboarding-redesign noise; the only users whose `interests` is a free-string array also have `onboarded=true` and won't re-enter this flow. We do not migrate or read those values from the new code path. |
| D14 | New table `profile_courses(user_id, course_id, position, added_at)` for the shelf | Cleanest model: preset courses stay one row in `courses`, multiple users reference them. `lesson_progress` keeps using preset `lesson_id`s; per-user progress is naturally scoped by `user_id`. Avoids cloning 10 courses + 21 lessons per user. |
| D15 | If user picks 0 topics → no `profile_courses` rows; home renders an empty state with the existing `/add` (paste YouTube link) entry | Empty home state is acknowledged but designed in a follow-up spec. v1 simply renders no rails + the existing dashed "+ paste YouTube link" row. |
| D16 | Widen `profiles.rate` from `numeric(3,1)` to `numeric(5,3)` | Default `5/20 = 0.25` and minimum `5/60 ≈ 0.083` need at least 3 decimal places. Existing rows (1.0, 0.5, etc.) cast cleanly. |

## Out of scope (explicit)

- **Topic browser page** (`/topics` or similar) — needed eventually so 0-pick users and "I want more" users can add topics post-onboarding. Not built here. The existing `/add` (paste YouTube URL) flow remains the only non-onboarding way to grow the shelf in v1.
- **Home empty state polish** — when interests is empty, home renders no rails. The existing dashed "+ paste YouTube link" entry remains. A nicer empty-state card is deferred.
- **"X new courses available" hints** on rails when preset library grows — deferred.
- **Notification permission / daily reminder** — explicitly deferred per D5 reasoning.
- **Nibs / Angel character intros** — taught in-context on lesson and feed pages, not in onboarding.
- **Editing rate / interests after onboarding** — settings page does not exist yet. `profiles.rate` and `profiles.interests` will be editable later via settings; not in this spec.
- **`/add` UI updates** to choose which topic a pasted course goes under — orthogonal; the current `/add` flow continues unchanged.
- **Migrating existing `profiles.interests` free-string data** — those users already have `onboarded=true` and won't re-enter onboarding; the new home code path filters by topic UUID and naturally ignores legacy strings.

## User flow

```
landing (4 chapters + CTA) → signup/login → /onboarding
  page 1 (the deal)            ↓ next
  page 2 (pick topics)         ↓ continue or skip
  ─ server action ─
    profiles.rate, profiles.interests, profiles.onboarded=true
    insert into profile_courses (one row per starter course)
  → /home
```

Back button on page 2 returns to page 1 with values preserved (client state). No DB writes until the final CTA.

If the user already has `onboarded=true` and lands on `/onboarding`, the existing `app/onboarding/page.tsx` redirect to `/home` is preserved.

## Page 1 — The deal

```
              01 · the deal
              (eyebrow, accent)

         Earn your guilty-free
         scroll time by learning.
              (headline, display)

   ┌─────────────────────────────────┐
   │   Learn   20  min               │
   │   Scroll   5  min               │
   │                                 │
   │   ●━━━━━━━━━━━━━━━━━━━━━━━━━    │
   │   easygoing · balanced · monk   │
   │                                 │
   │   you can change this anytime.  │
   └─────────────────────────────────┘

         [   sounds fair →   ]
```

- Slider value = learn minutes. Range **10–60, step 5**, default **20**.
- Scroll value is the literal text "5" and never changes.
- Mood label below the slider track:
  - 10 → `easygoing`
  - 15–25 → `balanced`
  - 30–45 → `focused`
  - 50–60 → `monk mode`
- Stored ratio: `rate = 5 / learnMinutes` (so default 5/20 = 0.25). This matches the existing `profiles.rate` semantic ("min of play per min of learn"), but the *displayed* number is always learn-minutes, never the decimal.
- "you can change this anytime." sub-line removes commitment anxiety.
- CTA copy is fixed: `sounds fair →`. Always enabled.

## Page 2 — Pick topics

```
              02 · pick what catches your eye
              (eyebrow, accent)

         What sounds interesting?
              (headline, display)

   ┌──────────────────────────────────┐
   │ 🧲   Physics                     │
   ├──────────────────────────────────┤
   │ 🧬   Biology                     │
   ├──────────────────────────────────┤
   │ 💰   Economics                   │
   ├──────────────────────────────────┤
   │ 📐   Math                        │
   ├──────────────────────────────────┤
   │ 💻   Programming                 │
   └──────────────────────────────────┘

   pick any number — none is fine too.
   you can add topics or paste a YouTube link later.
        (sub-text, ink-mute)

       [   skip for now →   ]
```

- Tile contents: emoji icon (`topics.icon`) + title (`topics.title`). No meta line.
- Selected state: 4px topic-color (`topics.color`) bar on the left edge; background brightens slightly.
- Tile is a button (`role="button"`, keyboard-toggleable).
- CTA copy varies by selection count:
  - 0 picked → `skip for now →`
  - ≥1 picked → `continue ({N} picked) →`
- CTA is always enabled.
- Topics fetched from DB at server-render of `/onboarding`, filtered to `is_preset = true`, ordered by `position`.

## Server action: `completeOnboarding`

Replaces the existing `app/onboarding/actions.ts`.

**Input:**
```ts
{
  rate: number,         // numeric, 0.0833…1.0 (= 5/60 to 5/5)
  topicIds: string[],   // UUIDs of preset topics, length 0–5
}
```

**Validation (zod):**
- `rate` ∈ [0.08, 0.5] — corresponds to learnMinutes ∈ [10, 60] via `rate = 5/learnMinutes`. Lower bound rounded down a hair to absorb float arithmetic noise.
- `topicIds` length 0–32 (liberal upper bound that doesn't hardcode the current preset count of 5; defends against malicious oversize payloads). Each must be a UUID and must reference a row in `topics` where `is_preset = true` (revalidate at server).

**Steps:**
1. Auth: `supabase.auth.getUser()`. If absent, throw `unauth`.
2. Read the requested topic rows: `select id from topics where is_preset = true and id = any(:topicIds)`. If any requested ID is missing, throw `invalid_topic`.
3. For each topic, fetch its courses ordered by `position` and slice the first 2: `select id, topic_id, position from courses where is_preset = true and topic_id = any(:topicIds) order by topic_id, position`. Group client-side, take top 2 per topic.
4. **Single transaction** (use a Postgres function or a sequence with the user's RLS-bound client; see "Implementation note" below):
   - `update profiles set rate = :rate, interests = :topicIds, onboarded = true where id = :uid`
   - `insert into profile_courses (user_id, course_id, position) values …` — one row per (user, course) pair from step 3, `position` = index across the flattened starter list (0…2N-1). On conflict do nothing (idempotent if user reloads and re-submits).
5. `redirect('/home')`.

If the user submits with `topicIds = []`: skip step 3, skip the insert, just update `profiles`.

**Implementation note (atomicity):** The cleanest atomic option is a `security invoker` Postgres function `complete_onboarding(p_rate numeric, p_topic_ids uuid[])` that the client calls via `supabase.rpc(...)`. The function runs as the caller (RLS-respecting) and wraps both writes in one statement. Acceptable alternative: do the two writes back-to-back from the server action and accept that a crash between them leaves `onboarded=true` with a partial shelf — but the second write is idempotent (PK conflict), so a subsequent home load with the user re-running onboarding can't happen (onboarded is already true). The risk surface is small. Pick whichever the implementer prefers; the function is cleaner and gets recommended.

## Schema changes

### New migration: `supabase/migrations/0007_onboarding_redesign.sql`

```sql
-- 0007_onboarding_redesign.sql
-- (1) User's "shelf": references to courses they're following.
--     Preset courses are not cloned — multiple users reference the same row.
-- (2) Widen profiles.rate to allow the new ratio range (5/learnMinutes).

create table public.profile_courses (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  position  int  not null default 0,
  added_at  timestamptz not null default now(),
  primary key (user_id, course_id)
);

create index on public.profile_courses (user_id, position);

alter table public.profile_courses enable row level security;

create policy profile_courses_read_own on public.profile_courses
  for select using (user_id = auth.uid());

create policy profile_courses_insert_own on public.profile_courses
  for insert with check (user_id = auth.uid());

create policy profile_courses_update_own on public.profile_courses
  for update using (user_id = auth.uid());

create policy profile_courses_delete_own on public.profile_courses
  for delete using (user_id = auth.uid());

-- Widen rate precision (was numeric(3,1) — only 1 decimal).
alter table public.profiles
  alter column rate type numeric(5,3) using rate::numeric(5,3);
```

### `profiles.interests` semantics change

No migration. Column type stays `text[]`. New code stores topic UUIDs (as text). Existing rows with `onboarded=true` keep their legacy free-string values; new home code filters topics by `id = any(profile.interests)`, so legacy strings simply don't match any topic and produce zero rails — same as a 0-pick user, which is acceptable behavior for a small population.

### Optional: `complete_onboarding` Postgres function

```sql
create or replace function public.complete_onboarding(
  p_rate numeric,
  p_topic_ids uuid[]
) returns void
language plpgsql
security invoker
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauth';
  end if;

  update public.profiles
    set rate      = p_rate,
        interests = (select array_agg(t::text) from unnest(p_topic_ids) t),
        onboarded = true
    where id = v_uid;

  insert into public.profile_courses (user_id, course_id, position)
  select v_uid, c.id, row_number() over (order by c.topic_id, c.position) - 1
    from public.courses c
   where c.is_preset = true
     and c.topic_id = any(p_topic_ids)
     and c.position < 2
  on conflict do nothing;
end;
$$;
```

If migrating now feels too heavy, the server action can do the same logic with two awaited writes. Either is acceptable.

## Home page change

`app/home/page.tsx` currently fetches all topics + all courses and renders one rail per preset topic. After this spec lands, it should:

1. Read `profile.interests` (already selected in the existing query).
2. Filter the topics query: `.in('id', profile.interests)` — no rail for unpicked topics.
3. Filter the courses query: `.in('id', shelfCourseIds)` where `shelfCourseIds` comes from a new query against `profile_courses` for this user. Preset courses **not** on the shelf are not shown.
4. The existing `continueCard` logic (find the first topic's first course's first undone lesson) keeps working unchanged on the filtered set.
5. The existing dashed "+ paste YouTube link" row stays.

Empty state (interests = []): no rails, just the dashed `/add` row. Polish deferred.

## Files affected

| File | Change |
|---|---|
| `app/onboarding/page.tsx` | Fetch preset topics (`id, title, icon, color, position` ordered by `position`) and pass to the new `Onboarding` component along with current `profile.rate` and `profile.interests`. Server-side redirect to `/home` if `profile.onboarded` already preserved. |
| `app/onboarding/actions.ts` | Replace `completeOnboarding` body. New input shape `{ rate: number, topicIds: string[] }`. Validation per "Server action" section. Either RPC `complete_onboarding` or two awaited writes (profile update + bulk insert into `profile_courses`). |
| `components/onboarding/Onboarding.tsx` | Full rewrite. 2 client-only pages + back arrow + progress dots (already present). State holds `step`, `learnMinutes`, `selectedTopicIds`. CTA on page 2 dispatches the server action with `{ rate: 5/learnMinutes, topicIds }`. |
| `components/onboarding/Scenes.tsx` | Delete (no comic scenes anymore). |
| `app/home/page.tsx` | Add a fourth query for `profile_courses` (or join). Filter `topics` by `profile.interests`; filter `courses` by shelf membership. Continue card derivation untouched in shape. |
| `supabase/migrations/0007_onboarding_redesign.sql` | New: `profile_courses` table + RLS policies + widen `profiles.rate` to `numeric(5,3)`. Optionally include the `complete_onboarding` RPC. |
| `lib/supabase/database.types.ts` | Regenerate via `npm run gen:types` after the migration. |
| `tests/onboarding.spec.ts` (new, optional) | Playwright: walk page 1 (assert default 20 / mood "balanced"), drag slider, page 2 (pick 2 topics), submit, assert `/home` shows exactly those topic rails with 2 courses each. |

## Open items / risks

- **`/add` topic assignment:** when a user pastes a YouTube URL post-onboarding, the resulting course needs a `topic_id` and a `profile_courses` row. Today `/add` may not be wired this way. Out of scope for onboarding, but a known integration edge that should be fixed in a follow-up so the user's shelf stays internally consistent.
- **Settings:** rate and interests are currently un-editable post-onboarding. A settings entry point is a separate spec. Until then, the `/onboarding` redirect for `onboarded=true` users prevents re-entry.
- **0-pick UX:** with no topic browser yet, a 0-pick user can grow their shelf only via `/add`. That's a thin path. A follow-up spec for `/topics` (or a home-side "browse topics" entry point) is needed within a sprint of shipping this.
- **Atomicity choice (RPC vs two writes):** noted above. Either acceptable for v1; RPC preferred long-term.
