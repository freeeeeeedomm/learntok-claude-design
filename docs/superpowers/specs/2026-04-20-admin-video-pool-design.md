# Admin Video Pool — Design Spec

**Date:** 2026-04-20
**Branch:** `phase5-admin-pool` (base: `origin/main` after PR #9 merge)
**Execution model:** Single phase, six tasks shipping as one PR.

## Problem

The feed currently reads from a hardcoded `FEED_VIDS` array in `app/feed/FeedPlayer.tsx` — 18 TikTok video IDs copied from `learntok-v2`. This causes three pain points:

1. **Pool is too small.** 18 videos cycle so quickly users get bored within minutes.
2. **No way to refresh content.** Adding new videos requires a code change + deploy.
3. **No quality control.** Some videos may rot (deleted, geo-locked, embed-disabled). There's no inventory view to see what's broken, no way to remove stale entries.

A `learntok-v2` admin page exists for the same purpose but only handled ~18 videos with no automated ingestion or embed verification — same scaling problem.

## Goal

Move the feed pool to Supabase. Build an admin page (gated by role + password backdoor) for inventory management. Build a Playwright-based scraper script that pulls fresh video IDs from `tiktok.com/explore`, verifies each one is embeddable, and upserts into the pool. Initial seed: 12 categories × 30 videos ≈ 360 entries.

## Non-Goals (out of scope)

- Per-user feed preference / category filter (will be addressed in a follow-up phase as a recommendation system)
- Per-user video pool (everyone shares one curated pool for now)
- Admin UI for adding/editing **categories** (low frequency — direct SQL via Supabase dashboard suffices)
- Admin UI for triggering the scraper (it runs locally via `npm run scrape:tiktok`)
- YouTube source in the pool (TikTok-only for v1; the `source` column allows future YouTube without schema change)
- Onboarding flow for letting users pick their preferred categories (deferred to recommendation phase)

## Architecture

```
┌─────────────────────────┐       ┌──────────────────────┐
│ scripts/                │       │ supabase             │
│ scrape-tiktok.ts        │──────▶│ video_pool table     │
│ (Playwright headful,    │       │ categories table     │
│  persistent profile)    │       │ profiles.is_admin    │
└─────────────────────────┘       └──────────────────────┘
                                       ▲           ▲
                                       │ read-only │ service_role
                                       │ via RLS   │
                          ┌────────────┘           │
                          │                        │
              ┌───────────┴────┐         ┌─────────┴────────┐
              │ app/feed       │         │ app/admin        │
              │ FeedPlayer     │         │ + /api/admin/*   │
              │ (consumer)     │         │ (CRUD)           │
              └────────────────┘         └──────────────────┘
                                              ▲
                                              │ requireAdmin()
                                              │
                                   ┌──────────┴──────────┐
                                   │ profile.is_admin    │
                                   │ OR admin_unlock     │
                                   │    cookie (400d)    │
                                   └─────────────────────┘
```

Three loosely-coupled units:

1. **Scraper** — A Node script. Talks to TikTok via Playwright, talks to Supabase via service role. Runs locally on demand.
2. **Admin module** — `/admin/unlock`, `/admin`, `/api/admin/*`. Gated by `requireAdmin()`. CRUD on `video_pool`.
3. **Feed consumer** — `/feed` server component reads the pool and passes a shuffled list to the existing `FeedPlayer` client component.

The three units share only the `video_pool` and `categories` tables as their interface. Each can be developed and tested independently.

## Data Model

New migration: `supabase/migrations/0006_video_pool_and_admin.sql` (covers both new tables, the FK constraint, the `profiles.is_admin` column, and the seeded admin row).

### `categories` table (extensible lookup)

```sql
create table public.categories (
  slug text primary key,                       -- '喜剧'
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy "categories_read" on public.categories
  for select to authenticated using (true);

-- Initial 12-category seed
insert into public.categories (slug, display_order) values
  ('唱歌跳舞',  0),
  ('喜剧',      1),
  ('动画与漫画', 2),
  ('表演',      3),
  ('对口型',    4),
  ('美容护理',  5),
  ('穿搭',      6),
  ('美食',      7),
  ('动物',      8),
  ('家庭',      9),
  ('健身和健康', 10),
  ('运动',      11);
```

The slug is the Chinese category name as it appears in TikTok's chip UI — the scraper relies on exact-match clicks. To add a new category later: `insert into categories (slug, display_order) values ('日常生活', 12);` via Supabase dashboard. To rename a category, `update categories set slug='新名'` triggers FK cascade and updates all `video_pool` rows automatically.

### `video_pool` table (the pool)

```sql
create table public.video_pool (
  id uuid primary key default gen_random_uuid(),
  video_id text not null unique,               -- TikTok numeric ID
  source text not null default 'tiktok'
    check (source in ('tiktok','youtube')),
  category text not null,
  title text,                                  -- from oembed
  author text,                                 -- from oembed
  thumbnail_url text,                          -- from oembed
  is_active boolean not null default true,     -- soft delete
  scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint video_pool_category_fk
    foreign key (category)
    references public.categories(slug)
    on delete restrict        -- protect: can't drop a category with videos
    on update cascade          -- rename a slug → all video rows update
);

create index on public.video_pool (category) where is_active = true;
create index on public.video_pool (created_at desc);

alter table public.video_pool enable row level security;

create policy "video_pool_read_active" on public.video_pool
  for select to authenticated using (is_active = true);

-- No insert/update/delete policy — service_role bypasses RLS for writes.
```

**Soft delete (`is_active`)** rationale: when the scraper re-runs and `upsert`s a previously-deleted video_id, we want the row to stay deleted. Hard delete + re-insert would silently restore it. Soft delete preserves the admin's curation decisions across scrapes.

### `profiles.is_admin` column

```sql
alter table public.profiles
  add column is_admin boolean not null default false;

update public.profiles set is_admin = true
  where email = 'luyin.hu@epfl.ch';
```

Single bool flag. Future multi-admin = update more rows. No separate roles table needed for this scope.

## Scraper Script

**File:** `scripts/scrape-tiktok.ts`
**Invoke:** `npm run scrape:tiktok` (add to `package.json` scripts)
**Runtime:** Local PC only. Vercel serverless cannot run Playwright (chromium binary, cold start, 60s timeout).

### Browser strategy: persistent profile, headful

```ts
const ctx = await chromium.launchPersistentContext(
  './data/playwright-profile/',
  { headless: false, viewport: { width: 1280, height: 900 } }
);
```

- **First run:** Browser window opens. If TikTok presents a login modal, the user logs in once manually. Cookies write into `./data/playwright-profile/`.
- **Subsequent runs:** Same profile dir → cookies reused → no re-login. Exact same effect as "use my Chrome's logged-in session" but isolated from the user's real Chrome (no profile lock conflicts, no risk of corrupting their actual browsing data).
- The profile directory and `data/tiktok-pool.json` audit file are added to `.gitignore`.
- Chromium binary installed via `npx playwright install chromium` once.

### Scrape loop

```ts
const { data: cats } = await sb.from('categories')
  .select('slug').eq('is_active', true).order('display_order');

for (const { slug } of cats) {
  await page.goto('https://www.tiktok.com/explore');
  await hideInterestModal(page);          // see DOM probe in section below
  await clickCategoryChip(page, slug);    // text-equality match
  await page.waitForTimeout(1500);

  // Scroll until 30+ unique IDs collected, max 20 scrolls
  const candidates = await collectIds(page, { target: 30, maxScrolls: 20 });

  // Embed verification (oembed)
  const verified = [];
  for (const c of candidates) {
    if (verified.length >= 30) break;
    const ok = await verifyEmbed(c.author, c.id);
    if (ok) verified.push({ ...c, ...ok });   // ok = { title, thumbnail_url, author_name }
  }

  await sb.from('video_pool').upsert(
    verified.map((v) => ({
      video_id: v.id,
      source: 'tiktok',
      category: slug,
      title: v.title,
      author: v.author_name,
      thumbnail_url: v.thumbnail_url,
      scraped_at: new Date().toISOString(),
    })),
    { onConflict: 'video_id', ignoreDuplicates: true }
  );

  console.log(`[${slug}] ${candidates.length} candidates → ${verified.length} verified → upserted`);
}
```

`ignoreDuplicates: true` so re-running the scraper won't undo soft deletes (the `is_active=false` row stays).

### DOM helpers (verified during recon)

- **Hide interest modal:** walk text node "你希望在 TikTok" up the DOM, find `[role="dialog"]` ancestor, set `display:none`.
- **Click category chip:** `Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === slug).click()`.
- **Collect IDs:** `document.querySelectorAll('a[href*="/video/"]')` → regex `/@([^/]+)\/video\/(\d+)/` on each href.

### Embed verification

```ts
async function verifyEmbed(author: string, videoId: string) {
  const url = `https://www.tiktok.com/@${author}/video/${videoId}`;
  const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
  if (!res.ok) return null;                 // disable_embed / deleted / geo-locked → 4xx
  const json = await res.json();            // { title, thumbnail_url, author_name, ... }
  return {
    title: json.title ?? null,
    thumbnail_url: json.thumbnail_url ?? null,
    author_name: json.author_name ?? author,
  };
}
```

oembed is TikTok's official endpoint (no API key), returns 200 with metadata when the video is publicly embeddable, 4xx otherwise. This is the cheapest reliable embed-feasibility check.

### Audit trail

In addition to upserting Supabase, write `data/tiktok-pool.json` containing the full scrape output (categories → list of `{id, author, title, thumbnail_url}`). Useful for debugging if an upsert fails or for re-importing without re-scraping.

## Admin Auth

### Components

- **`lib/admin-auth.ts`** — `requireAdmin()` server helper.
- **`app/admin/unlock/page.tsx`** — password prompt page.
- **`app/api/admin/unlock/route.ts`** — POST: verify password, set cookie, redirect.
- **Env var:** `ADMIN_PASSWORD=<value>` in `.env.local` (server-only, no `NEXT_PUBLIC_` prefix).

### `requireAdmin()` logic

Two exports — one for pages (redirects on failure), one for API routes (returns null on failure so the caller can return a 401):

```ts
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

