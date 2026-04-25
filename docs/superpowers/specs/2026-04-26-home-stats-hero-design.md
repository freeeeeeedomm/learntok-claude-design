# Home stats hero + compact continue row

**Date:** 2026-04-26
**Author:** Luyin (via brainstorming with Claude)

## Goal

Replace the big Continue+angel hero card with a 3-column stats card (streak / today / switchable cumulative time), and reduce the continue-learning surface to a single compact row with a YouTube thumbnail. The "vs yesterday" comparison is explicitly **not** included — daily comparisons can produce frustration when behind and complacency when ahead, both of which work against habit-forming.

This builds on top of [`2026-04-25-home-bw-redesign-design.md`](2026-04-25-home-bw-redesign-design.md) (B&W theme, Netflix rails, plushy angel hero). The plushy angel disappears entirely as part of this change — its function (anti-monotone visual anchor on the big card) is no longer needed because the big card is gone.

## Decisions (from brainstorming)

| # | Decision | Rationale |
|---|---|---|
| D1 | New page top order: greeting row → **stats card** → **compact continue row** → "your topics" rails → paste-row | "Layout C" from brainstorm. Greeting row is unchanged. |
| D2 | Stats card is a **single white card with two 1px vertical dividers**, three equal-width columns | Single card reads as one unit ("today's snapshot"); dividers cheap and clear. |
| D3 | Big numbers in **Fraunces 32px (weight 500, letter-spacing -0.02em)**; labels in **JetBrains Mono 10px UPPERCASE, color `var(--ink-mute)`** | Reuses the type system already in `display` and `eyebrow` classes — no new font weights. |
| D4 | Column 1 = **streak**: big `{N}`, label `🔥 STREAK`. Source: `profiles.streak` | Already loaded server-side; no new query. |
| D5 | Column 2 = **today's time**: big `{fmt(seconds)}`, label `TODAY`. Source: `SUM(delta_seconds WHERE delta_seconds > 0 AND created_at >= today)` | Banked credit only (positive deltas), to match what users perceive as "study time". |
| D6 | Column 3 = **switchable cumulative time**, default `TOTAL`. Other modes: `THIS WEEK`, `THIS MONTH`. Whole column is tappable; tap opens a small menu with 3 options. Choice persists in `localStorage` | Whole-column tap target sidesteps the small-pill problem; 3 modes give the user perspective at multiple scales without daily friction. |
| D7 | The plushy Angel mascot is **removed from the home page entirely** — no relocation | Its host (the big Continue card) is gone; relocating it elsewhere would feel pasted-on. |
| D8 | Compact continue row layout α: 80×60 (16:9) YouTube thumbnail on the left; right side has eyebrow `CONTINUE · {topicTitle}`, title `{courseTitle}` (Fraunces 16px), and a row with progress bar + `{pct}%` + `·` + `next {Xm}` | Layout α from brainstorm. ~80px tall. Far-right `→` chevron hints tappable. |
| D9 | UTC day boundary for "today"; ISO week (Monday-start) for "this week"; calendar month for "this month" | Avoids needing a user-timezone field in `profiles`. Documented limitation: a user in UTC+8 will see "today" reset at 8am local time. Acceptable for v1. ISO week start chosen because it matches most non-US habit-tracking apps. |

## Out of scope (explicit)

- Goals / target-setting (e.g., "20m daily goal") — not a feature today and not in this scope.
- Today-vs-yesterday comparison — explicitly rejected by user during brainstorming.
- Switching the streak metric (col 1) to anything other than the existing `profiles.streak` value — its accuracy is owned by whatever updates that column today; this design doesn't touch that.
- Storing user timezone — col 2/3 use UTC-day windowing.
- Any change to topic rails, bottom nav, or other pages.
- The existing `TopicRail` component, the existing `paste YouTube link` row, and the greeting row stay untouched.

## Files affected

