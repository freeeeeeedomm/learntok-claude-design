# Sessions lifecycle + player/idle hooks — design

**Date:** 2026-04-19
**Branch:** `lesson-track`
**Tracks:** F (session plumbing) + G (player/idle hooks) per `HANDOFF.md`

## Goal

Build the server-trusted session primitive (`start`/`heartbeat`/`end`) and two client hooks (`use-youtube-player`, `use-idle-detection`) that the lesson and feed pages will depend on. Both `learn` and `feed` session kinds are supported end-to-end, including feed debit and budget-exhaustion auto-close.

## Non-goals

- Lesson page UI (Track C)
- Feed page UI (Track H)
- Nibs "N seconds left" nudge (policy undecided)
- Dev panel integration
- Playlist/course creation flows

## Invariants preserved

- **Server is the single source of truth for balance.** All ledger writes remain server-side via `adminClient()`. Clients never send `delta_seconds`.
- **Sessions are user-scoped.** Every write verifies `session.user_id === user.id`; RLS for reads already enforces this.
- **`profiles.jar_balance_cached` is trigger-maintained.** No route updates it directly.
- **No RLS policy relaxation.** Shared files (`middleware.ts`, `lib/supabase/*`, `tailwind.config.ts`) are untouched.

## API surface

### `POST /api/sessions/start`

**Request body (discriminated union):**
```ts
| { kind: 'learn'; lessonId: string /* uuid */ }
| { kind: 'feed'; budgetSeconds: number /* int, > 0 */ }
```

**Auth:** required (via cookie session; anonymous → 401).

**Behavior:**
1. Validate body with zod.
2. For `learn`: verify the lesson exists and its course is visible to the user (`owner_id = user.id OR is_preset = true`). If not, 403.
3. **Auto-close orphans:** `update sessions set ended_at = now() where user_id = user.id and ended_at is null`. Prevents a user accumulating multiple open sessions across tabs/crashes.
4. Insert a new session row:
   - `user_id = user.id`
   - `kind` from body
   - `lesson_id` from body (learn only)
   - `budget_seconds` from body (feed only)
   - `started_at`, `last_heartbeat_at` default to `now()`
   - `earned_or_spent_seconds = 0`
5. Return `{ sessionId: string }`.

**Response codes:** 200 on success; 400 invalid body; 401 unauth; 403 lesson not visible; 500 on unexpected DB error.

### `POST /api/sessions/heartbeat`

**Request body:** unchanged — `{ sessionId: uuid, playing: boolean }`.

**Behavior (delta computation unchanged for both kinds):**
1. Load session via `adminClient`, verify ownership and `ended_at is null`.
2. Compute `gapSec = floor((now - last_heartbeat_at) / 1000)`.
3. `creditable = body.playing && gapSec <= 60`.
4. `delta = creditable ? min(gapSec, 20) : 0`. (`MAX_CREDIT_PER_HEARTBEAT = 20`.)

**Learn branch (unchanged):**
- If `delta > 0`: insert `ledger_entries { delta_seconds: +delta, label: 'lesson', ref_id: session.lesson_id }`; update `sessions { last_heartbeat_at: now, earned_or_spent_seconds: earned_or_spent_seconds + delta }`.
- Else: just update `last_heartbeat_at`.

**Feed branch (new):**
- If `delta > 0`: insert `ledger_entries { delta_seconds: -delta, label: 'feed', ref_id: session.id }`; update `sessions { last_heartbeat_at: now, earned_or_spent_seconds: earned_or_spent_seconds - delta }` (so the field trends negative).
- Else: just update `last_heartbeat_at`.
- **No balance check.** Overdraft is allowed — the jar may go negative.
- **Budget exhaustion:** after the update, compute `spent = -session.earned_or_spent_seconds_after_update`. If `spent > session.budget_seconds`, set `ended_at = now()` inline and include `ended: true, reason: 'budget_exhausted'` in the response. Semantics: the user gets one heartbeat of overdraft (≤20s) past budget, then the session is force-closed.

**Response shape:**
```ts
{
  balance: number,        // profiles.jar_balance_cached (reflects post-insert value via trigger)
  credited: number,       // signed: positive for learn, negative for feed (0 if no delta)
  ended?: true,           // only when session was closed this call
  reason?: 'budget_exhausted'
}
```

**Error cases (unchanged codes):** 400 bad body, 401 unauth, 403 not-owner, 400 `session_closed` if `ended_at` is non-null at fetch time.

### `POST /api/sessions/end`

**Request body:** `{ sessionId: uuid }`.

**Behavior:**
1. Verify ownership.
2. Idempotent: if `ended_at` is already set, return the existing row's `earnedOrSpent` without an update.
3. Otherwise `update sessions set ended_at = now() where id = ? returning earned_or_spent_seconds`.
4. Return `{ ok: true, earnedOrSpent: number }` (positive for learn, negative for feed, 0 if nothing was heartbeated).

**Error codes:** 400 bad body, 401 unauth, 403 not-owner.

## Hooks

