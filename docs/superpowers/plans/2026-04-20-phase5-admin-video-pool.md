# Phase 5: Admin Video Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `FEED_VIDS` array in `app/feed/FeedPlayer.tsx` with a Supabase-backed pool of curated TikTok videos, fed by a Playwright scraper script and managed via an admin page (gated by role + password backdoor).

**Architecture:** Three loosely-coupled units sharing two new tables (`video_pool`, `categories`). The scraper (`scripts/scrape-tiktok.ts`) ingests from `tiktok.com/explore` and verifies via the TikTok oembed API, upserting via service-role. The admin module (`/admin/unlock`, `/admin`, `/api/admin/*`) handles inventory management gated by either `profiles.is_admin` or a 400-day HMAC cookie. The feed (`/feed/page.tsx` server component) reads the pool via authenticated RLS and passes a shuffled list to the existing `FeedPlayer` client component.

**Tech Stack:** Next.js 14 App Router · Supabase (Postgres + Auth + RLS) · Playwright (scraper + tests) · Node `crypto` (HMAC for the admin cookie) · TikTok oembed API · `tsx` (TypeScript runner for the scraper).

**Spec:** `docs/superpowers/specs/2026-04-20-admin-video-pool-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `supabase/migrations/0006_video_pool_and_admin.sql` | Schema: `categories`, `video_pool`, `profiles.is_admin` + seeds |
| `lib/admin-auth.ts` | `requireAdmin()` (page) + `checkAdminForApi()` (route) helpers |
| `app/admin/unlock/page.tsx` | Server component: render unlock form |
| `app/admin/unlock/UnlockForm.tsx` | Client component: password input + submit |
| `app/api/admin/unlock/route.ts` | POST: verify password, set HMAC cookie, return 200/401 |
| `app/admin/page.tsx` | Server component: gate via `requireAdmin()`, fetch pool |
| `app/admin/AdminPoolView.tsx` | Client component: tab state, list rendering, delete handler |
| `app/admin/VideoCard.tsx` | Single card: thumbnail / preview / delete buttons |
| `app/api/admin/video-pool/[id]/route.ts` | PATCH: soft delete (or undelete) |
| `scripts/scrape-tiktok.ts` | Playwright scraper |
| `tests/admin-unlock.spec.ts` | Wrong/right password flow |
| `tests/admin-guard.spec.ts` | Anonymous + logged-in non-admin both redirected |
| `tests/admin-pool.spec.ts` | Grid render, tab filter, delete + reload still gone |
| `tests/feed-from-db.spec.ts` | Feed reads seeded videos from DB |

### Modified files

| Path | Change |
|---|---|
| `middleware.ts` | Allowlist `/admin/unlock` and `/api/admin/unlock` for anonymous |
| `app/feed/page.tsx` | Fetch from `video_pool`, pass `vids` prop |
| `app/feed/FeedPlayer.tsx` | Accept `vids` prop, drop hardcoded `FEED_VIDS`, empty state |
| `tests/feed-swipe-smoke.spec.ts` | Seed test videos in `beforeAll` |
| `tests/budget-feed-smoke.spec.ts` | Seed test videos in `beforeAll` |
| `tests/nav-smoke.spec.ts` | Seed test videos for the `/feed`-touching test |
| `package.json` | Add `scrape:tiktok` script + `tsx` devDep |
| `.gitignore` | Exclude `data/playwright-profile/` and `data/tiktok-pool.json` |
| `.env.example` | Document `ADMIN_PASSWORD` |
| `lib/supabase/database.types.ts` | Regenerate after migration |

---

## Task 1: Migration + types regeneration

Lays down `categories`, `video_pool`, `profiles.is_admin`, RLS, FK, and seed data. Regenerates the TypeScript types so subsequent tasks have type-safe table access.

**Files:**
- Create: `supabase/migrations/0006_video_pool_and_admin.sql`
- Modify: `lib/supabase/database.types.ts` (regenerated)

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0006_video_pool_and_admin.sql`:

```sql
-- 0006_video_pool_and_admin.sql
-- Phase 5: admin-curated TikTok pool + admin role

-- ────────────────────────────────────────────────────────────
-- categories: extensible lookup of TikTok-explore category names
-- ────────────────────────────────────────────────────────────
create table public.categories (
  slug text primary key,                       -- '喜剧' (TikTok chip text)
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy "categories_read" on public.categories
  for select to authenticated using (true);

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

-- ────────────────────────────────────────────────────────────
-- video_pool: admin-curated videos for the feed
-- ────────────────────────────────────────────────────────────
create table public.video_pool (
  id uuid primary key default gen_random_uuid(),
  video_id text not null unique,
  source text not null default 'tiktok'
    check (source in ('tiktok','youtube')),
  category text not null,
  title text,
  author text,
  thumbnail_url text,
  is_active boolean not null default true,
  scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint video_pool_category_fk
    foreign key (category)
    references public.categories(slug)
    on delete restrict
    on update cascade
);

create index on public.video_pool (category) where is_active = true;
create index on public.video_pool (created_at desc);

alter table public.video_pool enable row level security;

create policy "video_pool_read_active" on public.video_pool
  for select to authenticated using (is_active = true);

-- (No insert/update/delete policy: writes only via service_role.)

-- ────────────────────────────────────────────────────────────
-- profiles.is_admin: boolean role flag
-- ────────────────────────────────────────────────────────────
alter table public.profiles
  add column is_admin boolean not null default false;

update public.profiles set is_admin = true
  where email = 'luyin.hu@epfl.ch';
```

- [ ] **Step 2: Apply the migration to the linked Supabase project**

```bash
npx supabase db push
```

Expected output: the new migration file is listed and "Applied successfully" or similar. No error about FK or duplicate constraint.

- [ ] **Step 3: Regenerate TypeScript types from the live schema**

The current `gen:types` script uses `--local` which needs Docker. With Cloud the right invocation is `--linked`:

```bash
npx supabase gen types typescript --linked > lib/supabase/database.types.ts
```

Expected: file rewritten. `git diff lib/supabase/database.types.ts` shows new types for `categories`, `video_pool`, and an `is_admin` field on the `profiles` Row type.

- [ ] **Step 4: Verify the types compile**

```bash
npx tsc --noEmit
```

