# Home Page B&W Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the global accent from purple to near-black, redesign `/home` with a Netflix-style topic-rail layout and a plushy Angel mascot on the Continue card, and swap emoji bottom-nav icons for Lucide line icons.

**Architecture:** Mostly token + render restructuring. The `/home` server component keeps its data fetch + Continue-card derivation logic untouched; only the JSX render changes. A new presentational `<TopicRail>` server component encapsulates one horizontal rail of course cards. Two CSS files (`globals.css`, `tailwind.config.ts`) get the accent flip in lockstep so Tailwind utility classes and CSS custom properties stay in sync.

**Tech Stack:** Next.js 14 App Router, React Server Components, TypeScript (strict), Tailwind 3 + CSS custom properties, `lucide-react` (new), Supabase server client (existing).

**Verification model:** This project has **no test runner wired up** (`pnpm test` invokes Playwright but no specs exist). The spec explicitly says no tests are required. Each task therefore verifies via: (a) `npx tsc --noEmit` for type safety, (b) `pnpm lint` for code quality, (c) `pnpm dev` + manual browser check at `http://localhost:3000/home` for visual correctness. **Do not skip the manual check** — these are visual changes.

**Source spec:** [`docs/superpowers/specs/2026-04-25-home-bw-redesign-design.md`](../specs/2026-04-25-home-bw-redesign-design.md)

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `package.json` | modify | Add `lucide-react` runtime dep |
| `public/characters/angel-plush.png` | create | New plushy Angel mascot asset (copied from `Kling/`) |
| `app/globals.css` | modify | Flip `--accent`/`--accent-2` tokens; add new `.hero-angel` and `.rail*` component classes |
| `tailwind.config.ts` | modify | Flip `accent.DEFAULT` and `accent.2` to match the CSS-var change |
| `components/home/TopicRail.tsx` | create | Server component: renders one rail (title + horizontal scroll of course cards) for one topic |
| `app/home/page.tsx` | modify | Drop `card-hl` on Continue card, mount `<div class="hero-angel">`, replace vertical topic list with `<TopicRail>` per topic, keep paste-row at bottom |
| `components/nav/BottomNav.tsx` | modify | Replace emoji + nibs.png icons with Lucide `<Home>` / `<Coffee>` / `<TrendingUp>` |

The order below installs the dependency and asset first (so later tasks can use them), then flips the color tokens (everything else still works in purple → black instantly), then layers in the new CSS, then builds the new component, then wires it into the page, then updates the nav. Each task is independently committable.

---

## Task 1: Install `lucide-react`

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (auto-generated)

- [ ] **Step 1: Install the dependency**

Run from the worktree root:
```bash
pnpm add lucide-react
```

Expected: pnpm adds `lucide-react` to `dependencies`, regenerates the lockfile, no errors.

- [ ] **Step 2: Verify the entry in `package.json`**

Open `package.json` and confirm a line like:
```json
"lucide-react": "^0.x.x"
```
appears in the `dependencies` block.

- [ ] **Step 3: Verify TypeScript still compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors. (`lucide-react` ships its own types.)

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add lucide-react for line-icon bottom nav"
```

---

## Task 2: Add the plushy Angel asset

**Files:**
- Create: `public/characters/angel-plush.png`

- [ ] **Step 1: Verify the source file exists**

Run:
```bash
ls -la "C:/Users/admin/Desktop/ClaudeProjects/learntok-claude-design/Kling/angle-removebg-preview.png"
```
Expected: file exists, ~221 KB. If it's missing, stop and ask the user.

- [ ] **Step 2: Copy it into `public/characters/`**

Run from the worktree root:
```bash
cp "C:/Users/admin/Desktop/ClaudeProjects/learntok-claude-design/Kling/angle-removebg-preview.png" public/characters/angel-plush.png
```

- [ ] **Step 3: Verify the destination**

Run:
```bash
ls -la public/characters/
```
Expected: both `angel.png` (existing cartoon — must still be there) and `angel-plush.png` (new) are listed. The cartoon `angel.png` is still used by the feed-exit button — do not delete it.

- [ ] **Step 4: Commit**

```bash
git add public/characters/angel-plush.png
git commit -m "feat(assets): add plushy angel mascot for home hero"
```

---

## Task 3: Flip the global accent color from purple to near-black

**Files:**
- Modify: `app/globals.css:17-18`
- Modify: `tailwind.config.ts:11`

This is a token-level change. Every consumer of `var(--accent)`, `var(--accent-2)`, `bg-accent`, `text-accent`, etc. flips automatically. That's intentional (the spec calls for whole-app B&W).

- [ ] **Step 1: Edit `app/globals.css`**

In the `:root { ... }` block (around lines 9-26), change:
```css
  --accent: #5e6ad2;
  --accent-2: #4c56c4;
