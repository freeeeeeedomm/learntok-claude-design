# Phase 2: Page Surfaces + Bottom Nav + Lesson Upgrades

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the content surfaces shipped in Phase 1 — add real YouTube thumbnails on home/topic/course rows, mount a global bottom navigation so `/progress` has a first-class entry, restore native YouTube controls (fullscreen is currently blocked by a missing `allow` attribute), and make the jar-balance counter tick every second client-side instead of jumping every 15 seconds on heartbeat.

**Architecture:** Three independent UI units. BottomNav is a fresh client component mounted once in root layout with a path-based visibility gate. Thumbnails are pure CSS `background-image` additions driven by the first lesson's `yt_id` — no new queries are needed beyond what already runs for the topic aggregation. Lesson player gains (1) `allow="fullscreen"` + `allowFullScreen` on the iframe and (2) a client-only `useEffect` that increments `balance` by 1 every second when `playing === true`, with the heartbeat response overwriting the local tick to stay authoritative.

**Tech Stack:** Next.js 14 App Router, React client components, CSS custom properties (existing light-mode palette), Playwright. No new libs.

**Spec:** `docs/superpowers/specs/2026-04-19-topic-hierarchy-and-nibs-ball-design.md` Phase 2 section.

**Branch:** `redesign-phase2` (base: `2f52e56` on `main`, which is Phase 1 merged).

---

## File Structure

**New files:**
- `components/nav/BottomNav.tsx` — client component, path-based visibility
- `tests/nav-smoke.spec.ts` — visibility assertions across routes

**Modified files:**
- `app/layout.tsx` — mount `<BottomNav />`
- `app/globals.css` — `.bottom-nav` styles + safe-area padding rules
- `app/home/page.tsx` — add YT thumbnail background on topic rows
- `app/topic/[id]/page.tsx` — already has YT thumbnails from Phase 1, no change
- `app/course/[id]/page.tsx` — replace `YT` text thumb with real YT `mqdefault.jpg`
- `app/lesson/[id]/LessonPlayer.tsx` — fullscreen allow + 1s client tick

**Untouched (explicitly NOT in Phase 2):**
- `/add` topic dropdown (stays deferred; user-added courses still get `topic_id = null`)
- NibsHandle → NibsBall swap (Phase 3)
- Feed surface (Phase 4)

---

### Task 1: Global BottomNav

**Files:**
- Create: `components/nav/BottomNav.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Create: `tests/nav-smoke.spec.ts`

**Context for the subagent:** Phase 1 landed a new `/topic/[id]` route and kept `/home`, `/course/[id]`, `/lesson/[id]`, `/budget`, `/feed`, `/progress`, `/add`, `/login`, `/`. User feedback was that `/progress` has no discoverable entry — the jar-chip on /home links to it but users don't recognize it as clickable. The fix is a classic iOS/Android bottom tab bar with two tabs (Home + Progress), always visible EXCEPT on immersive routes (lesson player and feed) and auth routes (/ and /login).

- [ ] **Step 1.1: Create `components/nav/BottomNav.tsx`**

```tsx
'use client';

import { usePathname } from 'next/navigation';

const HIDE_PATTERNS = [
  /^\/$/,
  /^\/login(\/|$)/,
  /^\/auth(\/|$)/,
  /^\/onboarding(\/|$)/,
  /^\/lesson\//,
  /^\/feed(\/|$)/,
];

