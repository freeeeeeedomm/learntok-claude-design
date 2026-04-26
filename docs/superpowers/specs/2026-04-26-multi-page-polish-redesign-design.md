# Multi-Page Polish Redesign — Design Spec

**Date:** 2026-04-26
**Worktree:** `.claude/worktrees/polish-redesign-brainstorm`
**Branch:** `claude/polish-redesign` (will be split into 3 PRs at implementation time)

## Goal

Polish the LearnTok app across 5 pages (home, profile, discover, relax, feed), fix one real backend bug (`profiles.rate` is stored but never applied to time-bank credits), and add one new interaction (feed budget exhaustion modal with extend-by-1-minute). Make the app feel cohesive, English-first, and intentional about screen-time tradeoffs.

## Non-goals

- No new pages beyond renaming `/progress` → `/profile`.
- No new auth, payment, social, or notification systems.
- No daily-target slider, theme toggle, account deletion, or data export (deferred to future).
- No onboarding name capture (just allow editing existing display_name on profile page).

## Architecture summary

The change set is large (8 sub-features across 5 pages + 1 backend bug) but tightly themed. To keep PRs reviewable, ship in **3 sequential PRs**:

1. **`fix/earn-ratio`** (backend, ~50 LOC + migration + RPC test) — must ship first; downstream UI changes assume correct backend semantics.
2. **`feat/home-profile-redesign`** — home rework + progress→profile rename + new viz, ~600 LOC across ~12 files.
3. **`feat/discover-relax-feed-polish`** — discover redesign + bottom nav 4-tab + relax/feed polish + feed exhaustion modal, ~700 LOC + 1 migration + 1 RPC.

Each PR is independently testable and shippable. PRs 2 and 3 touch mostly disjoint files and can be developed in parallel after PR 1 lands.

## File structure

