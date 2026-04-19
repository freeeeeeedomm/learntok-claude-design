# Lesson Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working `/lesson/[id]` page (scope B per spec): YouTube embed + server-trusted heartbeat loop + 5-min "still studying?" sheet + jar chip showing live balance + "mark done" button that writes `lesson_progress` and sends the user back to `/home`.

**Architecture:** Next.js 14 App Router. The route is a server component that fetches the lesson + profile via the user-scoped Supabase client (RLS filters invisible lessons) and hands serializable props to a `'use client'` player component. All credit flows through the existing `/api/sessions/{start,heartbeat,end}` endpoints. A new `/api/lessons/complete` endpoint upserts `lesson_progress`. The player uses `useYouTubePlayer` (postMessage bridge) and `useIdleDetection` (latched 5-min counter), both already shipped in Track F+G.

**Tech Stack:** Next.js 14, TypeScript (strict), Supabase (@supabase/ssr for cookie auth, @supabase/supabase-js for admin), Tailwind + existing `app/globals.css` component classes (`.btn`, `.btn-primary`, `.chip`, `.eyebrow`, `.display`, `.body`), Playwright for tests. Package manager: **npm** for running scripts locally on Windows (project also supports pnpm).

**Branch:** `lesson-page` (already created off post-merge `main`, spec committed at `cec9a99`).

**Spec:** `docs/superpowers/specs/2026-04-19-lesson-page-design.md`

---

## File plan

| File | Status | Purpose |
|---|---|---|
| `app/api/lessons/complete/route.ts` | Create | POST endpoint that upserts `lesson_progress` for the signed-in user |
| `app/lesson/[id]/page.tsx` | Create | Server component: fetch lesson + profile + progress, redirect on miss, render `<LessonPlayer>` |
| `app/lesson/[id]/LessonPlayer.tsx` | Create | Client component: all player state (start → heartbeat → end), idle sheet, mark-done flow |
| `tests/lessons-complete.spec.ts` | Create | API tests for `/api/lessons/complete` |
| `tests/lesson-page.spec.ts` | Create | Playwright page smoke test |

**Not modified:** `middleware.ts`, `lib/supabase/*`, `tailwind.config.ts`, `app/globals.css`, `hooks/*`, anything under `app/onboarding/` or `components/onboarding/`, existing migrations.

**No new migration.** `supabase/migrations/0003_rls.sql:41-42` already has `create policy "progress_own" on public.lesson_progress for all using (user_id = auth.uid()) with check (user_id = auth.uid())`, which covers insert/update/select/delete on own rows. Verified before planning.

---

## Task 1: `/api/lessons/complete` route

**Files:**
- Create: `app/api/lessons/complete/route.ts`
- Create: `tests/lessons-complete.spec.ts`

The route uses the **user-scoped** Supabase client (`createClient()` from `@/lib/supabase/server`) so RLS naturally enforces ownership. We do NOT use `adminClient()` here — the existing `progress_own` policy does the right thing.

Ownership check: we select the lesson through the user client first. If RLS filters it out (not owned, not preset), the query returns no row and we return 403 — matching the existing "don't enumerate" pattern in `/api/sessions/end`.

- [ ] **Step 1: Write the failing test file**

Create `tests/lessons-complete.spec.ts` with these cases. Use the existing helpers in `tests/helpers/session.ts`.

