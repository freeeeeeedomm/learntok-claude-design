# Admin Swipe Review Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen TikTok-style swipe review mode to `/admin`, coexisting with the grid, with a 🗑 button + 3-second undo toast for soft-deleting videos while reviewing.

**Architecture:** Three vertical slices (enter/navigate/exit → delete+undo UI → delete commit + end-of-list). New component `AdminSwipeView` owns the swipe UX; existing `AdminPoolView` adds a button and conditional render; existing `onDelete` handler is called via callback — no new backend, no schema changes, no new PATCH route.

**Tech Stack:** Next.js 14 client component · React hooks (`useState`, `useMemo`, `useRef`, `useEffect`, `useCallback`) · existing `VideoEmbed` · existing feed CSS classes (`.feed`, `.feed-video`, `.feed-swipe-overlay`, `.feed-slide-up`, `.feed-slide-down`) · Playwright.

**Spec:** `docs/superpowers/specs/2026-04-24-admin-swipe-review-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `app/admin/AdminSwipeView.tsx` | Full-screen swipe review component: iframe + gesture + delete button + undo toast + progress pill + end card + exit button. Self-contained UI — no DB, no fetch. Receives data + callbacks via props. |
| `tests/admin-swipe.spec.ts` | Playwright spec: 3 tests covering enter/navigate/exit, delete+undo (no commit), delete+timeout (commit persists). |

### Modified files

| Path | Change |
|---|---|
| `app/admin/AdminPoolView.tsx` | Add `🎬 审一遍` button next to category tabs; add `swipeMode: boolean` state; when true, render `<AdminSwipeView>` instead of grid; pass filtered `videos` subset + `onDelete` handler as callbacks. |

### Reused (no changes)

| Path | Why |
|---|---|
| `components/feed/VideoEmbed.tsx` | Same dual-source iframe + autoplay unmute. |
| `app/api/admin/video-pool/[id]/route.ts` | Existing PATCH endpoint (admin-gated, service-role) handles the actual soft-delete. |
| `tests/helpers/session.ts` | `admin()` service-role helper for seeding/cleanup. |
| `app/globals.css` | `.feed` / `.feed-video` / `.feed-swipe-overlay` / `.feed-slide-up` / `.feed-slide-down` already exist. |

---

## Task 1: Enter / navigate / exit (vertical slice #1)

The first commit ends with a working swipe view that the admin can enter from the grid, see videos, swipe up/down between them, and exit back to the grid. No delete yet.

**Files:**
- Create: `app/admin/AdminSwipeView.tsx`
- Create: `tests/admin-swipe.spec.ts`
- Modify: `app/admin/AdminPoolView.tsx`

- [ ] **Step 1: Write the Playwright spec (failing test #1)**

Create `tests/admin-swipe.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { admin as svcAdmin } from './helpers/session';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env not set');

const TEST_VIDEO_IDS = [
  '4444444444000000001',
  '4444444444000000002',
  '4444444444000000003',
];

test.beforeEach(async () => {
  const a = svcAdmin();
  await a.from('video_pool').delete().in('video_id', TEST_VIDEO_IDS);
  await a.from('video_pool').insert([
    { video_id: TEST_VIDEO_IDS[0], source: 'tiktok', category: '喜剧', title: 'swipe-seed-1' },
    { video_id: TEST_VIDEO_IDS[1], source: 'tiktok', category: '喜剧', title: 'swipe-seed-2' },
    { video_id: TEST_VIDEO_IDS[2], source: 'tiktok', category: '喜剧', title: 'swipe-seed-3' },
  ]);
});

test.afterEach(async () => {
  const a = svcAdmin();
  await a.from('video_pool').delete().in('video_id', TEST_VIDEO_IDS);
});