### PR 1 — `fix/earn-ratio`

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/0012_apply_rate_to_earn.sql` | Create | Two changes in one migration: (1) `alter table profiles alter column rate type numeric(4,3)` — widens precision from 1 to 3 decimals so onboarding's `5 / learnMinutes` round-trips through the slider correctly (current `numeric(3,1)` collapses 0.083 to 0.1, 0.167 to 0.2, etc., breaking slider position fidelity). (2) Replaces `apply_heartbeat_delta` RPC: for `type='learn'` sessions, multiplies clamped `p_delta` by `profiles.rate` before crediting ledger and incrementing `sessions.earned_or_spent_seconds`. For `type='feed'` sessions, behavior unchanged. Existing rows keep their already-rounded values; no backfill recompute (would change every user's effective ratio retroactively). |
| `tests/sql/earn-ratio.test.sql` | Create | pgTAP-style assertions covering the post-fix range: rate=0.5 user (= 10 min/day), 60s heartbeat → ledger gets +30s. rate=0.167 (≈30 min/day) → +10s. rate=0.083 (≈60 min/day) → +5s. Feed debit unchanged regardless of rate. |
| `tests/full-flow.spec.ts` | Modify | Add a sub-section that picks 10 min/day on the onboarding slider (formula `rate = 5/10 = 0.5` stored), then mocks a learn session heartbeat with `delta=60` and asserts jar balance increased by exactly 30 (not 60). Then a second sub-section: 30 min/day (rate=0.167) → expect +10s for `delta=60`. |

### PR 2 — `feat/home-profile-redesign`

| File | Action | Responsibility |
|---|---|---|
| `app/home/page.tsx` | Modify | Remove top weekday/streak/greeting block (lines ~213-218 in current). Add "Continue learning" eyebrow above `<ContinueRow>`. Replace `<StatsCard>` import with `<StatsHero>`. Pass `removeTopic` and `removeCourse` actions down to `<TopicRail>`. |
| `components/home/StatsHero.tsx` | Create | Lifts `ProgressView`'s summary card (balance + streak + earned today + spent today + scope cell). Replaces the `rate` cell with PR #17's scope-toggle widget (`THIS WEEK` / `THIS MONTH` / `TOTAL`). Persists scope to localStorage key `home-stats-scope`. Visual: same grid + light-gray background banding as current `ProgressView` summary card. |
| `components/home/StatsCard.tsx` | Delete | Replaced by `StatsHero`. |
| `components/home/ContinueRow.tsx` | Modify | Remove the inline `continue ·` text prefix (line ~40); the section eyebrow above the card now provides that label. |
| `components/home/TopicRail.tsx` | Modify | Add `<TopicRailEdit topicId={...} />` next to rail header. Pass `onRemoveCourse` to each course card. |
| `components/home/TopicRailEdit.tsx` | Create | Popover triggered by ⋯ button. Two items: "+ add course" (link to `/discover/topic/[id]`), "delete topic" (calls `removeTopic` action; if action returns `requiresConfirm`, shows `<DeleteTopicConfirm>` dialog). |
| `components/home/DeleteTopicConfirm.tsx` | Create | Modal: "Delete [topic name]? You have {N} courses with {M} completed lessons. This will remove all of them and your progress." Two buttons: Cancel, Delete. |
| `components/home/CourseCardRemove.tsx` | Create | Small × button in top-right of each card. On click: if no progress, calls `removeCourse` directly. If progress, shows `<DeleteCourseConfirm>` modal. |
| `components/home/DeleteCourseConfirm.tsx` | Create | Modal: "Remove [course name]? You've completed {M} lessons. This deletes the course and your progress." |
| `app/home/actions.ts` | Create | Server actions: `removeTopic(topicId)`, `confirmRemoveTopic(topicId)`, `removeCourse(courseId)`, `confirmRemoveCourse(courseId)`. See "Server actions" section below. |
| `app/profile/page.tsx` | Create | New route. Renders `<SettingsSection>`, `<LearningRhythm>`, `<RecentActivity>`, `<SignOutButton>`. Reads `profile`, `sessions` (last 7 or 30 days), `ledger_entries` (last 30) on the server. |
| `app/profile/actions.ts` | Create | Server actions: `updateDisplayName(name)`, `updateRate(rate)`. RLS scopes to caller's row. |
| `components/profile/SettingsSection.tsx` | Create | Two rows: display name (inline-editable input, save on blur), daily learning target (slider 10-60 min step 5, mirroring onboarding; live preview "X min learn → 5 min play"; saved by computing rate = 5/X). |
| `components/profile/LearningRhythm.tsx` | Create | Per-day horizontal segmented bars (see "Learning rhythm viz" section). Window toggle: `week` (default, 7 days) / `month` (30 days). |
| `components/profile/RecentActivity.tsx` | Create | Lifts current `ProgressView`'s ledger entries list (lines ~123-155). |
| `components/profile/SignOutButton.tsx` | Create | Calls `supabase.auth.signOut()` then `router.push('/login')`. |
| `app/progress/page.tsx` | Modify | Replace contents with a Next redirect: `redirect('/profile')`. Keep file so deep links don't 404. |
| `app/progress/ProgressView.tsx` | Delete | Pieces lifted into `<StatsHero>` (summary card) and `<RecentActivity>` (ledger list). Courses tab dropped entirely. |
| `middleware.ts` | Modify | Update auth allowlist: `/profile` requires auth (default), `/progress` redirect chain still passes through middleware OK. |

### PR 3 — `feat/discover-relax-feed-polish`

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/0013_english_groups_and_lucide_icons.sql` | Create | UPDATE 5 `topic_groups` rows: English titles + Lucide icon names (replacing emoji). UPDATE 24 `topics` rows: Lucide icon names per appendix mapping. Schema comment for `topics.icon` and `topic_groups.icon` updated to "Lucide icon name (PascalCase)". |
| `app/discover/page.tsx` | Modify | Replace pill-chip `flexWrap` layout (lines ~91-135) with `<TopicGrid>` per group. Group header gets `<LucideIcon name={group.icon} />` instead of emoji. |
| `components/discover/TopicGrid.tsx` | Create | 2-column CSS grid (`grid-template-columns: 1fr 1fr; gap: 12px`). Renders `<TopicTile>` per topic. |
| `components/discover/TopicTile.tsx` | Create | Tile: 32px Lucide icon, topic title, "{N} courses" subtitle, ✓ angle badge if topic in user's `interests`. Click → `/discover/topic/[id]`. |
| `components/discover/LucideIcon.tsx` | Create | Wrapper that maps icon-name strings to lucide-react components (avoids dynamic import of all 1300+ icons; uses a lookup map of the ~30 names actually referenced). |
| `app/discover/topic/[id]/page.tsx` | Modify | Update header: replace emoji with `<LucideIcon>`. No layout change. |
| `components/nav/BottomNav.tsx` | Modify | 4 nav items instead of 3. Add "discover" (icon `Compass`, routes `/discover/*`). Rename "progress" → "profile" (icon changes from `TrendingUp` to `User`, routes `/profile`). Update `isHome` matching: `/topic/*` moves from home to discover. `/course/*` stays under home. |
| `app/budget/page.tsx` | Modify | Change "想休息一下吗？" → "Take a break?" (line 53). Remove `<Image src="/characters/nibs.png">` block (lines 44-50). Add server-side balance gate: if `profile.jar_balance_cached < 60`, render `<RelaxEmptyState>` instead of `<BudgetForm>`. |
| `components/relax/RelaxEmptyState.tsx` | Create | Centered: serif heading "Earn some time first", body "Study a lesson to bank time, then relax.", accent button → `/home`. |
| `app/feed/FeedPlayer.tsx` | Modify | Change "回去学习" → "Back to learning" (lines 230, 281). Remove angel `<Image>` block (lines 272-279). Replace existing 1.2s auto-redirect on `body.ended` with `<ExhaustionModal>` open. Pause video via YT iframe `postMessage({ event: 'command', func: 'pauseVideo' })`. |
| `components/feed/ExhaustionModal.tsx` | Create | Full-screen overlay. Shows "time's up." + current jar balance. Buttons: Back to learning (primary, → `/home`); Watch 1 more minute (secondary, hidden if `balance < 60`). On extend success: close modal, resume video. On extend failure: switch to single-button error state. |
| `app/api/sessions/extend/route.ts` | Create | POST `{ sessionId }`. Calls `extend_feed_session(p_session_id)` RPC. Returns new session budget on success or `{ error: 'insufficient_balance' \| 'invalid_session' }`. |
| `supabase/migrations/0014_extend_feed_session_rpc.sql` | Create | Defines `extend_feed_session(p_session_id uuid) returns jsonb`. Atomic: `select ... for update` on profile, check balance ≥ 60, insert ledger entry `(-60, 'feed_extend')`, update `sessions.budget_seconds += 60`, return new budget. Raises on insufficient balance. |
| `public/characters/angel.png` | Delete | Unused after FeedPlayer change (verify no other references). |
| `public/characters/nibs.png` | Delete | Unused after budget page change (verify no other references). |
| `tests/full-flow.spec.ts` | Modify | Add 2 segments: (1) topic-delete-confirm flow (add courses, complete a lesson, click delete, expect modal, confirm, verify cascade), (2) feed-extend flow (start feed session, exhaust budget, verify modal, click extend, verify new budget + ledger entry). |

