# Home Stats Hero + Compact Continue Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the big Continue+angel hero card with a 3-column stats card (streak / today's banked time / switchable cumulative time with localStorage persistence) and a compact continue-learning row that includes a YouTube thumbnail. Plushy angel disappears entirely.

**Architecture:** Server-side data fetch in `app/home/page.tsx` adds 4 parallel ledger sums (today / this week / this month / total). Two new components encapsulate the new render: `<ContinueRow>` (pure server) renders the compact continue row; `<StatsCard>` (client) renders the 3-column stats with a tap-to-open menu on the third column whose choice persists to localStorage. A duration formatter is extracted to `lib/format.ts` and extended to handle hour-scale values cleanly.

**Tech Stack:** Next.js 14 App Router (RSC + client components), TypeScript strict, Supabase server client (existing), CSS via `app/globals.css` `@layer components`.

**Verification model:** Same as the previous home redesign plan — the project has no test runner wired up. Each task verifies via `npx tsc --noEmit` for type safety and `npm run build` (against a placeholder `.env.local` that you delete after the build) for the final overall check. Visual confirmation (`npm run dev` → browser at `/home`) is reserved for the final step rather than per-task to keep iteration fast.

**Source spec:** [`docs/superpowers/specs/2026-04-26-home-stats-hero-design.md`](../specs/2026-04-26-home-stats-hero-design.md)