```
to:
```css
  --accent: #0e0f12;
  --accent-2: #000000;
```

Leave every other custom property (`--bg`, `--ink`, `--nibs`, `--angel`, etc.) untouched.

- [ ] **Step 2: Edit `tailwind.config.ts`**

Around line 11, change:
```ts
        accent: { DEFAULT: '#5e6ad2', 2: '#4c56c4' },
```
to:
```ts
        accent: { DEFAULT: '#0e0f12', 2: '#000000' },
```

Leave every other color (`bg`, `ink`, `line`, `nibs`, `angel`, `good`, `bad`) untouched.

- [ ] **Step 3: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Lint**

Run:
```bash
pnpm lint
```
Expected: no errors.

- [ ] **Step 5: Visual smoke check**

Run:
```bash
pnpm dev
```
In a browser at `http://localhost:3000`, log in (or use an existing session) and visit:
- `/home` — Continue card border (currently purple), Start button, jar dot all become near-black
- `/login` — primary button is now black
- `/onboarding` — accent dots / progress turn black
- `/budget` and `/feed` — anything that used `--accent` is now black; Nibs (red-orange) is unchanged

Confirm nothing looks broken (no invisible-on-white text, no missing hit targets). Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css tailwind.config.ts
git commit -m "refactor(theme): flip accent from purple #5e6ad2 to near-black #0e0f12"
```

---

## Task 4: Add new CSS for `.hero-angel` and `.rail*` classes

**Files:**
- Modify: `app/globals.css` (append inside `@layer components { ... }`, before the closing `}` at line 300)

- [ ] **Step 1: Locate the insertion point**

Open `app/globals.css`. Find the closing `}` of the `@layer components { ... }` block (the line right before `@keyframes fadein` at line 302). The new classes go just before that closing brace, alongside the other component classes (e.g. `.lesson-row`, `.jar-chip`, etc.).

- [ ] **Step 2: Append the new component classes**

Insert this block:
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

  /* Topic rail — Netflix-style horizontal scroll. The negative margin + padding
     trick lets the rail bleed to the screen edges so the last visible card
     peeks past the page padding (signal: "you can scroll"). */
  .rail-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 14px 0 6px;
  }
  .rail-title .rt {
    font-family: var(--serif);
    font-weight: 500;
    font-size: 16px;
    letter-spacing: -0.02em;
    color: var(--ink);
  }
  .rail-title .rm {
    font-size: 11px;
    color: var(--ink-mute);
  }

  .rail {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding: 4px 20px 16px;
    margin: 0 -20px;
    scrollbar-width: none;
  }
  .rail::-webkit-scrollbar { display: none; }

  .rail-card {
    flex: 0 0 148px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-decoration: none;
    color: inherit;
  }
  .rail-thumb {
    width: 100%;
    height: 80px;
    border-radius: 8px;
    background-color: var(--bg-3);
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    position: relative;
  }
  .rail-thumb .dur {
    position: absolute;
    bottom: 4px;
    right: 4px;
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    font-size: 9px;
    padding: 1px 6px;
    border-radius: 4px;
    font-family: var(--mono);
  }
  .rail-t {
    font-weight: 600;
    font-size: 13px;
    color: var(--ink);
  }
  .rail-meta {
    font-size: 10px;
    color: var(--ink-mute);
  }
  .rail-bar {
    height: 3px;
    border-radius: 2px;
    background: var(--bg-3);
    overflow: hidden;
  }
  .rail-bar > i {
    display: block;
    height: 100%;
    background: var(--ink);
  }

  /* Empty state pill for a topic with zero courses. */
  .rail-empty {
    padding: 10px 14px;
    border: 1px dashed var(--line);
    border-radius: 10px;
    color: var(--ink-mute);
    font-size: 12px;
    margin-bottom: 12px;
  }
```

- [ ] **Step 3: Verify the page still builds**