## Detailed sections

### § 1. Earn ratio bug fix

**Bug:** `profiles.rate` (numeric, schema default 1.0) is set at onboarding via `rate = 5 / learnMinutes` where `learnMinutes ∈ [10, 60]` (see `app/onboarding/actions.ts:7-13` and `components/onboarding/Onboarding.tsx:42`). Actual range post-onboarding: `[0.083, 0.5]`. The schema default 1.0 is never reachable for an onboarded user — middleware forces unauthorized→`/login` and unauthenticated→onboarding. But `apply_heartbeat_delta` RPC (`supabase/migrations/0004_heartbeat_rpc.sql:26`) ignores `rate` entirely. Every learning second credits exactly 1 second to the jar — which over-credits all users by 2× to 12× their intended ratio.

**Semantics decision:** rate is an **earn-only multiplier**. Schema comment "min play per min learn" stays correct. Spending side stays 1:1.

- `rate = 0.5` (slider at 10 min/day): study 60s → bank 30s play
- `rate = 0.167` (slider at 30 min/day, default): study 60s → bank 10s play
- `rate = 0.083` (slider at 60 min/day): study 60s → bank 5s play
- Feed: spend N seconds → balance -N seconds (always 1:1)

The product philosophy: more daily learning commitment → smaller per-minute play reward (because total daily play target is held at ~5 min). Rate < 1 is the norm; default 1.0 is a stub that should never be observed in practice. The bug is that the system currently behaves *as if* rate=1.0 for everyone.

**Implementation:** Move rate lookup into the RPC (single source of truth, atomic with the credit). Pseudocode:

```sql
create or replace function apply_heartbeat_delta(
  p_session_id uuid,
  p_delta int,
  p_label text default null
) returns jsonb as $$
declare
  v_session sessions%rowtype;
  v_rate numeric;
  v_clamped int;
  v_credit int;
begin
  select * into v_session from sessions where id = p_session_id for update;
  if v_session.id is null then
    raise exception 'session_not_found';
  end if;

  if v_session.type = 'learn' then
    -- Clamp on raw study seconds first (idle protection),
    -- THEN multiply by rate.
    v_clamped := least(p_delta, 20);  -- MAX_CREDIT_PER_HEARTBEAT
    select rate into v_rate from profiles where id = v_session.user_id;
    v_credit := round(v_clamped * v_rate);
    insert into ledger_entries (user_id, delta_seconds, label)
      values (v_session.user_id, v_credit, coalesce(p_label, 'lesson_credit'));
    update sessions
      set earned_or_spent_seconds = earned_or_spent_seconds + v_credit,
          last_heartbeat_at = now()
      where id = p_session_id;
    return jsonb_build_object('credited', v_credit, 'rate_applied', v_rate);
  else
    -- Feed: unchanged
    insert into ledger_entries (user_id, delta_seconds, label)
      values (v_session.user_id, -p_delta, coalesce(p_label, 'feed_debit'));
    update sessions ...
    return jsonb_build_object('debited', p_delta);
  end if;
end;
$$ language plpgsql security definer;
```

Notes:
- Clamp `least(p_delta, MAX_CREDIT_PER_HEARTBEAT)` happens **before** rate multiplication. The cap is about idle-protection on the *user's actual study time*. With rate=0.5, a 20s clamped heartbeat credits 10s — still bounded.
- Use `round()` for fractional rates (rate=0.167 × 15s = 2.5 → 3s). Round-half-to-even is fine; cumulative drift over a session is sub-second.
- Migration uses `create or replace function` — no schema break, no client changes needed.