Expected: zero errors. (If errors come from unrelated stale code, fix before continuing.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_video_pool_and_admin.sql lib/supabase/database.types.ts
git commit -m "feat(db): add video_pool, categories, and profiles.is_admin (migration 0006)

Lookup table 'categories' is FK target for 'video_pool.category' (with
ON UPDATE CASCADE so renaming a slug rewrites all videos). Soft-delete
via is_active on video_pool so re-scraping won't undo curation. RLS
allows authenticated reads of active rows; writes go through service
role. Seeds 12 break-appropriate categories and marks the admin user.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Admin auth + unlock flow + middleware allowlist

Builds the password backdoor end-to-end: HMAC helper, unlock page, POST endpoint, middleware allowlist, and 2 Playwright specs verifying the gate. Without this, no later admin task is reachable in tests.

**Files:**
- Create: `lib/admin-auth.ts`
- Create: `app/admin/unlock/page.tsx`
- Create: `app/admin/unlock/UnlockForm.tsx`
- Create: `app/api/admin/unlock/route.ts`
- Create: `tests/admin-unlock.spec.ts`
- Create: `tests/admin-guard.spec.ts`
- Modify: `middleware.ts` (lines 24-28: extend `isPublic` allowlist)
- Modify: `.env.example`

- [ ] **Step 1: Add `ADMIN_PASSWORD` to `.env.example`**

Edit `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
YOUTUBE_API_KEY=your-youtube-data-api-key
NEXT_PUBLIC_DEV_PANEL=false
ADMIN_PASSWORD=set-this-to-a-strong-secret
```

- [ ] **Step 2: Set `ADMIN_PASSWORD` in your local `.env.local`**

Manually edit `.env.local` and add:

```bash
ADMIN_PASSWORD=<pick a value>
```

(The plan can't write secrets for you. Tests below read this same env var.)

- [ ] **Step 3: Write `lib/admin-auth.ts`**

```ts
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

const COOKIE_NAME = 'admin_unlock';
const COOKIE_VALUE_INPUT = 'admin-unlock-v1';

export const ADMIN_COOKIE_NAME = COOKIE_NAME;

export function expectedAdminToken(): string {
  const pwd = process.env.ADMIN_PASSWORD;
  if (!pwd) throw new Error('ADMIN_PASSWORD env var not set');
  return crypto.createHmac('sha256', pwd).update(COOKIE_VALUE_INPUT).digest('hex');
}

async function checkAdmin(): Promise<{ mode: 'role' | 'cookie' } | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();
    if (data?.is_admin) return { mode: 'role' };
  }
  const token = cookies().get(COOKIE_NAME)?.value;
  if (token) {
    const expected = expectedAdminToken();
    if (
      token.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    ) {
      return { mode: 'cookie' };
    }
  }
  return null;
}

/** For server components / page.tsx — redirects to /admin/unlock on failure. */
export async function requireAdmin(): Promise<{ mode: 'role' | 'cookie' }> {
  const result = await checkAdmin();
  if (!result) redirect('/admin/unlock');
  return result;
}

/** For route handlers — caller returns 401 on null. */
export async function checkAdminForApi(): Promise<{ mode: 'role' | 'cookie' } | null> {
  return checkAdmin();
}
```

- [ ] **Step 4: Write `app/api/admin/unlock/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, expectedAdminToken } from '@/lib/admin-auth';
import { z } from 'zod';

const Body = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  let parsed: { password: string };
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: 'admin_not_configured' }, { status: 500 });
  }
  if (parsed.password !== expected) {
    return NextResponse.json({ error: 'wrong_password' }, { status: 401 });
  }

  cookies().set(ADMIN_COOKIE_NAME, expectedAdminToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 400, // 400 days — browser-imposed cap
    path: '/',
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Write `app/admin/unlock/UnlockForm.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function UnlockForm() {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? 'wrong password' : 'something went wrong');
        setSubmitting(false);
        return;
      }
      router.push('/admin');
      router.refresh();
    } catch {
      setError('network error');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="col gap-12" data-testid="admin-unlock-form">
      <input
        type="password"
        autoFocus
        placeholder="admin password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full bg-bg-2 border border-line rounded-xl px-4 py-3 text-ink"
        data-testid="admin-unlock-input"
        disabled={submitting}
      />
      <button
        type="submit"
        className="btn btn-primary"
        disabled={submitting || !password}
        data-testid="admin-unlock-submit"
      >
        {submitting ? 'checking…' : 'unlock'}
      </button>
      {error && (
        <div
          className="body"
          style={{ color: 'var(--bad)' }}
          data-testid="admin-unlock-error"
        >
          {error}
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 6: Write `app/admin/unlock/page.tsx`**

```tsx
import { UnlockForm } from './UnlockForm';

export const dynamic = 'force-dynamic';

export default function AdminUnlockPage() {
  return (
    <main className="app">
      <div className="pad pad-top col gap-16" style={{ paddingTop: 80, maxWidth: 360 }}>
        <div className="eyebrow">admin</div>
        <div className="display" style={{ fontSize: 28 }}>
          unlock
        </div>
        <div className="body" style={{ color: 'var(--ink-mute)', fontSize: 13 }}>
          enter the admin password to manage the video pool.
        </div>
        <UnlockForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Update `middleware.ts` to allowlist the admin module**

Replace the `isPublic` block (currently lines 24-28). The whole `/admin/*` and `/api/admin/*` tree must be exempt from the base auth gate so the cookie backdoor works without a Supabase session — the admin module's own helpers (`requireAdmin` / `checkAdminForApi`) gate everything downstream. Add the comment so future contributors don't accidentally ship a silently-public admin route:

```ts
  // /admin/* and /api/admin/* are exempt from the base auth gate so the cookie
  // backdoor can work without a Supabase session. Every page/route under those
  // paths MUST call requireAdmin() or checkAdminForApi() — otherwise it's
  // silently public.
  const isPublic =
    path === '/' ||
    path.startsWith('/_next') ||
    path.startsWith('/api/public') ||
    path.startsWith('/api/dev') ||
    path === '/admin' ||
    path.startsWith('/admin/') ||
    path === '/api/admin' ||
    path.startsWith('/api/admin/');
```

Also create `app/admin/page.tsx` as a temporary stub so the guard tests below can assert the redirect behavior. Task 3 will replace this file with the full pool UI.

```tsx
// app/admin/page.tsx (STUB — Task 3 replaces this file entirely)
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  await requireAdmin();
  return (
    <main className="app">
      <div className="pad pad-top col gap-16">
        <div className="eyebrow">admin</div>
        <div className="display" style={{ fontSize: 26 }}>
          video pool
        </div>
        <div className="body" style={{ color: 'var(--ink-mute)', fontSize: 13 }}>
          coming soon.
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 8: Write `tests/admin-unlock.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env not set');

test('admin unlock: wrong password rejected, no cookie, error visible', async ({
  page,
}) => {
  await page.goto('/admin/unlock');
  await page.getByTestId('admin-unlock-input').fill('definitely-not-the-right-password');
  await page.getByTestId('admin-unlock-submit').click();

  await expect(page.getByTestId('admin-unlock-error')).toContainText('wrong password');

  // Cookie must not have been set.
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === 'admin_unlock')).toBeUndefined();
});

test('admin unlock: right password sets cookie and redirects to /admin', async ({
  page,
}) => {
  await page.goto('/admin/unlock');
  await page.getByTestId('admin-unlock-input').fill(ADMIN_PASSWORD!);
  await page.getByTestId('admin-unlock-submit').click();

  await page.waitForURL('**/admin', { timeout: 5000 });

  const cookies = await page.context().cookies();
  const c = cookies.find((c) => c.name === 'admin_unlock');
  expect(c).toBeDefined();
  expect(c!.httpOnly).toBe(true);
});
```

- [ ] **Step 9: Write `tests/admin-guard.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env not set');

test('admin guard: anonymous user → redirect to /admin/unlock', async ({ page }) => {
  // Fresh context, no auth, no cookies.
  await page.goto('/admin');
  await page.waitForURL('**/admin/unlock', { timeout: 5000 });
  await expect(page.getByTestId('admin-unlock-form')).toBeVisible();
});

test('admin guard: logged-in non-admin user → still redirected to /admin/unlock', async ({
  page,
}) => {
  // Dev login creates dev@learntok.local — is_admin defaults to false.
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/admin');
  await page.waitForURL('**/admin/unlock', { timeout: 5000 });
});

test('admin guard: cookie unlocks /admin', async ({ page }) => {
  // Unlock via the password cookie path — proves the OR-gate accepts cookie mode.
  const unlockRes = await page.request.post('/api/admin/unlock', {
    data: { password: ADMIN_PASSWORD },
  });
  expect(unlockRes.ok()).toBeTruthy();

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin$/);
  // Page itself isn't built yet (Task 4) — for now just assert we did NOT
  // bounce to /admin/unlock.
  await expect(page).not.toHaveURL(/\/admin\/unlock/);
});
```

- [ ] **Step 10: Run the new specs and confirm they pass**

```bash
npx playwright test tests/admin-unlock.spec.ts tests/admin-guard.spec.ts
```

Expected: 5 passed (2 from admin-unlock, 3 from admin-guard).

If "cookie unlocks /admin" fails because `/admin` 404s (Task 4 hasn't built it yet), temporarily skip that one assertion-level case OR proceed — the test only checks the URL didn't redirect to /admin/unlock. A 404 still keeps the URL at /admin so the assertion passes. (Verified: Next.js 14 `notFound()` does not change the URL.)

- [ ] **Step 11: Commit**

```bash
git add lib/admin-auth.ts app/admin/page.tsx app/admin/unlock/ \
        app/api/admin/unlock/ middleware.ts \
        tests/admin-unlock.spec.ts tests/admin-guard.spec.ts .env.example