| File | Change |
|---|---|
| `app/home/page.tsx` | Server-side: also compute `todaySeconds`, `weekSeconds`, `monthSeconds`, `totalSeconds` for the user (4 ledger sums in parallel with the existing fetches). Render: replace the existing Continue card block with `<StatsCard>` + `<ContinueRow>`. Remove the inline `hero-angel` div. |
| `components/home/StatsCard.tsx` *(new, client component)* | Renders the 3-col stats card. Takes `{ streak, todaySeconds, weekSeconds, monthSeconds, totalSeconds }`. Owns the col-3 scope state (`'total' \| 'week' \| 'month'`), reads/writes `localStorage` key `home-stats-scope`, opens the small menu on tap. |
| `components/home/ContinueRow.tsx` *(new, server component)* | Renders the compact continue row. Takes `{ topicTitle, courseTitle, nextLessonId, nextLessonTitle, nextLessonDur, ytId, donePct }`. |
| `app/globals.css` | Add `.stats-card`, `.stats-col`, `.stats-divider`, `.stats-num`, `.stats-label`, `.stats-menu`, `.continue-row`, `.continue-thumb`, `.continue-meta`, `.continue-progress` component classes. Remove the previously-added `.hero-angel` rule. |

## Data flow

The home page is a server component. Add four parallel ledger sums alongside the existing `Promise.all`:

```ts
const now = new Date();
const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const startOfWeek = new Date(startOfToday); // Monday-week-start
startOfWeek.setUTCDate(startOfToday.getUTCDate() - ((startOfToday.getUTCDay() + 6) % 7));
const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

const [todayRes, weekRes, monthRes, totalRes] = await Promise.all([
  supabase.from('ledger_entries')
    .select('delta_seconds')
    .eq('user_id', user.id)
    .gt('delta_seconds', 0)
    .gte('created_at', startOfToday.toISOString()),
  // ...week, month identical patterns
  supabase.from('ledger_entries')
    .select('delta_seconds')
    .eq('user_id', user.id)
    .gt('delta_seconds', 0),
]);

const sum = (rows: { delta_seconds: number }[] | null) =>
  (rows ?? []).reduce((s, r) => s + r.delta_seconds, 0);

const todaySeconds = sum(todayRes.data);
// ...etc
```

Pass all four into `<StatsCard streak={...} todaySeconds={...} weekSeconds={...} monthSeconds={...} totalSeconds={...} />`.

The continue card derivation logic (walking topics → first course with undone lesson) is **kept verbatim** from the previous redesign — the only change is the data flows into `<ContinueRow>` instead of being rendered inline.

## New / changed CSS

```css
/* Stats card — 3 equal columns, two thin vertical dividers */
.stats-card {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 18px;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  padding: 18px 0;
  position: relative;       /* for the menu popover */
}
.stats-col {
  display: flex; flex-direction: column;
  align-items: center; gap: 6px;
  padding: 0 8px;
  min-width: 0;             /* allow truncation if a number is long */
}
.stats-col + .stats-col {
  border-left: 1px solid var(--line);
}
.stats-num {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 32px;
  letter-spacing: -0.02em;
  color: var(--ink);
  line-height: 1;
}
.stats-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--ink-mute);
}

/* Whole col 3 is a button; it gets a chevron next to its label.
   No background change so the card stays clean — only the chevron signals it's tappable. */
.stats-col.toggle {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.stats-col.toggle .stats-label::after {
  content: ' ▾';
  font-family: var(--sans);
  letter-spacing: 0;
}

/* The popover menu (anchored under col 3) */
.stats-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 12px;
  min-width: 140px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 6px;
  z-index: 10;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
}
.stats-menu button {
  display: flex; width: 100%;
  align-items: center; gap: 8px;
  padding: 8px 10px;
  border: none; background: transparent;
  font-family: var(--sans); font-size: 13px; color: var(--ink);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
}
.stats-menu button:hover { background: var(--bg-2); }
.stats-menu button[aria-checked="true"]::before {
  content: '✓';
  width: 14px; color: var(--ink);
}
.stats-menu button[aria-checked="false"]::before {
  content: '';
  width: 14px;
}

/* Compact continue row */
.continue-row {
  display: flex; align-items: stretch; gap: 12px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 10px;
  text-decoration: none; color: inherit;
  margin-top: 12px;          /* sits below the stats card */
}
.continue-thumb {
  flex: 0 0 80px; height: 60px;
  border-radius: 8px;
  background-color: var(--bg-3);
  background-size: cover; background-position: center;
  background-repeat: no-repeat;
}
.continue-meta {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 4px;
  justify-content: center;
}
.continue-eyebrow {
  font-family: var(--mono);
  font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase;
  color: var(--ink-mute);
}
.continue-title {
  font-family: var(--serif);
  font-weight: 500; font-size: 16px;
  letter-spacing: -0.02em; color: var(--ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.continue-progress {
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; color: var(--ink-soft);
}
.continue-progress .bar {
  flex: 1;
  height: 4px; background: var(--bg-3); border-radius: 2px; overflow: hidden;
}
.continue-progress .bar > i {
  display: block; height: 100%; background: var(--ink);
}
.continue-row .chev {
  flex: 0 0 auto;
  color: var(--ink-mute);
  align-self: center;
  font-size: 18px;
  padding-right: 4px;
}
```