**Branch:** `claude/home-stats-hero` (split off `claude/infallible-pascal-d16110` after the spec was committed there; PR #12 unaffected).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `lib/format.ts` | create | Single duration formatter `fmtBank(seconds)` shared by the home page and `<StatsCard>`. Extracted from the inline definition in `app/home/page.tsx`; extended to handle hour-scale values. |
| `app/globals.css` | modify | Add `.stats-card`, `.stats-col`, `.stats-num`, `.stats-label`, `.stats-menu`, `.continue-row`, `.continue-thumb`, `.continue-meta`, `.continue-progress`. **Delete** the `.hero-card` and `.hero-angel` rules added by the previous redesign — they have no callers after this change. |
| `components/home/ContinueRow.tsx` | create | Server component. Renders the compact continue row from already-derived continue-card data. |
| `components/home/StatsCard.tsx` | create | Client component. Renders the 3-column stats card; owns the col-3 scope state, localStorage persistence, and the popover menu. |
| `app/home/page.tsx` | modify | Add 4 parallel ledger sum queries. Drop the inline `fmtBank` (import from `@/lib/format`). Replace the existing Continue card JSX with `<StatsCard>` + `<ContinueRow>`. Remove the `<div className="hero-angel">`. Keep greeting row, topic rails, and paste-row exactly as they are. |

The order below puts the formatter (zero risk) and CSS (no consumers yet, harmless if unused) first, then the two new components in dependency-free order, then the page wiring as the last step. Each task is independently committable and TS-checkable.

---

## Task 1: Extract and extend `fmtBank` into `lib/format.ts`

The current `app/home/page.tsx` has an inline `fmtBank` that handles seconds and minutes but treats everything past 60 minutes as "120m", "300m" etc. Fine for the jar chip when balances are small, but `<StatsCard>` will display lifetime totals in hours. Extend it once and reuse it everywhere.

**Files:**
- Create: `lib/format.ts`
- Modify: `app/home/page.tsx:4-9` (remove inline `fmtBank`, replace with import)

- [ ] **Step 1: Create `lib/format.ts` with the extended formatter**

Create `lib/format.ts`:
```ts
// Format a non-negative number of seconds for human display.
// - < 60s          → "30s"
// - < 60m          → "5m" or "5m 30s" (only show seconds when nonzero)
// - >= 60m         → "1h 5m" or "2h" (drop seconds entirely at the hour scale)
//
// Returns "0s" for 0; defensive but matches the seconds-bracket so display stays
// consistent with how the jar chip historically reads.
export function fmtBank(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s ? `${m}m ${s.toString().padStart(2, '0')}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
```

Mental test of the new branch: `fmtBank(3660) === '1h 1m'`, `fmtBank(7200) === '2h'`, `fmtBank(30600) === '8h 30m'`. The pre-existing branches are unchanged: `fmtBank(0) === '0s'`, `fmtBank(30) === '30s'`, `fmtBank(60) === '1m'`, `fmtBank(130) === '2m 10s'`.

- [ ] **Step 2: Replace the inline definition in `app/home/page.tsx`**

In `app/home/page.tsx`, **delete** lines 4-9:
```ts
function fmtBank(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s.toString().padStart(2, '0')}s` : `${m}m`;
}
```

And add to the import block at the top of the file:
```ts
import { fmtBank } from '@/lib/format';
```

The existing call site `fmtBank(profile?.jar_balance_cached ?? 0)` for the jar chip is unchanged.

- [ ] **Step 3: Type-check**

Run from the worktree root:
```bash
npx tsc --noEmit
```
Expected: no errors. (The single call site already passes a `number`.)

- [ ] **Step 4: Commit**

```bash
git add lib/format.ts app/home/page.tsx
git commit -m "refactor(format): extract fmtBank to lib/format and add hour bracket"
```

---

## Task 2: Add new CSS classes; remove the dead hero-angel rules

**Files:**
- Modify: `app/globals.css`

The existing `.hero-card` and `.hero-angel` rules (added in the previous redesign) get **deleted** — they have no callers after Task 5. The new `.stats-*` and `.continue-*` rules go into the same `@layer components { ... }` block, immediately after the deleted rules' position so the visual grouping ("home page hero stack") is preserved.

- [ ] **Step 1: Locate and delete the hero-angel rules**

Open `app/globals.css`. Find this block (added by the previous redesign, currently sitting right after `.angel-exit-label` inside `@layer components`):

```css
  /* Continue hero — overflow visible so the angel can hang off the top-right. */
  .hero-card { position: relative; overflow: visible; }
  .hero-angel {
    position: absolute;
    right: -4px;
    top: -58px;
    width: 86px;
    height: 86px;
    background: url('/characters/angel-plush.png') no-repeat center/contain;
    pointer-events: none;
  }
```

Delete it entirely. The next set of rules (`.rail-title`, `.rail`, etc. for the topic rails) stays in place.

- [ ] **Step 2: Insert the new component classes**

In the same spot (where the deleted block lived), insert:

```css
  /* Stats card — 3 equal columns, two thin vertical dividers. */
  .stats-card {
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 18px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    padding: 18px 0;
    position: relative; /* anchors the .stats-menu popover */
  }
  .stats-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    min-width: 0;
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
  .stats-col.toggle {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .stats-col.toggle .stats-label::after {
    content: ' ▾';
    font-family: var(--sans);
    letter-spacing: 0;
  }

  /* Popover anchored under the stats card (right-aligned to col 3). */
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
    display: flex;
    width: 100%;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: none;
    background: transparent;
    font-family: var(--sans);
    font-size: 13px;
    color: var(--ink);
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
  }
  .stats-menu button:hover { background: var(--bg-2); }
  .stats-menu button[aria-checked="true"]::before {
    content: '✓';
    width: 14px;
    color: var(--ink);
  }
  .stats-menu button[aria-checked="false"]::before {
    content: '';
    width: 14px;
  }

  /* Compact continue-learning row. */
  .continue-row {
    display: flex;
    align-items: stretch;
    gap: 12px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 10px;
    text-decoration: none;
    color: inherit;
    margin-top: 12px;
  }
  .continue-thumb {
    flex: 0 0 80px;
    height: 60px;
    border-radius: 8px;
    background-color: var(--bg-3);
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }
  .continue-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    justify-content: center;
  }
  .continue-eyebrow {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--ink-mute);
  }
  .continue-title {
    font-family: var(--serif);
    font-weight: 500;
    font-size: 16px;
    letter-spacing: -0.02em;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .continue-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--ink-soft);
  }
  .continue-progress .bar {
    flex: 1;
    height: 4px;
    background: var(--bg-3);
    border-radius: 2px;
    overflow: hidden;
  }
  .continue-progress .bar > i {
    display: block;
    height: 100%;
    background: var(--ink);
  }
  .continue-row .chev {
    flex: 0 0 auto;
    color: var(--ink-mute);
    align-self: center;
    font-size: 18px;
    padding-right: 4px;
  }
```

- [ ] **Step 3: Sanity-build (catches stray brace errors in `globals.css`)**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors. (TypeScript doesn't validate CSS but the project's `tsc` run is fast and catches any accidental edit to a `.ts` file. We defer the full `npm run build` to the final step to avoid doing it 5 times.)

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "style(home): add stats/continue classes; remove dead hero-angel rules"
```

---

## Task 3: Create the `<ContinueRow>` server component

**Files:**
- Create: `components/home/ContinueRow.tsx`

Pure server component. Renders one DOM tree from the props the home page already derives.

- [ ] **Step 1: Write the component**

Create `components/home/ContinueRow.tsx` with this exact content:
```tsx
// Compact continue-learning row. Replaces the big Continue+angel card.
// The whole row is an <a> that navigates to the next undone lesson.
import Link from 'next/link';

type Props = {
  topicTitle: string;
  courseTitle: string;
  nextLessonId: string;
  nextLessonDurSec: number; // 0 if unknown
  ytId: string | null;
  donePct: number; // 0-100
};

export function ContinueRow({
  topicTitle,
  courseTitle,
  nextLessonId,
  nextLessonDurSec,
  ytId,
  donePct,
}: Props) {
  const nextMin = nextLessonDurSec > 0 ? Math.floor(nextLessonDurSec / 60) : 0;

  return (
    <Link
      href={`/lesson/${nextLessonId}`}
      className="continue-row"
      data-testid="home-continue-row"
    >
      <div
        className="continue-thumb"
        style={
          ytId
            ? { backgroundImage: `url(https://i.ytimg.com/vi/${ytId}/mqdefault.jpg)` }
            : undefined
        }
        aria-hidden
      />
      <div className="continue-meta">
        <div className="continue-eyebrow">continue · {topicTitle}</div>
        <div className="continue-title">{courseTitle}</div>
        <div className="continue-progress">
          <div className="bar">
            <i style={{ width: `${donePct}%` }} />
          </div>
          <span>
            {donePct}%{nextMin > 0 ? ` · next ${nextMin}m` : ''}
          </span>
        </div>
      </div>
      <span className="chev" aria-hidden>›</span>
    </Link>
  );
}
```

Notes:
- `›` is the visual chevron — same character used in the previous topic-row design (`app/home/page.tsx:219`). The `.chev` class re-styles it for this row.
- `aria-hidden` on the thumb and chev because they're decorative; the `<Link>` text content is the accessible name.
- `data-testid` set so future Playwright tests can target it consistently.

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors. (The component isn't imported anywhere yet, but TS still analyses it.)

- [ ] **Step 3: Commit**

```bash
git add components/home/ContinueRow.tsx
git commit -m "feat(home): add compact ContinueRow server component"
```

---

## Task 4: Create the `<StatsCard>` client component

**Files:**
- Create: `components/home/StatsCard.tsx`

Client component because it owns interactive state (scope selection + popover menu) and reads/writes `localStorage`.

- [ ] **Step 1: Write the component**

Create `components/home/StatsCard.tsx` with this exact content:
```tsx
'use client';

// 3-column stats card. The third column is tappable: tapping it opens a small
// popover anchored under the card with three time-scope choices. The selected
// scope is persisted to localStorage so the user's choice survives reloads.
import { useEffect, useRef, useState } from 'react';
import { fmtBank } from '@/lib/format';

type Scope = 'total' | 'week' | 'month';
const SCOPES: ReadonlyArray<Scope> = ['total', 'week', 'month'];
const STORAGE_KEY = 'home-stats-scope';

const SCOPE_LABEL: Record<Scope, string> = {
  total: 'TOTAL',
  week: 'THIS WEEK',
  month: 'THIS MONTH',
};

const SCOPE_LONG: Record<Scope, string> = {
  total: 'All time',
  week: 'This week',
  month: 'This month',
};

type Props = {
  streak: number;
  todaySeconds: number;
  weekSeconds: number;
  monthSeconds: number;
  totalSeconds: number;
};

function isScope(v: unknown): v is Scope {
  return typeof v === 'string' && (SCOPES as ReadonlyArray<string>).includes(v);
}

export function StatsCard({
  streak,
  todaySeconds,
  weekSeconds,
  monthSeconds,
  totalSeconds,
}: Props) {
  const [scope, setScope] = useState<Scope>('total');
  const [menuOpen, setMenuOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Hydrate from localStorage on mount. Defensive against SSR + incognito.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isScope(stored)) setScope(stored);
    } catch {
      /* localStorage unavailable; keep default */
    }
  }, []);

  // Persist on every change.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, scope);
    } catch {
      /* swallow */
    }
  }, [scope]);

  // Close menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [menuOpen]);

  const col3Seconds =
    scope === 'week' ? weekSeconds : scope === 'month' ? monthSeconds : totalSeconds;

  const onPick = (next: Scope) => {
    setScope(next);
    setMenuOpen(false);
  };

  return (
    <div ref={cardRef} className="stats-card mt-16" data-testid="home-stats-card">
      <div className="stats-col" data-testid="stats-col-streak">
        <div className="stats-num">{streak}</div>
        <div className="stats-label">🔥 STREAK</div>
      </div>
      <div className="stats-col" data-testid="stats-col-today">
        <div className="stats-num">{fmtBank(todaySeconds)}</div>
        <div className="stats-label">TODAY</div>
      </div>
      <div
        className="stats-col toggle"
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setMenuOpen((v) => !v);
          } else if (e.key === 'Escape') {
            setMenuOpen(false);
          }
        }}
        data-testid="stats-col-scope"
      >
        <div className="stats-num">{fmtBank(col3Seconds)}</div>
        <div className="stats-label">{SCOPE_LABEL[scope]}</div>
      </div>

      {menuOpen && (
        <div className="stats-menu" role="menu" data-testid="stats-menu">
          {SCOPES.map((s) => (
            <button
              key={s}
              role="menuitemradio"
              aria-checked={s === scope}
              onClick={() => onPick(s)}
            >
              {SCOPE_LONG[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

Notes:
- `mt-16` is an existing utility in `globals.css` that gives the same top spacing the old Continue card had — the stats card slots in cleanly without changing how the greeting row sits above it.
- Keyboard support: the col-3 button responds to Enter / Space (toggle) and Escape (close). `role="button"` + `tabIndex={0}` lets it focus.
- Accessibility: `role="menu"` + `role="menuitemradio"` + `aria-checked` describes the popover semantically; the visible ✓ glyph is rendered by CSS `::before` so screen readers don't announce a duplicate "checkmark".

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/home/StatsCard.tsx
git commit -m "feat(home): add StatsCard client component with scope switcher"
```

---

## Task 5: Refactor `app/home/page.tsx` — wire ledger sums + render the new components

**Files:**
- Modify: `app/home/page.tsx` (full file rewrite below — most of the JSX changes and the data layer grows by 4 queries)

The data-fetching block expands to also pull 4 ledger sums in parallel. The Continue-card derivation (the `outer:` loop) is preserved verbatim — it still produces the data `<ContinueRow>` consumes. The render block drops the Continue card JSX (and its `hero-angel` div) in favor of `<StatsCard>` + `<ContinueRow>`.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `app/home/page.tsx` with:
```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TopicRail } from '@/components/home/TopicRail';
import { StatsCard } from '@/components/home/StatsCard';
import { ContinueRow } from '@/components/home/ContinueRow';
import { fmtBank } from '@/lib/format';

// UTC-day-start for "today". A user in UTC+8 will see "today" reset at 8 AM
// local — documented limitation in the spec; acceptable v1 trade-off.
function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// ISO week: Monday-start. JS getUTCDay returns 0=Sun..6=Sat; map to 0=Mon..6=Sun.
function startOfWeekUTC(): Date {
  const t = startOfTodayUTC();
  const dayOffsetFromMonday = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayOffsetFromMonday);
  return t;
}

function startOfMonthUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function sumDeltas(rows: { delta_seconds: number }[] | null): number {
  return (rows ?? []).reduce((s, r) => s + r.delta_seconds, 0);
}

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, streak, jar_balance_cached, onboarded')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarded) redirect('/onboarding');

  const todayISO = startOfTodayUTC().toISOString();
  const weekISO = startOfWeekUTC().toISOString();
  const monthISO = startOfMonthUTC().toISOString();

  const [
    topicsRes,
    coursesRes,
    lessonsRes,
    progressRes,
    todayRes,
    weekRes,
    monthRes,
    totalRes,
  ] = await Promise.all([
    supabase
      .from('topics')
      .select('id, title, icon, color, position, is_preset')
      .order('is_preset', { ascending: false })
      .order('position', { ascending: true }),
    supabase
      .from('courses')
      .select('id, topic_id, title, icon, position, is_preset')
      .order('position', { ascending: true }),
    supabase
      .from('lessons')
      .select('id, course_id, position, title, duration_seconds, yt_id')
      .order('position', { ascending: true }),
    supabase
      .from('lesson_progress')
      .select('lesson_id, completed_at')
      .eq('user_id', user.id),
    supabase
      .from('ledger_entries')
      .select('delta_seconds')
      .eq('user_id', user.id)
      .gt('delta_seconds', 0)
      .gte('created_at', todayISO),
    supabase
      .from('ledger_entries')
      .select('delta_seconds')
      .eq('user_id', user.id)
      .gt('delta_seconds', 0)
      .gte('created_at', weekISO),
    supabase
      .from('ledger_entries')
      .select('delta_seconds')
      .eq('user_id', user.id)
      .gt('delta_seconds', 0)
      .gte('created_at', monthISO),
    supabase
      .from('ledger_entries')
      .select('delta_seconds')
      .eq('user_id', user.id)
      .gt('delta_seconds', 0),
  ]);

  const topics = topicsRes.data ?? [];
  const courses = coursesRes.data ?? [];
  const lessons = lessonsRes.data ?? [];
  const progress = progressRes.data ?? [];
  const doneIds = new Set(
    progress.filter((p) => p.completed_at).map((p) => p.lesson_id)
  );

  const todaySeconds = sumDeltas(todayRes.data);
  const weekSeconds = sumDeltas(weekRes.data);
  const monthSeconds = sumDeltas(monthRes.data);
  const totalSeconds = sumDeltas(totalRes.data);

  // Group lessons by course.
  const lessonsByCourse = new Map<
    string,
    Array<{ id: string; title: string; duration_seconds: number; yt_id: string; done: boolean }>
  >();
  for (const l of lessons) {
    const arr = lessonsByCourse.get(l.course_id) ?? [];
    arr.push({
      id: l.id,
      title: l.title,
      duration_seconds: l.duration_seconds,
      yt_id: l.yt_id,
      done: doneIds.has(l.id),
    });
    lessonsByCourse.set(l.course_id, arr);
  }

  // Group courses by topic.
  const coursesByTopic = new Map<string, typeof courses>();
  for (const c of courses) {
    if (!c.topic_id) continue;
    const arr = coursesByTopic.get(c.topic_id) ?? [];
    arr.push(c);
    coursesByTopic.set(c.topic_id, arr);
  }

  // Continue card: walk topics in order, find the first topic whose first
  // course has an undone lesson. Same logic as before — the result feeds
  // <ContinueRow> instead of being rendered inline.
  let continueCard: {
    topicTitle: string;
    courseTitle: string;
    nextLessonId: string;
    nextLessonDurSec: number;
    ytId: string | null;
    donePct: number;
  } | null = null;

  outer: for (const t of topics) {
    const courseList = coursesByTopic.get(t.id) ?? [];
    for (const c of courseList) {
      const ls = lessonsByCourse.get(c.id) ?? [];
      if (ls.length === 0) continue;
      const next = ls.find((l) => !l.done);
      if (!next) continue;
      const done = ls.filter((l) => l.done).length;
      continueCard = {
        topicTitle: t.title,
        courseTitle: c.title,
        nextLessonId: next.id,
        nextLessonDurSec: next.duration_seconds,
        ytId: next.yt_id || null,
        donePct: Math.round((done / ls.length) * 100),
      };
      break outer;
    }
  }

  const weekday = new Date()
    .toLocaleDateString('en', { weekday: 'long' })
    .toLowerCase();

  return (
    <main className="app">
      <div className="pad">
        <div className="row between aic">
          <div>
            <div className="eyebrow">
              {weekday} · 🔥 {profile?.streak ?? 0}
            </div>
            <div className="display mt-4" style={{ fontSize: 30 }}>
              hey, {profile?.display_name ?? 'friend'}
            </div>
          </div>
          <a
            href="/progress"
            className="jar-chip"
            data-testid="home-jar-chip"
          >
            <span className="jar-dot" />
            {fmtBank(profile?.jar_balance_cached ?? 0)}
          </a>
        </div>

        <StatsCard
          streak={profile?.streak ?? 0}
          todaySeconds={todaySeconds}
          weekSeconds={weekSeconds}
          monthSeconds={monthSeconds}
          totalSeconds={totalSeconds}
        />

        {continueCard && (
          <ContinueRow
            topicTitle={continueCard.topicTitle}
            courseTitle={continueCard.courseTitle}
            nextLessonId={continueCard.nextLessonId}
            nextLessonDurSec={continueCard.nextLessonDurSec}
            ytId={continueCard.ytId}
            donePct={continueCard.donePct}
          />
        )}

        <div className="eyebrow mt-24">your topics</div>
        <div className="col mt-8">
          {topics.map((t) => (
            <TopicRail
              key={t.id}
              topic={{ id: t.id, title: t.title }}
              courses={(coursesByTopic.get(t.id) ?? []).map((c) => ({
                id: c.id,
                title: c.title,
              }))}
              lessonsByCourse={lessonsByCourse}
            />
          ))}
          <a
            href="/add"
            className="lesson-row mt-12"
            style={{
              borderStyle: 'dashed',
              justifyContent: 'center',
              color: 'var(--ink-soft)',
              textDecoration: 'none',
            }}
            data-testid="home-add-course"
          >
            <span style={{ fontSize: 18 }}>+</span>
            <span>paste YouTube link</span>
          </a>
        </div>
      </div>
    </main>
  );
}
```

What changed from the previous file:
- Imports added: `StatsCard`, `ContinueRow`, `fmtBank` from `@/lib/format`. Removed inline `fmtBank`.
- Helper functions `startOfTodayUTC`, `startOfWeekUTC`, `startOfMonthUTC`, `sumDeltas` added at top-of-file (file-scope, not inside component, so no re-creation per render).
- `Promise.all` expanded from 4 to 8 queries; the new 4 are ledger sums (all positive deltas) for today / this week / this month / lifetime.
- `continueCard` shape simplified: only the props `<ContinueRow>` consumes (`topicTitle`, `courseTitle`, `nextLessonId`, `nextLessonDurSec`, `ytId`, `donePct`). Removed the unused `topicId`, `nextTitle`, `total`, `done` fields from the previous shape. `ytId` is normalized to `null` when empty so `<ContinueRow>`'s prop type matches.
- The render block: greeting row preserved exactly. Continue card JSX (with `hero-angel`, `card-hl`, etc.) is **gone**. Stats card + Continue row replace it. `your topics` eyebrow / topic rails / paste-row preserved exactly.

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat(home): replace hero card with StatsCard + ContinueRow; pull ledger sums"
```

---

## Final verification

- [ ] **Step 1: Production build**

Create a placeholder `.env.local` (don't commit it — `.gitignore` already covers it) so static prerender of `/login` doesn't fail on missing Supabase env:

```bash
cat > .env.local <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key
YOUTUBE_API_KEY=placeholder
NEXT_PUBLIC_DEV_PANEL=false
EOF
```

Then:
```bash
npm install      # picks up the new components if pnpm/npm caches need warming
npm run build
```
Expected: build succeeds. `/home` page should appear in the page list with size around `7-8 kB / ~94 kB First Load JS` (StatsCard adds a small client bundle on top of the previous figure).

Then clean up:
```bash
rm .env.local
```

- [ ] **Step 2: Manual smoke at `/home`**

With a real `.env.local` (your dev Supabase keys), run:
```bash
npm run dev
```
Open `http://localhost:3000/home` (log in if redirected). Verify:

1. Greeting row at top is unchanged (weekday + 🔥 streak, "hey, {name}", jar chip).
2. Below it: a single white card with three columns separated by thin vertical dividers.
   - Col 1: large number, `🔥 STREAK` underneath
   - Col 2: large duration string, `TODAY` underneath
   - Col 3: large duration string, `TOTAL ▾` underneath
3. Tap col 3. A small popover anchors under the card showing three options: `All time` (✓), `This week`, `This month`.
4. Pick `This week`. Popover closes; col 3 updates to that value; label changes to `THIS WEEK ▾`.
5. Refresh the page. Col 3 still says `THIS WEEK ▾` (localStorage persisted).
6. Click outside the popover with it open — popover closes.
7. Below the stats card: a compact row with a YouTube thumbnail (16:9), eyebrow `continue · {topic}`, course title in serif, then a thin progress bar + `{N}% · next {M}m` and a `›` chevron at the right edge.
8. Tap the row — navigates to `/lesson/{nextId}`.
9. The plushy angel does not appear anywhere on the page.
10. Scroll down — the topic rails + paste-row are unchanged.

If a topic has no continue candidate (everything done), the continue row is hidden but the stats card still renders. New users with only the 300s welcome gift should see `🔥 0`, `5m TODAY`, `5m TOTAL` (or similar — depends on whether the welcome gift was inserted today).

- [ ] **Step 3: Push the branch**

```bash
git push -u origin claude/home-stats-hero
```

- [ ] **Step 4: Open the PR**

```bash
gh pr create --base main --head claude/home-stats-hero \
  --title "Home: 3-col stats hero + compact continue row" \
  --body "$(cat <<'EOF'
## Summary
- Replace the big Continue+angel hero card with a 3-column stats card (streak / today's banked time / switchable cumulative time). The third column tap-opens a small menu offering All time / This week / This month; choice persists to localStorage.
- Add a compact continue-learning row with a YouTube thumbnail, course title, progress bar, and a `›` chevron — replaces the old Continue+Start-now card body.
- Plushy angel removed entirely from `/home` (its host card is gone). Asset stays in `public/` for future use.
- Extract `fmtBank` to `lib/format.ts` and add an hour-scale bracket so `8h 30m` displays cleanly.

**Builds on top of #12** (B&W theme + Netflix rails + Lucide bottom nav). Best to merge #12 first, then rebase this onto main.

Spec: [`docs/superpowers/specs/2026-04-26-home-stats-hero-design.md`](docs/superpowers/specs/2026-04-26-home-stats-hero-design.md)
Plan: [`docs/superpowers/plans/2026-04-26-home-stats-hero.md`](docs/superpowers/plans/2026-04-26-home-stats-hero.md)

## Test Plan
- [ ] `npm run dev`, open `/home`: stats card shows three columns with vertical dividers; col 3 has a `▾` chevron next to its label
- [ ] Tap col 3 → popover with three options; ✓ next to current
- [ ] Pick a different scope → number + label update; refresh page → choice survives
- [ ] Click outside popover → it closes
- [ ] Compact continue row below stats: thumbnail loads (or shows grey fallback if no `yt_id`); tap navigates to `/lesson/{nextId}`
- [ ] No plushy angel anywhere on `/home`
- [ ] Topic rails + paste-row unchanged
- [ ] Resize to ~360px wide — popover stays inside the viewport

## Notes
- Today / week / month windows use UTC day boundary (documented limitation in the spec)
- 4 extra ledger sum queries run in parallel with the existing 4 — no extra round-trip latency
- No new tests (project has no working test infra; spec doesn't require any)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Done when all five tasks plus the four verification steps are committed and the PR URL is in your hand.