const COOKIE_NAME = 'admin_unlock';
const COOKIE_VALUE_INPUT = 'admin-unlock-v1';   // versioned constant string

function expectedToken() {
  const pwd = process.env.ADMIN_PASSWORD;
  if (!pwd) throw new Error('ADMIN_PASSWORD env var not set');
  return crypto.createHmac('sha256', pwd).update(COOKIE_VALUE_INPUT).digest('hex');
}

async function checkAdmin(): Promise<{ mode: 'role' | 'cookie' } | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single();
    if (data?.is_admin) return { mode: 'role' };
  }
  const token = cookies().get(COOKIE_NAME)?.value;
  if (token) {
    const expected = expectedToken();
    if (token.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return { mode: 'cookie' };
    }
  }
  return null;
}

// For server components / page.tsx — redirects on failure.
export async function requireAdmin(): Promise<{ mode: 'role' | 'cookie' }> {
  const result = await checkAdmin();
  if (!result) redirect('/admin/unlock');
  return result;
}

// For route handlers — caller returns 401 on null. Doesn't redirect (fetch() callers
// can't follow auth redirects sensibly).
export async function checkAdminForApi(): Promise<{ mode: 'role' | 'cookie' } | null> {
  return checkAdmin();
}
```

The cookie value is an HMAC of a fixed string keyed by `ADMIN_PASSWORD`. If the password env var changes, all existing cookies become invalid (expected token differs). The `timingSafeEqual` length check guards against the buffer-length-mismatch error.

### Cookie

```ts
cookies().set(COOKIE_NAME, expectedToken(), {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 400,    // 400 days — browser-imposed cap (Chrome/Firefox)
  path: '/',
});
```

400 days = the absolute browser maximum. After that, user re-`/admin/unlock`s once.

### Middleware allowlist

The existing `middleware.ts` redirects unauthenticated requests to `/login` for any non-allowlisted path. The admin password backdoor must be reachable when the visitor has no Supabase session at all (e.g. fresh phone, anonymous browser). Add to the allowlist:

- `/admin/unlock` (the password page)
- `/api/admin/unlock` (the POST endpoint)

`/admin` itself stays gated — `requireAdmin()` handles its access check at the page level (redirects to `/admin/unlock`, which the middleware now lets through).

### Bottom-nav exposure

The admin page is **not** added to the bottom nav (which stays at home / relax / progress for all users). Admin is a power-user surface — bookmark `/admin` on phone or PC.

## Admin UI

**Route:** `/admin` (server component, calls `requireAdmin()` first, then queries pool).
**Layout:** Single page with category tabs and a thumbnail grid.

```
┌────────────────────────────────────────────┐
│ 🛡️ admin · video pool                       │
├────────────────────────────────────────────┤
│ [全部 360] [喜剧 30] [动物 30] [美食 30] … │  ← category tabs (counts from join)
├────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│ │ 📷   │ │ 📷   │ │ 📷   │ │ 📷   │        │  ← thumbnail (thumbnail_url from oembed)
│ │title │ │title │ │title │ │title │        │
│ │@auth │ │@auth │ │@auth │ │@auth │        │
│ │[👁][🗑]│[👁][🗑]│[👁][🗑]│[👁][🗑]        │  ← preview + soft delete
│ └──────┘ └──────┘ └──────┘ └──────┘        │
│  Grid: 2-col mobile, 4-col desktop          │
├────────────────────────────────────────────┤
│  💡 池子腻了？本地跑 `npm run scrape:tiktok`│
└────────────────────────────────────────────┘
```

### Components

- **`/admin/page.tsx`** — server component, fetches `categories` + `video_pool` (active counts and rows).
- **`/admin/AdminPoolView.tsx`** — client component, owns tab state and handles delete/preview interactions.
- **`/admin/VideoCard.tsx`** — single card with thumbnail, title, author, preview button, delete button.

### Interactions

- **Category tab click** — filters grid client-side (all rows already loaded, no second fetch).
- **👁 preview** — replaces the thumbnail with an inline `<VideoEmbed>` (Phase 4 component) that autoplays on tap. Tapping again collapses back to thumbnail. Only one card can be expanded at a time.
- **🗑 delete** — `PATCH /api/admin/video-pool/[id]` with body `{ is_active: false }`. Optimistic UI: row fades and removes from local state immediately; if the API errors, revert with a toast.

### API routes

- `POST /api/admin/unlock` — body `{ password: string }`. Verify against `ADMIN_PASSWORD`. On match: set the `admin_unlock` cookie, return 200. On mismatch: return 401. (No `requireAdmin()` here — this IS the way to become admin.)
- `PATCH /api/admin/video-pool/[id]` — body `{ is_active: boolean }`. Soft delete (or undelete). Calls `checkAdminForApi()` first; null result → return 401.

## Feed Integration

### `app/feed/page.tsx` (server component)

```tsx
const supabase = createClient();
const { data: vids } = await supabase
  .from('video_pool')
  .select('video_id, source, title, category')
  .eq('is_active', true);