git commit -m "feat(admin): add HMAC-cookie unlock flow + middleware allowlist

requireAdmin() (page-side, redirects) and checkAdminForApi() (route-side,
returns null) gate the admin module via either profiles.is_admin or a
400-day HMAC cookie keyed by ADMIN_PASSWORD. /admin and /api/admin are
allowlisted in middleware so the admin module's own guard can handle
both authed-admin and cookie-backdoor paths; a stub /admin/page.tsx
calls requireAdmin() so the guard tests can exercise the redirect
before Task 3 builds the pool UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Admin page — read-only grid

Builds the admin dashboard with category tabs and a thumbnail grid. No delete yet — that comes in Task 4. This task ends with a working grid that reflects whatever's in `video_pool`.

**Files:**
- Replace: `app/admin/page.tsx` (currently a stub from Task 2 Step 7 — overwrite it entirely with the version below)
- Create: `app/admin/AdminPoolView.tsx`
- Create: `app/admin/VideoCard.tsx`

- [ ] **Step 1: Replace `app/admin/page.tsx` (server component) — overwrite the Task 2 stub**

```tsx
import { requireAdmin } from '@/lib/admin-auth';
import { createClient } from '@/lib/supabase/server';
import { AdminPoolView } from './AdminPoolView';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  await requireAdmin();

  const supabase = createClient();

  const [catsRes, vidsRes] = await Promise.all([
    supabase
      .from('categories')
      .select('slug, display_order')
      .eq('is_active', true)
      .order('display_order'),
    supabase
      .from('video_pool')
      .select('id, video_id, source, category, title, author, thumbnail_url')
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
  ]);

  const categories = catsRes.data ?? [];
  const videos = vidsRes.data ?? [];

  return (
    <main className="app">
      <div className="pad pad-top">
        <div className="eyebrow">🛡️ admin</div>
        <div className="display mt-4" style={{ fontSize: 26 }}>
          video pool
        </div>
        <AdminPoolView categories={categories} videos={videos} />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Write `app/admin/VideoCard.tsx` (client component)**

```tsx
'use client';

import { useState } from 'react';
import { VideoEmbed } from '@/components/feed/VideoEmbed';

export interface AdminVideo {
  id: string;
  video_id: string;
  source: 'tiktok' | 'youtube';
  category: string;
  title: string | null;
  author: string | null;
  thumbnail_url: string | null;
}

