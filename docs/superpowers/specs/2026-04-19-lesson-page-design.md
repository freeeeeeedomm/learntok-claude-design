# Lesson Page — Design Spec

**Date:** 2026-04-19
**Branch:** `lesson-page`
**Supersedes HANDOFF.md #9** (lesson page scope).

This spec covers the standard-scope lesson page: the `/lesson/[id]` route,
its client-side player loop, a new `POST /api/lessons/complete` endpoint,
and the tests and migrations needed to support them.

Builds on the session lifecycle + hooks shipped in
`docs/superpowers/specs/2026-04-19-sessions-lifecycle-design.md` (merged in
PR #1). That spec defines `/api/sessions/{start,heartbeat,end}`,
`useYouTubePlayer`, `useIdleDetection`, and `apply_heartbeat_delta` RPC —
all of which are dependencies here and not re-designed.

## Goal

Port v3's `Lesson` component (`v3/screens.jsx:109-218`) to the Next.js app
so that a signed-in user can navigate to `/lesson/<preset-or-owned lesson id>`,
watch the embedded YouTube video, bank time in the jar while playing, see
the balance update, get a "still studying?" sheet after 5 minutes of pause,
and mark the lesson done.

Server-trusted credit only: the page never computes balance locally. Every
second banked flows through `/api/sessions/heartbeat`, which writes the
ledger.

## Non-goals

- NibsHandle (deferred — needs home page integration)
- LessonDone celebration screen (user jumps directly to `/home` on mark done)
- `/course/[id]` list page (test access is by direct URL)
- `show_timer` 👁 privacy toggle (jar chip always visible)
- Auto-mark-done when the YouTube player reports `ended` (user clicks manually)
- Supabase realtime subscription for balance (heartbeat response is the
  update channel)

## Route + data flow

### `app/lesson/[id]/page.tsx` — server component

On request:

1. `createClient()` → `supabase.auth.getUser()`. `middleware.ts` already
   redirects unauthed users to `/login`, so assume `user` exists.
2. Select the lesson with a join to its course — RLS filters out lessons
   the user can't see (i.e., not preset and not owned):

   ```ts
   const { data: lesson } = await supabase
     .from('lessons')
     .select(`
       id, title, yt_id, duration_seconds, position,
       course:courses!inner ( id, title )
     `)
     .eq('id', params.id)
     .single();
   ```

   If the query returns `null` (not found, or RLS hid it), `redirect('/home')`.

   **Position display:** "n / N" requires the total lesson count for the
   parent course. Run a separate `count` query after the lesson fetch:
   ```ts
   const { count } = await supabase.from('lessons')
     .select('*', { count: 'exact', head: true })
     .eq('course_id', lesson.course.id);
   ```

3. Read the user's profile balance and `show_timer`:
   ```ts
   const { data: profile } = await supabase
     .from('profiles')
     .select('jar_balance_cached')
     .eq('id', user.id).single();
   ```

4. Read any existing lesson progress (for the "✓ already completed"
   display hint, non-blocking):
   ```ts
   const { data: progress } = await supabase
     .from('lesson_progress')
     .select('completed_at')
     .eq('user_id', user.id).eq('lesson_id', params.id).maybeSingle();
   ```

5. Render:
   ```tsx
   <LessonPlayer
     lesson={{ id, title, ytId, position, courseTitle, courseLessonCount }}
     initialBalance={profile.jar_balance_cached}
     alreadyCompleted={!!progress?.completed_at}
   />
   ```

### `app/lesson/[id]/LessonPlayer.tsx` — client component

All state and side effects live here. Marked `'use client'`. Props are
JSON-serializable (no Supabase client, no User object).

## Session lifecycle

| Trigger | Action |
|---|---|
| Mount (first `useEffect`) | `fetch('/api/sessions/start', { kind: 'learn', lessonId })` → store `sessionId` in state |
| Every 15s while `sessionId` set | `POST /api/sessions/heartbeat { sessionId, playing: effectivePlaying }` → update balance from response |
| Mark done button | 1. `POST /api/lessons/complete { lessonId }` 2. `POST /api/sessions/end { sessionId }` 3. `router.push('/home')` |
| Idle sheet "done for now" | `POST /api/sessions/end { sessionId }` → `router.push('/home')` |
| Component unmount (e.g., back button, client-side nav) | `useEffect` cleanup fires `fetch('/api/sessions/end', ...)`, fire-and-forget (no await) |
| `pagehide` event (tab close, full nav) | `navigator.sendBeacon('/api/sessions/end', JSON.stringify({ sessionId }))` |

`effectivePlaying = playing && !isIdle`. When `isIdle` is latched true, the
video can be playing yet heartbeats still carry `playing: false` — the
server records zero credit until the user dismisses the sheet.

### Start failure

If `/api/sessions/start` returns non-2xx, render a full-screen fallback:

> couldn't start this lesson.
> [ retry ]  [ back to home ]

Retry re-calls `/start`. The iframe is NOT rendered until `sessionId` is
known — no point loading the video if we can't credit time.

## Heartbeat loop

```ts
useEffect(() => {
  if (!sessionId) return;
  let cancelled = false;

  const tick = async () => {
    try {
      const res = await fetch('/api/sessions/heartbeat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          playing: playing && !isIdle,
        }),
      });
      if (!cancelled && res.ok) {
        const { balance } = await res.json();
        setBalance(balance);
      }
    } catch {
      // network blip — next tick will retry
    }
  };

  tick(); // fire immediately so the first 15s of play isn't lost on unmount
  const id = setInterval(tick, 15_000);
  return () => {
    cancelled = true;
    clearInterval(id);
  };
}, [sessionId, playing, isIdle]);
```

Design notes:

- **No overlap guard.** The `apply_heartbeat_delta` RPC uses row-level
  locking; two concurrent heartbeats are safe.
- **Depends on `playing` and `isIdle`.** The effect resets on every change,
  which means a heartbeat fires within a React render of any transition.
  That's intentional — a play/pause edge should propagate to the server
  within a second or two instead of waiting up to 15s.
- **Failure is silent.** A single network blip is expected; a persistent
  failure shows up as balance no longer increasing. Explicit offline UI
  would be nice-to-have but is deferred.

## Idle sheet

Rendered as a fixed-position overlay when `isIdle === true`. Copy mirrors
v3 exactly:

> **still studying?**
> video's been paused 5 min. we paused the earn clock too — no cheating by
> accident 😊
>
> [ yep, resume ]  [ done for now ]

- **yep, resume** → `acknowledge()` (clears the latched state; user still
  has to press play on the YouTube iframe themselves). Sheet dismisses.
- **done for now** → `POST /api/sessions/end` then `router.push('/home')`.

The 5-min threshold is the hook's default (`timeoutSec = 300`).

## Mark done + new API route

### `POST /api/lessons/complete`

```
body:     { lessonId: string (uuid) }
response: { completedAt: string (ISO 8601) }
errors:
  401   no session
  400   bad body
  403   lesson not visible to user (hide 404 under 403, don't enumerate)
  500   DB error
```

Implementation:

```ts
// zod-validate body
// createClient() → user
// verify visibility:
const { data: lesson } = await supabase.from('lessons')
  .select('id').eq('id', lessonId).maybeSingle();   // RLS filters
if (!lesson) return json({ error: 'lesson not visible' }, 403);

// upsert
const { data, error } = await supabase.from('lesson_progress')
  .upsert({
    user_id: user.id,
    lesson_id: lessonId,
    completed_at: new Date().toISOString(),
  }, { onConflict: 'user_id,lesson_id' })
  .select('completed_at').single();
if (error) return json({ error: error.message }, 500);
return json({ completedAt: data.completed_at });
```

Idempotent: a second call just overwrites `completed_at` with a newer
timestamp. No side effect on other tables.

### `lesson_progress` RLS migration

The existing `0003_rls.sql` may only have `SELECT` policies on
`lesson_progress`. Client-side RLS insert/update must be allowed for the
user's own rows, because this route uses the **user-scoped** Supabase
client (not `adminClient`), matching the existing pattern of letting the
user own their own rows.

Check `0003_rls.sql` first. If policies are missing, add
`supabase/migrations/0005_lesson_progress_rls.sql`:

```sql
create policy "lesson_progress_insert_own"
  on public.lesson_progress for insert
  with check (auth.uid() = user_id);

create policy "lesson_progress_update_own"
  on public.lesson_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

(SELECT policy likely already exists; don't duplicate.)

## Error handling matrix

| Failure point | User-visible effect |
|---|---|
| `/start` returns 4xx/5xx | full-screen fallback with retry |
| `/heartbeat` single blip | silent; next tick retries |
| `/heartbeat` persistent failure | balance stops increasing (deferred: offline banner) |
| `/lessons/complete` fails | toast "couldn't save progress — try again"; session not ended |
| `/end` fails on mark-done path | already completed; log and still push to `/home` |
| YouTube iframe never loads / postMessage never arrives | `playing` stays false indefinitely; UI shows "paused"; no credit earned; user can still mark done |

Toasts can be a lightweight inline div for this milestone (full toast
library is out of scope).

## UI layout

Mirror v3 visual hierarchy; use existing Tailwind tokens (no hex). The
rough markup:

```tsx
<main className="min-h-screen bg-bg text-ink">
  <header className="fixed top-0 inset-x-0 flex justify-between p-4 z-10">
    <button onClick={goBack}>‹</button>
    <div className="jar-chip">{fmtBank(balance)}</div>
  </header>

  <div className="pt-24 px-4 space-y-4">
    <div className="aspect-video bg-black rounded-xl overflow-hidden">
      <iframe {...iframeProps}
        src={`https://www.youtube.com/embed/${lesson.ytId}?enablejsapi=1&rel=0&modestbranding=1`}
        className="w-full h-full border-0"
        allow="autoplay; encrypted-media" />
    </div>

    <div>
      <div className="eyebrow">{lesson.courseTitle} · {lesson.position}/{lesson.courseLessonCount}</div>
      <h1 className="font-serif text-2xl mt-1">{lesson.title}</h1>
      <p className="text-sm mt-2">
        {effectivePlaying
          ? <span className="text-good">● earning time</span>
          : <span className="text-ink-mute">paused · timer stopped</span>}
      </p>
      {alreadyCompleted && <span className="badge-mute">✓ completed before</span>}
    </div>

    <button className="btn btn-primary w-full" onClick={markDone}>
      mark done & next
    </button>
  </div>

  {isIdle && <IdleSheet onResume={acknowledge} onDone={handleDoneForNow} />}
</main>
```

`fmtBank(seconds)` is a tiny util — `formatDuration` on seconds to
`"Hh Mm" | "Mm Ss"`. Put it in `lib/format.ts` if not already there.

## Test plan

### API: `tests/lessons-complete.spec.ts`

- Auth'd user POSTs for a visible preset lesson → 200, returns
  `completedAt` within 1s of now.
- Same user POSTs again for the same lesson → 200, upsert succeeds and
  `completedAt` is a valid timestamp `>=` the previous one (allow equal —
  back-to-back calls can land on the same millisecond).
- POST for a bogus UUID → 403.
- POST for a lesson in another user's course → 403. (Reuse the
  foreign-user helper from `tests/sessions.spec.ts`.)
- Malformed body → 400.

### Page smoke: `tests/lesson-page.spec.ts`

- Auth'd user visits `/lesson/<preset-lesson-id>`.
- Page does not redirect; DOM contains the `<iframe>`, the jar chip (with
  a number), the lesson title, and the "mark done & next" button.
- Does NOT rely on YouTube postMessage events reaching the test browser —
  the iframe will load but `playing` will never become true, which is
  fine.
- Bonus (if cheap): click "mark done & next" → navigates to `/home`, and
  a follow-up DB query (via the existing test helper) sees
  `lesson_progress.completed_at` set.

### Not tested

- `useYouTubePlayer` bridge end-to-end (YouTube's iframe in a headless
  test is brittle). Heartbeat integration with `playing=true/false` is
  already covered by `tests/sessions.spec.ts`.
- Idle sheet appearance (would need to either wait 5 minutes or mock
  timers; defer).

## File plan

**New**
- `app/lesson/[id]/page.tsx` (~50 lines, RSC)
- `app/lesson/[id]/LessonPlayer.tsx` (~200 lines, `'use client'`)
- `app/api/lessons/complete/route.ts` (~50 lines)
- `supabase/migrations/0005_lesson_progress_rls.sql` (if RLS policies are
  missing — verify in `0003_rls.sql` first)
- `tests/lessons-complete.spec.ts` (~80 lines)
- `tests/lesson-page.spec.ts` (~50 lines)
- Possibly `lib/format.ts` for `fmtBank` (a few lines) — skip if it
  already exists

**Modified**
None. `middleware.ts`, `lib/supabase/*`, `tailwind.config.ts`,
`app/onboarding/*`, `components/onboarding/*`, and the session hooks stay
untouched.

## Open decisions already resolved (recap)

- Scope: **B** — player + heartbeat loop + idle sheet + mark done + jar
  chip. No NibsHandle, no LessonDone, no course list, no timer toggle.
- Mark done: **A** — new `/api/lessons/complete` route, user-scoped client,
  upserts `lesson_progress`.
- Session cleanup: **C** — client `navigator.sendBeacon` + `useEffect`
  cleanup on unmount, server orphan-close as backstop.
- Balance display: initial from SSR `jar_balance_cached`; updated per
  heartbeat response.