// Server-side shuffle so each session gets a different order.
const shuffled = [...(vids ?? [])].sort(() => Math.random() - 0.5);

return <FeedPlayer sessionId={...} budgetSeconds={...} vids={shuffled} />;
```

If the pool is empty (e.g. fresh deploy without scrape), pass an empty array — `FeedPlayer` shows an empty state with "no videos yet, ask admin to scrape".

### `app/feed/FeedPlayer.tsx` changes

- Remove the hardcoded `FEED_VIDS` constant.
- Add `vids` prop typed `Array<{ video_id: string; source: 'tiktok' | 'youtube'; title: string | null; category: string | null }>`.
- Replace `FEED_VIDS[vidIdx % FEED_VIDS.length]` with `vids[vidIdx % vids.length]`.
- Empty-state UI: if `vids.length === 0`, render a centered card "No videos in pool — admin needs to scrape" with the angel-exit button still visible.

## Testing

Four new Playwright specs:

| File | Coverage |
|---|---|
| `tests/admin-unlock.spec.ts` | Wrong password rejected (cookie not set, redirected back to /unlock); right password sets `admin_unlock` cookie and redirects to `/admin`. |
| `tests/admin-pool.spec.ts` | Logged-in admin sees the grid; category tab filters thumbnails; clicking 🗑 makes the card disappear and the row stays deleted after page reload (verifies DB write). |
| `tests/admin-guard.spec.ts` | Anonymous user → /admin redirects to /admin/unlock; logged-in non-admin user → same redirect; admin user → `/admin` loads. |
| `tests/feed-from-db.spec.ts` | Seed two test videos via service role into `video_pool`; navigate `/feed`; assert iframe src contains one of the seeded `video_id`s. |

Modify `tests/feed-swipe-smoke.spec.ts`: it currently relies on hardcoded videos. Switch to seeding 2+ test videos in a `beforeAll`, so swipe behavior is exercised against real DB-backed content.

**Not tested (manual only):** the scraper script. It's a local dev tool with TikTok as a moving target — automated tests would be brittle and the iteration cost is low (just re-run `npm run scrape:tiktok` and watch console output).

## Future Extensions (out of scope but informed by this design)

- **Per-user category preferences** — Add `profiles.preferred_categories text[]`. Modify the feed query: `where category = any(preferred_categories)`. Onboarding adds a "pick 3 categories" step. The schema is ready (`category` is already on `video_pool`).
- **Category management UI in admin** — A "Categories" tab to add/disable categories with display-order drag. Frequency is too low to justify now.
- **Scraper trigger from admin UI** — Currently it runs locally. Could be wrapped as an Edge Function or queued worker, but Playwright on Supabase Edge / Vercel is non-trivial. Defer until clear need.
- **Multi-source pool** — `source` column is already a CHECK enum supporting `youtube`. To add YouTube to the pool, add YouTube ID extraction to `/add` page or extend the scraper. The `VideoEmbed` component already handles both.
- **Pool stats / decay** — Track per-video play count, surface in admin; deprioritize videos shown N times.

## Decisions Log (key trade-offs from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Initial pool source | Scrape `tiktok.com/explore` via Playwright | Manual collection of 360 URLs is impractical; v2-style hand-curated 18 was the original problem |
| Browser mode | Headful with persistent profile (`./data/playwright-profile/`) | First-run login persists; isolated from user's real Chrome to avoid lock conflicts |
| Embed verification | TikTok oembed API (`/oembed?url=...`) | Free, official, fast, returns metadata as bonus. Avoids false positives from `disable_embed`. |
| Pool scope | Shared global pool | Matches "admin curates feed" intent; matches existing `FEED_VIDS` shape; simpler. Per-user filter deferred to recommendation phase. |
| Delete semantics | Soft delete (`is_active`) | Re-scraping with `upsert` won't undo curation decisions |
| Categories | Lookup table (`categories`) with FK | User wants extensibility; lookup table makes scraper + UI auto-discover new entries; ON UPDATE CASCADE handles renames cleanly |
| Initial 12 categories | TikTok's break-appropriate 12 (skip 情感关系/社会/戏剧 + others) | Matches "学习间隙休息"调性 — light content only |
| Admin role | `profiles.is_admin boolean` | Simple, future multi-admin via row update |
| Admin auth | Role + 400-day password cookie (OR-gate) | PC: real account; phone: bookmark `/admin` + remember password once |
| Cookie expiry | 400 days | Browser-imposed maximum; "basically permanent" |
| Admin UI in bottom nav | No | Power-user surface; keeps nav clean for all users |
| Scraper trigger | Local-only (`npm run scrape:tiktok`) | Vercel/Edge can't run Playwright; refresh frequency is low (months) |