```ts
import { test, expect } from '@playwright/test';
import { admin, anyPresetLessonId, devAuthedContext } from './helpers/session';

test('complete: preset lesson returns completedAt close to now', async () => {
  const { ctx, userId } = await devAuthedContext();
  const lessonId = await anyPresetLessonId();

  const before = Date.now();
  const res = await ctx.post('/api/lessons/complete', { data: { lessonId } });
  expect(res.status()).toBe(200);
  const { completedAt } = await res.json();
  const ts = Date.parse(completedAt);
  expect(Number.isFinite(ts)).toBe(true);
  expect(ts).toBeGreaterThanOrEqual(before - 1000);
  expect(ts).toBeLessThanOrEqual(Date.now() + 1000);

  // DB should reflect the upsert.
  const a = admin();
  const { data: row } = await a
    .from('lesson_progress')
    .select('completed_at')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .single();
  expect(row?.completed_at).toBe(completedAt);

  await ctx.dispose();
});

test('complete: repeat call is idempotent (upsert)', async () => {
  const { ctx } = await devAuthedContext();
  const lessonId = await anyPresetLessonId();

  const first = await ctx.post('/api/lessons/complete', { data: { lessonId } });
  expect(first.status()).toBe(200);
  const { completedAt: t1 } = await first.json();

  // Small wait so the second timestamp is usually strictly later, but assert >=.
  await new Promise((r) => setTimeout(r, 50));

  const second = await ctx.post('/api/lessons/complete', { data: { lessonId } });
  expect(second.status()).toBe(200);
  const { completedAt: t2 } = await second.json();
  expect(Date.parse(t2)).toBeGreaterThanOrEqual(Date.parse(t1));

  await ctx.dispose();
});

test('complete: bogus lessonId returns 403', async () => {
  const { ctx } = await devAuthedContext();
  const res = await ctx.post('/api/lessons/complete', {
    data: { lessonId: '00000000-0000-0000-0000-000000000000' },
  });
  expect(res.status()).toBe(403);
  await ctx.dispose();
});

test('complete: lesson in another user-owned course returns 403', async () => {
  const { ctx } = await devAuthedContext();
  const a = admin();
  const { data: other } = await a.auth.admin.createUser({
    email: `other-${Date.now()}@learntok.local`,
    password: 'p',
    email_confirm: true,
  });
  try {
    // Create a private course + lesson owned by the other user.
    const { data: course } = await a
      .from('courses')
      .insert({
        owner_id: other.user!.id,
        is_preset: false,
        title: 'foreign course',
      })
      .select('id')
      .single();
    const { data: lesson } = await a
      .from('lessons')
      .insert({
        course_id: course!.id,
        position: 1,
        title: 'foreign lesson',
        yt_id: 'dQw4w9WgXcQ',
        duration_seconds: 60,
      })
      .select('id')
      .single();

    const res = await ctx.post('/api/lessons/complete', {
      data: { lessonId: lesson!.id },
    });
    expect(res.status()).toBe(403);
  } finally {
    await a.auth.admin.deleteUser(other.user!.id);
    await ctx.dispose();
  }
});

test('complete: malformed body returns 400', async () => {
  const { ctx } = await devAuthedContext();
  const res = await ctx.post('/api/lessons/complete', { data: { lessonId: 'not-a-uuid' } });
  expect(res.status()).toBe(400);
  await ctx.dispose();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Ensure Supabase local stack is up first (see `CLAUDE.md` and prior Track F+G notes). Then:

```
npx playwright test tests/lessons-complete.spec.ts
```

Expected: all 5 tests fail with 404 (route does not exist yet).

- [ ] **Step 3: Implement the route**

Create `app/api/lessons/complete/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const Body = z.object({ lessonId: z.string().uuid() });

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad' }, { status: 400 });
  const { lessonId } = parsed.data;

  // RLS filters invisible lessons. No row => 403 (don't enumerate).
  const { data: lesson } = await supabase
    .from('lessons')
    .select('id')
    .eq('id', lessonId)
    .maybeSingle();
  if (!lesson) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const completedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('lesson_progress')
    .upsert(
      { user_id: user.id, lesson_id: lessonId, completed_at: completedAt },
      { onConflict: 'user_id,lesson_id' }
    )
    .select('completed_at')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: 'upsert_failed' }, { status: 500 });
  }

  return NextResponse.json({ completedAt: data.completed_at });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx playwright test tests/lessons-complete.spec.ts
```

Expected: 5/5 pass.

- [ ] **Step 5: Commit**

```
git add app/api/lessons/complete/route.ts tests/lessons-complete.spec.ts
git commit -m "feat(api): /api/lessons/complete — upsert lesson_progress (user-scoped)"
```

---

## Task 2: Server component `app/lesson/[id]/page.tsx`

**Files:**
- Create: `app/lesson/[id]/page.tsx`

Does three Supabase reads (lesson, lesson count, progress) using the user-scoped client. RLS does the visibility filtering. Profile is read for initial balance.

`LessonPlayer` doesn't exist yet — we'll import it in the next task. To keep this task compilable standalone, we'll add a TODO stub import OR do both files in Task 2+3. I choose to colocate: Task 2 creates the stub file too so imports resolve.

- [ ] **Step 1: Create the page and a minimal player stub so imports resolve**

Create `app/lesson/[id]/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LessonPlayer } from './LessonPlayer';

type Params = { params: { id: string } };

