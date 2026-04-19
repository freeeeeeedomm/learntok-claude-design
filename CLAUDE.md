# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

This is a **scaffold**, not a finished app. Most pages under `app/` are stubs with TODO markers pointing to screens in a `LearnTok v3.html` prototype (not in this repo — lives in the parent project). `HANDOFF.md` has the phased build plan; consult it before starting new work.

## Commands

Package manager is **pnpm**.

```bash
pnpm dev                  # next dev on :3000
pnpm build                # next build
pnpm lint                 # next lint (eslint-config-next)
pnpm test                 # playwright test (no tests exist yet)
pnpm test path/to.spec.ts # run a single Playwright spec

pnpm supabase:reset       # supabase db reset — applies migrations + seed
pnpm supabase:push        # supabase db push — apply migrations to remote
pnpm gen:types            # regenerate lib/supabase/database.types.ts from local DB
```

No typecheck script; run `npx tsc --noEmit` if needed. `strict: true` is on.

## Architecture

### Jar-balance ledger (the core invariant)

The product meters screen-time in "seconds banked." **Never trust the client for balance.** `ledger_entries` is the single source of truth: `balance = sum(delta_seconds) where user_id = ?`. `profiles.jar_balance_cached` is maintained by the `after_ledger_insert` trigger (see `supabase/migrations/0002_triggers.sql`); the client reads the cache for display, but any *write* that depends on balance must re-derive from the ledger on the server.

Clients call `/api/sessions/heartbeat` every ~15s with `{ sessionId, playing }`. The server computes a trusted `delta`, clamped to `MAX_CREDIT_PER_HEARTBEAT = 20s`, and discards credit if the gap since the last heartbeat is >60s (treated as idle). See `app/api/sessions/heartbeat/route.ts`. The same pattern applies to feed debits when implemented — do not write a "client-reported seconds" path.

### Two Supabase clients, never mix them

- `lib/supabase/client.ts` → browser, user-scoped. RLS applies.
- `lib/supabase/server.ts` → `createClient()` (user session via cookies, RLS applies) and `adminClient()` (service-role, bypasses RLS).
- **`adminClient` must never be imported from a client component.** Use it only for trusted server operations like ledger inserts and session writes. Client-side insert/update/delete on `ledger_entries` is intentionally blocked by RLS (no policy exists).

### Auth flow

`middleware.ts` gates every route: unauthenticated users are redirected to `/login` unless the path is `/`, `/login`, `/auth/*`, `/_next/*`, or `/api/public/*`. Authenticated users on auth routes get bounced to `/home`. Magic-link and Google OAuth both land at `/auth/callback`, which exchanges the code for a session.

On first sign-in, the `on_auth_user_created` trigger creates a `profiles` row AND inserts a 300s `welcome_gift` ledger entry. Don't duplicate this in application code.

### Schema & RLS

Tables: `profiles`, `courses` (user-owned or `is_preset=true`), `lessons`, `lesson_progress`, `ledger_entries`, `sessions`. RLS is on for all six. Key rules:

- `courses`: readable if owned or `is_preset = true`.
- `lessons`: readable if parent course is readable (nested EXISTS check).
- `ledger_entries`: read-only to the user; **no client insert policy** — writes go through service-role API routes.
- `sessions`: read-only to the user; writes via server routes.

If you add a table, add RLS in a new migration. Don't relax existing policies to work around a client-side limitation — route through the server instead.

### Path alias

`@/*` resolves to the project root (see `tsconfig.json`). Use `@/lib/supabase/server` etc., not relative paths.

### Capacitor-readiness

The app is designed to wrap in Capacitor for iOS/Android later. Use **Pointer Events** (`onPointerDown`/`Move`/`Up`) for gesture handles, not touch-only events — Capacitor proxies pointer events cleanly.

### YouTube iframe bridge

Lesson pages detect play/pause via `postMessage` to the YT iframe (`enablejsapi=1`) and parse `infoDelivery` events from `window.addEventListener('message', ...)`. The pattern is sketched in `HANDOFF.md` §1 and already works in the v3 prototype — port rather than redesign.

### Tailwind theme

Dark cozy palette is centralized in `tailwind.config.ts` (`bg`, `bg-2`, `ink`, `accent`, `nibs`, `angel`, etc.). Use these tokens — don't hard-code hex values in components.

## Env vars

All listed in `.env.example`. `SUPABASE_SERVICE_ROLE_KEY` and `YOUTUBE_API_KEY` are **server-only** — never expose via `NEXT_PUBLIC_*`.