**Tests:**
- pgTAP-style SQL test in `tests/sql/earn-ratio.test.sql` covering: rate=0.5 → 60s heartbeat credits 30s; rate=0.167 → 60s credits 10s; rate=0.083 → 60s credits 5s; feed-side debit unchanged regardless of rate.
- Playwright extension in `tests/full-flow.spec.ts`: dev-login-onboarding → drag onboarding slider to **10 min** (formula `rate = 5 / 10 = 0.5`) → complete onboarding → POST `/api/sessions/heartbeat` with `delta=60` for the learn session → assert `profiles.jar_balance_cached` increased by exactly 30 (not 60). Then re-run with slider at 30 min (rate=0.167) and assert credit = 10.

**RLS impact:** None. RPC is `security definer` so it can read `profiles.rate` regardless of caller's RLS.

### § 2. Home redesign

**Layout** (top to bottom, after change):

```
┌─────────────────────────────────────┐
│  [StatsHero]                        │  ← Lifted from ProgressView's summary card
│   ┌──────────────────────────────┐  │     Banded gray backgrounds, big typography
│   │  Balance     ▒▒  4 12 m      │  │     Replaces current StatsCard (PR #17)
│   │  Streak       ▒▒  🔥 3       │  │
│   │  Earned today ▒▒  +18 m      │  │
│   │  Spent today  ▒▒  −10 m      │  │
│   │  [week ▼]     ▒▒  +1 23 m   │  │  ← scope toggle (was rate cell)
│   └──────────────────────────────┘  │
├─────────────────────────────────────┤
│  Continue learning                  │  ← New section eyebrow
│  [ContinueRow card with thumbnail]  │
├─────────────────────────────────────┤
│  Your topics            + browse    │
│                                     │
│  Physics              ⋯             │  ← edit button per rail
│  [card][card][card]                 │
│                                     │
│  Algebra Basics       ⋯             │
│  [card×][card][card]                │  ← × on each card to remove single course
│                                     │
├─────────────────────────────────────┤
│  + paste YouTube link               │
└─────────────────────────────────────┘
```

**Removed from current home:**
- Greeting line: `{weekday} · 🔥 {profile?.streak ?? 0}` and `hey, {display_name}` (current `app/home/page.tsx` lines ~215-218)
- `<StatsCard>` component (replaced by `<StatsHero>`)