export function VideoCard({
  video,
  expanded,
  onToggleExpand,
}: {
  video: AdminVideo;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  return (
    <div
      className="card col gap-8"
      style={{ padding: 8, position: 'relative' }}
      data-testid={`admin-video-card-${video.video_id}`}
    >
      <div
        style={{
          aspectRatio: '9 / 16',
          background: 'var(--bg-2)',
          borderRadius: 8,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {expanded ? (
          <VideoEmbed source={video.source} videoId={video.video_id} fillHeight />
        ) : video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail_url}
            alt={video.title ?? video.video_id}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            className="row aic jc"
            style={{
              width: '100%',
              height: '100%',
              color: 'var(--ink-mute)',
              fontSize: 11,
            }}
          >
            no thumbnail
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
        {video.title ?? video.video_id}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
        {video.author ? `@${video.author}` : video.category}
      </div>
      <div className="row gap-8">
        <button
          type="button"
          className="btn btn-ghost"
          style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
          onClick={onToggleExpand}
          data-testid={`admin-video-preview-${video.video_id}`}
        >
          {expanded ? 'close' : '👁 preview'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `app/admin/AdminPoolView.tsx` (client component)**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { VideoCard, type AdminVideo } from './VideoCard';

const ALL = '__all__';

export function AdminPoolView({
  categories,
  videos,
}: {
  categories: Array<{ slug: string; display_order: number }>;
  videos: AdminVideo[];
}) {
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(
    () => (activeCat === ALL ? videos : videos.filter((v) => v.category === activeCat)),
    [videos, activeCat]
  );

  const countByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of videos) m.set(v.category, (m.get(v.category) ?? 0) + 1);
    return m;
  }, [videos]);

  return (
    <div className="col gap-16 mt-16">
      <div
        className="row gap-8"
        style={{ overflowX: 'auto', paddingBottom: 4 }}
        data-testid="admin-category-tabs"
      >
        <CategoryTab
          slug={ALL}
          label={`全部 ${videos.length}`}
          active={activeCat === ALL}
          onClick={() => setActiveCat(ALL)}
        />
        {categories.map((c) => (
          <CategoryTab
            key={c.slug}
            slug={c.slug}
            label={`${c.slug} ${countByCat.get(c.slug) ?? 0}`}
            active={activeCat === c.slug}
            onClick={() => setActiveCat(c.slug)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div
          className="card body"
          style={{ color: 'var(--ink-mute)', textAlign: 'center' }}
          data-testid="admin-empty"
        >
          no videos in this category yet. run{' '}
          <code>npm run scrape:tiktok</code> to populate.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 12,
          }}
          data-testid="admin-video-grid"
        >
          {filtered.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              expanded={expandedId === v.id}
              onToggleExpand={() => setExpandedId(expandedId === v.id ? null : v.id)}
            />
          ))}
        </div>
      )}

      <div
        className="body"
        style={{ fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center' }}
      >
        💡 池子腻了？本地跑 <code>npm run scrape:tiktok</code> 补货。
      </div>
    </div>
  );
}

function CategoryTab({
  slug,
  label,
  active,
  onClick,
}: {
  slug: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn ${active ? 'btn-primary' : 'btn-ghost'}`}
      style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap', flexShrink: 0 }}
      data-testid={`admin-tab-${slug}`}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 4: Smoke-check via dev server**

```bash
npm run dev
```

In a browser, with admin cookie set (you can `POST` to `/api/admin/unlock` from devtools or just visit `/admin/unlock`):
- visit `/admin`
- expect: header "🛡️ admin · video pool", category tabs, empty-state card "no videos in this category yet"

The tabs should still render (categories are seeded). No video grid because `video_pool` is empty.

Stop the dev server (`Ctrl+C`) when done.

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.tsx app/admin/AdminPoolView.tsx app/admin/VideoCard.tsx
git commit -m "feat(admin): add /admin page with category tabs and video grid

Server component gates via requireAdmin(), parallel-fetches categories
and active video_pool rows, hands them to the client view. The view
renders horizontal category tabs (filterable by client-side state) and
a responsive thumbnail grid with inline VideoEmbed preview. Soft-delete
button comes in Task 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Soft delete

Adds the trash button + PATCH route + Playwright spec proving the row stays gone after reload.

**Files:**
- Create: `app/api/admin/video-pool/[id]/route.ts`
- Modify: `app/admin/VideoCard.tsx` (add delete button)
- Modify: `app/admin/AdminPoolView.tsx` (handle delete state)
- Create: `tests/admin-pool.spec.ts`

- [ ] **Step 1: Write `app/api/admin/video-pool/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { checkAdminForApi } from '@/lib/admin-auth';

const Body = z.object({ is_active: z.boolean() });

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const admin = await checkAdminForApi();
  if (!admin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let parsed: { is_active: boolean };
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }

  const sb = adminClient();
  const { error } = await sb
    .from('video_pool')
    .update({ is_active: parsed.is_active })
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Modify `app/admin/VideoCard.tsx` to add a delete button**

Replace the entire file contents with:

```tsx
'use client';

import { VideoEmbed } from '@/components/feed/VideoEmbed';

export interface AdminVideo {
  id: string;
  video_id: string;
  source: 'tiktok' | 'youtube';
  category: string;
  title: string | null;
  author: string | null;
  thumbnail_url: string | null;
}

export function VideoCard({
  video,
  expanded,
  onToggleExpand,
  onDelete,
  deleting,
}: {
  video: AdminVideo;
  expanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div
      className="card col gap-8"
      style={{
        padding: 8,
        position: 'relative',
        opacity: deleting ? 0.4 : 1,
        pointerEvents: deleting ? 'none' : 'auto',
      }}
      data-testid={`admin-video-card-${video.video_id}`}
    >
      <div
        style={{
          aspectRatio: '9 / 16',
          background: 'var(--bg-2)',
          borderRadius: 8,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {expanded ? (
          <VideoEmbed source={video.source} videoId={video.video_id} fillHeight />
        ) : video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail_url}
            alt={video.title ?? video.video_id}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            className="row aic jc"
            style={{
              width: '100%',
              height: '100%',
              color: 'var(--ink-mute)',
              fontSize: 11,
            }}
          >
            no thumbnail
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
        {video.title ?? video.video_id}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
        {video.author ? `@${video.author}` : video.category}
      </div>
      <div className="row gap-8">
        <button
          type="button"
          className="btn btn-ghost"
          style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
          onClick={onToggleExpand}
          data-testid={`admin-video-preview-${video.video_id}`}
        >
          {expanded ? 'close' : '👁 preview'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{
            fontSize: 12,
            padding: '6px 10px',
            color: 'var(--bad)',
          }}
          onClick={onDelete}
          disabled={deleting}
          data-testid={`admin-video-delete-${video.video_id}`}
          aria-label="delete video"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Modify `app/admin/AdminPoolView.tsx` to handle delete**

Replace the entire file contents with:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { VideoCard, type AdminVideo } from './VideoCard';

const ALL = '__all__';

export function AdminPoolView({
  categories,
  videos: initialVideos,
}: {
  categories: Array<{ slug: string; display_order: number }>;
  videos: AdminVideo[];
}) {
  const [videos, setVideos] = useState<AdminVideo[]>(initialVideos);
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () => (activeCat === ALL ? videos : videos.filter((v) => v.category === activeCat)),
    [videos, activeCat]
  );

  const countByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of videos) m.set(v.category, (m.get(v.category) ?? 0) + 1);
    return m;
  }, [videos]);

  const onDelete = async (id: string) => {
    if (deletingIds.has(id)) return;
    setDeletingIds((s) => new Set(s).add(id));

    // Optimistic snapshot for revert.
    const prev = videos;
    setVideos((vs) => vs.filter((v) => v.id !== id));

    try {
      const res = await fetch(`/api/admin/video-pool/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });
      if (!res.ok) {
        setVideos(prev); // revert
        // eslint-disable-next-line no-console
        console.error('delete failed', await res.text());
      }
    } catch (e) {
      setVideos(prev);
      // eslint-disable-next-line no-console
      console.error('delete network error', e);
    } finally {
      setDeletingIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  };

  return (
    <div className="col gap-16 mt-16">
      <div
        className="row gap-8"
        style={{ overflowX: 'auto', paddingBottom: 4 }}
        data-testid="admin-category-tabs"
      >
        <CategoryTab
          slug={ALL}
          label={`全部 ${videos.length}`}
          active={activeCat === ALL}
          onClick={() => setActiveCat(ALL)}
        />
        {categories.map((c) => (
          <CategoryTab
            key={c.slug}
            slug={c.slug}
            label={`${c.slug} ${countByCat.get(c.slug) ?? 0}`}
            active={activeCat === c.slug}
            onClick={() => setActiveCat(c.slug)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div
          className="card body"
          style={{ color: 'var(--ink-mute)', textAlign: 'center' }}
          data-testid="admin-empty"
        >
          no videos in this category yet. run{' '}
          <code>npm run scrape:tiktok</code> to populate.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 12,
          }}
          data-testid="admin-video-grid"
        >
          {filtered.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              expanded={expandedId === v.id}
              onToggleExpand={() => setExpandedId(expandedId === v.id ? null : v.id)}
              onDelete={() => onDelete(v.id)}
              deleting={deletingIds.has(v.id)}
            />
          ))}
        </div>
      )}

      <div
        className="body"
        style={{ fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center' }}
      >
        💡 池子腻了？本地跑 <code>npm run scrape:tiktok</code> 补货。
      </div>
    </div>
  );
}

function CategoryTab({
  slug,
  label,
  active,
  onClick,
}: {
  slug: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn ${active ? 'btn-primary' : 'btn-ghost'}`}
      style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap', flexShrink: 0 }}
      data-testid={`admin-tab-${slug}`}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 4: Write `tests/admin-pool.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env not set');

const TEST_VIDEO_IDS = [
  '9999999999000000001',
  '9999999999000000002',
  '9999999999000000003',
];

test.beforeEach(async () => {
  // Hard-delete any leftover test rows (avoid "row already exists, soft-deleted")
  // so each test starts from a known clean slate.
  const a = admin();
  await a.from('video_pool').delete().in('video_id', TEST_VIDEO_IDS);

  await a.from('video_pool').insert([
    {
      video_id: TEST_VIDEO_IDS[0],
      source: 'tiktok',
      category: '喜剧',
      title: 'test comedy A',
      author: 'testuser',
      thumbnail_url: null,
    },
    {
      video_id: TEST_VIDEO_IDS[1],
      source: 'tiktok',
      category: '喜剧',
      title: 'test comedy B',
      author: 'testuser',
      thumbnail_url: null,
    },
    {
      video_id: TEST_VIDEO_IDS[2],
      source: 'tiktok',
      category: '动物',
      title: 'test animal',
      author: 'testuser',
      thumbnail_url: null,
    },
  ]);
});

test.afterEach(async () => {
  const a = admin();
  await a.from('video_pool').delete().in('video_id', TEST_VIDEO_IDS);
});

test('admin pool: grid shows seeded videos and category tab filters', async ({
  page,
}) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });

  await page.goto('/admin');
  await expect(page.getByTestId('admin-video-grid')).toBeVisible();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[0]}`)).toBeVisible();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[2]}`)).toBeVisible();

  // Filter to 喜剧: animal video should be hidden, two comedy videos visible.
  await page.getByTestId('admin-tab-喜剧').click();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[0]}`)).toBeVisible();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[2]}`)).toHaveCount(0);
});