export default async function LessonPage({ params }: Params) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: lesson } = await supabase
    .from('lessons')
    .select(`
      id, title, yt_id, position,
      course:courses!inner ( id, title )
    `)
    .eq('id', params.id)
    .maybeSingle();
  if (!lesson) redirect('/home');

  // `course` comes back as an array from the !inner join in supabase-js v2.
  const course = Array.isArray(lesson.course) ? lesson.course[0] : lesson.course;

  const { count: courseLessonCount } = await supabase
    .from('lessons')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', course.id);

  const { data: profile } = await supabase
    .from('profiles')
    .select('jar_balance_cached')
    .eq('id', user.id)
    .single();

  const { data: progress } = await supabase
    .from('lesson_progress')
    .select('completed_at')
    .eq('user_id', user.id)
    .eq('lesson_id', params.id)
    .maybeSingle();

  return (
    <LessonPlayer
      lesson={{
        id: lesson.id,
        title: lesson.title,
        ytId: lesson.yt_id,
        position: lesson.position,
        courseTitle: course.title,
        courseLessonCount: courseLessonCount ?? 0,
      }}
      initialBalance={profile?.jar_balance_cached ?? 0}
      alreadyCompleted={!!progress?.completed_at}
    />
  );
}
```

Create `app/lesson/[id]/LessonPlayer.tsx` as a typed stub (full impl in Task 3):

```tsx
'use client';

export type LessonPlayerProps = {
  lesson: {
    id: string;
    title: string;
    ytId: string;
    position: number;
    courseTitle: string;
    courseLessonCount: number;
  };
  initialBalance: number;
  alreadyCompleted: boolean;
};

export function LessonPlayer(_props: LessonPlayerProps) {
  return <div>lesson player (scaffold)</div>;
}
```

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
git add app/lesson/[id]/page.tsx app/lesson/[id]/LessonPlayer.tsx
git commit -m "feat(lesson): server component fetches lesson + profile + progress"
```

---

## Task 3: Scaffold `LessonPlayer` — start session + fallback UI

**Files:**
- Modify: `app/lesson/[id]/LessonPlayer.tsx`

Build up the client component in small increments. This task adds session start, error fallback, and the shell layout. No heartbeat yet (Task 4), no mark done (Task 5), no idle sheet (Task 6), no cleanup on leave (Task 7).

- [ ] **Step 1: Replace the stub with the scaffold**