test('admin swipe: enter → navigate → exit', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });

  await page.goto('/admin');
  await page.getByTestId('admin-tab-喜剧').click();
  await page.getByTestId('admin-review-enter').click();

  await expect(page.getByTestId('admin-swipe-view')).toBeVisible();
  await expect(page.getByTestId('admin-swipe-progress')).toContainText('喜剧 · 1/3');

  const src1 = await page
    .getByTestId('admin-swipe-current')
    .locator('iframe')
    .getAttribute('src');
  expect(src1).toContain('tiktok.com/player/v1/');

  // Wheel down → next video.
  await page.getByTestId('admin-swipe-overlay').hover();
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(400); // 300ms slide + commit margin
  await expect(page.getByTestId('admin-swipe-progress')).toContainText('喜剧 · 2/3');

  const src2 = await page
    .getByTestId('admin-swipe-current')
    .locator('iframe')
    .getAttribute('src');
  expect(src2).not.toBe(src1);

  // Past the 800ms throttle.
  await page.waitForTimeout(900);

  // Wheel up → back to first.
  await page.getByTestId('admin-swipe-overlay').hover();
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(400);
  await expect(page.getByTestId('admin-swipe-progress')).toContainText('喜剧 · 1/3');

  // Exit → back to grid.
  await page.getByTestId('admin-swipe-exit').click();
  await expect(page.getByTestId('admin-swipe-view')).toHaveCount(0);
  await expect(page.getByTestId('admin-video-grid')).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/admin-swipe.spec.ts`

Expected: FAIL with a timeout waiting for `admin-review-enter` — the button doesn't exist yet.

- [ ] **Step 3: Create `app/admin/AdminSwipeView.tsx` — skeleton + navigation**

```tsx
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { VideoEmbed } from '@/components/feed/VideoEmbed';
import type { AdminVideo } from './VideoCard';