test('admin pool: soft delete removes card and persists across reload', async ({
  page,
}) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });

  await page.goto('/admin');
  await page.getByTestId(`admin-video-delete-${TEST_VIDEO_IDS[0]}`).click();

  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[0]}`)).toHaveCount(0);

  // Reload — the row should still be gone (soft delete persisted).
  await page.reload();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[0]}`)).toHaveCount(0);
  // Other test videos still present.
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[1]}`)).toBeVisible();
});
```

- [ ] **Step 5: Run the spec and confirm green**

```bash
npx playwright test tests/admin-pool.spec.ts
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add app/admin/VideoCard.tsx app/admin/AdminPoolView.tsx \
        app/api/admin/video-pool/ tests/admin-pool.spec.ts
git commit -m "feat(admin): soft-delete videos via PATCH /api/admin/video-pool/[id]

Card gains a 🗑 button that PATCHes is_active=false; AdminPoolView does
optimistic UI removal with revert on error. Spec verifies delete
persists across reload and only the targeted row disappears.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Feed reads from DB

Stops feeding videos from the hardcoded array and reads them from `video_pool` instead. Updates the existing feed-related Playwright specs to seed test videos so they keep working.

**Files:**
- Modify: `app/feed/page.tsx`
- Modify: `app/feed/FeedPlayer.tsx`
- Modify: `tests/budget-feed-smoke.spec.ts`
- Modify: `tests/feed-swipe-smoke.spec.ts`
- Modify: `tests/nav-smoke.spec.ts`
- Create: `tests/feed-from-db.spec.ts`

- [ ] **Step 1: Replace `app/feed/page.tsx` entirely**

Current file (verified): does the `getUser()` + session lookup via RLS, then renders `<FeedPlayer sessionId budgetSeconds />`. Add the `video_pool` fetch and the `vids` prop. Full replacement:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FeedPlayer } from './FeedPlayer';

export const dynamic = 'force-dynamic';

export default async function FeedPage({
  searchParams,
}: {
  searchParams: { session?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const sessionId = searchParams.session;
  if (!sessionId) redirect('/budget');

  const { data: sessionRow } = await supabase
    .from('sessions')
    .select('id, kind, ended_at, budget_seconds')
    .eq('id', sessionId)
    .maybeSingle();

  // RLS hides sessions that don't belong to this user.
  if (!sessionRow || sessionRow.kind !== 'feed' || sessionRow.ended_at) {
    redirect('/budget');
  }

  const budget = sessionRow.budget_seconds ?? 0;
  if (budget <= 0) redirect('/budget');

  const { data: vids } = await supabase
    .from('video_pool')
    .select('video_id, source, title, category')
    .eq('is_active', true);

  // Server-side shuffle so each session gets a different order.
  const shuffled = [...(vids ?? [])].sort(() => Math.random() - 0.5);

  return <FeedPlayer sessionId={sessionId} budgetSeconds={budget} vids={shuffled} />;
}
```