export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const hidden = HIDE_PATTERNS.some((r) => r.test(pathname));
  if (hidden) return null;

  const isHome = pathname === '/home' || pathname.startsWith('/topic/') || pathname.startsWith('/course/') || pathname.startsWith('/add') || pathname.startsWith('/budget');
  const isProgress = pathname.startsWith('/progress');

  return (
    <nav className="bottom-nav" data-testid="bottom-nav">
      <a
        href="/home"
        className={`bottom-nav-item ${isHome ? 'active' : ''}`}
        data-testid="nav-home"
      >
        <span className="bottom-nav-icon" aria-hidden>🏠</span>
        <span className="bottom-nav-label">home</span>
      </a>
      <a
        href="/progress"
        className={`bottom-nav-item ${isProgress ? 'active' : ''}`}
        data-testid="nav-progress"
      >
        <span className="bottom-nav-icon" aria-hidden>📊</span>
        <span className="bottom-nav-label">progress</span>
      </a>
    </nav>
  );
}
```

- [ ] **Step 1.2: Add CSS to `app/globals.css`**

Append these rules at the end of the file:

```css
/* ===== Bottom navigation ===== */
.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  background: var(--bg);
  border-top: 1px solid var(--line);
  display: flex;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom, 0px));
  gap: 12px;
}

.bottom-nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 4px;
  color: var(--ink-mute);
  text-decoration: none;
  font-size: 11px;
  border-radius: 10px;
  transition: color 120ms ease, background 120ms ease;
}

.bottom-nav-item:hover {
  background: var(--bg-2);
}

.bottom-nav-item.active {
  color: var(--accent);
}

.bottom-nav-icon {
  font-size: 20px;
  line-height: 1;
}

.bottom-nav-label {
  letter-spacing: 0.02em;
}

/* Give pages breathing room so content isn't covered by the fixed nav. */
.app {
  padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
}
```

- [ ] **Step 1.3: Mount BottomNav in root layout**

Read `app/layout.tsx` first, then add the import and mount after `{children}`:

```tsx
import { BottomNav } from '@/components/nav/BottomNav';

// …inside the body:
<body className={inter.className}>
  {children}
  <BottomNav />
</body>
```

Preserve whatever class / metadata / imports are already there.

- [ ] **Step 1.4: Write the nav smoke test**

```ts
// tests/nav-smoke.spec.ts
import { test, expect } from '@playwright/test';

test('bottom nav visible on /home and /progress', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/home');
  await expect(page.getByTestId('bottom-nav')).toBeVisible();
  await expect(page.getByTestId('nav-home')).toBeVisible();
  await expect(page.getByTestId('nav-progress')).toBeVisible();

  // Click into /progress via the nav tab.
  await page.getByTestId('nav-progress').click();
  await page.waitForURL('**/progress');
  await expect(page.getByTestId('bottom-nav')).toBeVisible();
});

test('bottom nav hidden on /lesson/[id]', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  // Use a pinned preset lesson id from seed (Newton's first law).
  await page.goto('/lesson/30000000-0000-0000-0000-000000000111');
  // Wait for lesson page chrome to render.
  await expect(page.getByTestId('mark-done')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('bottom-nav')).toHaveCount(0);
});

test('bottom nav hidden on /feed', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  // Start a feed session and navigate to /feed.
  await page.goto('/budget');
  await page.getByTestId('budget-preset-120').click();
  await page.getByTestId('budget-start').click();
  await page.waitForURL(/\/feed\?session=/);
  await expect(page.getByTestId('bottom-nav')).toHaveCount(0);

  // Tidy up so the session doesn't linger.
  await page.getByTestId('feed-done').click();
});