export function AdminSwipeView({
  vids,
  categoryLabel,
  onExit,
  onCommitDelete,
}: {
  vids: AdminVideo[];
  categoryLabel: string;
  onExit: () => void;
  onCommitDelete: (id: string) => void;
}) {
  // Fixed snapshot of the list at mount. Denominator of the progress label
  // never changes mid-session — even when we soft-delete, the total stays
  // the same so "N/3" → "N/3" visually, not "N/2".
  const [originalVids] = useState<AdminVideo[]>(vids);

  // ID-based navigation (not index). Using ids avoids off-by-one bugs when
  // we filter out deleted videos from the navigable list.
  const [currentId, setCurrentId] = useState<string | null>(vids[0]?.id ?? null);

  // Committed (3s timer fired) soft-deletes. We track them locally so the
  // deleted video doesn't reappear when the user swipes back — the parent's
  // `videos` prop shrinks asynchronously and we can't rely on it alone.
  // (Task 1 declares the state; Task 3 wires the setter into the commit timer.)
  const [committedIds, setCommittedIds] = useState<Set<string>>(new Set());

  // Pending soft-delete — at most one at a time.
  // (Task 1 declares the shape; the 🗑 button + timer land in Tasks 2-3.)
  const [pendingDelete, setPendingDelete] = useState<{
    video: AdminVideo;
    timerId: ReturnType<typeof setTimeout>;
  } | null>(null);

  const [slideDirection, setSlideDirection] = useState<'none' | 'up' | 'down'>('none');
  const [overlayHidden, setOverlayHidden] = useState(false);

  const lastSwipeRef = useRef(0);
  const pointerStart = useRef<{ y: number; t: number } | null>(null);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingId = pendingDelete?.video.id ?? null;

  // Navigable = originalVids minus pending (temporary) and committed (permanent).
  // Used for swipe navigation and for the current-video lookup.
  const navigable = useMemo(
    () =>
      originalVids.filter(
        (v) => v.id !== pendingId && !committedIds.has(v.id)
      ),
    [originalVids, pendingId, committedIds]
  );

  const current = useMemo<AdminVideo | null>(
    () => navigable.find((v) => v.id === currentId) ?? null,
    [navigable, currentId]
  );

  // End-of-list: currentId doesn't point to anything navigable (either
  // navigable is empty, or we passed the last navigable video).
  const isAtEnd = !current;

  // Progress label uses originalVids for a fixed denominator. When at end,
  // show N/N so the user sees "fully reviewed."
  const progressLabel = useMemo(() => {
    const len = originalVids.length;
    if (len === 0) return `${categoryLabel} · 0/0`;
    if (!current) return `${categoryLabel} · ${len}/${len}`;
    const pos = originalVids.findIndex((v) => v.id === currentId) + 1;
    return `${categoryLabel} · ${pos}/${len}`;
  }, [categoryLabel, originalVids, current, currentId]);

  // Navigation — wheel + pointer. Same throttle + slide pattern as FeedPlayer,
  // but operates on the `navigable` list (skips pending + committed).
  const commitSwipe = useCallback(
    (direction: 1 | -1) => {
      const now = performance.now();
      if (now - lastSwipeRef.current < 800) return; // throttle
      lastSwipeRef.current = now;
      setSlideDirection(direction > 0 ? 'up' : 'down');
      setTimeout(() => {
        // Resolve the next currentId from the navigable list.
        if (currentId === null) {
          // At end. Swipe up = go back to last navigable. Swipe down = stay.
          if (direction < 0 && navigable.length > 0) {
            setCurrentId(navigable[navigable.length - 1].id);
          }
        } else {
          const visIdx = navigable.findIndex((v) => v.id === currentId);
          if (visIdx < 0) {
            // currentId no longer in navigable (e.g. someone deleted it
            // between render and this timer). Recover by landing on the
            // first remaining or at end.
            setCurrentId(navigable[0]?.id ?? null);
          } else {
            const next = navigable[visIdx + direction];
            if (next) {
              setCurrentId(next.id);
            } else if (direction > 0) {
              // Past end.
              setCurrentId(null);
            }
            // direction < 0 past start: stay put.
          }
        }
        setSlideDirection('none');
      }, 300);
    },
    [navigable, currentId]
  );

  const onOverlayWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (Math.abs(e.deltaY) < 30) return;
      commitSwipe(e.deltaY > 0 ? 1 : -1);
    },
    [commitSwipe]
  );

  const onOverlayPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    pointerStart.current = { y: e.clientY, t: performance.now() };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, []);

  const onOverlayPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = pointerStart.current;
      pointerStart.current = null;
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer may have been cancelled
      }
      if (!start) return;
      const dy = e.clientY - start.y;
      const dt = performance.now() - start.t;

      // Tap = hide overlay for 4 s so the user can tap TikTok's native UI.
      if (Math.abs(dy) < 6 && dt < 250) {
        setOverlayHidden(true);
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = setTimeout(() => setOverlayHidden(false), 4000);
        return;
      }

      // Swipe.
      if (Math.abs(dy) > 50 && dt > 50) {
        commitSwipe(dy < 0 ? 1 : -1);
      }
    },
    [commitSwipe]
  );

  // Exit with a pending-delete flush (Task 3 will wire commit;
  // in Task 1 pending is always null so this is effectively just onExit).
  const handleExit = () => {
    if (pendingDelete) {
      clearTimeout(pendingDelete.timerId);
      onCommitDelete(pendingDelete.video.id);
      setPendingDelete(null);
    }
    onExit();
  };

  return (
    <div className="feed" data-testid="admin-swipe-view">
      <div
        className={`feed-video ${slideDirection !== 'none' ? `feed-slide-${slideDirection}` : ''}`}
        data-testid="admin-swipe-current"
      >
        {current ? (
          <VideoEmbed source={current.source} videoId={current.video_id} fillHeight />
        ) : null}
      </div>

      {!overlayHidden && current && (
        <div
          className="feed-swipe-overlay"
          onWheel={onOverlayWheel}
          onPointerDown={onOverlayPointerDown}
          onPointerUp={onOverlayPointerUp}
          onPointerCancel={() => {
            pointerStart.current = null;
          }}
          data-testid="admin-swipe-overlay"
        />
      )}

      {/* Top bar: ✕ left / progress center / (🗑 right lands in Task 2) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: 'calc(env(safe-area-inset-top, 0px) + 12px) 12px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 25,
          pointerEvents: 'none',
        }}
      >
        <button
          type="button"
          onClick={handleExit}
          data-testid="admin-swipe-exit"
          aria-label="exit review mode"
          style={{
            pointerEvents: 'auto',
            width: 40,
            height: 40,
            borderRadius: 999,
            border: 'none',
            background: 'rgba(0,0,0,0.45)',
            color: '#fff',
            fontSize: 18,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
        <div
          data-testid="admin-swipe-progress"
          style={{
            pointerEvents: 'auto',
            background: 'rgba(0,0,0,0.45)',
            color: '#fff',
            padding: '6px 12px',
            borderRadius: 999,
            fontFamily: 'var(--mono)',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {progressLabel}
        </div>
        <div style={{ width: 40, height: 40 }} /> {/* placeholder — 🗑 in Task 2 */}
      </div>

      {/* End-of-list card (shown when isAtEnd) — wired in Task 3. Task 1 is a no-op path. */}
      {isAtEnd && (
        <div
          data-testid="admin-swipe-empty"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
            color: '#fff',
            textAlign: 'center',
            zIndex: 30,
          }}
        >
          <div>
            <div className="display" style={{ fontSize: 24, fontFamily: 'var(--serif)' }}>
              审完了 🎉
            </div>
            <div className="body mt-8" style={{ color: '#d6d3cf' }}>
              这个分类全看过一遍
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              onClick={handleExit}
            >
              回列表
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Modify `app/admin/AdminPoolView.tsx` — add button + swipeMode + conditional render**

Open `app/admin/AdminPoolView.tsx`. Two changes:

**Change 1 — add import + state.** Near the top (after existing imports and useState hooks), add:

```tsx
import { AdminSwipeView } from './AdminSwipeView';
```

Inside the component body, add `swipeMode` to the existing state declarations:

```tsx
const [swipeMode, setSwipeMode] = useState(false);
```

**Change 2 — add button next to tabs + conditional render.**

Find the tab row. The existing structure is roughly:

```tsx
<div className="col gap-16 mt-16">
  <div
    className="row gap-8"
    style={{ overflowX: 'auto', paddingBottom: 4 }}
    data-testid="admin-category-tabs"
  >
    <CategoryTab slug={ALL} ... />
    {categories.map(...)}
  </div>
  ...
</div>
```

Wrap the existing tab row and a new review button in a flex container so the button sits on the right. Replace the top-level `<div className="col gap-16 mt-16">` block (the entire outer return) with the version below. Note: the first child of this outer `<div>` is now a `{swipeMode ? <AdminSwipeView /> : <normal grid markup>}` conditional — the swipe view completely replaces the grid markup when active.

Full new return:

```tsx
  return (
    <div className="col gap-16 mt-16">
      {swipeMode ? (
        <AdminSwipeView
          vids={filtered}
          categoryLabel={activeCat === ALL ? '全部' : activeCat}
          onExit={() => setSwipeMode(false)}
          onCommitDelete={onDelete}
        />
      ) : (
        <>
          <div
            className="row"
            style={{ gap: 8, alignItems: 'center' }}
          >
            <div
              className="row gap-8"
              style={{ overflowX: 'auto', paddingBottom: 4, flex: 1 }}
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
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setSwipeMode(true)}
              disabled={filtered.length === 0}
              data-testid="admin-review-enter"
              style={{
                fontSize: 12,
                padding: '6px 12px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              🎬 审一遍
            </button>
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
        </>
      )}
    </div>
  );
```

- [ ] **Step 5: tsc check**

Run: `npx tsc --noEmit`

Expected: zero errors.

If there's a type error on `type { AdminVideo }` import in AdminSwipeView (e.g. the type isn't exported from `./VideoCard`), check that `app/admin/VideoCard.tsx` still has `export interface AdminVideo { ... }`. It should — that export was added in Phase 5 Task 3 and hasn't been removed. If it was somehow changed to a non-exported type, re-export it with `export`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx playwright test tests/admin-swipe.spec.ts`