Replace the full contents of `app/lesson/[id]/LessonPlayer.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useYouTubePlayer } from '@/hooks/use-youtube-player';

export type LessonPlayerProps = {
  lesson: {
    id: string;
    title: string;
    ytId: string;
    position: number;
    courseTitle: string;
    courseLessonCount: number;
  };
  initialBalance: number;
  alreadyCompleted: boolean;
};

type StartState =
  | { phase: 'starting' }
  | { phase: 'ready'; sessionId: string }
  | { phase: 'failed' };

function fmtBalance(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function LessonPlayer({ lesson, initialBalance, alreadyCompleted }: LessonPlayerProps) {
  const [state, setState] = useState<StartState>({ phase: 'starting' });
  const [balance, setBalance] = useState(initialBalance);
  const { playing, iframeProps } = useYouTubePlayer();

  // We need a stable reference to the session id even after the component re-renders
  // or unmounts — used by cleanup code in later tasks.
  const sessionIdRef = useRef<string | null>(null);

  const retryStart = () => setState({ phase: 'starting' });

  // Runs on mount (state starts as 'starting') and again whenever retryStart
  // flips state back to 'starting'.
  useEffect(() => {
    if (state.phase !== 'starting') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/sessions/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'learn', lessonId: lesson.id }),
        });
        if (!res.ok) throw new Error(`start ${res.status}`);
        const { sessionId } = await res.json();
        if (cancelled) return;
        sessionIdRef.current = sessionId;
        setState({ phase: 'ready', sessionId });
      } catch {
        if (!cancelled) setState({ phase: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.phase, lesson.id]);

  if (state.phase === 'failed') {
    return (
      <main className="app pad center col gap-16" style={{ minHeight: '100vh' }}>
        <div className="display" style={{ fontSize: 24 }}>couldn't start this lesson.</div>
        <div className="col gap-8" style={{ width: '100%', maxWidth: 320 }}>
          <button className="btn btn-primary" onClick={retryStart}>retry</button>
          <a className="btn btn-ghost" href="/home">back to home</a>
        </div>
      </main>
    );
  }

  if (state.phase === 'starting') {
    return (
      <main className="app pad center col" style={{ minHeight: '100vh' }}>
        <div className="body">starting session…</div>
      </main>
    );
  }

  return (
    <main className="app">
      <div className="row between aic" style={{ position: 'fixed', top: 0, left: 0, right: 0, padding: 16, zIndex: 10 }}>
        <a href="/home" style={{ fontSize: 24, color: 'var(--ink-soft)' }}>‹</a>
        <div className="chip" data-testid="jar-chip">{fmtBalance(balance)}</div>
      </div>

      <div className="pad pad-top col gap-16">
        <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#000', borderRadius: 12, overflow: 'hidden' }}>
          <iframe
            {...iframeProps}
            src={`https://www.youtube.com/embed/${lesson.ytId}?enablejsapi=1&rel=0&modestbranding=1`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            allow="autoplay; encrypted-media"
            title={lesson.title}
          />
        </div>

        <div>
          <div className="eyebrow">{lesson.courseTitle} · {lesson.position}/{lesson.courseLessonCount}</div>
          <div className="display mt-4" style={{ fontSize: 20 }}>{lesson.title}</div>
          <div className="body mt-4" style={{ fontSize: 12 }}>
            {playing
              ? <span style={{ color: 'var(--good)' }}>● earning time</span>
              : <span style={{ color: 'var(--ink-mute)' }}>paused · timer stopped</span>}
          </div>
          {alreadyCompleted && (
            <div className="eyebrow mt-8" data-testid="already-completed">✓ completed before</div>
          )}
        </div>

        <button className="btn btn-primary" data-testid="mark-done" disabled>
          mark done &amp; next
        </button>
      </div>
    </main>
  );
}
```

Button `mark-done` is `disabled` for now — Task 5 wires it up.

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual sanity check the shell renders**

Start dev server:

```
npm run dev
```

In another terminal, run `/api/dev/login` to set the auth cookie in a browser of your choice, then visit `http://localhost:3000/lesson/<any preset lesson id>`. Expected: page renders "starting session…" briefly, then shows the iframe, title, "paused · timer stopped" status, and the disabled mark-done button. Kill dev server.