- [ ] **Step 2: Modify `app/feed/FeedPlayer.tsx` — accept `vids` prop, drop hardcoded array, add empty state**

Find the existing `FEED_VIDS` const (lines ~11-30 in the file as last seen) and DELETE the entire array. Then change the component signature and the `vid` lookup. Specifically:

- Delete the const declaration `const FEED_VIDS: Array<...> = [ ... ];` (entire block).
- Update the props type:

```tsx
type FeedVid = {
  video_id: string;
  source: 'tiktok' | 'youtube';
  title: string | null;
  category: string | null;
};

export function FeedPlayer({
  sessionId,
  budgetSeconds,
  vids,
}: {
  sessionId: string;
  budgetSeconds: number;
  vids: FeedVid[];
}) {
```

- Replace the line `const vid = FEED_VIDS[vidIdx % FEED_VIDS.length];` with:

```tsx
const vid = vids.length > 0 ? vids[vidIdx % vids.length] : null;
```

- Right after the existing `pct` calculation, add an early return for the empty pool case:

```tsx
if (!vid) {
  return (
    <div className="feed" data-testid="feed-root">
      <div
        className="col aic jc"
        data-testid="feed-empty"
        style={{
          position: 'absolute',
          inset: 0,
          padding: 24,
          textAlign: 'center',
          color: '#fff',
        }}
      >
        <div
          className="display"
          style={{ fontSize: 24, fontFamily: 'var(--serif)' }}
        >
          no videos yet
        </div>
        <div className="body mt-8" style={{ color: '#d6d3cf' }}>
          ask the admin to run <code>npm run scrape:tiktok</code>.
        </div>
        <div className="angel-exit-bar mt-24">
          <button
            type="button"
            className="angel-exit-btn"
            onClick={doneNow}
            disabled={submitting}
            data-testid="angel-exit"
          >
            <span className="angel-exit-label">回去学习</span>
          </button>
        </div>
      </div>
    </div>
  );
}
```

- Replace the existing render's `<VideoEmbed source={vid.source} videoId={vid.id} fillHeight />` with `<VideoEmbed source={vid.source} videoId={vid.video_id} fillHeight />` (note: `vid.id` was the field name in the old hardcoded shape; new prop uses `video_id`).
- Replace the existing `vid.caption` reference (in `feed-overlay-info`) with `vid.title ?? ''`.

- [ ] **Step 3: Confirm the dev server still renders /feed end-to-end**

```bash
npm run dev
```

Manually:
1. Visit `/budget`, pick a preset, click start → land on `/feed`.
2. With an empty `video_pool`, the empty-state card appears.
3. Stop the dev server.

