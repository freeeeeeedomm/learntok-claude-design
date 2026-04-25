# Admin Restructure: Category Index + Manual Add Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single tab+grid `/admin` with a drill-in IA (`/admin` → `/admin/all` or `/admin/[slug]`), and add inline forms for posting a single TikTok URL into a category and creating a new category.

**Architecture:** Three pages share one client component (`CategoryView`) that owns the grid + swipe-review + (when on a single-category page) the add-video form. The category index aggregates counts and one sample `video_id` per category in a single DB pass. Two new POST API routes accept the inline form submissions, gated by the existing `checkAdminForApi` helper. URL parsing for TikTok is extracted into a shared `lib/tiktok-url.ts` so both the new POST handler and the scraper use one parser/builder.

**Tech Stack:** Next.js 14 App Router, React Server + Client components, Supabase (`adminClient` for service-role writes), Zod for body validation, Playwright for integration tests.

---

## File Structure

**New:**
- `lib/tiktok-url.ts` — `extractVideoId(url) → { videoId, author } | null` and `buildVideoUrl({ videoId, author }) → string`
- `app/admin/CategoryView.tsx` — client component: grid + swipe trigger + (optional) add-video form
- `app/admin/NewVideoForm.tsx` — client form: single TikTok URL → POST → optimistic prepend
- `app/admin/NewCategoryForm.tsx` — client form: single slug → POST → `router.refresh()`
- `app/admin/all/page.tsx` — server: fetch all active videos, render `CategoryView` with `slug={null}`
- `app/admin/[slug]/page.tsx` — server: fetch one category, render `CategoryView` with `slug={slug}`
- `app/api/admin/video-pool/route.ts` — POST: parse URL, oembed, upsert (revive soft-deleted)
- `app/api/admin/categories/route.ts` — POST: validate slug, auto-increment `display_order`, insert
- `tests/admin-routes.spec.ts` — covers `/admin/all` and `/admin/[slug]`
- `tests/admin-index.spec.ts` — covers `/admin` index
- `tests/admin-add-category.spec.ts` — covers create-category form
- `tests/admin-add-video.spec.ts` — covers add-video form

**Modified:**
- `app/admin/page.tsx` — full rewrite: was rendering `AdminPoolView`, now renders the category index
- `scripts/scrape-tiktok.ts` — refactor `verifyEmbed` to call `buildVideoUrl`
- `tests/admin-pool.spec.ts` — change paths from `/admin` to `/admin/[slug]`; testids unchanged

**Deleted:**
- `app/admin/AdminPoolView.tsx` — its responsibilities split between the new index and `CategoryView`

---

## Tasks

### Task 1: `lib/tiktok-url.ts` URL helper + scraper refactor

**Files:**
- Create: `lib/tiktok-url.ts`
- Modify: `scripts/scrape-tiktok.ts`