Run:
```bash
pnpm build
```
Expected: build succeeds. (Build catches CSS parse errors and unknown Tailwind directives.)

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "style: add .hero-angel and .rail* component classes for home redesign"
```

---

## Task 5: Create the `<TopicRail>` server component

**Files:**
- Create: `components/home/TopicRail.tsx`

This is a pure presentational server component. It receives already-grouped data from `app/home/page.tsx` and renders one rail.

- [ ] **Step 1: Create the directory**

Run:
```bash
mkdir -p components/home
```

- [ ] **Step 2: Write the component**

Create `components/home/TopicRail.tsx` with this exact content:
```tsx
// Renders one Netflix-style horizontal rail for a single topic.
// Each course in the topic becomes a card; tapping the card navigates to
// /course/{id}. Pure presentational — all data is grouped server-side in
// app/home/page.tsx and passed in as props.
import Link from 'next/link';

type LessonLite = {
  id: string;
  title: string;
  duration_seconds: number;
  yt_id: string;
  done: boolean;
};

type CourseLite = {
  id: string;
  title: string;
};

type TopicLite = {
  id: string;
  title: string;
};

type Props = {
  topic: TopicLite;
  courses: CourseLite[];
  lessonsByCourse: Map<string, LessonLite[]>;
};

function fmtMin(totalSeconds: number): string {
  if (totalSeconds <= 0) return '';
  const m = Math.max(1, Math.round(totalSeconds / 60));
  return `${m} min`;
}