(If you can't easily set cookies by hand, skip this — the Playwright test in Task 8 covers it.)

- [ ] **Step 4: Commit**

```
git add app/lesson/[id]/LessonPlayer.tsx
git commit -m "feat(lesson): LessonPlayer scaffold — start session + iframe + layout"
```

---

## Task 4: Heartbeat loop

**Files:**
- Modify: `app/lesson/[id]/LessonPlayer.tsx`

Add the 15s heartbeat effect. Declares `isIdle` locally as `false` — the idle hook wires up in Task 6.

- [ ] **Step 1: Add heartbeat effect**

In `app/lesson/[id]/LessonPlayer.tsx`, after the start effect, add:

```tsx
// Placeholder until Task 6 wires useIdleDetection.
const isIdle = false;

useEffect(() => {
  if (state.phase !== 'ready') return;
  const sessionId = state.sessionId;
  let cancelled = false;

  const tick = async () => {
    try {
      const res = await fetch('/api/sessions/heartbeat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, playing: playing && !isIdle }),
      });
      if (cancelled || !res.ok) return;
      const body: { balance?: number } = await res.json();
      if (typeof body.balance === 'number') setBalance(body.balance);
    } catch {
      // single blip — next tick retries
    }
  };

  tick(); // establish anchor immediately
  const id = setInterval(tick, 15_000);
  return () => {
    cancelled = true;
    clearInterval(id);
  };
}, [state, playing, isIdle]);
```

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
git add app/lesson/[id]/LessonPlayer.tsx
git commit -m "feat(lesson): 15s heartbeat loop updates balance from server"
```

---

## Task 5: Mark-done flow

**Files:**
- Modify: `app/lesson/[id]/LessonPlayer.tsx`

Wire the "mark done" button: POST to `/api/lessons/complete`, then POST to `/api/sessions/end`, then navigate to `/home`. Button stays disabled while the flow is in flight.

- [ ] **Step 1: Add `useRouter` + handler**

At the top of `app/lesson/[id]/LessonPlayer.tsx`, update the imports:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useYouTubePlayer } from '@/hooks/use-youtube-player';
```

Inside `LessonPlayer`, after the `balance` state, add:

```tsx
const router = useRouter();
const [submitting, setSubmitting] = useState(false);

const markDone = async () => {
  if (submitting || state.phase !== 'ready') return;
  setSubmitting(true);
  try {
    // 1. Mark progress.
    const completeRes = await fetch('/api/lessons/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lessonId: lesson.id }),
    });
    if (!completeRes.ok) {
      setSubmitting(false);
      // TODO(toast): show "couldn't save — try again" non-blocking; for now log.
      console.error('complete failed', completeRes.status);
      return;
    }
    // 2. End session (failure is non-blocking — orphan cleanup will handle it).
    try {
      await fetch('/api/sessions/end', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: state.sessionId }),
      });
    } catch {
      // ignore
    }
    // 3. Navigate home.
    router.push('/home');
  } catch {
    setSubmitting(false);
  }
};
```

Update the button JSX:

```tsx
<button
  className="btn btn-primary"
  data-testid="mark-done"
  onClick={markDone}
  disabled={submitting || state.phase !== 'ready'}
>
  {submitting ? 'saving…' : 'mark done & next'}
</button>
```

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
git add app/lesson/[id]/LessonPlayer.tsx
git commit -m "feat(lesson): mark-done wires complete → end → /home"
```

---

## Task 6: Idle sheet

**Files:**
- Modify: `app/lesson/[id]/LessonPlayer.tsx`

Replace the `isIdle = false` placeholder from Task 4 with the real `useIdleDetection` hook. Render the idle sheet when `isIdle` latches.

- [ ] **Step 1: Wire the hook**

In `app/lesson/[id]/LessonPlayer.tsx`, update imports:

```tsx
import { useYouTubePlayer } from '@/hooks/use-youtube-player';
import { useIdleDetection } from '@/hooks/use-idle-detection';
```

Remove the line:

```tsx
const isIdle = false;
```

Add, near the `useYouTubePlayer` call:

```tsx
const { isIdle, acknowledge } = useIdleDetection({ active: !playing });
```

This places `active = !playing` — the hook ticks while paused, latches `isIdle = true` at 300 seconds, and only `acknowledge()` clears it.

- [ ] **Step 2: Add a "done for now" handler**

After `markDone`, add:

```tsx
const doneForNow = async () => {
  if (submitting || state.phase !== 'ready') return;
  setSubmitting(true);
  try {
    await fetch('/api/sessions/end', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: state.sessionId }),
    });
  } catch {
    // ignore — orphan cleanup handles it
  }
  router.push('/home');
};
```

- [ ] **Step 3: Render the idle sheet**

Inside the outer `<main className="app">`, right before the closing `</main>`, add:

```tsx
{isIdle && (
  <div
    data-testid="idle-sheet"
    style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      zIndex: 20,
    }}
  >
    <div
      className="col gap-16"
      style={{
        width: '100%', maxWidth: 480,
        background: 'var(--bg-2)',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        borderTop: '1px solid var(--line)',
        padding: 24,
      }}
    >
      <div style={{ width: 40, height: 4, background: 'var(--line)', borderRadius: 2, alignSelf: 'center' }} />
      <div className="display" style={{ fontSize: 24 }}>still studying?</div>
      <div className="body">
        video's been paused 5 min. we paused the earn clock too — no cheating by accident 😊
      </div>
      <div className="col gap-8">
        <button className="btn btn-primary" onClick={acknowledge}>yep, resume</button>
        <button className="btn btn-ghost" onClick={doneForNow} disabled={submitting}>
          done for now
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Typecheck**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```
git add app/lesson/[id]/LessonPlayer.tsx
git commit -m "feat(lesson): idle sheet — latched 5-min pause, acknowledge to resume"
```

---

## Task 7: Session cleanup on leave

**Files:**
- Modify: `app/lesson/[id]/LessonPlayer.tsx`

Best-effort `POST /api/sessions/end` when the user navigates away without clicking mark done or "done for now":