**Stats hero scope toggle behavior:**
- Default: "TOTAL" (matches PR #17's existing default)
- Clicking the cell opens a popover with three options: THIS WEEK / THIS MONTH / TOTAL
- Selected scope persisted to `localStorage['home-stats-scope']`
- Cell shows the period label (small, all-caps) above the corresponding number (large)
- Number = sum of `delta_seconds` in selected window (positive = earned, negative = spent, displayed as net or as separate +/- depending on which sub-cell — see existing `StatsCard` for exact semantics, lifted as-is)

**Topic edit popover (`<TopicRailEdit>`):**
- Triggered by a 24px ⋯ button to the right of the topic title
- Popover anchored top-right, two items:
  - `+ add course` → `Link href={'/discover/topic/' + topicId}`
  - `delete topic` → calls `removeTopic` server action
- Server action returns `{ requiresConfirm: boolean, courseCount: number, completedLessonCount: number }`
- If `requiresConfirm`, render `<DeleteTopicConfirm>` modal client-side; otherwise the action call has already cascaded and the page revalidates.

**Per-course remove (`<CourseCardRemove>`):**
- 18px × button absolutely positioned top-right of course card, visible on hover (desktop) or always-on (mobile)
- Same confirm rule: if any `lesson_progress` row exists for this course (for this user), show `<DeleteCourseConfirm>`; else delete silently

### § 3. Profile page (replaces /progress)

**Route:** `/progress` → `/profile` (rename). Old `/progress` URL gets a server-side `redirect('/profile')` to preserve any deep links / bookmarks.

**Layout:**

```
┌─────────────────────────────────────┐
│  Profile                            │
├─────────────────────────────────────┤
│  Settings                           │
│   Display name   [luyin.hu       ]  │  ← inline editable
│   Daily learning target [────●──]   │  ← slider 10-60 min/day
│                  10 min learn → 5 min play
├─────────────────────────────────────┤
│  Learning rhythm        [week ▼]    │
│                                     │
│  Today      ████████░░░  1h 56m     │  ← per-day segmented bar
│  Yesterday  ███░░██░░░░  1h 28m     │
│  Sun        — no activity —         │
│  Sat        ██░░░░░░░░░  35m        │
│  ...                                │
├─────────────────────────────────────┤
│  Recent activity                    │
│  +120s  lesson_credit · 3 min ago   │  ← lifted from ProgressView
│  -60s   feed_extend   · 12 min ago  │
│  ...                                │
├─────────────────────────────────────┤
│  [ Sign out ]                       │
└─────────────────────────────────────┘
```

**Daily target slider behavior** (mirrors onboarding's slider for consistency):
- Slider labeled `Daily learning target`, range 10-60 min, step 5 min
- Internal value = `learnMinutes`; on save, server computes `rate = 5 / learnMinutes`
- Reuse `components/onboarding/Onboarding.tsx`'s slider component if extractable; otherwise build a small standalone `<DailyTargetSlider>` with the same shape
- Live preview text below: `{learnMinutes} min learn → 5 min play` (uses fixed "5 min" target as the human-readable anchor; matches onboarding's mental model)
- Save on slider release (`onPointerUp`), not every drag tick
- After save, optimistic UI; if server rejects, revert and toast error
- Initial value: derive from current `profile.rate` via `Math.round(5 / rate)`, clamped to [10, 60]

**Display name editable:**
- Click on the name → becomes input
- Save on blur or Enter
- Validate: non-empty, ≤ 40 chars
- After save, optimistic UI; revert on error

**Removed from current progress page:**
- Tab switcher (Ledger / Courses)
- Summary card (now in home `<StatsHero>`)
- Courses completion grid (overlaps with home topic rails)

### § 4. Learning rhythm visualization

**Goal:** Show usage *pattern*, not just totals. User's example: "学了47分钟，休息了10分钟，又学了59分钟" — the answer should let you see this rhythm at a glance.

**Design:** Per-day horizontal segmented bars (Apple Screen Time / Toggl style).

```
Today      [████ 47m][· 10m][████ 59m]            1h 56m learn · 10m relax
Yesterday  [██ 22m][· 5m][███ 38m][· 15m][██ 28m] 1h 28m learn · 20m relax
Sun        [████ 1h 30m]                          1h 30m learn · 0m relax
Sat        — no activity —
Fri        [█ 18m][· 8m][███ 42m]                 1h 0m learn · 8m relax
Thu        [██ 25m]                               25m learn · 0m relax
Wed        [██ 35m][· 12m][· 5m][· 18m]           35m learn · 35m relax
```

**Visual rules:**
- One row per day in the selected window (week=7 rows, month=30 rows scrollable)
- Each row contains chronologically-ordered colored blocks, one per session
- Block color: learn = `--accent` filled, relax = `--ink-mute` with dotted/striped fill (visual difference even in monochrome)
- Block width is proportional to `session.elapsed_seconds`
- All days share one scale: `max_total = max(daily_total_seconds across visible days)`. The day with `daily_total = max_total` fills the row; other days take `(daily_total / max_total) × 100%` width
- Days with zero sessions render the literal text `— no activity —` instead of a 0-width bar
- Day label uses `Today`, `Yesterday`, `<weekday>` (for last 7 days), then `<MM/DD>` for older days
- Right-aligned summary: `{learn_total} learn · {relax_total} relax`
- Block hover (desktop) / tap (mobile): tooltip showing `{type} · {duration} · {start_time}`

**Data source:** `sessions` table. Query:

```sql
select id, user_id, type, started_at, elapsed_seconds
from sessions
where user_id = $1
  and started_at >= $2  -- 7 or 30 days ago (start of day in user's timezone)
  and elapsed_seconds > 0  -- skip zero-length stubs
order by started_at asc;
```

Group client-side by `started_at::date` (server returns rows already date-bucketed if convenient).

**Window toggle:** `week` (default, last 7 days including today) / `month` (last 30). Independent state from home hero's scope toggle (different page, different control).

**Performance note:** A heavy user might have ~50 sessions/week, ~200/month. Single query, all rendered server-side, no virtualization needed at this scale.

### § 5. Discover redesign

**Layout change:** Replace `flexWrap` pill chips with `<TopicGrid>` (2-column CSS grid).

```
┌─────────────────────────────────────┐
│  <LineChart/> Finance & Economics   │  ← group header (English + Lucide icon)
│                                     │
│  ┌──────────────┐ ┌──────────────┐  │
│  │  <Coins/>    │ │  <Globe/>    │  │
│  │  Microecon.  │ │  Macroecon.  │  │
│  │  3 courses   │ │  2 courses   │  │
│  │         [✓]  │ │              │  │  ← ✓ if topic in interests
│  └──────────────┘ └──────────────┘  │
│  ┌──────────────┐                   │
│  │ <TrendingUp/>│                   │
│  │ Finance and  │                   │  ← title wraps to 2 lines if long
│  │ Capital ...  │                   │
│  │  4 courses   │                   │
│  └──────────────┘                   │
├─────────────────────────────────────┤
│  <Landmark/> Humanities & History   │
│  ...                                │
```

**Tile component (`<TopicTile>`):**
- Fixed height (~110px), responsive width
- 32px Lucide icon top-left
- Title: 2 lines max with `text-overflow: ellipsis`
- Subtitle: `{N} courses` in `--ink-mute`
- ✓ "in library" badge top-right when `topicId in profile.interests`
- Tap → `Link href={'/discover/topic/' + id}`

**Group titles + icons** (migration `0013`):

| key | English title | Lucide icon |
|---|---|---|
| finance | Finance & Economics | `LineChart` |
| humanities | Humanities & History | `Landmark` |
| stem | Science & Engineering | `FlaskConical` |
| math | Mathematics | `Sigma` |
| cs | Computer Science | `Code` |

**Topic icons** (migration `0013`, full mapping in Appendix A).

### § 6. Bottom nav: 4 tabs

Current 3 tabs → 4 tabs:

| Tab | Label | Lucide icon | Routes (highlight when current path matches) |
|---|---|---|---|
| 1 | home | `Home` | `/home`, `/course/*`, `/add*` |
| 2 | discover | `Compass` | `/discover/*`, `/topic/*` |
| 3 | relax | `Coffee` | `/budget`, `/feed*` |
| 4 | profile | `User` | `/profile` |

`isHome` matching logic update (in `BottomNav.tsx`):
- `/topic/*` moves from home tab to discover tab (it's browsing, not "my stuff")
- `/course/*` stays under home (it's "my course")
- `/add*` stays under home (it's "add to my library")
- `/progress` removed (route gone after redirect)

Layout: 4 equal-width columns. Icons stay 22px, strokeWidth 1.8 (matches existing).

### § 7. Relax (budget) page polish

**File:** `app/budget/page.tsx`.

**Text changes:**
- Line 53: `想休息一下吗？` → `Take a break?`
- Line 55: `pick a budget` (already English, keep)

**Image removal:** Delete the `<Image src="/characters/nibs.png" width={96} height={96} />` block (lines 44-50). Tighten spacing on the heading container (it was sized to balance the 96px image; without the image, give the heading more vertical breathing room).

**Balance gate (new behavior):** Server-side check at top of page render:

```tsx
const profile = await getProfile();
if ((profile.jar_balance_cached ?? 0) < 60) {
  return <RelaxEmptyState />;
}
return <BudgetForm balance={profile.jar_balance_cached} />;
```

**`<RelaxEmptyState>` content:**
- Centered serif heading: `Earn some time first`
- Body text: `Study a lesson to bank time, then relax.`
- Accent button: `Back to learning` → `/home`

Threshold = 60s (one extend unit). Avoids the edge case of "balance=10, allow session creation, immediately get kicked out by exhaustion modal."

### § 8. Feed page polish + exhaustion modal

**File:** `app/feed/FeedPlayer.tsx`.

**Text changes:**
- Line 230: `回去学习` → `Back to learning`
- Line 281: `'saving…' : '回去学习'` → `'saving…' : 'Back to learning'`

**Image removal:** Delete the angel `<Image>` block (lines 272-279). Restyle the exit button as text-only or with a Lucide `X` icon.

**Exhaustion modal flow:**

Current behavior (lines 87-94 of FeedPlayer.tsx): when heartbeat returns `body.ended === true`, set `endedBySystem=true`, show modal overlay for 1.2 seconds, then `router.push('/home')`.

New behavior:
1. On `body.ended === true`:
   - Set `endedBySystem=true`
   - Pause video: `iframeRef.current.contentWindow.postMessage(JSON.stringify({event:'command',func:'pauseVideo'}), '*')`
   - Open `<ExhaustionModal>` (no auto-redirect)
2. Modal renders:
   - Heading: `time's up.`
   - Subtext: `jar: {formatDuration(profile.jar_balance_cached)} left`
   - Primary button: `Back to learning` → `router.push('/home')`
   - Secondary button: `Watch 1 more minute` (rendered only if `profile.jar_balance_cached >= 60`)
3. Click secondary button:
   - POST `/api/sessions/extend` with `{ sessionId }`
   - On 200: close modal, resume video (`postMessage` `playVideo`), update local `remain` to `body.newBudget` and `balance` from response
   - On 400 (`insufficient_balance`): swap modal to single-button "Not enough time. Back to learning?"
   - On other error: same fallback

**RPC `extend_feed_session`:**

```sql
create or replace function extend_feed_session(p_session_id uuid)
returns jsonb as $$
declare
  v_session sessions%rowtype;
  v_balance int;
begin
  select * into v_session from sessions where id = p_session_id for update;
  if v_session.id is null or v_session.type != 'feed' then
    raise exception 'invalid_session';
  end if;
  if v_session.ended_at is not null then
    raise exception 'session_already_ended';
  end if;

  select jar_balance_cached into v_balance
    from profiles where id = v_session.user_id for update;

  if v_balance < 60 then
    raise exception 'insufficient_balance';
  end if;

  insert into ledger_entries (user_id, delta_seconds, label)
    values (v_session.user_id, -60, 'feed_extend');

  update sessions
    set budget_seconds = budget_seconds + 60
    where id = p_session_id;

  return jsonb_build_object(
    'newBudget', v_session.budget_seconds + 60,
    'balanceAfter', v_balance - 60
  );
end;
$$ language plpgsql security definer;
```

The ledger insert triggers `after_ledger_insert` to update `jar_balance_cached`, so the row-locked `v_balance` may be slightly stale by the time the function returns. The returned `balanceAfter` is computed from the locked value minus 60 (deterministic).

**API route `app/api/sessions/extend/route.ts`:**

```ts
export async function POST(req: Request) {
  const supabase = createClient();
  const { sessionId } = await req.json();
  if (!sessionId) return NextResponse.json({ error: 'missing_session_id' }, { status: 400 });

  const { data, error } = await supabase.rpc('extend_feed_session', { p_session_id: sessionId });
  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('insufficient_balance')) {
      return NextResponse.json({ error: 'insufficient_balance' }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  return NextResponse.json(data);
}
```

RLS: `extend_feed_session` is `security definer`, but the route uses the user-scoped client so the implicit `user_id` comes from the session row's owner. Add a sanity check inside the RPC: `if v_session.user_id != auth.uid() then raise exception 'forbidden';` — this prevents one user from extending another user's session if `sessionId` leaks.

## Server actions

### `app/home/actions.ts`

```ts
'use server';

export async function removeTopic(topicId: string): Promise<
  { ok: true; cascaded: { courses: number; lessons: number } } |
  { requiresConfirm: true; courseCount: number; completedLessonCount: number }
> {
  // 1. Look up courses on the user's shelf for this topic
  // 2. Look up lesson_progress rows for those courses
  // 3. If any progress, return { requiresConfirm: true, ... }
  // 4. Else cascade-delete and return { ok: true, ... }
}

export async function confirmRemoveTopic(topicId: string): Promise<{ ok: true }> {
  // Transaction:
  //   delete from lesson_progress where course_id in (...)
  //   delete from profile_courses where user_id = auth.uid() and course_id in (...)
  //   update profiles set interests = array_remove(interests, topicId) where id = auth.uid()
  // Revalidate /home
}

export async function removeCourse(courseId: string): Promise<
  { ok: true } | { requiresConfirm: true; completedLessonCount: number }
> {
  // 1. Verify course is on the user's shelf (RLS scopes the query)
  // 2. Count lesson_progress rows where course_id = courseId and user_id = auth.uid()
  // 3. If count > 0, return { requiresConfirm: true, completedLessonCount: count }
  // 4. Else: delete from profile_courses where user_id = auth.uid() and course_id = courseId
  //         (no need to touch lesson_progress — none exist by step 2's check)
  //         revalidate /home and return { ok: true }
  // Note: do NOT remove the topic from interests; user may have other courses in same topic.
}

export async function confirmRemoveCourse(courseId: string): Promise<{ ok: true }> {
  // Transaction (single supabase call wrapping both deletes; or two awaits — RLS ensures atomicity per row):
  //   delete from lesson_progress where course_id = courseId and user_id = auth.uid()
  //   delete from profile_courses where user_id = auth.uid() and course_id = courseId
  // Revalidate /home and return { ok: true }
}
```

### `app/profile/actions.ts`

```ts
'use server';

export async function updateDisplayName(name: string): Promise<{ ok: true } | { error: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: 'empty_name' };
  if (trimmed.length > 40) return { error: 'name_too_long' };
  const supabase = createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: trimmed })
    .eq('id', (await supabase.auth.getUser()).data.user!.id);
  if (error) return { error: error.message };
  revalidatePath('/profile');
  revalidatePath('/home');  // greeting removed but no harm
  return { ok: true };
}

export async function updateDailyTarget(learnMinutes: number): Promise<{ ok: true; rate: number } | { error: string }> {
  if (!Number.isFinite(learnMinutes) || learnMinutes < 10 || learnMinutes > 60) {
    return { error: 'target_out_of_range' };
  }
  // Snap to 5-minute step to match slider granularity.
  const snapped = Math.round(learnMinutes / 5) * 5;
  // Same formula as onboarding (`app/onboarding/actions.ts:7`).
  const rate = Math.round((5 / snapped) * 1000) / 1000;  // 3-decimal precision
  const supabase = createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ rate })
    .eq('id', (await supabase.auth.getUser()).data.user!.id);
  if (error) return { error: error.message };
  revalidatePath('/profile');
  return { ok: true, rate };
}
```

## Schema changes summary

| Migration | Change |
|---|---|
| `0012_apply_rate_to_earn.sql` | (1) `alter table profiles alter column rate type numeric(4,3)` — widens precision so 3-decimal rates round-trip. (2) `create or replace function apply_heartbeat_delta(...)` — multiplies clamped `p_delta` by `profiles.rate` for learn sessions. |
| `0013_english_groups_and_lucide_icons.sql` | UPDATE `topic_groups`: 5 rows get English titles + Lucide icon names. UPDATE `topics`: 24 rows get Lucide icon names. Comment on `topics.icon` and `topic_groups.icon` columns updated. |
| `0014_extend_feed_session_rpc.sql` | New `extend_feed_session(p_session_id uuid)` RPC for the +1 minute feed extend flow. |

No schema breaks. All migrations additive or `create or replace`.

## RLS implications

- `home/actions.ts` and `profile/actions.ts` use the user-scoped `createClient()` — RLS policies on `profile_courses`, `profiles`, `lesson_progress` already restrict to owner. No new policies needed.
- `extend_feed_session` is `security definer` but enforces `auth.uid() == session.user_id` internally.
- `apply_heartbeat_delta` is `security definer` (already is); RLS unchanged.

## Testing

**Per-PR test additions:**

- PR 1: pgTAP SQL test (`tests/sql/earn-ratio.test.sql`) + Playwright assertion in `full-flow.spec.ts` for rate=0.5 → ½× credit and rate=0.167 → ⅙× credit.
- PR 2: Playwright test for topic-edit-popover (open, click delete, expect modal, confirm, verify cascade); profile page renders all sections; rate slider updates DB.
- PR 3: Playwright test for feed-extend flow (start session, mock budget exhaustion via direct heartbeat call, verify modal renders, click extend, verify new budget + ledger entry); discover renders 5 group sections with English titles + Lucide icons.

**Existing `tests/full-flow.spec.ts`** stays the source of truth for full happy path; we extend it rather than fork. Total test runtime should stay under 60s (currently ~14s; adding ~30s of new assertions is acceptable).

## Out of scope (explicitly deferred)

- Onboarding name capture step
- Account deletion
- Theme toggle
- Daily-target slider on profile (earn ratio implicit target)
- Notifications / reminders
- Social / sharing
- Adding to library directly from `/discover/topic/[id]` page (already exists per PR #25)
- Replacing emoji in any other place than `topics.icon` and `topic_groups.icon` (e.g., `🔥` streak emoji stays — it's playful and contextual)

## Risks & open questions

- **Display name source**: The Supabase auth trigger sets `display_name` from email prefix on signup. After the home greeting is removed, `display_name` is only visible on profile page. Existing users with weird names (e.g., `luyin.hu`) won't be auto-corrected. Acceptable: they can edit it.
- **Migration 0013 idempotency**: UPDATEs are naturally idempotent. Safe to re-run.
- **Lucide tree-shaking**: Importing 30 icons via `import { Atom, Coins, ... } from 'lucide-react'` should tree-shake fine with Next 14 + SWC. Verify bundle size after change; if it grows unexpectedly, switch to `import Atom from 'lucide-react/dist/esm/icons/atom'`.
- **YT iframe pause race**: If the user's network is slow, `pauseVideo` postMessage might not arrive before the user sees the modal. Acceptable — modal overlays the video, user clicks anyway. No data implication.
- **Stacking PRs**: Last session burned us with stacked PRs hitting the wrong base after squash-merge. PRs 2 and 3 should both branch from PR 1's branch BUT only after PR 1 merges to main, do `git rebase main` and force-push the children. Alternative: keep PR 2/3 branched directly from main and accept that the earn-ratio fix may be temporarily missing in PR 2's CI runs (rate display works either way; the only test that depends on rate-applied is the new one in PR 1).

## Appendix A — 24 topic icons

| Group | Topic | Lucide icon |
|---|---|---|
| finance | Microeconomics | `Coins` |
| finance | Macroeconomics | `Globe` |
| finance | Finance and Capital Markets | `TrendingUp` |
| humanities | World History | `Globe2` |
| humanities | US History | `Flag` |
| humanities | Art History | `Palette` |
| humanities | US Government & Civics | `Scale` |
| stem | Physics | `Atom` |
| stem | Chemistry | `TestTube` |
| stem | Biology | `Dna` |
| stem | Cosmology & Astronomy | `Telescope` |
| stem | Electrical Engineering | `Zap` |
| stem | Computer Animation | `Clapperboard` |
| math | Pre-Algebra | `Calculator` |
| math | Algebra Basics | `Variable` |
| math | Geometry | `Triangle` |
| math | Trigonometry | `Waves` |
| math | Calculus AB | `LineChart` |
| math | Calculus BC | `Infinity` |
| math | Linear Algebra | `Grid3x3` |
| math | Multivariable Calculus | `Box` |
| math | Differential Equations | `Spline` |
| cs | Computer Programming | `Braces` |
| cs | Computer Science | `Cpu` |

All names verified against `lucide-react` v0.x exports.