The earlier `.hero-card` and `.hero-angel` rules are **deleted** from `globals.css` — they have no more callers after this change.

## Component contracts

### `<StatsCard>` (client)

```ts
type Scope = 'total' | 'week' | 'month';
type Props = {
  streak: number;
  todaySeconds: number;
  weekSeconds: number;
  monthSeconds: number;
  totalSeconds: number;
};
```

- On mount, reads `localStorage.getItem('home-stats-scope')` (validates against the union; falls back to `'total'`).
- On scope change, writes the new value to localStorage.
- Menu open/close is local component state; clicking outside closes (use a single document-level pointerdown listener mounted while the menu is open).
- The displayed col-3 number switches between `weekSeconds`, `monthSeconds`, `totalSeconds` based on scope.
- Time formatter: reuse `fmtBank` already exported / inlined in home page (move it to `lib/format.ts` so both `<StatsCard>` and `app/home/page.tsx` can import).

### `<ContinueRow>` (server)

```ts
type Props = {
  topicTitle: string;
  courseTitle: string;
  nextLessonId: string;
  nextLessonTitle: string;
  nextLessonDurSec: number;   // 0 if unknown
  ytId: string | null;
  donePct: number;            // 0-100
};
```

- The whole element is an `<a href={`/lesson/${nextLessonId}`}>`.
- Thumbnail uses `https://i.ytimg.com/vi/{ytId}/mqdefault.jpg` if `ytId` is present, else the `--bg-3` solid fallback.
- The `next {Xm}` segment hides when `nextLessonDurSec === 0`.
- `donePct` is rendered as both the bar width and the trailing percentage label.

## Edge cases

- **Total/week/month/today all 0** → render as `0m` (don't hide the column or the card). New users should see their card light up as they earn.
- **Continue card hidden** (all lessons done across all topics) → the `<ContinueRow>` doesn't render. The stats card still does.
- **localStorage unavailable** (incognito etc.) → `<StatsCard>` swallows the error, falls back to default `'total'` for the session, doesn't try to persist.
- **Timezone** → "today" is UTC-day. A user in UTC+8 sees their "today" roll over at 8 AM local. Acceptable v1 trade-off.
- **No `yt_id` on the next lesson** → continue thumbnail is a flat `var(--bg-3)` block (no broken image).

## Testing

- Manual smoke at `/home`: stats card shows three numbers; col 3 menu opens on tap; selecting a different scope updates the number and label; refreshing the page preserves the choice.
- Spot-check that picking `THIS WEEK` or `THIS MONTH` shows numbers ≥ today's number (since week/month must include today).
- With a fresh seeded user (no ledger entries beyond the 300s welcome gift), stats card reads `🔥 0 / 5m TODAY / 5m TOTAL` (welcome gift counts).
- Continue row tap navigates to `/lesson/{nextId}`.
- Resize the browser to ~360px wide — divider lines and the popover menu position correctly.
- No new Playwright tests required (project still has no working test infra).

## Risks

- **localStorage write on every scope change.** Negligible — single key, ~10 byte value.
- **Four extra Supabase queries per home load.** Each is a sum over an indexed `(user_id, created_at desc)`; `count` is small for realistic users. They run in parallel with the existing four queries, so no extra round-trip latency.
- **Menu positioning on small screens.** `.stats-menu` is anchored to the card with `right: 12px` so it always opens within the viewport on phone widths.

## Acceptance

The `/home` page renders, top-to-bottom: greeting row, stats card (3 columns, dividers, all four computed values reachable through col-3 menu), compact continue row (with YouTube thumbnail, `→` chevron, taps to lesson), then the existing topic rails and paste-row. The plushy angel does not appear anywhere on `/home`. The col-3 scope choice survives a page refresh.