Expected: 1 passed ("admin swipe: enter → navigate → exit").

If it fails:
- `admin-review-enter` not found → check Step 4 put the button in the right outer flex container
- `admin-swipe-view` not visible → check the conditional render in Step 4
- Progress label wrong (`喜剧 · 0/3` or similar) → check `progressLabel` uses `findIndex + 1` not just `index + 1`
- Iframe src not changing on wheel → check `commitSwipe` is wired to `onOverlayWheel` and `setCurrentId` advances to the next navigable id

- [ ] **Step 7: Commit**

```bash
git add app/admin/AdminSwipeView.tsx app/admin/AdminPoolView.tsx tests/admin-swipe.spec.ts
git commit -m "$(cat <<'EOF'
feat(admin): swipe review mode — enter/navigate/exit

First vertical slice of the TikTok-style admin review: a new full-screen
AdminSwipeView component that the grid can switch to via a '🎬 审一遍'
button next to the category tabs. Wheel or pointer swipes navigate
between videos in the filtered list (throttled + sliding same as
FeedPlayer). ✕ exits back to the grid. No delete button yet — that
lands in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Delete button + undo toast (no commit yet)

Adds the 🗑 button and the undo toast. Clicking 🗑 marks a pending delete, advances to the next video, shows the toast. Clicking undo within 3 s clears the pending state. The actual PATCH commit lands in Task 3 — Task 2's spec verifies that the DB is UNCHANGED after undo.

**Files:**
- Modify: `app/admin/AdminSwipeView.tsx`
- Modify: `tests/admin-swipe.spec.ts` (add test #2)

- [ ] **Step 1: Add failing test #2**

Append to `tests/admin-swipe.spec.ts` (below the first test):

```ts
test('admin swipe: delete + undo within 3s → DB unchanged', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });

  await page.goto('/admin');
  await page.getByTestId('admin-tab-喜剧').click();
  await page.getByTestId('admin-review-enter').click();

  // Confirm we're on video 1/3.
  await expect(page.getByTestId('admin-swipe-progress')).toContainText('喜剧 · 1/3');

  // Click delete — toast appears, progress advances.
  await page.getByTestId('admin-swipe-delete').click();
  await expect(page.getByTestId('admin-swipe-undo')).toBeVisible();
  await expect(page.getByTestId('admin-swipe-progress')).toContainText('喜剧 · 2/3');

  // Click undo inside the 3s window.
  await page.getByTestId('admin-swipe-undo').click();
  await expect(page.getByTestId('admin-swipe-undo')).toHaveCount(0);

  // Wait longer than what would have been the commit timer.
  await page.waitForTimeout(3500);

  // DB unchanged — all 3 rows still is_active = true.
  const a = svcAdmin();
  const { data: rows } = await a
    .from('video_pool')
    .select('video_id, is_active')
    .in('video_id', TEST_VIDEO_IDS);
  expect(rows?.length).toBe(3);
  expect(rows?.every((r) => r.is_active)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/admin-swipe.spec.ts`

Expected: test #1 still passes, test #2 FAILS with a timeout waiting for `admin-swipe-delete` (button doesn't exist yet).

- [ ] **Step 3: Add the 🗑 button, pending logic, and undo toast to `AdminSwipeView.tsx`**

Three edits in `app/admin/AdminSwipeView.tsx`.

**Edit 1 — add the `triggerDelete` callback and the undo handler, just after `commitSwipe`:**

Find the line:
```tsx
  const onOverlayWheel = useCallback(
```

**Immediately before** that line, insert:

```tsx
  const triggerDelete = useCallback(() => {
    if (!current || pendingDelete) return;
    const target = current;
    // Visually slide to the next video.
    setSlideDirection('up');
    const sliceTimer = setTimeout(() => {
      // Next video = the first video in `originalVids` AFTER target that
      // isn't already committed-deleted. (target is about to become pending;
      // we exclude it explicitly.)
      const targetOrigIdx = originalVids.findIndex((v) => v.id === target.id);
      let nextId: string | null = null;
      for (let i = targetOrigIdx + 1; i < originalVids.length; i++) {
        const v = originalVids[i];
        if (v.id !== target.id && !committedIds.has(v.id)) {
          nextId = v.id;
          break;
        }
      }
      // If nothing forward, try backward (preserves the "always show
      // something if possible" UX; falling through to null lands on end card).
      if (nextId === null) {
        for (let i = targetOrigIdx - 1; i >= 0; i--) {
          const v = originalVids[i];
          if (v.id !== target.id && !committedIds.has(v.id)) {
            nextId = v.id;
            break;
          }
        }
      }
      setCurrentId(nextId);
      setSlideDirection('none');
    }, 300);

    // Kick off the 3-second commit timer. (Actual onCommitDelete call lands in Task 3.)
    const commitTimer = setTimeout(() => {
      setPendingDelete(null);
      // Task 3 will: setCommittedIds((s) => new Set(s).add(target.id)); onCommitDelete(target.id);
    }, 3000);

    setPendingDelete({ video: target, timerId: commitTimer });

    // Defensive cleanup — if component unmounts while slice is in flight.
    return () => clearTimeout(sliceTimer);
  }, [current, pendingDelete, originalVids, committedIds]);

  const cancelPendingDelete = useCallback(() => {
    if (!pendingDelete) return;
    clearTimeout(pendingDelete.timerId);
    setPendingDelete(null);
  }, [pendingDelete]);
```

**Edit 2 — replace the top-right placeholder with the real 🗑 button.**

Find:
```tsx
        <div style={{ width: 40, height: 40 }} /> {/* placeholder — 🗑 in Task 2 */}
```

Replace with:

```tsx
        <button
          type="button"
          onClick={triggerDelete}
          disabled={!current || !!pendingDelete}
          data-testid="admin-swipe-delete"
          aria-label="delete video"
          style={{
            pointerEvents: 'auto',
            width: 40,
            height: 40,
            borderRadius: 999,
            border: 'none',
            background: 'rgba(0,0,0,0.45)',
            color: 'var(--bad)',
            fontSize: 20,
            cursor: 'pointer',
            opacity: !current || !!pendingDelete ? 0.5 : 1,
          }}
        >
          🗑
        </button>
```

**Edit 3 — add the undo toast at the bottom of the `.feed` container.**

Find the closing `)}` of the `{isAtEnd && ...}` block (right before the final `</div>` that closes the outer `<div className="feed" ...>`). **Before** that final `</div>`, insert:

```tsx
      {pendingDelete && (
        <div
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
            display: 'flex',
            justifyContent: 'center',
            zIndex: 26,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              pointerEvents: 'auto',
              background: 'rgba(0,0,0,0.85)',
              color: '#fff',
              padding: '10px 16px',
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 13,
              boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
            }}
          >
            <span>已删除</span>
            <button
              type="button"
              onClick={cancelPendingDelete}
              data-testid="admin-swipe-undo"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--angel)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              撤回
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 4: tsc check**