No dedicated unit test (the project's test culture is integration-only). The helper is exercised end-to-end in Task 5 (`admin-add-video.spec.ts`), which covers both happy path and `bad_url` rejection.

- [ ] **Step 1: Create `lib/tiktok-url.ts`**

```ts
/**
 * TikTok video URL parsing + building.
 *
 * Used by:
 *  - app/api/admin/video-pool/route.ts (POST: parse user-pasted URL → ref)
 *  - scripts/scrape-tiktok.ts (build URL from scraped { id, author } → oembed)
 */

export interface TikTokVideoRef {
  videoId: string;
  author: string;
}

// Accepts:
//   https://www.tiktok.com/@khaby.lame/video/6950627842518568197
//   https://tiktok.com/@user/video/123456789
//   http variants, optional trailing slash, optional ?query
const VIDEO_URL_PATTERN = /^https?:\/\/(?:www\.)?tiktok\.com\/@([^/?#]+)\/video\/(\d{5,30})(?:[/?#].*)?$/;

export function extractVideoId(url: string): TikTokVideoRef | null {
  const trimmed = url.trim();
  const match = trimmed.match(VIDEO_URL_PATTERN);
  if (!match) return null;
  return { author: match[1], videoId: match[2] };
}

export function buildVideoUrl(ref: TikTokVideoRef): string {
  return `https://www.tiktok.com/@${ref.author}/video/${ref.videoId}`;
}
```

- [ ] **Step 2: Refactor `scripts/scrape-tiktok.ts` to use `buildVideoUrl`**

Find the `verifyEmbed` function (around line 93-108 of the existing file). Replace its URL-construction line:

```ts
// Before:
async function verifyEmbed(c: Candidate): Promise<Verified | null> {
  const url = `https://www.tiktok.com/@${c.author}/video/${c.id}`;
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
    ...

// After:
import { buildVideoUrl } from '../lib/tiktok-url';
// (add this import alongside the other imports at the top of the file)

async function verifyEmbed(c: Candidate): Promise<Verified | null> {
  const url = buildVideoUrl({ videoId: c.id, author: c.author });
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
    ...
```

Behavior is unchanged; the import path is relative because `scripts/` is outside the Next.js `@/` alias.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add lib/tiktok-url.ts scripts/scrape-tiktok.ts
git commit -m "refactor(scrape): extract TikTok URL parsing into lib/tiktok-url"
```

---

### Task 2: `CategoryView` component + `/admin/all` + `/admin/[slug]`

**Files:**
- Create: `app/admin/CategoryView.tsx`
- Create: `app/admin/all/page.tsx`
- Create: `app/admin/[slug]/page.tsx`
- Test: `tests/admin-routes.spec.ts`

This task adds the new routes alongside the existing `/admin` (which still uses `AdminPoolView` until Task 3). Tests visit the new routes directly.

- [ ] **Step 1: Write failing test `tests/admin-routes.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env not set');

test('/admin/all renders the all-videos grid', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin/all');
  await expect(page.getByTestId('admin-video-grid')).toBeVisible();
  await expect(page.getByTestId('admin-review-enter')).toBeVisible();
});

test('/admin/[slug] renders a single category', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin/喜剧');
  await expect(page.getByTestId('admin-video-grid')).toBeVisible();
  // Add-video trigger is only on /admin/[slug], not on /admin/all
  await expect(page.getByTestId('admin-new-video-trigger')).toBeVisible();
});

test('/admin/[slug] returns 404 for an unknown slug', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  const res = await page.goto('/admin/__definitely_not_a_category__');
  expect(res?.status()).toBe(404);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx playwright test tests/admin-routes.spec.ts`
Expected: FAIL — routes return 404 (`/admin/all`, `/admin/[slug]` don't exist yet).

- [ ] **Step 3: Create `app/admin/CategoryView.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VideoCard, type AdminVideo } from './VideoCard';
import { AdminSwipeView } from './AdminSwipeView';
import { NewVideoForm } from './NewVideoForm';

export function CategoryView({
  initialVideos,
  categoryLabel,
  slug,
}: {
  initialVideos: AdminVideo[];
  categoryLabel: string;
  /** Single-category page passes the slug; /admin/all passes null */
  slug: string | null;
}) {
  const [videos, setVideos] = useState<AdminVideo[]>(initialVideos);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [swipeMode, setSwipeMode] = useState(false);
  const router = useRouter();

  const onDelete = async (id: string) => {
    if (deletingIds.has(id)) return;
    const removed = videos.find((v) => v.id === id);
    if (!removed) return;
    setDeletingIds((s) => new Set(s).add(id));
    setVideos((vs) => vs.filter((v) => v.id !== id));
    const reinsert = () =>
      setVideos((cur) => (cur.some((v) => v.id === id) ? cur : [...cur, removed]));
    try {
      const res = await fetch(`/api/admin/video-pool/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });
      if (!res.ok) reinsert();
    } catch {
      reinsert();
    } finally {
      setDeletingIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  };

  const onAddVideo = (newVideo: AdminVideo) => {
    setVideos((vs) => [newVideo, ...vs]);
    // router.refresh() reconciles with server truth (e.g. picks up the
    // canonical row's `created_at` ordering, ensures other components
    // re-render with the new total count).
    router.refresh();
  };

  if (swipeMode) {
    return (
      <AdminSwipeView
        vids={videos}
        categoryLabel={categoryLabel}
        onExit={() => setSwipeMode(false)}
        onCommitDelete={onDelete}
      />
    );
  }

  return (
    <div className="col gap-16 mt-16">
      {slug && <NewVideoForm category={slug} onAdded={onAddVideo} />}

      <div
        className="row"
        style={{ justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div className="body" style={{ color: 'var(--ink-mute)', fontSize: 12 }}>
          {categoryLabel} · {videos.length} 条
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setSwipeMode(true)}
          disabled={videos.length === 0}
          data-testid="admin-review-enter"
          style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
        >
          🎬 审一遍
        </button>
      </div>

      {videos.length === 0 ? (
        <div
          className="card body"
          style={{ color: 'var(--ink-mute)', textAlign: 'center' }}
          data-testid="admin-empty"
        >
          {slug
            ? '这个分类还没视频,贴 URL 加几条'
            : '池子是空的,跑 npm run scrape:tiktok 补货'}
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
          {videos.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              expanded={expandedId === v.id}
              onToggleExpand={() =>
                setExpandedId(expandedId === v.id ? null : v.id)
              }
              onDelete={() => onDelete(v.id)}
              deleting={deletingIds.has(v.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

Note: `NewVideoForm` doesn't exist yet. The import will produce a TypeScript error. Stub it out as an empty component for now to make Task 2's test pass — the real implementation lands in Task 5:

Create `app/admin/NewVideoForm.tsx` (stub):

```tsx
'use client';

import type { AdminVideo } from './VideoCard';

/**
 * Stub. Real implementation lands in Task 5. CategoryView imports
 * this to avoid `slug && <NewVideoForm/>` becoming a dangling
 * reference, and Task 2's test asserts `admin-new-video-trigger` is
 * visible on /admin/[slug] (so the stub must render the trigger).
 */
export function NewVideoForm({
  category: _category,
  onAdded: _onAdded,
}: {
  category: string;
  onAdded: (video: AdminVideo) => void;
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ alignSelf: 'flex-start', fontSize: 12, padding: '6px 12px' }}
      data-testid="admin-new-video-trigger"
      disabled
    >
      + 加视频 (todo)
    </button>
  );
}
```

- [ ] **Step 4: Create `app/admin/all/page.tsx`**

```tsx
import { requireAdmin } from '@/lib/admin-auth';
import { adminClient } from '@/lib/supabase/server';
import { CategoryView } from '../CategoryView';

export const dynamic = 'force-dynamic';

export default async function AllVideosPage() {
  await requireAdmin();
  const supabase = adminClient();
  const { data: vids } = await supabase
    .from('video_pool')
    .select('id, video_id, source, category, title, author, thumbnail_url')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  return (
    <main className="app">
      <div className="pad pad-top">
        <a
          href="/admin"
          className="eyebrow"
          style={{ textDecoration: 'underline' }}
        >
          ← 全部分类
        </a>
        <div className="display mt-4" style={{ fontSize: 26 }}>
          全部 · {vids?.length ?? 0} 条
        </div>
        <CategoryView
          initialVideos={vids ?? []}
          categoryLabel="全部"
          slug={null}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Create `app/admin/[slug]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import { adminClient } from '@/lib/supabase/server';
import { CategoryView } from '../CategoryView';

export const dynamic = 'force-dynamic';

export default async function CategoryPage({
  params,
}: {
  params: { slug: string };
}) {
  await requireAdmin();
  const slug = decodeURIComponent(params.slug);

  // /admin/all has its own static route; never resolve it as a category.
  if (slug === 'all') notFound();

  const supabase = adminClient();
  const { data: cat } = await supabase
    .from('categories')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!cat) notFound();

  const { data: vids } = await supabase
    .from('video_pool')
    .select('id, video_id, source, category, title, author, thumbnail_url')
    .eq('category', slug)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  return (
    <main className="app">
      <div className="pad pad-top">
        <a
          href="/admin"
          className="eyebrow"
          style={{ textDecoration: 'underline' }}
        >
          ← 全部分类
        </a>
        <div className="display mt-4" style={{ fontSize: 26 }}>
          {slug}
        </div>
        <CategoryView
          initialVideos={vids ?? []}
          categoryLabel={slug}
          slug={slug}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 7: Run test, verify pass**

Run: `npx playwright test tests/admin-routes.spec.ts`
Expected: 3/3 pass.

- [ ] **Step 8: Commit**

```bash
git add app/admin/CategoryView.tsx app/admin/NewVideoForm.tsx \
        app/admin/all/page.tsx app/admin/[slug]/page.tsx \
        tests/admin-routes.spec.ts
git commit -m "feat(admin): add /admin/all and /admin/[slug] drill-in routes"
```

---

### Task 3: `/admin` → category index, remove `AdminPoolView`

**Files:**
- Create: `app/admin/NewCategoryForm.tsx` (stub for now; real impl in Task 4)
- Modify: `app/admin/page.tsx` (rewrite)
- Delete: `app/admin/AdminPoolView.tsx`
- Modify: `tests/admin-pool.spec.ts` (path change)
- Test: `tests/admin-index.spec.ts` (new)

- [ ] **Step 1: Write failing test `tests/admin-index.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env not set');

test('/admin renders category index with hero + 12 cards + new-tile', async ({
  page,
}) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin');
  await expect(page.getByTestId('admin-all-hero')).toBeVisible();
  await expect(page.getByTestId('admin-category-grid')).toBeVisible();
  await expect(page.getByTestId('admin-category-card-喜剧')).toBeVisible();
  await expect(page.getByTestId('admin-category-card-动物')).toBeVisible();
  await expect(page.getByTestId('admin-new-category-tile')).toBeVisible();
});

test('clicking a category card navigates to /admin/[slug]', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin');
  await page.getByTestId('admin-category-card-喜剧').click();
  await expect(page.getByTestId('admin-video-grid')).toBeVisible();
});

test('hero card navigates to /admin/all', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin');
  await page.getByTestId('admin-all-hero').click();
  await expect(page).toHaveURL(/\/admin\/all$/);
  await expect(page.getByTestId('admin-video-grid')).toBeVisible();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx playwright test tests/admin-index.spec.ts`
Expected: FAIL — testids `admin-all-hero`, `admin-category-card-*`, `admin-new-category-tile` don't exist on the current `/admin` (which still renders the old grid via `AdminPoolView`).

- [ ] **Step 3: Create `app/admin/NewCategoryForm.tsx` (stub)**

```tsx
'use client';

/**
 * Stub. Real implementation lands in Task 4. Index page mounts this
 * to satisfy the "+ 新分类" tile testid; Task 4 wires it to the API.
 */
export function NewCategoryForm() {
  return (
    <button
      type="button"
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        borderStyle: 'dashed',
        minHeight: 120,
        color: 'var(--ink-mute)',
        background: 'transparent',
      }}
      disabled
      data-testid="admin-new-category-tile"
    >
      + 新分类 (todo)
    </button>
  );
}
```

- [ ] **Step 4: Rewrite `app/admin/page.tsx`**

```tsx
import { requireAdmin } from '@/lib/admin-auth';
import { adminClient } from '@/lib/supabase/server';
import { NewCategoryForm } from './NewCategoryForm';

export const dynamic = 'force-dynamic';

export default async function AdminIndex() {
  await requireAdmin();
  const supabase = adminClient();

  // Two queries in parallel: categories (for ordering + completeness) and a
  // newest-first stream of (category, video_id) we aggregate in JS to
  // produce per-category counts + the most recent video_id as a sample.
  const [catsRes, vidsRes] = await Promise.all([
    supabase
      .from('categories')
      .select('slug, display_order')
      .eq('is_active', true)
      .order('display_order'),
    supabase
      .from('video_pool')
      .select('category, video_id')
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
  ]);

  const categories = catsRes.data ?? [];
  const vids = vidsRes.data ?? [];

  const counts = new Map<string, number>();
  const samples = new Map<string, string>();
  for (const r of vids) {
    counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    if (!samples.has(r.category)) samples.set(r.category, r.video_id);
  }
  const total = vids.length;
  const heroSample = vids[0]?.video_id ?? null;

  return (
    <main className="app">
      <div className="pad pad-top">
        <div className="eyebrow">🛡️ admin</div>
        <div className="display mt-4" style={{ fontSize: 26 }}>
          video pool
        </div>

        {/* Hero: all videos */}
        <a
          href="/admin/all"
          className="card card-hl mt-16"
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            textDecoration: 'none',
            color: 'inherit',
          }}
          data-testid="admin-all-hero"
        >
          <div
            style={{
              width: 60,
              height: 80,
              flexShrink: 0,
              background: 'var(--bg-2)',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            {heroSample && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/admin/video-pool/thumbnail/${heroSample}`}
                alt=""
                referrerPolicy="no-referrer"
                loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </div>
          <div>
            <div className="eyebrow">全部</div>
            <div className="display" style={{ fontSize: 22 }}>
              {total} 条
            </div>
          </div>
        </a>

        {/* Category grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 12,
            marginTop: 16,
          }}
          data-testid="admin-category-grid"
        >
          {categories.map((c) => {
            const sample = samples.get(c.slug);
            const count = counts.get(c.slug) ?? 0;
            return (
              <a
                key={c.slug}
                href={`/admin/${encodeURIComponent(c.slug)}`}
                className="card"
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  color: 'inherit',
                  padding: 8,
                }}
                data-testid={`admin-category-card-${c.slug}`}
              >
                <div
                  style={{
                    aspectRatio: '9 / 16',
                    background: 'var(--bg-2)',
                    borderRadius: 6,
                    overflow: 'hidden',
                    marginBottom: 6,
                  }}
                >
                  {sample ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/admin/video-pool/thumbnail/${sample}`}
                      alt=""
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
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
                      (空)
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.slug}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
                  {count} 条
                </div>
              </a>
            );
          })}

          <NewCategoryForm />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Delete `app/admin/AdminPoolView.tsx`**

Run:

```bash
rm app/admin/AdminPoolView.tsx
```

- [ ] **Step 6: Update `tests/admin-pool.spec.ts` for new paths**

Replace the entire contents of `tests/admin-pool.spec.ts` with:

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

test('admin pool: each category page shows only its own videos', async ({
  page,
}) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });

  await page.goto('/admin/喜剧');
  await expect(page.getByTestId('admin-video-grid')).toBeVisible();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[0]}`)).toBeVisible();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[1]}`)).toBeVisible();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[2]}`)).toHaveCount(0);

  await page.goto('/admin/动物');
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[2]}`)).toBeVisible();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[0]}`)).toHaveCount(0);
});

test('admin pool: soft delete removes card and persists across reload', async ({
  page,
}) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });

  await page.goto('/admin/喜剧');

  const patchResponse = page.waitForResponse(
    (res) =>
      res.url().includes('/api/admin/video-pool/') && res.request().method() === 'PATCH'
  );
  await page.getByTestId(`admin-video-delete-${TEST_VIDEO_IDS[0]}`).click();
  const response = await patchResponse;
  expect(response.status()).toBe(200);

  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[0]}`)).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[0]}`)).toHaveCount(0);
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[1]}`)).toBeVisible();
});
```

- [ ] **Step 7: Run all admin specs**

Run: `npx playwright test tests/admin-`
Expected: all admin specs (admin-pool, admin-index, admin-routes, admin-unlock, admin-guard, admin-swipe) pass.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add app/admin/page.tsx app/admin/NewCategoryForm.tsx \
        tests/admin-index.spec.ts tests/admin-pool.spec.ts
git rm app/admin/AdminPoolView.tsx
git commit -m "feat(admin): /admin is now a category index; drill in for grids"
```

---

### Task 4: `NewCategoryForm` + `POST /api/admin/categories`

**Files:**
- Create: `app/api/admin/categories/route.ts`
- Modify: `app/admin/NewCategoryForm.tsx` (replace stub with real impl)
- Test: `tests/admin-add-category.spec.ts`

- [ ] **Step 1: Write failing test `tests/admin-add-category.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env not set');

const TEST_SLUG = `__test_${Math.random().toString(36).slice(2, 8)}`;

test.afterEach(async () => {
  const a = admin();
  await a.from('categories').delete().eq('slug', TEST_SLUG);
});

test('admin: create new category from /admin index', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin');

  await page.getByTestId('admin-new-category-tile').click();
  await page.getByTestId('admin-new-category-input').fill(TEST_SLUG);
  await page.getByTestId('admin-new-category-submit').click();

  await expect(page.getByTestId(`admin-category-card-${TEST_SLUG}`)).toBeVisible();
});

test('admin: rejects duplicate category slug', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin');

  await page.getByTestId('admin-new-category-tile').click();
  await page.getByTestId('admin-new-category-input').fill('喜剧');
  await page.getByTestId('admin-new-category-submit').click();

  await expect(page.getByTestId('admin-new-category-error')).toContainText('已经存在');
});

test('admin: rejects reserved slug "all"', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin');

  await page.getByTestId('admin-new-category-tile').click();
  await page.getByTestId('admin-new-category-input').fill('all');
  await page.getByTestId('admin-new-category-submit').click();

  await expect(page.getByTestId('admin-new-category-error')).toContainText('保留字');
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx playwright test tests/admin-add-category.spec.ts`
Expected: FAIL — clicking the (disabled stub) tile does nothing; the input testid doesn't exist.

- [ ] **Step 3: Create `app/api/admin/categories/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { checkAdminForApi } from '@/lib/admin-auth';

const Body = z.object({ slug: z.string() });

export async function POST(req: Request) {
  const admin = await checkAdminForApi();
  if (!admin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let parsed: { slug: string };
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }

  const slug = parsed.slug.trim();
  if (slug.length === 0) {
    return NextResponse.json({ error: 'empty' }, { status: 400 });
  }
  if (slug.length > 30) {
    return NextResponse.json({ error: 'too_long' }, { status: 400 });
  }
  if (slug === 'all') {
    return NextResponse.json({ error: 'reserved' }, { status: 400 });
  }

  const sb = adminClient();

  const { data: existing } = await sb
    .from('categories')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'duplicate' }, { status: 409 });
  }

  const { data: maxRow } = await sb
    .from('categories')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const display_order = (maxRow?.display_order ?? 0) + 1;

  const { data: inserted, error } = await sb
    .from('categories')
    .insert({ slug, display_order })
    .select('slug, display_order')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(inserted);
}
```

- [ ] **Step 4: Replace `app/admin/NewCategoryForm.tsx` with real implementation**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function NewCategoryForm() {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const submit = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: slug.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const msg =
          body.error === 'duplicate'
            ? `「${slug.trim()}」已经存在了`
            : body.error === 'reserved'
            ? '`all` 是保留字,换一个'
            : body.error === 'too_long'
            ? 'slug 太长(最多 30 字)'
            : body.error === 'empty'
            ? 'slug 不能空'
            : '出错了,稍后再试';
        setError(msg);
        return;
      }
      setSlug('');
      setOpen(false);
      router.refresh();
    } catch {
      setError('网络出错');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          borderStyle: 'dashed',
          minHeight: 120,
          color: 'var(--ink-mute)',
          background: 'transparent',
        }}
        onClick={() => setOpen(true)}
        data-testid="admin-new-category-tile"
      >
        + 新分类
      </button>
    );
  }

  return (
    <div
      className="card col gap-8"
      style={{ padding: 8 }}
      data-testid="admin-new-category-form"
    >
      <input
        type="text"
        placeholder="分类名"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        disabled={submitting}
        style={{
          padding: 6,
          fontSize: 13,
          border: '1px solid #ddd',
          borderRadius: 4,
        }}
        data-testid="admin-new-category-input"
      />
      {error && (
        <div
          style={{ fontSize: 11, color: 'var(--bad)' }}
          data-testid="admin-new-category-error"
        >
          {error}
        </div>
      )}
      <div className="row gap-8">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setOpen(false);
            setSlug('');
            setError(null);
          }}
          disabled={submitting}
          style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
        >
          取消
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={submitting || !slug.trim()}
          style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
          data-testid="admin-new-category-submit"
        >
          {submitting ? '...' : '添加'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test, verify pass**

Run: `npx playwright test tests/admin-add-category.spec.ts`
Expected: 3/3 pass.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add app/api/admin/categories/route.ts app/admin/NewCategoryForm.tsx \
        tests/admin-add-category.spec.ts
git commit -m "feat(admin): create new category from index"
```

---

### Task 5: `NewVideoForm` + `POST /api/admin/video-pool`

**Files:**
- Create: `app/api/admin/video-pool/route.ts`
- Modify: `app/admin/NewVideoForm.tsx` (replace stub with real impl)
- Test: `tests/admin-add-video.spec.ts`

- [ ] **Step 1: Write failing test `tests/admin-add-video.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env not set');

// Stable public TikTok URL: Khaby Lame "peel a banana" — was in the
// pre-PR-#10 hardcoded FEED_VIDS list. Public, oembed reliably returns
// metadata. If TikTok ever pulls the video the test breaks; that's
// acceptable for an integration test that depends on real services.
const TEST_URL = 'https://www.tiktok.com/@khaby.lame/video/6950627842518568197';
const TEST_VIDEO_ID = '6950627842518568197';

test.beforeEach(async () => {
  const a = admin();
  await a.from('video_pool').delete().eq('video_id', TEST_VIDEO_ID);
});

test.afterEach(async () => {
  const a = admin();
  await a.from('video_pool').delete().eq('video_id', TEST_VIDEO_ID);
});

test('admin: add a video by URL on /admin/[slug]', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin/喜剧');

  await page.getByTestId('admin-new-video-trigger').click();
  await page.getByTestId('admin-new-video-input').fill(TEST_URL);
  await page.getByTestId('admin-new-video-submit').click();

  // Hits TikTok oembed → can take a few seconds.
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_ID}`)).toBeVisible({
    timeout: 15000,
  });

  await page.reload();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_ID}`)).toBeVisible({
    timeout: 15000,
  });
});

test('admin: rejects malformed URL with inline error', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin/喜剧');

  await page.getByTestId('admin-new-video-trigger').click();
  await page.getByTestId('admin-new-video-input').fill('not-a-url');
  await page.getByTestId('admin-new-video-submit').click();

  await expect(page.getByTestId('admin-new-video-error')).toContainText('URL 不对');
});

test('admin: rejects already-active duplicate', async ({ page }) => {
  // Seed the row as active first.
  const a = admin();
  await a.from('video_pool').insert({
    video_id: TEST_VIDEO_ID,
    source: 'tiktok',
    category: '喜剧',
    title: 'preseed',
    author: 'khaby.lame',
    thumbnail_url: null,
  });

  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin/动物');

  await page.getByTestId('admin-new-video-trigger').click();
  await page.getByTestId('admin-new-video-input').fill(TEST_URL);
  await page.getByTestId('admin-new-video-submit').click();

  await expect(page.getByTestId('admin-new-video-error')).toContainText('已经在');
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx playwright test tests/admin-add-video.spec.ts`
Expected: FAIL — the trigger button is disabled (stub), input testid doesn't exist.

- [ ] **Step 3: Create `app/api/admin/video-pool/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { checkAdminForApi } from '@/lib/admin-auth';
import { extractVideoId, buildVideoUrl } from '@/lib/tiktok-url';

const Body = z.object({ url: z.string(), category: z.string() });

export async function POST(req: Request) {
  const admin = await checkAdminForApi();
  if (!admin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let parsed: { url: string; category: string };
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }

  const ref = extractVideoId(parsed.url);
  if (!ref) {
    return NextResponse.json({ error: 'bad_url' }, { status: 400 });
  }

  // Re-fetch oembed for fresh title / thumbnail / author_name.
  const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(
    buildVideoUrl(ref)
  )}`;
  let oembedJson: {
    title?: string;
    thumbnail_url?: string;
    author_name?: string;
  };
  try {
    const r = await fetch(oembedUrl);
    if (!r.ok) {
      return NextResponse.json({ error: 'oembed_failed' }, { status: 422 });
    }
    oembedJson = await r.json();
  } catch {
    return NextResponse.json({ error: 'network' }, { status: 502 });
  }

  const sb = adminClient();

  // Reject if already active. Allow auto-revive if soft-deleted.
  const { data: existing } = await sb
    .from('video_pool')
    .select('id, is_active, category')
    .eq('video_id', ref.videoId)
    .maybeSingle();

  if (existing && existing.is_active) {
    return NextResponse.json(
      { error: 'already_active', category: existing.category },
      { status: 409 }
    );
  }

  const row = {
    video_id: ref.videoId,
    source: 'tiktok' as const,
    category: parsed.category,
    title: oembedJson.title ?? null,
    author: oembedJson.author_name ?? ref.author,
    thumbnail_url: oembedJson.thumbnail_url ?? null,
    is_active: true,
    scraped_at: new Date().toISOString(),
  };

  const { data: upserted, error } = await sb
    .from('video_pool')
    .upsert(row, { onConflict: 'video_id' })
    .select('id, video_id, source, category, title, author, thumbnail_url')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(upserted);
}
```

- [ ] **Step 4: Replace `app/admin/NewVideoForm.tsx` with real implementation**

```tsx
'use client';

import { useState } from 'react';
import type { AdminVideo } from './VideoCard';

export function NewVideoForm({
  category,
  onAdded,
}: {
  category: string;
  onAdded: (video: AdminVideo) => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/video-pool', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), category }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          category?: string;
        };
        const msg =
          body.error === 'bad_url'
            ? 'URL 不对,得是 https://www.tiktok.com/@x/video/N 这种'
            : body.error === 'oembed_failed'
            ? '嵌入失败 — 视频可能被删了或设了隐私'
            : body.error === 'already_active'
            ? `这条已经在「${body.category ?? category}」里了`
            : body.error === 'network'
            ? 'TikTok 暂时不通,稍后再试'
            : '出错了,稍后再试';
        setError(msg);
        return;
      }
      const newVideo = (await res.json()) as AdminVideo;
      onAdded(newVideo);
      setUrl('');
      setOpen(false);
    } catch {
      setError('网络出错');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpen(true)}
        style={{
          alignSelf: 'flex-start',
          fontSize: 12,
          padding: '6px 12px',
        }}
        data-testid="admin-new-video-trigger"
      >
        + 加视频
      </button>
    );
  }

  return (
    <div
      className="card col gap-8"
      style={{ padding: 12 }}
      data-testid="admin-new-video-form"
    >
      <input
        type="text"
        placeholder="https://www.tiktok.com/@x/video/N"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={submitting}
        style={{
          padding: 8,
          fontSize: 13,
          border: '1px solid #ddd',
          borderRadius: 4,
        }}
        data-testid="admin-new-video-input"
      />
      {error && (
        <div
          style={{ fontSize: 11, color: 'var(--bad)' }}
          data-testid="admin-new-video-error"
        >
          {error}
        </div>
      )}
      <div className="row gap-8">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setOpen(false);
            setUrl('');
            setError(null);
          }}
          disabled={submitting}
          style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
        >
          取消
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={submitting || !url.trim()}
          style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
          data-testid="admin-new-video-submit"
        >
          {submitting ? '正在添加...' : '添加'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test, verify pass**

Run: `npx playwright test tests/admin-add-video.spec.ts`
Expected: 3/3 pass. The happy-path test makes a real TikTok oembed call; allow up to 15s.

- [ ] **Step 6: Run full admin suite**

Run: `npx playwright test tests/admin-`
Expected: all admin specs pass (admin-pool, admin-index, admin-routes, admin-unlock, admin-guard, admin-swipe, admin-add-category, admin-add-video).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add app/api/admin/video-pool/route.ts app/admin/NewVideoForm.tsx \
        tests/admin-add-video.spec.ts
git commit -m "feat(admin): add video by TikTok URL on category page"
```

---

## Verification (after all 5 tasks)

Run the full Playwright suite to confirm no regressions:

Run: `npx playwright test`
Expected: all specs pass (existing + 4 new admin specs).

Manual sanity check on the running dev server:

1. `pnpm dev` and visit `http://localhost:3000/admin/unlock` → unlock with `ADMIN_PASSWORD`
2. `/admin` shows the index — hero card + 12 category cards + new-tile
3. Click `+ 新分类`, enter a slug (`__sanity_test`), submit → new card appears
4. Click the new card → empty category page, `+ 加视频` visible
5. Click back, click an existing category card → grid shows that category's videos + add-video form
6. Add a TikTok URL → card appears at the top of the grid
7. Click `🎬 审一遍` → swipe review still works
8. Cleanup: drop the test row from `categories` and `video_pool`