Both hooks live in a new `hooks/` directory at repo root. Both are pure client hooks (`'use client'` implied by consumer).

### `hooks/use-youtube-player.ts`

**Purpose:** wrap the YT iframe API's `postMessage` handshake + `infoDelivery` parsing into a single hook. Matches the pattern in `v3/screens.jsx:117-137`.

**Shape:**
```ts
type UseYouTubePlayer = () => {
  playing: boolean;                 // playerState === 1
  ended: boolean;                   // playerState === 0 (lesson completion signal)
  iframeProps: {
    ref: React.RefObject<HTMLIFrameElement>;
    onLoad: () => void;
  };
};
```

**Behavior:**
- On iframe `onLoad`, post `{"event":"listening","id":1}` to `iframe.contentWindow` with `targetOrigin: '*'`.
- On mount, attach a `window` `message` listener; on unmount, remove it.
- Listener parses `event.data` as JSON, filters `d.event === 'infoDelivery' && d.info?.playerState !== undefined`, and updates state.
- Non-JSON messages are ignored silently (no console spam).
- `ended` latches true once observed — does not flip back to false.

**Consumers are expected to pass** `iframeProps` onto a standard `<iframe src="…?enablejsapi=1">`.

### `hooks/use-idle-detection.ts`

**Purpose:** tick an "idle for" counter while the user is not actively watching. Mirrors `v3/screens.jsx:139-154` but as an isolated primitive.

**Shape:**
```ts
type UseIdleDetection = (opts: { active: boolean; timeoutSec?: number }) => {
  idleFor: number;                  // seconds
  isIdle: boolean;                  // idleFor >= timeoutSec
  reset: () => void;
};
```

**Behavior:**
- Default `timeoutSec = 300`.
- While `active === true`, a 1000ms interval increments `idleFor`.
- When `active` transitions `true → false`, `idleFor` resets to 0.
- `reset()` zeroes `idleFor` imperatively (used when the user confirms "still studying" in the idle sheet).
- Interval cleared on unmount.

**Lesson-page usage:** `useIdleDetection({ active: !playing })` — counts idle only while paused, matches the prototype semantics.

## Client integration (reference only — pages are out of scope)

For clarity, a future lesson page will wire this as:

```ts
const { playing, ended, iframeProps } = useYouTubePlayer();
const { isIdle, reset } = useIdleDetection({ active: !playing });
const sessionId = useRef<string | null>(null);

// on mount
useEffect(() => {
  fetch('/api/sessions/start', { method:'POST', body: JSON.stringify({ kind:'learn', lessonId }) })
    .then(r => r.json()).then(d => { sessionId.current = d.sessionId });
  return () => {
    if (sessionId.current) {
      navigator.sendBeacon('/api/sessions/end', JSON.stringify({ sessionId: sessionId.current }));
    }
  };
}, []);

// 15s heartbeat
useEffect(() => {
  const t = setInterval(() => {
    if (!sessionId.current) return;
    fetch('/api/sessions/heartbeat', { method:'POST', body: JSON.stringify({ sessionId: sessionId.current, playing }) });
  }, 15_000);
  return () => clearInterval(t);
}, [playing]);
```

This integration is not delivered in this track — it is shown so reviewers can validate the hook contracts.

## Testing plan

New file: `tests/sessions.spec.ts` (Playwright). Tests run against the local Supabase stack. Requires `pnpm supabase:reset` before the run to seed a clean state.

Three scenarios:

1. **Learn: start → heartbeat ×3 → end.**
   - Start session with an existing lesson id.
   - Fake 15s elapsed between heartbeats by waiting or by directly backdating `last_heartbeat_at` via service-role client. Keep `playing=true`.
   - Expect three `ledger_entries` with positive `delta_seconds`, `label='lesson'`.
   - End session → `earnedOrSpent` matches sum of deltas; `ended_at` non-null.

2. **Feed budget exhaustion.**
   - Start feed session with `budgetSeconds = 30`.
   - Heartbeat loop with `playing=true` until response returns `ended: true, reason: 'budget_exhausted'`.
   - Expect ≥ 2 feed ledger entries (all negative), session `ended_at` non-null after the final heartbeat, and total spent (`-sum(delta_seconds)`) > 30 (overdraft is allowed and expected — the last heartbeat pushes past budget before the server closes the session).

3. **Idle clamp.**
   - Start learn session; backdate `last_heartbeat_at` to 90s ago; heartbeat with `playing=true`.
   - Response `credited === 0`; no new ledger entry; `last_heartbeat_at` updated to now.

**Out of scope for tests:** the two hooks. They are small, deterministic React primitives; a unit test harness is overkill for Track F+G. Will revisit if they grow behavior.

## Open items explicitly deferred

- Nibs "budget almost gone" nudge — needs UX decision, deferred to Track H.
- Lesson/feed page UI — Tracks C and H respectively.
- Multi-tab behavior beyond the orphan-cleanup on `/start` — if a user opens two lesson tabs, the second `/start` closes the first. Accepted as the simplest behavior; revisit if it surprises users in practice.