Run: `npx tsc --noEmit`

Expected: zero errors.

- [ ] **Step 5: Run test to verify both tests pass**

Run: `npx playwright test tests/admin-swipe.spec.ts`

Expected: 2 passed.

If test #2 fails:
- `admin-swipe-delete` not found → check Edit 2 replaced the placeholder correctly
- `admin-swipe-undo` not found → check Edit 3 inserted the toast JSX before the closing `</div>`
- Progress still shows `1/3` after click → `triggerDelete` didn't advance `setCurrentId`; check the `setCurrentId(nextId)` inside the sliceTimer body
- DB rows show `is_active = false` unexpectedly → Task 2 should NOT call `onCommitDelete`. Double-check the commitTimer body: `setPendingDelete(null); // Task 3 will: call onCommitDelete(target.id) here.` — nothing else should be in there.

- [ ] **Step 6: Commit**

```bash
git add app/admin/AdminSwipeView.tsx tests/admin-swipe.spec.ts
git commit -m "$(cat <<'EOF'
feat(admin): swipe review — delete button + undo toast (no commit yet)

Clicking 🗑 marks the current video as pending-delete, slides to the
next one, and shows an undo toast. Clicking 撤回 within 3s clears the
pending state. The actual PATCH commit lands in the next commit —
this one only verifies the UI + state machine, not the DB.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Commit on timer + end-of-list + exit flush

Wires the actual PATCH commit: after 3 s, the pending video's id is passed to `onCommitDelete` (which AdminPoolView forwards to its existing `onDelete` handler — real PATCH, real optimistic grid update). Also polishes the end-of-list card behavior and the exit-flush guarantee.

**Files:**
- Modify: `app/admin/AdminSwipeView.tsx`
- Modify: `tests/admin-swipe.spec.ts` (add test #3)

- [ ] **Step 1: Add failing test #3**

Append to `tests/admin-swipe.spec.ts`:

```ts
test('admin swipe: delete + timeout → soft-delete persisted + grid shrinks', async ({
  page,
}) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });

  await page.goto('/admin');
  await page.getByTestId('admin-tab-喜剧').click();
  await page.getByTestId('admin-review-enter').click();

  // Identify which video is shown first (depends on created_at desc order,
  // which for the 3 beforeEach-inserted rows matches the insertion order's
  // reverse — the LAST inserted is newest = first. Don't assume, read from DOM.)
  const iframeSrc1 = await page
    .getByTestId('admin-swipe-current')
    .locator('iframe')
    .getAttribute('src');
  const deletedId = TEST_VIDEO_IDS.find((id) => iframeSrc1!.includes(id));
  expect(deletedId, 'iframe src should match one of the seeded video_ids').toBeTruthy();

  await page.getByTestId('admin-swipe-delete').click();
  await expect(page.getByTestId('admin-swipe-undo')).toBeVisible();

  // Past the 3s commit window.
  await page.waitForTimeout(3500);

  // Toast gone, PATCH fired.
  await expect(page.getByTestId('admin-swipe-undo')).toHaveCount(0);

  // Verify DB: deleted row is now is_active = false.
  const a = svcAdmin();
  const { data: row } = await a
    .from('video_pool')
    .select('is_active')
    .eq('video_id', deletedId!)
    .single();
  expect(row?.is_active).toBe(false);

  // Exit → grid should show only 2 cards (the other 2 seeded rows).
  await page.getByTestId('admin-swipe-exit').click();
  await expect(page.getByTestId('admin-swipe-view')).toHaveCount(0);
  await expect(page.getByTestId(`admin-video-card-${deletedId}`)).toHaveCount(0);

  const otherIds = TEST_VIDEO_IDS.filter((id) => id !== deletedId);
  for (const id of otherIds) {
    await expect(page.getByTestId(`admin-video-card-${id}`)).toBeVisible();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/admin-swipe.spec.ts`

Expected: tests #1 and #2 still pass. Test #3 FAILS at `expect(row?.is_active).toBe(false)` — Task 2's commit timer doesn't call `onCommitDelete`, so the DB stays unchanged.

- [ ] **Step 3: Wire `onCommitDelete` into the commit timer**

In `app/admin/AdminSwipeView.tsx`, find the `triggerDelete` body from Task 2:

```tsx
    // Kick off the 3-second commit timer. (Actual onCommitDelete call lands in Task 3.)
    const commitTimer = setTimeout(() => {
      setPendingDelete(null);
      // Task 3 will: setCommittedIds((s) => new Set(s).add(target.id)); onCommitDelete(target.id);
    }, 3000);
```

Replace with:

```tsx
    // Kick off the 3-second commit timer — fires the real PATCH via parent,
    // and records the committed id locally so the user can't swipe back
    // into the deleted video even if the parent's prop hasn't re-propagated yet.
    const commitTimer = setTimeout(() => {
      setPendingDelete(null);
      setCommittedIds((s) => {
        const n = new Set(s);
        n.add(target.id);
        return n;
      });
      onCommitDelete(target.id);
    }, 3000);
```

- [ ] **Step 4: Add the commit-on-exit flush**

Currently the `handleExit` function already has a flush block (Task 1 wrote it). Double-check it's still:

```tsx
  const handleExit = () => {
    if (pendingDelete) {
      clearTimeout(pendingDelete.timerId);
      onCommitDelete(pendingDelete.video.id);
      setPendingDelete(null);
    }
    onExit();
  };
```

This stays — no change. If it isn't exactly that, fix it to match.

- [ ] **Step 5: Add a useEffect unmount cleanup as a backstop**

Right after the `overlayTimerRef` ref declaration (near the top of the component body), the existing refs end like this:

```tsx
  const lastSwipeRef = useRef(0);
  const pointerStart = useRef<{ y: number; t: number } | null>(null);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Below that, add a `useEffect` cleanup that flushes on unmount:

```tsx
  // Backstop: if the component unmounts for any reason (route change,
  // parent-driven rerender, etc.) while a delete is pending, still commit
  // the PATCH so the optimistic UI doesn't lie about what was "deleted".
  // Parent's onDelete dedupes via deletingIds.has(id), so double-calling
  // (exit button + unmount) is safe.
  useEffect(() => {
    return () => {
      if (pendingDelete) {
        clearTimeout(pendingDelete.timerId);
        onCommitDelete(pendingDelete.video.id);
      }
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
      }
    };
    // Intentionally depend on pendingDelete so the cleanup sees the latest
    // value, not a stale closure.
  }, [pendingDelete, onCommitDelete]);
```

This requires `useEffect` to be in the React imports. Open the top of `AdminSwipeView.tsx` and check the import line. If it's currently:

```tsx
import { useCallback, useMemo, useRef, useState } from 'react';
```

Add `useEffect`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
```

- [ ] **Step 6: tsc check**

Run: `npx tsc --noEmit`

Expected: zero errors.

- [ ] **Step 7: Run all admin tests to verify**

Run: `npx playwright test tests/admin-swipe.spec.ts tests/admin-pool.spec.ts tests/admin-unlock.spec.ts tests/admin-guard.spec.ts`

Expected: 3 + 2 + 2 + 3 = **10 passed**.

If test #3 still fails:
- `is_active` still true → check Step 3 replaced the commit-timer body correctly (must call `onCommitDelete(target.id)`)
- Grid card still shows → after `handleExit`, parent's `onDelete` handler optimistically removes from `videos` state. If it doesn't, the PATCH succeeded but the grid didn't re-fetch. Check that `onCommitDelete` is bound to `onDelete` in the parent (Task 1 Step 4 change 2 sets it).
- Tests #1 or #2 regressed → likely the useEffect cleanup is firing more than expected. Check the dependency array includes `pendingDelete` so the cleanup re-runs when pending is set/cleared, and doesn't accidentally commit on every render.

- [ ] **Step 8: Commit**

```bash
git add app/admin/AdminSwipeView.tsx tests/admin-swipe.spec.ts
git commit -m "$(cat <<'EOF'
feat(admin): swipe review — 3s commit + end-of-list + exit flush

Wires the pending-delete timer to call onCommitDelete (parent's existing
optimistic soft-delete handler). Also adds a useEffect unmount cleanup
so that unexpected unmounts (route change, parent rerender) still flush
the pending PATCH. End-of-list card + handleExit flush were already
in place from Task 1. This closes the feature.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final Verification

After Task 3, run the entire test suite to confirm no cross-feature regressions:

```bash
npx playwright test
```

Expected: full suite green. The four admin specs (unlock, guard, pool, swipe) + all feed specs + sessions + topic + nav all pass.

Open PR or push preview — branch is `phase5-admin-pool`, now carrying both the admin-pool feature and the swipe review mode.