test('bottom nav hidden on /login and /', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('bottom-nav')).toHaveCount(0);

  await page.goto('/login');
  await expect(page.getByTestId('bottom-nav')).toHaveCount(0);
});
```

- [ ] **Step 1.5: Run the new test**

```bash
npx playwright test tests/nav-smoke.spec.ts
```
Expected: 4 passed.

- [ ] **Step 1.6: Commit**

```bash
git add components/nav/BottomNav.tsx app/layout.tsx app/globals.css tests/nav-smoke.spec.ts
git commit -m "feat(nav): global BottomNav with home + progress tabs"
```

---

### Task 2: YouTube thumbnails on home + course rows

**Files:**
- Modify: `app/home/page.tsx`
- Modify: `app/course/[id]/page.tsx`

**Context for the subagent:** Phase 1 gave `/topic/[id]` real YT `mqdefault.jpg` thumbnails on each course row. `/home`'s topic rows show colored icon badges; `/course/[id]`'s lesson rows still show a dead `YT` text placeholder. Both should use YT thumbnails keyed to the first lesson's `yt_id`. The data already flows through the home queries — no schema change, no new query.

- [ ] **Step 2.1: Home — add thumbnail to topic rows**

In `app/home/page.tsx`, the `topicRows.map` block currently renders `t.icon` on a colored background. Extend the aggregation to compute the topic's "first lesson yt_id" (first course in order, first lesson in order), then render a YT thumbnail when available and fall back to the colored icon.

Inside the topicRows aggregation (the `topics.map` around line 115), compute `firstYt`:

```tsx
const topicRows = topics.map((t) => {
  const cs = coursesByTopic.get(t.id) ?? [];
  const allLs = cs.flatMap((c) => lessonsByCourse.get(c.id) ?? []);
  // First lesson of the first course (by position, matching query order).
  const firstCourse = cs[0];
  const firstYt = firstCourse
    ? (lessonsByCourse.get(firstCourse.id) ?? [])[0]
    : undefined;
  return {
    id: t.id,
    title: t.title,
    icon: t.icon ?? '📚',
    color: t.color ?? '#5e6ad2',
    courseCount: cs.length,
    lessonCount: allLs.length,
    doneCount: allLs.filter((l) => l.done).length,
    firstYtId: firstYt?.id ?? null,
    // Note: we actually need yt_id, not lesson id. Adjust the lessons
    // query below to include yt_id, then pipe it through lessonsByCourse.
  };
});
```

**Problem:** `lessonsByCourse` currently stores `{ id, title, duration_seconds, done }` — it doesn't include `yt_id`. Two options:
- (A) Extend the lessons SELECT in Home to include `yt_id` and thread it through the map.
- (B) Do a fresh lightweight query for the first-lesson-yt-id per topic.

Go with (A): it's a single column added to an existing query, no extra round-trip.

**Concrete diff for the lessons query + grouping:**

Find the lessons `Promise.all` entry and change its select to include `yt_id`:

```tsx
supabase
  .from('lessons')
  .select('id, course_id, position, title, duration_seconds, yt_id')
  .order('position', { ascending: true }),
