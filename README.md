# LearnTok — Next.js + Supabase starter

A production-ready scaffold for LearnTok, ported from the v3 clickable prototype.

## Stack
- **Next.js 14** (App Router, TypeScript)
- **Supabase** (Postgres, Auth, RLS)
- **Tailwind CSS** (dark cozy theme)
- **Vercel**-ready
- Designed with **Capacitor** wrapping in mind for iOS/Android later

## Quick start

```bash
pnpm install
cp .env.example .env.local
# fill in keys (see Setup below)
pnpm supabase:reset   # applies migrations + seeds
pnpm dev
```

## Setup

### 1. Supabase project
1. Create a project at supabase.com
2. Copy the project URL and anon key into `.env.local`
3. Copy the service role key (used by server-side API routes only)
4. Run migrations:
   ```bash
   pnpm supabase db push
   pnpm supabase db seed
   ```

### 2. Auth providers
- **Magic link**: enabled by default in Supabase. No extra setup.
- **Google OAuth**:
  1. Supabase dashboard → Authentication → Providers → Google → enable
  2. Create OAuth credentials in Google Cloud Console
  3. Add the Supabase callback URL to authorized redirects
  4. Paste client ID + secret into Supabase

### 3. YouTube Data API
1. Enable YouTube Data API v3 in Google Cloud Console
2. Create an API key (restrict to YouTube Data API)
3. Add to `.env.local` as `YOUTUBE_API_KEY`
4. This key is server-side only — never expose it to the client

### 4. Run
```bash
pnpm dev
# → http://localhost:3000
```

## Project layout

```
app/
  (marketing)/          # public pages (if you add a landing later)
  (app)/                # authenticated app
    layout.tsx          # phone-frame-less layout, mobile-first
    onboarding/         # scenes 1-9 from v3
    home/               # course list + jar
    course/[id]/        # lesson list
    lesson/[id]/        # YT embed + ticking timer
    budget/             # set budget before feed
    feed/               # vertical swipe feed with countdown
    progress/           # ledger + streak
    add/                # paste YT link
  api/
    youtube/            # server-side YouTube Data API proxy
    lessons/complete/   # mark done, credit bank
    feed/spend/         # deduct from bank
components/
  characters/           # Nibs, Angel, handles
  ui/                   # buttons, sheets, chips
  player/               # YT iframe + postMessage bridge
lib/
  supabase/             # server + client + middleware
  timer/                # tick hook, idle detection
  ledger/               # jar accounting logic (single source of truth)
supabase/
  migrations/           # all SQL, ordered
  seed.sql              # preset courses
```

## Schema overview

- `profiles` — user, interests, rate, jar balance, streak
- `courses` — user-owned OR preset (is_preset flag)
- `lessons` — belongs to course, YT video ID, duration
- `lesson_progress` — per-user completion
- `ledger_entries` — every +/- to the jar (single source of truth for balance)
- `sessions` — learning & feed sessions with timestamps

See `supabase/migrations/` for the full DDL.

## Jar balance — source of truth

Never trust the client for jar balance. Every credit/debit is a row in `ledger_entries` with a signed `delta_seconds`. Balance = `sum(delta_seconds) where user_id = ?`. Server re-derives on every request.

Idle detection (5-min paused) happens client-side but credit is only written server-side when the user hits "mark done" or the client flushes every N seconds via `/api/sessions/heartbeat` — server validates the gap is plausible (<2x wall clock) to prevent cheating.

## Gesture compatibility for native

The hold-and-pull-up character handles use Pointer Events, which Capacitor passes through cleanly. No refactor needed when wrapping.

## Next milestones

- [ ] Push notifications (streak reminders, gentle nudges)
- [ ] Offline lesson caching
- [ ] Capacitor wrapper: iOS, Android
- [ ] Admin panel for curating preset courses
- [ ] Face-presence check during lesson (optional anti-cheat)

## Handoff to Claude Code

Feed Claude Code this repo + the `HANDOFF.md` file — it has the prioritized implementation order and known gotchas.
