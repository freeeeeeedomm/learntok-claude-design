# Overnight build — 2026-04-19

Goal: "I want to wake up to a working app with all functions running."

This doc captures what I built, what I cut, and how to use it.

## How to run

```
npm run dev
```

Then in the browser, open `http://localhost:3000` and auth via:

1. Click **get started**
2. On the `/login` page, open DevTools (F12) → Console → run:

   ```js
   await fetch('/api/dev/login', { method: 'POST' })
   ```

   This provisions / refreshes the dev user (`onboarded: true`,
   `display_name: 'sam'`, 300s welcome-gift in the jar) and sets the auth
   cookie on the response.

3. Refresh the page — you'll land on `/home` directly (no onboarding detour).

## What's live now

### Pages
- `/` — splash with "get started"
- `/login` — magic-link + dev-login
- `/home` — real data: weekday + streak, jar chip, continue card (→ `/lesson/[next]`), "take a break" CTA (→ `/budget`), course list, "paste YouTube link" row, NibsHandle
- `/course/[id]` — lesson list with done/current/future indicators, progress bar
- `/lesson/[id]` — YouTube player, server-trusted heartbeat, 5-min idle sheet, mark-done flow (shipped in PR #2)
- `/budget` — preset chips (2m / 5m / 10m / all) + slider, fires `POST /api/sessions/start { kind: 'feed', ... }` then navigates to `/feed`
- `/feed` — TikTok-style shell: YT iframe (rotates through 5 hardcoded videos), 1s local countdown + 15s server heartbeat (debits the ledger), "done now" exits early, budget-exhausted auto-ends with a "time's up" overlay before navigating home
- `/progress` — ledger + courses tabs; balance/streak/rate summary card with today's earned/spent aggregation
- `/add` — paste a YouTube URL, preview via oembed, save-to-library inserts a course + single lesson

### APIs
- `/api/sessions/{start,heartbeat,end}` — shipped in PR #1/#2, all server-trusted ledger writes
- `/api/lessons/complete` — shipped in PR #2
- `/api/youtube/parse` — **enhanced tonight**: uses YouTube Data API if `YOUTUBE_API_KEY` env is set, otherwise falls back to the no-key `oembed` endpoint. Returns `source: 'data-api' | 'oembed'` so the UI can tell the user when duration is unknown.
- `/api/dev/login` — **patched tonight**: now provisions a post-onboarded dev user

### Theme
PR #3's Linear-style light theme (indigo `#5e6ad2` accent, near-white bg, emerald `good`) is live. Nibs (red-orange) and Angel (yellow) stay warm per your earlier guidance.

## Tests

`npx playwright test` runs the full suite. **31 passing**:

- `tests/sessions.spec.ts` — 14 (session API, pre-existing)
- `tests/lessons-complete.spec.ts` — 5 (complete API, pre-existing)
- `tests/lesson-page.spec.ts` — 1 (page smoke, pre-existing)
- `tests/home-course-smoke.spec.ts` — **4 new** (home + course + e2e learn loop)
- `tests/budget-feed-smoke.spec.ts` — **3 new** (budget → feed happy path + session cleanup + redirect)
- `tests/add-progress-smoke.spec.ts` — **4 new** (/api/youtube/parse oembed + 400, /add save flow, /progress tabs)

## What I cut / deferred

- **`app/onboarding/*` untouched.** That directory is reserved for the parallel onboarding-redesign worktree. Dev login sets `onboarded: true` so you bypass it entirely; real magic-link users still go through whatever's there.
- **NibsHandle's `onSummon` is a silent no-op.** The handle renders (both `/home` and `/course/[id]`), but there's no `/nibs-ask` route yet — so tapping it currently does nothing. When you build the Nibs chat screen, wire the handler via the prop.
- **AngelHandle not ported.** The feed page's in-session Angel "head back?" sheet (v3 feature) isn't here; instead, there's a plain "done now" button pinned to the bottom.
- **Video duration unknown for user-added content.** oembed doesn't return duration, so `/add` saves lessons with `duration_seconds = 0`. The `/course/[id]` lesson row shows "—" instead of "X min" for these. Set `YOUTUBE_API_KEY` in `.env.local` to enable real duration parsing — the parser already branches on this.
- **Playlists not supported.** The /add flow handles single videos only. Playlist enumeration needs the Data API.
- **"Time up" auto-end in feed isn't Playwright-tested.** The heartbeat runs every 15s so a budget-exhaustion test would take 2+ minutes minimum. The server-side one-shot-overdraft path *is* covered by `tests/sessions.spec.ts:282` "heartbeat feed: one overdraft allowed, then force-close".
- **Idle sheet (`/lesson/[id]`) isn't Playwright-tested either** — 5-minute threshold would need fake timers; deferred.

## Notable bugs I hit and fixed

1. **Feed "done now" was a silent no-op in dev.** React strict-mode double-fired an unmount-cleanup effect that set `endedRef.current = true` before any user click, gating the real click handler. Fixed by removing the unmount-time `sendBeacon` call — `pagehide` + server orphan-close are sufficient. Commit `a539390`. The lesson page's same-shaped cleanup is safe because its `sessionId` is null during strict-mode's double-fire.

## Branch + PRs

- **main** now has: Track F+G (sessions foundation), PR #2 (lesson page), PR #3 (theme light).
- **`overnight-phase2`** has everything else (home, course, budget, feed, progress, add, dev-login patch, NibsHandle, shared CSS). This is a single branch; once it lands on main you have the full app.

A PR (#4?) will be open when you wake up. If my auto-merge runs, it'll be on main already.

## Known caveats after merge

- When you first visit `/home`, you'll see the dev display name `sam` because that's what `/api/dev/login` sets. A real magic-link sign-in won't auto-set display name — you'll need the onboarding flow (not mine) to populate it, or a future profile-settings page.
- The feed uses five hardcoded public YouTube IDs for demo content. Five is enough to "scroll through"; a real feed would populate from another source.
- No service-worker / offline detection / error boundaries yet (HANDOFF phase 4).

---

Any regression → `git log --oneline origin/main..overnight-phase2` lists every commit I made tonight, each with a scoped message. Pick and revert.
