# LearnTok — Claude Code handoff

This document tells Claude Code exactly what to build, in what order, with which gotchas.

## Ground truth

- **UX reference:** open `LearnTok v3.html` in the parent project. That's the shipped prototype. Every screen, gesture, and animation there should be faithfully ported.
- **Characters:** Nibs & Angel SVGs are in `v3/characters.jsx`. Port them to `components/characters/Nibs.tsx` and `Angel.tsx` — keep the SVG exact, just typescript-ify the props.
- **Dark cozy theme:** palette is in `v3/styles.css` (`:root` block). Port to Tailwind config (see `tailwind.config.ts`).

## Build order (ship in this sequence)

### Phase 1 — skeleton (day 1)
1. Next.js 14 App Router + TS + Tailwind + Supabase client libs (already scaffolded here)
2. Supabase migrations applied (see `supabase/migrations/`)
3. Auth: magic link + Google OAuth (see `app/(auth)/`)
4. Middleware: redirect unauthenticated users to `/login`
5. `profiles` row auto-created on first sign-in (trigger in migrations)

### Phase 2 — core loop (days 2-3)
6. `/onboarding` — port scenes 1-9 from `v3/onboarding.jsx`. All animation logic already written — just swap jsx→tsx and replace `localStorage` with Supabase writes to `profiles`.
7. `/home` — course list, jar chip, streak. Server component for initial data, client component for the jar chip (polls/subscribes for live balance).
8. `/course/[id]` — lesson list with completion state
9. `/lesson/[id]` — YT embed + ticking timer + idle detection. **Critical:** credit is written server-side via `/api/sessions/heartbeat`, not trusted from client.
10. `/budget` and `/feed` — countdown, Angel handle, Nibs peek nudge. Debit happens server-side on exit.

### Phase 3 — content (day 4)
11. `/api/youtube/parse?url=...` — extracts video ID, calls YouTube Data API for title/duration/thumbnail
12. `/add` — paste URL flow, creates a user-owned course with 1 lesson (or playlist → N lessons)
13. Seed file populates 3 preset courses (React, CSS, Spanish) visible to all users

### Phase 4 — polish (day 5)
14. `/progress` — ledger + courses tabs
15. Dev panel (gated behind `NEXT_PUBLIC_DEV_PANEL=true` env)
16. Error boundaries, loading states, offline detection

## Critical gotchas

### 1. YT iframe postMessage bridge
The lesson player detects play/pause via the YT iframe API. Code pattern:
```ts
<iframe src={`https://www.youtube.com/embed/${ytId}?enablejsapi=1`} onLoad={() => {
  iframe.contentWindow.postMessage('{"event":"listening","id":1}', '*')
}} />
// Then window.addEventListener('message', ...) parses infoDelivery events
```
Already working in the prototype — just port.

### 2. Server-side credit validation
Never `bank = bank + clientReportedSeconds`. Always:
1. Client sends heartbeat every 15s: `{ lessonId, playing: true/false }`
2. Server computes `delta = min(time_since_last_heartbeat, 20s)` if playing
3. Insert ledger entry with that delta
4. Refuse if gap > 60s (stale) or negative

### 3. Idle detection
If user hasn't heartbeated in 5 min, show the "still studying?" sheet client-side AND server clamps the next heartbeat's credit to 0.

### 4. Jar balance caching
`profiles.jar_balance_cached` is updated by a trigger whenever `ledger_entries` is inserted. Never update directly. Client reads from `profiles` for display, server re-derives from `ledger_entries` sum for any write operation that depends on balance.

### 5. RLS policies
Every table has RLS on. Users can only read/write their own rows EXCEPT:
- `courses where is_preset = true` — readable by all authenticated users
- `lessons` — readable if the parent course is visible to user

See `supabase/migrations/0003_rls.sql` for full policies.

### 6. Gesture handles for native wrapping
Use Pointer Events (`onPointerDown`, `onPointerMove`, `onPointerUp`). Capacitor proxies these correctly. Don't use touch-specific events.

### 7. Tailwind dark cozy palette
Port from `v3/styles.css`:
- `bg`: #13110e
- `bg-2`: #1c1814
- `accent`: #e89a56
- `nibs`: #d85a3e
- `angel`: #f4c874
See `tailwind.config.ts` for the full map.

## Env vars

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only
YOUTUBE_API_KEY=                     # server only
NEXT_PUBLIC_DEV_PANEL=false          # set true in dev
```

## What's already in this repo

- Tailwind config with dark cozy palette
- Supabase migrations (schema + RLS + triggers)
- Seed with 3 preset courses
- TypeScript types generated from schema (run `pnpm gen:types`)
- Auth scaffolding (middleware, login page)
- Nibs & Angel components ported from prototype
- Stub API routes for youtube parse + session heartbeat
- `.env.example`

## What Claude Code needs to finish

- All app pages under `app/(app)/*` — currently stubs
- Complete the heartbeat + ledger server logic
- Wire the YT iframe bridge in the Lesson player
- Feed page with real countdown + debit on exit
- Progress page
- Testing (Playwright for core flows)

Give it the prototype HTML for reference and it should take 3-5 days.