Then seed two videos via Supabase SQL editor (or via `tests/helpers/session.ts`'s `admin()` from a one-off node REPL) and reload `/feed`. Iframe should appear.

```sql
insert into public.video_pool (video_id, source, category, title, author)
values
  ('9999999999000000010', 'tiktok', '喜剧', 'manual seed A', 'me'),
  ('9999999999000000011', 'tiktok', '喜剧', 'manual seed B', 'me');
```

After verification, hard-delete the seed:

```sql
delete from public.video_pool where video_id in ('9999999999000000010','9999999999000000011');
```

- [ ] **Step 4: Update `tests/budget-feed-smoke.spec.ts` to seed test videos**

Open the file. Add at the top after existing imports:

```ts
import { admin as svcAdmin } from './helpers/session';

const SEED_VIDS = ['8888888888000000001', '8888888888000000002'];

test.beforeAll(async () => {
  const a = svcAdmin();
  await a.from('video_pool').delete().in('video_id', SEED_VIDS);
  await a.from('video_pool').insert(
    SEED_VIDS.map((v) => ({
      video_id: v,
      source: 'tiktok' as const,
      category: '喜剧',
      title: 'budget-feed-seed',
    }))
  );
});

test.afterAll(async () => {
  const a = svcAdmin();
  await a.from('video_pool').delete().in('video_id', SEED_VIDS);
});
```

(Note: the existing file already imports `admin` from `./helpers/session` in one spec — rename the import here to `svcAdmin` to avoid shadowing or just verify there's no name conflict.)

- [ ] **Step 5: Update `tests/feed-swipe-smoke.spec.ts` to seed test videos**

Add the same `beforeAll` / `afterAll` block at the top of the file (with a different SEED_VIDS prefix to avoid collision):

```ts
import { admin as svcAdmin } from './helpers/session';

const SEED_VIDS = [
  '7777777777000000001',
  '7777777777000000002',
  '7777777777000000003',
];

test.beforeAll(async () => {
  const a = svcAdmin();
  await a.from('video_pool').delete().in('video_id', SEED_VIDS);
  await a.from('video_pool').insert(
    SEED_VIDS.map((v) => ({
      video_id: v,
      source: 'tiktok' as const,
      category: '喜剧',
      title: 'feed-swipe-seed',
    }))
  );
});

test.afterAll(async () => {
  const a = svcAdmin();
  await a.from('video_pool').delete().in('video_id', SEED_VIDS);
});
```

- [ ] **Step 6: Update `tests/nav-smoke.spec.ts` to seed for the `/feed` test**

The test "bottom nav hidden on /feed" navigates to /feed. Add at the top:

```ts
import { admin as svcAdmin } from './helpers/session';

const SEED_VIDS = ['6666666666000000001'];

test.beforeAll(async () => {
  const a = svcAdmin();
  await a.from('video_pool').delete().in('video_id', SEED_VIDS);
  await a.from('video_pool').insert(
    SEED_VIDS.map((v) => ({
      video_id: v,
      source: 'tiktok' as const,
      category: '喜剧',
      title: 'nav-smoke-seed',
    }))
  );
});

test.afterAll(async () => {
  const a = svcAdmin();
  await a.from('video_pool').delete().in('video_id', SEED_VIDS);
});
```

- [ ] **Step 7: Write `tests/feed-from-db.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { admin as svcAdmin } from './helpers/session';

const SEED_VID = '5555555555000000099';

test.beforeAll(async () => {
  const a = svcAdmin();
  await a.from('video_pool').delete().eq('video_id', SEED_VID);
  await a.from('video_pool').insert({
    video_id: SEED_VID,
    source: 'tiktok' as const,
    category: '喜剧',
    title: 'feed-from-db-seed',
  });
});

test.afterAll(async () => {
  const a = svcAdmin();
  await a.from('video_pool').delete().eq('video_id', SEED_VID);
});

test('feed reads from video_pool: seeded video appears in iframe', async ({
  page,
}) => {
  // Wipe other rows so the seeded one is the only candidate (otherwise
  // the random shuffle might land elsewhere).
  const a = svcAdmin();
  const { data: others } = await a
    .from('video_pool')
    .select('id')
    .neq('video_id', SEED_VID);
  const otherIds = (others ?? []).map((r) => r.id);
  if (otherIds.length) {
    await a.from('video_pool').update({ is_active: false }).in('id', otherIds);
  }

  try {
    const loginRes = await page.request.post('/api/dev/login');
    expect(loginRes.ok()).toBeTruthy();

    await page.goto('/budget');
    await page.getByTestId('budget-preset-120').click();
    await page.getByTestId('budget-start').click();
    await page.waitForURL(/\/feed\?session=/, { timeout: 10_000 });

    const src = await page.getByTestId('video-embed').locator('iframe').getAttribute('src');
    expect(src).toContain(SEED_VID);

    await page.getByTestId('angel-exit').click();
    await page.waitForURL('**/home', { timeout: 10_000 });
  } finally {
    // Restore any previously-active rows.
    if (otherIds.length) {
      await a.from('video_pool').update({ is_active: true }).in('id', otherIds);
    }
  }
});
```

- [ ] **Step 8: Run the full feed-related test suite to confirm green**

```bash
npx playwright test tests/feed-from-db.spec.ts tests/feed-swipe-smoke.spec.ts \
                   tests/budget-feed-smoke.spec.ts tests/nav-smoke.spec.ts
```

Expected: all green. (If `feed-from-db` flakes due to other test rows still being active from a parallel run, run with `--workers=1`.)

- [ ] **Step 9: Commit**

```bash
git add app/feed/page.tsx app/feed/FeedPlayer.tsx \
        tests/budget-feed-smoke.spec.ts tests/feed-swipe-smoke.spec.ts \
        tests/nav-smoke.spec.ts tests/feed-from-db.spec.ts
git commit -m "feat(feed): read videos from video_pool instead of hardcoded array

FeedPlayer.tsx loses its 18-video FEED_VIDS const and gains a 'vids'
prop populated by /feed/page.tsx via an authenticated read of active
video_pool rows. Server shuffles the list per session. Empty pool shows
'no videos yet, ask admin to scrape' with the angel-exit still
reachable. Three existing feed-touching specs now seed test rows in
beforeAll/afterAll; new feed-from-db.spec.ts asserts the seeded video
ID lands in the iframe src.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Scraper script

Builds the local-only Playwright scraper that ingests TikTok explore content into `video_pool`. No automated tests — manual run is the validation.

**Files:**
- Create: `scripts/scrape-tiktok.ts`
- Modify: `package.json` (add `tsx` devDep, `scrape:tiktok` script)
- Modify: `.gitignore`

- [ ] **Step 1: Add `tsx` as devDep + `scrape:tiktok` script in `package.json`**

```bash
npm install --save-dev tsx
```

Then edit `package.json` to add the script under `scripts`:

```json
  "scripts": {
    "dev": "next dev",
    "dev:lan": "next dev -H 0.0.0.0",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "supabase:reset": "supabase db reset",
    "supabase:push": "supabase db push",
    "gen:types": "supabase gen types typescript --local > lib/supabase/database.types.ts",
    "test": "playwright test",
    "scrape:tiktok": "tsx --env-file=.env.local scripts/scrape-tiktok.ts"
  },
```

- [ ] **Step 2: Update `.gitignore`**

Append to `.gitignore`:

```
data/playwright-profile/
data/tiktok-pool.json
```

- [ ] **Step 3: Write `scripts/scrape-tiktok.ts`**

```ts
/**
 * Local TikTok explore scraper. Pulls 30 verified-embeddable videos per
 * active category from tiktok.com/explore and upserts them into the
 * video_pool Supabase table.
 *
 * Run: npm run scrape:tiktok
 *
 * First run pops a Chrome window. If TikTok prompts for login, log in
 * once — the persistent profile in data/playwright-profile/ saves the
 * session for subsequent runs.
 */

import { chromium, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const TARGET_PER_CATEGORY = 30;
const MAX_SCROLLS = 20;
const SCROLL_DELAY_MS = 1200;
const PROFILE_DIR = './data/playwright-profile';
const AUDIT_OUT = './data/tiktok-pool.json';

interface Candidate {
  id: string;
  author: string;
}

interface Verified extends Candidate {
  title: string | null;
  thumbnail_url: string | null;
  author_name: string;
}

async function hideInterestModal(page: Page): Promise<void> {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.nodeValue?.includes('你希望在')) {
        let el = (node as Text).parentElement;
        for (let i = 0; i < 12 && el; i++) {
          const role = el.getAttribute('role');
          if (role === 'dialog') {
            (el as HTMLElement).style.display = 'none';
            return;
          }
          el = el.parentElement;
        }
      }
    }
  });
}