export function TopicRail({ topic, courses, lessonsByCourse }: Props) {
  // Aggregate counts across the topic's courses for the rail-title meta.
  const allLessons = courses.flatMap((c) => lessonsByCourse.get(c.id) ?? []);
  const totalLessons = allLessons.length;
  const doneLessons = allLessons.filter((l) => l.done).length;

  return (
    <section data-testid={`topic-rail-${topic.id}`}>
      <div className="rail-title">
        <span className="rt">{topic.title}</span>
        <span className="rm">
          {courses.length} {courses.length === 1 ? 'course' : 'courses'}
          {totalLessons > 0 ? ` · ${doneLessons}/${totalLessons} done` : ''}
        </span>
      </div>

      {courses.length === 0 ? (
        <div className="rail-empty">no courses yet — paste a YouTube link below</div>
      ) : (
        <div className="rail">
          {courses.map((c) => {
            const ls = lessonsByCourse.get(c.id) ?? [];
            const done = ls.filter((l) => l.done).length;
            const total = ls.length;
            const totalSeconds = ls.reduce((sum, l) => sum + (l.duration_seconds ?? 0), 0);
            const firstYt = ls.find((l) => l.yt_id)?.yt_id ?? null;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;

            return (
              <Link key={c.id} href={`/course/${c.id}`} className="rail-card">
                <div
                  className="rail-thumb"
                  style={
                    firstYt
                      ? { backgroundImage: `url(https://i.ytimg.com/vi/${firstYt}/mqdefault.jpg)` }
                      : undefined
                  }
                >
                  {totalSeconds > 0 && <span className="dur">{fmtMin(totalSeconds)}</span>}
                </div>
                <div className="rail-t">{c.title}</div>
                <div className="rail-meta">
                  {total === 0 ? '0 lessons' : `${total} lessons${done > 0 ? ` · ${done} done` : ''}`}
                </div>
                {total > 0 && (
                  <div className="rail-bar">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors. The component is not yet imported anywhere, but TypeScript will still analyse it.

- [ ] **Step 4: Lint**

Run:
```bash
pnpm lint
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/home/TopicRail.tsx
git commit -m "feat(home): add TopicRail server component for Netflix-style rails"
```

---

## Task 6: Refactor `app/home/page.tsx` to use `<TopicRail>` and mount the angel

**Files:**
- Modify: `app/home/page.tsx` (full file rewrite below — the existing file is short and most of it changes)

The data-fetching block (lines 11-49) and Continue-card derivation block (lines 80-112) are preserved verbatim. The render block (lines 138-239) is restructured:
- Drop `card-hl` from the Continue card → replace with `card hero-card`.
- Add `<div className="hero-angel" />` inside the Continue card.
- Replace the `topicRows.map(...)` block + the inline aggregator (lines 114-132) with a loop of `<TopicRail>` per topic.
- Keep the bottom `paste YouTube link` dashed row unchanged.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `app/home/page.tsx` with:
```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TopicRail } from '@/components/home/TopicRail';

function fmtBank(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s.toString().padStart(2, '0')}s` : `${m}m`;
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

  const [topicsRes, coursesRes, lessonsRes, progressRes] = await Promise.all([
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
  ]);

  const topics = topicsRes.data ?? [];
  const courses = coursesRes.data ?? [];
  const lessons = lessonsRes.data ?? [];
  const progress = progressRes.data ?? [];
  const doneIds = new Set(
    progress.filter((p) => p.completed_at).map((p) => p.lesson_id)
  );

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
  // course has an undone lesson. Deep enough: one level of topic, one course.
  let continueCard: {
    topicId: string;
    topicTitle: string;
    courseTitle: string;
    total: number;
    done: number;
    nextId: string;
    nextTitle: string;
    nextDur: number;
  } | null = null;

  outer: for (const t of topics) {
    const courseList = coursesByTopic.get(t.id) ?? [];
    for (const c of courseList) {
      const ls = lessonsByCourse.get(c.id) ?? [];
      if (ls.length === 0) continue;
      const next = ls.find((l) => !l.done);
      if (!next) continue;
      continueCard = {
        topicId: t.id,
        topicTitle: t.title,
        courseTitle: c.title,
        total: ls.length,
        done: ls.filter((l) => l.done).length,
        nextId: next.id,
        nextTitle: next.title,
        nextDur: next.duration_seconds,
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

        {continueCard && (
          <a
            href={`/lesson/${continueCard.nextId}`}
            className="card hero-card mt-16"
            style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
            data-testid="home-continue-card"
          >
            <div className="hero-angel" aria-hidden />
            <div className="eyebrow" style={{ color: 'var(--ink)', fontWeight: 600 }}>
              continue · {continueCard.topicTitle}
            </div>
            <div className="display mt-4" style={{ fontSize: 22 }}>
              {continueCard.courseTitle}
            </div>
            <div className="bar mt-12">
              <i
                style={{
                  width: `${Math.round(
                    (continueCard.done / continueCard.total) * 100
                  )}%`,
                }}
              />
            </div>
            <div className="body mt-8" style={{ fontSize: 12 }}>
              up next · {continueCard.nextTitle}
              {continueCard.nextDur > 0
                ? ` · ${Math.floor(continueCard.nextDur / 60)}m`
                : ''}
            </div>
          </a>
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

Notes on what changed from the original:
- Imported `TopicRail` from `@/components/home/TopicRail`.
- Continue card: `card card-hl` → `card hero-card`; added `<div className="hero-angel" aria-hidden />` as the first child; the eyebrow is now ink-colored (formerly inherited muted gray from `.eyebrow`, now bumped to `var(--ink)` weight 600 to match the mockup).
- Topic loop: replaced the inline `topicRows.map(...)` and `lesson-row` rendering with `<TopicRail>` per topic.
- The `topicRows`/`firstYtId` aggregation block (original lines 114-132) is removed — `<TopicRail>` derives its own per-card thumbnail.
- The bottom `paste YouTube link` row is preserved verbatim except for spacing class adjustments to play nicely with the new sibling rails.

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Lint**

Run:
```bash
pnpm lint
```
Expected: no errors.

- [ ] **Step 4: Visual smoke check on `/home`**

Run:
```bash
pnpm dev
```
At `http://localhost:3000/home`, verify:
1. Continue card renders with the **plushy angel** clearly visible at the top-right, body overlapping the card edge.
2. Continue card border is **neutral gray** (no accent highlight).
3. Below "your topics" eyebrow, you see one row per topic with the topic title + "X courses · Y/Z done" meta on the right.
4. Each row has a **horizontal scroll** of course cards. The last visible card peeks past the right edge of the page padding (signal: scrollable).
5. Each course card shows: YouTube thumbnail (color image from `i.ytimg.com`), title, "X lessons · Y done", a thin progress bar.
6. Clicking a course card navigates to `/course/{id}`.
7. The "paste YouTube link" dashed row is still at the bottom.
8. A topic with no courses shows the dashed empty-state pill instead of an empty rail.

Resize the browser to ~360px wide — confirm 2+ cards fit and one peeks. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat(home): redesign with Netflix topic rails and plushy angel mascot"
```

---

## Task 7: Swap `BottomNav` icons for Lucide line icons

**Files:**
- Modify: `components/nav/BottomNav.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `components/nav/BottomNav.tsx` with:
```tsx
'use client';

import { usePathname } from 'next/navigation';
import { Home, Coffee, TrendingUp } from 'lucide-react';

const HIDE_PATTERNS = [
  /^\/$/,
  /^\/login(\/|$)/,
  /^\/auth(\/|$)/,
  /^\/onboarding(\/|$)/,
  /^\/lesson\//,
  /^\/feed(\/|$)/,
];

const ICON_PROPS = { size: 22, strokeWidth: 1.8 } as const;

export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const hidden = HIDE_PATTERNS.some((r) => r.test(pathname));
  if (hidden) return null;

  // Exact-match OR "prefix + /" so /addresses wouldn't accidentally match /add.
  const isHome =
    pathname === '/home' ||
    pathname.startsWith('/topic/') ||
    pathname.startsWith('/course/') ||
    pathname === '/add' ||
    pathname.startsWith('/add/');
  const isRelax =
    pathname === '/budget' ||
    pathname.startsWith('/budget/') ||
    pathname === '/feed' ||
    pathname.startsWith('/feed/');
  const isProgress =
    pathname === '/progress' || pathname.startsWith('/progress/');

  return (
    <nav className="bottom-nav" data-testid="bottom-nav">
      <a
        href="/home"
        className={`bottom-nav-item ${isHome ? 'active' : ''}`}
        aria-current={isHome ? 'page' : undefined}
        data-testid="nav-home"
      >
        <span className="bottom-nav-icon" aria-hidden>
          <Home {...ICON_PROPS} />
        </span>
        <span className="bottom-nav-label">home</span>
      </a>
      <a
        href="/budget"
        className={`bottom-nav-item ${isRelax ? 'active' : ''}`}
        aria-current={isRelax ? 'page' : undefined}
        data-testid="nav-relax"
      >
        <span className="bottom-nav-icon" aria-hidden>
          <Coffee {...ICON_PROPS} />
        </span>
        <span className="bottom-nav-label">relax</span>
      </a>
      <a
        href="/progress"
        className={`bottom-nav-item ${isProgress ? 'active' : ''}`}
        aria-current={isProgress ? 'page' : undefined}
        data-testid="nav-progress"
      >
        <span className="bottom-nav-icon" aria-hidden>
          <TrendingUp {...ICON_PROPS} />
        </span>
        <span className="bottom-nav-label">progress</span>
      </a>
    </nav>
  );
}
```

Notes:
- Removed `next/image` import (no longer rendering `nibs.png` from this file).
- The existing `.bottom-nav-icon img` rule in `app/globals.css` (lines 350-355) is left in place — it's now a no-op for this component since we render SVGs, not `<img>`. No need to delete it (YAGNI; some other surface might still use it).
- `data-testid` and `aria-current` attributes preserved exactly so any future Playwright tests built against the spec still pass.
- The active state still uses the `active` class, which in `globals.css:337-339` sets `color: var(--accent)` — and `--accent` is now near-black, so active tabs render in ink color. That matches the mockup.

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors. `lucide-react` exports `Home`, `Coffee`, `TrendingUp` as React components with built-in types.

- [ ] **Step 3: Lint**

Run:
```bash
pnpm lint
```
Expected: no errors.

- [ ] **Step 4: Visual smoke check on bottom nav**

Run:
```bash
pnpm dev
```
At `http://localhost:3000/home`, verify:
1. Bottom nav shows **three line icons**: house outline, coffee cup outline, upward trend line.
2. The active tab (`home` when on `/home`) is rendered in near-black; the other two in muted gray.
3. Tapping each icon navigates correctly:
   - `home` → `/home`
   - `relax` → `/budget`
   - `progress` → `/progress`
4. Visit `/lesson/<some-id>` and `/feed` — bottom nav is hidden (per `HIDE_PATTERNS`).
5. Visit `/budget` — `relax` icon highlights as active.
6. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add components/nav/BottomNav.tsx
git commit -m "feat(nav): swap emoji icons for Lucide line icons (Home/Coffee/TrendingUp)"
```

---

## Final verification (after all 7 tasks)

- [ ] **Step 1: Full build**

Run:
```bash
pnpm build
```
Expected: production build succeeds with no errors or warnings beyond the usual Next.js info logs.

- [ ] **Step 2: Spec acceptance walk-through**

With `pnpm dev` running, walk through each item in the spec's "Acceptance" and "Testing" sections:
- `/home` matches `home-mockup-v2.html` (the brainstorm preview) — black accent, plushy angel on hero, Netflix rails, Lucide bottom nav.
- The whole app's accent color is near-black instead of purple (sample `/login`, `/onboarding`, `/budget`, `/feed`).
- Bottom nav shows three Lucide line icons.
- No other functional behavior has changed (auth still works, jar chip still links to `/progress`, paste-row still links to `/add`).

If any item fails, fix it inline (treat as a follow-up task) and commit separately.

- [ ] **Step 3: Push the branch**

```bash
git push origin HEAD
```

This plan is complete when all seven tasks plus the final verification are committed.