```

Update `lessonsByCourse` construction to carry `yt_id`:

```tsx
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
```

Then `topicRows`:

```tsx
const topicRows = topics.map((t) => {
  const cs = coursesByTopic.get(t.id) ?? [];
  const allLs = cs.flatMap((c) => lessonsByCourse.get(c.id) ?? []);
  const firstCourse = cs[0];
  const firstYtId = firstCourse
    ? (lessonsByCourse.get(firstCourse.id) ?? [])[0]?.yt_id ?? null
    : null;
  return {
    id: t.id,
    title: t.title,
    icon: t.icon ?? '📚',
    color: t.color ?? '#5e6ad2',
    courseCount: cs.length,
    lessonCount: allLs.length,
    doneCount: allLs.filter((l) => l.done).length,
    firstYtId,
  };
});
```

Finally render the thumbnail with fallback:

```tsx
{topicRows.map((t) => (
  <a
    key={t.id}
    href={`/topic/${t.id}`}
    className="lesson-row"
    style={{ textDecoration: 'none', color: 'inherit' }}
    data-testid={`home-topic-${t.id}`}
  >
    <div
      className="thumb"
      style={
        t.firstYtId
          ? {
              backgroundImage: `url(https://i.ytimg.com/vi/${t.firstYtId}/mqdefault.jpg)`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : { background: t.color, color: '#fff' }
      }
    >
      {t.firstYtId ? '' : t.icon}
    </div>
    <div className="grow col">
      <div style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</div>
      <div className="body" style={{ fontSize: 11 }}>
        {t.courseCount} courses · {t.doneCount}/{t.lessonCount} lessons
      </div>
    </div>
    <div style={{ color: 'var(--ink-mute)' }}>›</div>
  </a>
))}
```

- [ ] **Step 2.2: Course — replace `YT` thumb with real YT thumbnail**

`app/course/[id]/page.tsx` currently renders `<div className="thumb">YT</div>` on each lesson row. Change it to a YT `mqdefault` background. The lesson already has `yt_id` accessible via the lessons select. If it isn't selected yet, extend the SELECT.

Find the lessons query:

```tsx
supabase
  .from('lessons')
  .select('id, position, title, duration_seconds')
  .eq('course_id', course.id)
  .order('position', { ascending: true }),
```

Change to include `yt_id`:

```tsx
supabase
  .from('lessons')
  .select('id, position, title, duration_seconds, yt_id')
  .eq('course_id', course.id)
  .order('position', { ascending: true }),
```

Then in the row render block, replace the placeholder:

```tsx
<div
  className="thumb"
  style={{
    backgroundImage: `url(https://i.ytimg.com/vi/${l.yt_id}/mqdefault.jpg)`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }}
/>
```

(Drop the `YT` text and leave the div empty when we have a yt_id — the image fills it.)

- [ ] **Step 2.3: Typecheck + dev smoke**

```bash
npx tsc --noEmit
```

Expected: no errors.

Hit `/home` in a dev server and confirm:
- Topic rows now show YT thumbnails (e.g., Physics shows `rjkQcfw5fkM`'s cover)
- Click into a topic → course rows already have thumbnails (from Phase 1)
- Click into a course → lesson rows show YT covers, not "YT" placeholder

- [ ] **Step 2.4: Commit**

```bash
git add app/home/page.tsx app/course/[id]/page.tsx
git commit -m "feat(home,course): real YouTube thumbnails on topic + lesson rows"
```

---

### Task 3: Lesson player — fullscreen + 1s client tick

**Files:**
- Modify: `app/lesson/[id]/LessonPlayer.tsx`

**Context for the subagent:** User feedback is (1) YT player has no fullscreen/volume/progress controls — this is because the current iframe `allow="autoplay; encrypted-media"` is missing `fullscreen` AND the React prop `allowFullScreen` is missing; YouTube's default `controls=1` is already on. (2) The visible jar-balance jumps in 15-second chunks because `balance` is only updated by heartbeat response; users expect to see it tick every second when the video is playing.

The fix is small: extend the iframe permissions, and add a `useEffect` that runs a 1s interval that increments balance locally during playback. The heartbeat response overwrites local balance every 15s so the client never drifts from the server by more than one heartbeat interval.

- [ ] **Step 3.1: Add fullscreen + picture-in-picture to the iframe**

Find the iframe declaration near line 240:

```tsx
<iframe
  {...iframeProps}
  src={`https://www.youtube.com/embed/${lesson.ytId}?enablejsapi=1&rel=0&modestbranding=1`}
  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
  allow="autoplay; encrypted-media"
  title={lesson.title}
/>
```

Replace with:

```tsx
<iframe
  {...iframeProps}
  src={`https://www.youtube.com/embed/${lesson.ytId}?enablejsapi=1&rel=0&modestbranding=1`}
  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
  allowFullScreen
  title={lesson.title}
/>
```

Note: `controls=1` is already the YouTube default — don't need to add it explicitly.

- [ ] **Step 3.2: Add 1s client tick for balance**

Right after the existing heartbeat `useEffect` (the one that sets up `setInterval(tick, HEARTBEAT_INTERVAL_MS)`), add a new `useEffect`:

```tsx
// Client-side 1s tick: while the video is playing (and session is ready),
// increment the displayed balance by 1 every second. The heartbeat effect
// above overwrites balance with the server-authoritative value every 15s,
// so local drift is bounded to one heartbeat window.
useEffect(() => {
  if (state.phase !== 'ready') return;
  if (!playing || isIdle) return;
  const id = setInterval(() => {
    setBalance((b) => b + 1);
  }, 1000);
  return () => clearInterval(id);
}, [state.phase, playing, isIdle]);
```

Why reconciliation works: `setBalance(body.balance)` in the heartbeat effect is called on every tick when the server returns `balance`. That value is always authoritative — the server computes it from the ledger. The 1s local tick only fills in the visual gap between heartbeats. If a tick gets it slightly ahead (e.g. server credited 19s instead of 20 because of a rounding boundary), the next heartbeat snaps it back. If the server decides to DEBIT (feed session), this effect will not run anyway because `playing` is tied to the YT player playing state which only happens on lesson pages.

- [ ] **Step 3.3: Typecheck + dev smoke**

```bash
npx tsc --noEmit
```

Open a lesson page. Verify:
- YT controls visible (seek bar, volume, fullscreen icon)
- Fullscreen button works
- While playing, the `jar-chip` text increments once per second

- [ ] **Step 3.4: Commit**

```bash
git add app/lesson/[id]/LessonPlayer.tsx
git commit -m "feat(lesson): fullscreen + picture-in-picture + 1s client tick"
```

---

### Task 4: Full suite green + PR

- [ ] **Step 4.1: Run entire Playwright suite**

```bash
npx playwright test
```

Expected: 38 tests (34 existing + 4 new in nav-smoke). All passing.

Possible failure modes + fixes:
- If `nav-smoke.spec.ts › bottom nav hidden on /feed` times out waiting for feed-done click, the feed test cleanup was never reached. Not a functional issue for the nav test — still passes the `toHaveCount(0)` assertion BEFORE the cleanup. If it flakes, wrap the feed-done click in a try/catch.
- If `.app { padding-bottom }` breaks existing page layout visually, verify by grepping for hard-coded `padding-bottom` overrides — none are expected.

- [ ] **Step 4.2: Push + open PR**

```bash
git push -u origin redesign-phase2
gh pr create --title "Phase 2: thumbnails, bottom nav, lesson player polish" --body "$(cat <<'EOF'
## Summary

Polish pass on the Phase 1 surfaces:

- **Global `<BottomNav />`** mounted in root layout. Two tabs (home + progress). Hidden on /lesson/*, /feed, /login, /, /auth, /onboarding.
- **YT thumbnails** on /home topic rows + /course/[id] lesson rows (via `i.ytimg.com/vi/<id>/mqdefault.jpg`).
- **Lesson player**: restored YouTube native controls (fullscreen was blocked by a missing iframe `allow="fullscreen"` + `allowFullScreen`). Added a client-side 1s tick so the visible jar balance counts up every second during playback instead of jumping every 15s on heartbeat.

## Test plan

- [x] `npx playwright test` — all tests pass (38 total, 4 new in `tests/nav-smoke.spec.ts`)
- [x] Manual: /home shows real thumbnails, /course/<id> shows real lesson thumbnails, /lesson/<id> has a working fullscreen button, balance ticks up by 1 each second while video is playing.

## Explicitly deferred

- Nibs floating ball (Phase 3)
- Feed vertical-swipe + Angel handle (Phase 4)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

1. **Spec coverage.** Phase 2 spec requirements: thumbnails on /home + /course/[id] ✓, global `<BottomNav />` with path gate ✓, YT native controls restored ✓, 1s client tick ✓.
2. **Placeholder scan.** No TBD / TODO / "add appropriate" in the plan body. Every code block is complete and pastable.
3. **Type consistency.** `yt_id` column exists on lessons (verified via Phase 1 seed), `firstYtId: string | null` consistent across aggregation and render.
4. **File-path accuracy.** `components/nav/BottomNav.tsx` follows existing convention (see `components/characters/NibsHandle.tsx`). `app/layout.tsx` modification respects existing imports.
5. **Behavioral cross-check.** BottomNav's `HIDE_PATTERNS` matches the immersive pages identified in the spec. `.app { padding-bottom: 72px + safe-area }` gives the nav room without layout shift on already-pinned elements (topbar/jar-chip are `position: fixed`).

No issues found.