async function clickCategoryChip(page: Page, slug: string): Promise<boolean> {
  return page.evaluate((s) => {
    const btns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const target = btns.find((b) => b.textContent?.trim() === s);
    if (!target) return false;
    (target as HTMLElement).click();
    return true;
  }, slug);
}

async function collectIds(page: Page): Promise<Candidate[]> {
  const seen = new Map<string, string>();
  for (let i = 0; i < MAX_SCROLLS; i++) {
    if (seen.size >= TARGET_PER_CATEGORY * 2) break; // collect 2x target so verification can drop some
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
    await page.waitForTimeout(SCROLL_DELAY_MS);
    const batch: Array<{ id: string; author: string }> = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/video/"]'));
      const out: Array<{ id: string; author: string }> = [];
      for (const a of anchors) {
        const m = (a as HTMLAnchorElement).href.match(/@([^/]+)\/video\/(\d+)/);
        if (m) out.push({ author: m[1], id: m[2] });
      }
      return out;
    });
    for (const { id, author } of batch) seen.set(id, author);
  }
  return [...seen.entries()].map(([id, author]) => ({ id, author }));
}

async function verifyEmbed(c: Candidate): Promise<Verified | null> {
  const url = `https://www.tiktok.com/@${c.author}/video/${c.id}`;
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const json: { title?: string; thumbnail_url?: string; author_name?: string } =
      await res.json();
    return {
      ...c,
      title: json.title ?? null,
      thumbnail_url: json.thumbnail_url ?? null,
      author_name: json.author_name ?? c.author,
    };
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const sb = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: cats, error: catsErr } = await sb
    .from('categories')
    .select('slug')
    .eq('is_active', true)
    .order('display_order');

  if (catsErr || !cats) {
    console.error('failed to load categories:', catsErr?.message);
    process.exit(1);
  }

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();

  const audit: Record<string, Verified[]> = {};

  for (const { slug } of cats) {
    console.log(`\n=== ${slug} ===`);
    await page.goto('https://www.tiktok.com/explore', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500); // let initial videos paint
    await hideInterestModal(page);

    const clicked = await clickCategoryChip(page, slug);
    if (!clicked) {
      console.warn(`  [skip] could not find category chip for "${slug}"`);
      continue;
    }
    await page.waitForTimeout(2000);
    await hideInterestModal(page); // modal can re-appear after category click

    const candidates = await collectIds(page);
    console.log(`  collected ${candidates.length} candidate IDs`);

    const verified: Verified[] = [];
    for (const c of candidates) {
      if (verified.length >= TARGET_PER_CATEGORY) break;
      const v = await verifyEmbed(c);
      if (v) verified.push(v);
      await new Promise((r) => setTimeout(r, 100)); // gentle on oembed
    }
    console.log(`  ${verified.length} embeddable (verified via oembed)`);

    audit[slug] = verified;

    if (verified.length === 0) {
      console.warn(`  [skip-upsert] no embeddable videos for "${slug}"`);
      continue;
    }

    const { error: upsertErr } = await sb.from('video_pool').upsert(
      verified.map((v) => ({
        video_id: v.id,
        source: 'tiktok' as const,
        category: slug,
        title: v.title,
        author: v.author_name,
        thumbnail_url: v.thumbnail_url,
        scraped_at: new Date().toISOString(),
      })),
      { onConflict: 'video_id', ignoreDuplicates: true }
    );
    if (upsertErr) {
      console.error(`  [error] upsert failed: ${upsertErr.message}`);
    } else {
      console.log(`  upserted ${verified.length} into video_pool`);
    }
  }

  await ctx.close();

  await mkdir(dirname(AUDIT_OUT), { recursive: true });
  await writeFile(AUDIT_OUT, JSON.stringify(audit, null, 2));
  console.log(`\nWrote audit trail → ${AUDIT_OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 4: Install Chromium binary for Playwright (one-time)**

```bash
npx playwright install chromium
```

Expected: downloads Chromium (~150MB) into Playwright's cache.

- [ ] **Step 5: Run the scraper end-to-end**

```bash
npm run scrape:tiktok
```

Expected: A Chrome window pops up. The script iterates 12 categories, console logs progress. If TikTok shows a login modal you can ignore it (the JS-level modal-hide handles it) or close it manually. After ~10 minutes the window closes; the script exits with `Wrote audit trail → ./data/tiktok-pool.json`. Supabase should now have ~360 rows in `video_pool`.

- [ ] **Step 6: Verify the pool was populated**

In the Supabase SQL editor (or a one-off `psql`):

```sql
select category, count(*) from video_pool where is_active group by category order by category;
```

Expected: 12 rows, each with `count` close to 30.

- [ ] **Step 7: Commit**

```bash
git add scripts/scrape-tiktok.ts package.json .gitignore package-lock.json
git commit -m "feat(scraper): add scripts/scrape-tiktok.ts for local pool ingestion

Playwright headful with persistent profile in data/playwright-profile/
(gitignored). Iterates active categories, scrolls each up to 20x,
extracts (author, video_id) pairs from anchor hrefs, verifies each via
TikTok oembed (drops disable_embed / deleted / geo-locked), upserts up
to 30 per category into video_pool with ignoreDuplicates so soft-deletes
survive re-scraping. Writes data/tiktok-pool.json as audit trail.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Final Verification

After Task 6, run the entire test suite to confirm no regressions:

```bash
npx playwright test
```

Expected: every spec green. Open PR with title "Phase 5: admin video pool + scraper" and link to spec + plan.