- On `pagehide` event → `navigator.sendBeacon`. Browser guarantees the request is sent even during unload.
- On component unmount (client-side nav, e.g., `router.push` for reasons other than mark-done — there aren't any right now, but future proofing) → fire-and-forget `fetch`.

Server-side orphan cleanup in `/api/sessions/start` is the backstop, so missing a beacon is not catastrophic.

- [ ] **Step 1: Add a ref to track whether end has been called**

We want to avoid double-ending. Track inside the component:

```tsx
const endedRef = useRef(false);

const endSessionBestEffort = () => {
  const sessionId = sessionIdRef.current;
  if (!sessionId || endedRef.current) return;
  endedRef.current = true;
  try {
    navigator.sendBeacon(
      '/api/sessions/end',
      new Blob([JSON.stringify({ sessionId })], { type: 'application/json' })
    );
  } catch {
    // some browsers/environments reject Blob bodies; fall back to fetch keepalive
    try {
      fetch('/api/sessions/end', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
        keepalive: true,
      });
    } catch {}
  }
};
```

Add these declarations next to the other refs/state (before the start effect).

- [ ] **Step 2: Attach `pagehide` listener**

After the heartbeat effect, add:

```tsx
useEffect(() => {
  const onHide = () => endSessionBestEffort();
  window.addEventListener('pagehide', onHide);
  return () => window.removeEventListener('pagehide', onHide);
}, []);
```

- [ ] **Step 3: Fire on unmount too**

Add a cleanup-only effect at the end of the effects section:

```tsx
useEffect(() => {
  return () => {
    endSessionBestEffort();
  };
}, []);
```

- [ ] **Step 4: Update `markDone` and `doneForNow` to set `endedRef`**

Both handlers already call `/api/sessions/end` explicitly. Mark the ref so the unmount/pagehide path doesn't double-send. In `markDone`, immediately after the `fetch('/api/sessions/end', ...)` block (success or swallowed catch), set:

```tsx
endedRef.current = true;
```

In `doneForNow`, do the same right before `router.push('/home')`:

```tsx
endedRef.current = true;
router.push('/home');
```

(Putting it before the push matters — the unmount-cleanup effect runs synchronously on navigation, and we don't want it to fire a second end request.)

- [ ] **Step 5: Typecheck**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```
git add app/lesson/[id]/LessonPlayer.tsx
git commit -m "feat(lesson): sendBeacon on pagehide + unmount cleanup (idempotent)"
```

---

## Task 8: Page smoke test

**Files:**
- Create: `tests/lesson-page.spec.ts`

Validates that the full page renders after `/api/sessions/start` succeeds and that mark-done flows into `/home` with `lesson_progress` written.

Because the test runs in Chromium against a real YouTube embed, we can't rely on the iframe's postMessage events making it into the page (Playwright's origin/frame security + YouTube's anti-automation may interfere). We check DOM chrome only; playing-state behavior is already covered by `tests/sessions.spec.ts`.

Uses Playwright's browser context (not `APIRequestContext`) so we get real page navigation. Auth happens through `/api/dev/login` which sets the cookie on the returned response — we'll issue the login via `page.request` so the browser's cookie jar picks it up.

- [ ] **Step 1: Write the test**

Create `tests/lesson-page.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { admin, anyPresetLessonId } from './helpers/session';

test('lesson page: renders chrome and mark-done writes progress', async ({ page }) => {
  // 1. Auth via dev login — cookie is attached to the page's context.
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();
  const { email } = await loginRes.json();

  const a = admin();
  const { data: users } = await a.auth.admin.listUsers();
  const userId = users.users.find((u) => u.email === email)!.id;

  // Clear any prior progress for idempotency.
  await a.from('lesson_progress').delete().eq('user_id', userId);

  const lessonId = await anyPresetLessonId();

  // 2. Navigate.
  await page.goto(`/lesson/${lessonId}`);

  // 3. Wait for the iframe + mark-done button to appear (session start resolved).
  await expect(page.locator('iframe')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('jar-chip')).toBeVisible();
  await expect(page.getByTestId('mark-done')).toBeEnabled({ timeout: 10_000 });

  // 4. Click mark-done → should land on /home.
  await page.getByTestId('mark-done').click();
  await page.waitForURL('**/home', { timeout: 10_000 });

  // 5. DB verification: lesson_progress row exists with completed_at set.
  const { data: row } = await a
    .from('lesson_progress')
    .select('completed_at')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .single();
  expect(row?.completed_at).toBeTruthy();
});
```

- [ ] **Step 2: Run the test**

Ensure Supabase is up and the preset lesson seed exists. Then:

```
npx playwright test tests/lesson-page.spec.ts
```

Expected: 1/1 pass.

**Troubleshooting:**
- If the iframe never appears, check that `/api/sessions/start` isn't failing — look at the dev server console for 500s.
- If mark-done stays disabled, `state.phase !== 'ready'` — the start call hasn't resolved. Increase the `toBeEnabled` timeout to 20s.
- If `/home` redirects back to `/onboarding` (because the dev user isn't onboarded), check `app/home/page.tsx` and use `page.waitForURL(/\/(home|onboarding)/)` instead. The test should still pass on that relaxed regex; adjust if needed.

- [ ] **Step 3: Commit**

```
git add tests/lesson-page.spec.ts
git commit -m "test(lesson): page smoke — iframe renders, mark-done writes progress"
```

---

## Task 9: Full test run + lint + PR

**Files:** none new

- [ ] **Step 1: Run the whole Playwright suite**

```
npx playwright test
```

Expected: all tests pass (old Track F+G tests: 14, new lessons-complete: 5, new lesson-page: 1 = 20 total). If anything fails, fix before moving on.

- [ ] **Step 2: Lint**

```
npm run lint
```

Expected: no errors. Fix any lint complaints inline.

- [ ] **Step 3: Final typecheck**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Push branch**

```
git push -u origin lesson-page
```

- [ ] **Step 5: Open PR**

```
gh pr create --title "feat: lesson page (/lesson/[id]) + /api/lessons/complete" --body "$(cat <<'EOF'
## Summary
- Adds `/lesson/[id]` page: YouTube embed + server-trusted heartbeat loop + 5-min "still studying?" sheet + jar chip.
- Adds `POST /api/lessons/complete` endpoint that upserts `lesson_progress` (user-scoped; RLS already permits).
- Wires `useYouTubePlayer` and `useIdleDetection` (shipped in Track F+G PR #1) into a real page for the first time.
- `pagehide` + unmount cleanup fire `POST /api/sessions/end` best-effort; orphan cleanup is the backstop.

Scope B per spec at `docs/superpowers/specs/2026-04-19-lesson-page-design.md`. Plan at `docs/superpowers/plans/2026-04-19-lesson-page.md`.

No changes to middleware, Supabase clients, Tailwind config, or onboarding code. No new migration (existing `progress_own` RLS policy covers the upsert).

## Test plan
- [x] `tests/lessons-complete.spec.ts`: 5 API tests (success, idempotent, bogus id, foreign user, bad body)
- [x] `tests/lesson-page.spec.ts`: page smoke (iframe renders, mark-done → `/home` + DB row)
- [x] Full Playwright suite (20 tests) green locally
- [x] `npm run lint` clean
- [x] `npx tsc --noEmit` clean

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Post the PR URL**

Print the URL that `gh pr create` returned so the user can review.

---

## Self-review notes

- **Spec coverage check.** Every section of `docs/superpowers/specs/2026-04-19-lesson-page-design.md` maps to at least one task:
  - Route + data flow → Task 2
  - Session lifecycle → Tasks 3, 4, 5, 6, 7
  - Heartbeat loop → Task 4
  - Idle sheet → Task 6
  - Mark done + new API → Tasks 1, 5
  - Error handling matrix → mostly Task 3 (start fallback), plus silent handling in heartbeat/end
  - UI layout → Task 3
  - Test plan → Tasks 1, 8
  - File plan → matches tasks exactly

- **Out-of-scope items stay out.** No NibsHandle, no LessonDone, no `/course/[id]`, no `show_timer` toggle, no auto-mark-done on video end, no realtime subscription. None of these appear as tasks.

- **No migration.** Verified `supabase/migrations/0003_rls.sql:41-42` has a blanket `for all` policy on `lesson_progress` for own rows, so insert/upsert with the user-scoped client works today.

- **Dependencies between tasks:**
  - Task 2 depends on Task 1? No — Task 2 creates the stub that imports from `./LessonPlayer`; Task 3 fills it in. Task 1 is independent and could run in parallel, but sequential is clearer.
  - Task 4 depends on Task 3 (effect added alongside existing state).
  - Task 5 depends on Task 3 (button exists but disabled).
  - Task 6 depends on Task 4 (replaces the `isIdle = false` placeholder).
  - Task 7 depends on Tasks 5 and 6 (they both set `endedRef.current = true` to dedupe).
  - Task 8 depends on everything.
  - Task 9 depends on Task 8.

- **Type consistency:** `LessonPlayerProps` shape in Task 2 stub matches the real implementation in Task 3. `sessionIdRef` / `endedRef` / `endSessionBestEffort` all named consistently across Tasks 3 and 7.
