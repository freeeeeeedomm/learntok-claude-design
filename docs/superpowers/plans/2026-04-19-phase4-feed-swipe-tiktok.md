# Phase 4: Feed Redesign — TikTok Content + Vertical Swipe + Angel Exit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the current YouTube-only button-based feed with a TikTok-content vertical-swipe feed. Keep the jar-balance ledger + heartbeat mechanics untouched. Replace the bottom "done now" button with an Angel-themed exit that ends the session and returns to `/home` directly.

**Architecture:**
- `<VideoEmbed />` is a new dual-source (TikTok/YouTube) iframe wrapper. TikTok uses the private `https://www.tiktok.com/player/v1/{id}?...` endpoint which supports URL params (autoplay, controls) + postMessage (`{ 'x-tiktok-player': true, type: 'unMute' }`). Browsers force-mute autoplay without user gesture; we send `unMute` after iframe load (+ 500ms / 1s / 2.5s / 5s fallback timers) to flip it on once playback starts.
- `<FeedPlayer />` renders exactly **one** `<VideoEmbed />` at a time (not a stack). An invisible overlay on top of the iframe captures swipe gestures (vertical): `onWheel` for desktop, Pointer Events for touch. Beyond a 50px / 400ms threshold in a given direction, the overlay triggers `setVidIdx(±1)` and animates a CSS `translateY` slide. Tap on the overlay hides it for 4s so the user can interact with TikTok's own controls (like / share), then it returns.
- Bottom `done now` button becomes `<AngelExit />`: full-width bar with `public/characters/angel.png` on the left + "回去学习" label. Tap → POST `/api/sessions/end` → `router.push('/home')`. No confirmation sheet (direct exit, per user preference).
- 18 curated public TikTok video IDs (from the learntok-v2 project's seed) populate `FEED_VIDS`, replacing the 5 YouTube IDs. Schema stays backward-compat: `{ id, source: 'tiktok' | 'youtube', caption }`.

**Tech Stack:** Next.js 14 client component, TikTok `/player/v1/` iframe endpoint, Pointer Events, CSS transforms, Playwright.

**Spec reference:** `docs/superpowers/specs/2026-04-19-topic-hierarchy-and-nibs-ball-design.md` Phase 4 section — but superseded by this plan where they conflict (specifically: this plan uses single-iframe + swipe per learntok-v2's learnings, not scroll-snap; and skips `<AngelHandle />` top-left handle in favor of a bottom Angel exit button since floating corner handles proved unreliable on mobile during Phase 3).

**Branch:** `redesign-phase4` (base: `01468bb` on `main`).

---

## File Structure

**New files:**
- `components/feed/VideoEmbed.tsx` — dual-source iframe with TikTok auto-unmute logic (~100 lines)
- `tests/feed-swipe-smoke.spec.ts` — wheel-driven swipe integration test

**Modified files:**
- `app/feed/FeedPlayer.tsx` — swap FEED_VIDS to TikTok, replace ↓next-button with swipe handler, replace done-now bar with Angel exit
- `app/globals.css` — append `.feed-swipe-overlay`, `.feed-slide-*`, `.angel-exit-bar` rules
- `tests/budget-feed-smoke.spec.ts` — update testid expectations for new angel exit button (rename from `feed-done` to `angel-exit`)

**Left untouched:**
- `/api/sessions/{start,end,heartbeat}` routes — same shape, same behavior
- Jar-balance trigger + `apply_heartbeat_delta` RPC — ledger mechanics unchanged
- `public/characters/nibs.png` — still used by Relax nav tab + /budget page
- `public/characters/angel.png` — now used by AngelExit bar at bottom of feed

---

### Task 1: `<VideoEmbed />` dual-source wrapper

**Files:**
- Create: `components/feed/VideoEmbed.tsx`

**Context:** We need an iframe component that handles both TikTok and YouTube. TikTok's public oEmbed gives only `<blockquote>`+JS markup, but the `/player/v1/{id}` endpoint is a real iframe with query params. TikTok player also speaks a postMessage protocol: `{ 'x-tiktok-player': true, type: 'unMute' }` flips audio on. Because browsers force-mute autoplay without user gesture, we queue `unMute` after iframe load + at 500ms / 1s / 2.5s / 5s. Once playback has started (any of those windows), the command takes effect.

For YouTube, we keep the standard `youtube.com/embed/{id}?enablejsapi=1&autoplay=0&rel=0` and let consumers control playback via the YT iframe API. (Feed only uses TikTok; YT support is kept for the `/add` page and future reuse.)

- [ ] **Step 1.1: Create `components/feed/VideoEmbed.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useRef } from 'react';

interface VideoEmbedProps {
  source: 'tiktok' | 'youtube';
  videoId: string;
  /** true = absolute-fill parent; false = aspect-ratio container that sizes from width. */
  fillHeight?: boolean;
}

/**
 * Dual-source video iframe.
 *
 * TikTok: uses the /player/v1/ endpoint (private, works in practice).
 * Supports autoplay via ?autoplay=1 but browsers force-mute autoplay without
 * user gesture, so we postMessage 'unMute' after iframe load with staggered
 * fallback timers.
 *
 * YouTube: standard /embed/ endpoint. Consumers control play/pause via the
 * YT iframe API (outside this component's scope).
 */
export function VideoEmbed({ source, videoId, fillHeight = false }: VideoEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sendTikTokCommand = useCallback((type: string, value?: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(
      { 'x-tiktok-player': true, type, ...(value !== undefined ? { value } : {}) },
      '*'
    );
  }, []);

  // Auto-unmute TikTok once player is ready. Browsers force-mute autoplay
  // without a user gesture; we send unMute after load + staggered retries.
  useEffect(() => {
    if (source !== 'tiktok') return;

    const onMessage = (e: MessageEvent) => {
      // Any message that looks like it came from the TikTok player = player is alive.
      if (
        e.data?.['x-tiktok-player'] ||
        (typeof e.data === 'string' && e.data.includes('tiktok'))
      ) {
        sendTikTokCommand('unMute');
      }
    };
    window.addEventListener('message', onMessage);

    const t1 = setTimeout(() => sendTikTokCommand('unMute'), 1000);
    const t2 = setTimeout(() => sendTikTokCommand('unMute'), 2500);
    const t3 = setTimeout(() => sendTikTokCommand('unMute'), 5000);

    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [source, videoId, sendTikTokCommand]);

  const containerStyle: React.CSSProperties = fillHeight
    ? { position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#000' }
    : {
        position: 'relative',
        width: '100%',
        paddingBottom: source === 'tiktok' ? '177.78%' : '56.25%', // 9:16 for TT, 16:9 for YT
        overflow: 'hidden',
        background: '#000',
      };

  const iframeSrc =
    source === 'tiktok'
      ? `https://www.tiktok.com/player/v1/${videoId}?autoplay=1&mute=0&controls=1&loop=0&music_info=0&description=0&rel=0`
      : `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0&rel=0`;

  const allowAttr =
    source === 'tiktok'
      ? 'autoplay; fullscreen'
      : 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

  return (
    <div style={containerStyle} data-testid="video-embed">
      <iframe
        ref={iframeRef}
        key={`${source}-${videoId}`}
        src={iframeSrc}
        title={`${source} video`}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
        allow={allowAttr}
        allowFullScreen
        onLoad={() => {
          if (source === 'tiktok') {
            // Eager first attempt — after iframe's initial JS has a chance to wire up listeners.
            setTimeout(() => sendTikTokCommand('unMute'), 500);
          }
        }}
      />
    </div>
  );
}
```

- [ ] **Step 1.2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 1.3: Commit**

```bash
git add components/feed/VideoEmbed.tsx
git commit -m "feat(feed): add VideoEmbed dual-source iframe (TikTok auto-unmute + YT)"
```

---

### Task 2: Swap FEED_VIDS to TikTok + wire VideoEmbed into FeedPlayer

**Files:**
- Modify: `app/feed/FeedPlayer.tsx`

**Context:** This task does NOT add swipe yet — just replaces the raw `<iframe>` with `<VideoEmbed />` and switches the 5 YouTube IDs to 18 TikTok IDs from the learntok-v2 seed. The `↓ next` button + `done now` bar still work exactly the same, so the existing `tests/budget-feed-smoke.spec.ts` still passes. Task 3 adds swipe; Task 4 replaces done-now with AngelExit.

- [ ] **Step 2.1: Update imports + FEED_VIDS + iframe replacement in `app/feed/FeedPlayer.tsx`**

Read the file first (it's ~218 lines). The changes are surgical:

1. Add import at top:
```tsx
import { VideoEmbed } from '@/components/feed/VideoEmbed';
```

2. Replace the `FEED_VIDS` constant with this 18-item TikTok list (taken from `learntok-v2/backend/scripts/seed_presets.py`, all public TikTok videos in entertainment categories):
```tsx
const FEED_VIDS: Array<{ id: string; source: 'tiktok' | 'youtube'; caption: string }> = [
  { id: '6862153058223197445', source: 'tiktok', caption: 'Bella Poarch — M to the B' },
  { id: '6950627842518568197', source: 'tiktok', caption: 'Khaby Lame — peel a banana' },
  { id: '6979606181463526661', source: 'tiktok', caption: 'Khaby Lame — wing mirror hack' },
  { id: '6932635718615338246', source: 'tiktok', caption: 'Sugar Crash parody' },
  { id: '6973813778597055749', source: 'tiktok', caption: 'pick-up line comedy' },
  { id: '7332342275151760642', source: 'tiktok', caption: 'Leah Halton — inverted lip sync' },
  { id: '7071079551756979483', source: 'tiktok', caption: 'MONA — singing performance' },
  { id: '7058186727248235782', source: 'tiktok', caption: 'Say It Right' },
  { id: '7028775404173413678', source: 'tiktok', caption: 'dog interaction' },
  { id: '6839416095586159878', source: 'tiktok', caption: 'cat pawing' },
  { id: '6975140587196517638', source: 'tiktok', caption: 'chipmunks eating nuts' },
  { id: '6768504823336815877', source: 'tiktok', caption: 'Zach King — magic broomstick' },
  { id: '6749520869598481669', source: 'tiktok', caption: 'Zach King — glass + cake' },
  { id: '6766278000783658245', source: 'tiktok', caption: 'Zach King — hiding spots' },
  { id: '6911406868699073798', source: 'tiktok', caption: 'mouth drawing art' },
  { id: '7065370017944063278', source: 'tiktok', caption: 'UP-themed 3D animation' },
  { id: '7332187682480590112', source: 'tiktok', caption: 'chocolate covered strawberries' },
  { id: '6894081763379924229', source: 'tiktok', caption: 'Billie Eilish — TimeWarp' },
];
```

3. Replace the `<div className="feed-video">...</div>` block (which currently hardcodes a `<iframe src={...youtube...}/>`) with:
```tsx
<div className="feed-video">
  <VideoEmbed source={vid.source} videoId={vid.id} fillHeight />
</div>
```

4. Remove the `@neverendingref` hardcoded user label — TikTok caption is enough:
- In the `.feed-overlay-info` block, delete the `<div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 600 }}>{vid.user}</div>` line. The `vid` type no longer has `.user`, so this enforces the cleanup.
- Keep the caption line: `<div style={{ fontSize: 13, marginTop: 4, opacity: 0.9 }}>{vid.caption}</div>`.

- [ ] **Step 2.2: Typecheck + run the existing budget-feed-smoke test**

```bash
npx tsc --noEmit
npx playwright test tests/budget-feed-smoke.spec.ts
```
Expected: 3 passing. The existing test flow (login → /budget → preset → start → lands on /feed → click feed-done) still works because we haven't touched those testids yet.

- [ ] **Step 2.3: Commit**

```bash
git add app/feed/FeedPlayer.tsx
git commit -m "feat(feed): swap 5 YT videos for 18 TikTok videos via VideoEmbed"
```

---

### Task 3: Swipe gesture (wheel + pointer) + slide animation

**Files:**
- Modify: `app/feed/FeedPlayer.tsx`
- Modify: `app/globals.css`

**Context:** Replace the `↓ next` button with an invisible overlay that captures vertical swipe gestures. Support:
- **Desktop**: `onWheel` — read `e.deltaY` > 30 = down, < -30 = up.
- **Mobile**: Pointer Events — `onPointerDown` records startY, `onPointerMove` tracks delta, `onPointerUp` commits if |deltaY| > 50 AND duration > 50ms (prevents accidental flicks).

On commit: set `slideDirection` state ('up' | 'down'), wait 300ms while CSS transforms slide the current slot off-screen, then `setVidIdx(±1)` and reset `slideDirection` to 'none'. The new video renders in place.

Tap-on-overlay is ambiguous (could be a small swipe or a "get out of my way, I want to click TikTok UI"). Resolve by: if `onPointerUp` finds |deltaY| < 6px, treat it as a tap → hide overlay for 4s (so user can click like/share in TikTok), then restore.

Also throttle: ignore new swipes within 800ms of the last one to avoid rapid-fire flicks.

Delete the `↓ next` button block (`<button ... data-testid="feed-next">↓</button>`) and its `nextVid` handler — overlay replaces them.

- [ ] **Step 3.1: Rewrite the relevant parts of `app/feed/FeedPlayer.tsx`**

Read the current file. Replace:

(a) The component-scope state + refs: add slide state, last-scroll-time, overlay-hidden state. Merge into the existing `useState` declarations near the top of `FeedPlayer`:

```tsx
const [slideDirection, setSlideDirection] = useState<'none' | 'up' | 'down'>('none');
const [overlayHidden, setOverlayHidden] = useState(false);
const lastSwipeRef = useRef(0);
const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const pointerStart = useRef<{ y: number; t: number } | null>(null);
```

(b) Delete this line (the `nextVid` handler):
```tsx
const nextVid = () => setVidIdx((i) => i + 1);
```

And add these handlers in its place:

```tsx
// Shared swipe commit: direction is +1 (next) or -1 (prev).
const commitSwipe = useCallback((direction: 1 | -1) => {
  const now = performance.now();
  if (now - lastSwipeRef.current < 800) return; // throttle
  lastSwipeRef.current = now;
  setSlideDirection(direction > 0 ? 'up' : 'down');
  setTimeout(() => {
    setVidIdx((i) => {
      if (direction < 0) return Math.max(0, i - 1);
      return i + 1; // modulo handled below via FEED_VIDS.length
    });
    setSlideDirection('none');
  }, 300);
}, []);

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
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    if (!start) return;
    const dy = e.clientY - start.y;
    const dt = performance.now() - start.t;

    // Tap (minimal movement, quick): hide overlay for 4s so user can click TikTok UI.
    if (Math.abs(dy) < 6 && dt < 250) {
      setOverlayHidden(true);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = setTimeout(() => setOverlayHidden(false), 4000);
      return;
    }

    // Swipe: |dy| > 50 AND duration > 50ms.
    if (Math.abs(dy) > 50 && dt > 50) {
      commitSwipe(dy < 0 ? 1 : -1); // swipe UP (finger moves up = dy negative) = next
    }
  },
  [commitSwipe]
);
```

(c) Delete the `↓ next` button block — this whole thing:

```tsx
<div className="feed-side">
  <button
    type="button"
    className="icon-btn"
    onClick={nextVid}
    aria-label="next video"
    data-testid="feed-next"
  >
    ↓
  </button>
</div>
```

(d) Add swipe overlay + slide wrapper around the video. Replace the current `<div className="feed-video">...</div>` with:

```tsx
<div
  className={`feed-video ${slideDirection !== 'none' ? `feed-slide-${slideDirection}` : ''}`}
>
  <VideoEmbed source={vid.source} videoId={vid.id} fillHeight />
</div>
{!overlayHidden && (
  <div
    className="feed-swipe-overlay"
    onWheel={onOverlayWheel}
    onPointerDown={onOverlayPointerDown}
    onPointerUp={onOverlayPointerUp}
    onPointerCancel={() => { pointerStart.current = null; }}
    data-testid="feed-swipe-overlay"
  />
)}
```

- [ ] **Step 3.2: Append CSS rules to `app/globals.css`**

Append to the end of the file:

```css
/* ===== Feed swipe + slide animation ===== */
.feed-swipe-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: transparent;
  touch-action: none;
  cursor: grab;
}

.feed-slide-up {
  animation: feed-slide-out-up 300ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

.feed-slide-down {
  animation: feed-slide-out-down 300ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes feed-slide-out-up {
  from { transform: translateY(0); }
  to   { transform: translateY(-100%); opacity: 0; }
}

@keyframes feed-slide-out-down {
  from { transform: translateY(0); }
  to   { transform: translateY(100%); opacity: 0; }
}
```

- [ ] **Step 3.3: Typecheck + manual smoke**

```bash
npx tsc --noEmit
npm run dev
```

Open http://localhost:3000/login, dev-login, navigate to Relax tab → /budget → pick 2m → start scrolling. Expected: one TikTok plays; wheel-down on trackpad advances to next with slide animation; wheel-up goes back; single click pauses overlay for 4s (you can click TikTok UI); after 4s, overlay returns.

- [ ] **Step 3.4: Commit**

```bash
git add app/feed/FeedPlayer.tsx app/globals.css
git commit -m "feat(feed): swipe gesture (wheel + pointer) replaces ↓next button"
```

---

### Task 4: AngelExit — replace "done now" with Angel-themed bottom bar

**Files:**
- Modify: `app/feed/FeedPlayer.tsx`
- Modify: `app/globals.css`

**Context:** Mirror the Nibs-at-/budget polish for the exit. Bottom full-width bar with Angel PNG (56px) on the left + "回去学习" label. Tapping it ends the feed session and navigates to `/home` directly — no confirmation sheet (per user's Q3=直接回 choice). This replaces the current plain "done now" button.

Keep `data-testid="angel-exit"` for the test suite to target. The underlying handler (`doneNow`) stays the same — only the JSX + className change.

- [ ] **Step 4.1: Replace the done-bar block in `app/feed/FeedPlayer.tsx`**

Replace this block:
```tsx
<div className="feed-done-bar">
  <button
    type="button"
    className="btn btn-primary"
    onClick={doneNow}
    disabled={submitting}
    data-testid="feed-done"
  >
    {submitting ? 'saving…' : 'done now'}
  </button>
</div>
```

With:
```tsx
<div className="angel-exit-bar">
  <button
    type="button"
    className="angel-exit-btn"
    onClick={doneNow}
    disabled={submitting}
    data-testid="angel-exit"
    aria-label="back to learning"
  >
    <Image
      src="/characters/angel.png"
      alt=""
      width={40}
      height={40}
      priority
      draggable={false}
    />
    <span className="angel-exit-label">
      {submitting ? 'saving…' : '回去学习'}
    </span>
  </button>
</div>
```

Also add to the imports at the top of the file:
```tsx
import Image from 'next/image';
```

- [ ] **Step 4.2: Append CSS rules to `app/globals.css`**

Append at the end:

```css
/* ===== Angel exit bar (feed bottom) ===== */
.angel-exit-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
  display: flex;
  justify-content: center;
  z-index: 25;
  pointer-events: none; /* only the button is tappable */
}

.angel-exit-btn {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px 10px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  border: none;
  color: #1a1a1a;
  font-size: 16px;
  font-weight: 600;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease;
}

.angel-exit-btn:active:not(:disabled) {
  transform: scale(0.96);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.angel-exit-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.angel-exit-btn img {
  display: block;
  width: 40px;
  height: 40px;
  object-fit: contain;
}

.angel-exit-label {
  letter-spacing: 0.02em;
}
```

- [ ] **Step 4.3: Typecheck + remove old `.feed-done-bar` CSS**

```bash
npx tsc --noEmit
grep -n "feed-done-bar" app/globals.css
```

If `grep` finds a `.feed-done-bar` rule block, delete it from `app/globals.css` (it's orphaned now). If not, skip.

- [ ] **Step 4.4: Commit**

```bash
git add app/feed/FeedPlayer.tsx app/globals.css
git commit -m "feat(feed): replace done-now with Angel exit bar (direct end+nav)"
```

---

### Task 5: Update + add Playwright tests

**Files:**
- Modify: `tests/budget-feed-smoke.spec.ts`
- Modify: `tests/nav-smoke.spec.ts`
- Create: `tests/feed-swipe-smoke.spec.ts`

**Context:** The rename `feed-done` → `angel-exit` breaks two existing tests that click the bottom button. Update their selector. Also add a new `feed-swipe-smoke.spec.ts` that drives the swipe via `page.mouse.wheel` (Playwright's mouse-wheel helper; the overlay's `onWheel` path is the desktop equivalent of touch swipe and the easiest to assert). Touch-swipe on a real phone stays manual.

- [ ] **Step 5.1: Update `tests/budget-feed-smoke.spec.ts`**

Replace every occurrence of `getByTestId('feed-done')` with `getByTestId('angel-exit')`. Specifically the first test (around line 15) that reads:
```ts
await page.getByTestId('feed-done').click();
```
becomes:
```ts
await page.getByTestId('angel-exit').click();
```

And the `try { await page.getByTestId('feed-done').click(); } catch {}` session-cleanup fallback near the end of each test — update to `getByTestId('angel-exit')` as well.

- [ ] **Step 5.2: Update `tests/nav-smoke.spec.ts` feed-hidden test**

The test around line 26 ("bottom nav hidden on /feed") has its own session cleanup:
```ts
try { await page.getByTestId('feed-done').click(); } catch {}
```
Rename to `angel-exit`.

- [ ] **Step 5.3: Create `tests/feed-swipe-smoke.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('feed swipe: wheel-down advances to next TikTok; wheel-up goes back', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  // Start a feed session via /budget → pick 2m → start.
  await page.goto('/budget');
  await page.getByTestId('budget-preset-120').click();
  await page.getByTestId('budget-start').click();
  await page.waitForURL(/\/feed\?session=/, { timeout: 10_000 });

  const embed = page.getByTestId('video-embed');
  const firstSrc = await embed.locator('iframe').getAttribute('src');
  expect(firstSrc).toContain('tiktok.com/player/v1/');

  // Overlay should be present — mouse-wheel down to advance.
  const overlay = page.getByTestId('feed-swipe-overlay');
  await expect(overlay).toBeVisible();
  await overlay.hover();
  await page.mouse.wheel(0, 200); // down = next

  // Slide animation is 300ms; wait a bit longer.
  await page.waitForTimeout(400);

  const secondSrc = await page.getByTestId('video-embed').locator('iframe').getAttribute('src');
  expect(secondSrc).not.toBe(firstSrc);
  expect(secondSrc).toContain('tiktok.com/player/v1/');

  // Wheel up — should return to first.
  await overlay.hover();
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(400);

  const backSrc = await page.getByTestId('video-embed').locator('iframe').getAttribute('src');
  expect(backSrc).toBe(firstSrc);

  // Clean up session.
  await page.getByTestId('angel-exit').click();
});

test('feed angel exit: click → end session → /home', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/budget');
  await page.getByTestId('budget-preset-120').click();
  await page.getByTestId('budget-start').click();
  await page.waitForURL(/\/feed\?session=/, { timeout: 10_000 });

  await page.getByTestId('angel-exit').click();
  await page.waitForURL('**/home', { timeout: 10_000 });
});

test('feed overlay tap hides for 4s (so TikTok UI is interactive)', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/budget');
  await page.getByTestId('budget-preset-120').click();
  await page.getByTestId('budget-start').click();
  await page.waitForURL(/\/feed\?session=/, { timeout: 10_000 });

  const overlay = page.getByTestId('feed-swipe-overlay');
  await expect(overlay).toBeVisible();
  await overlay.click(); // short pointer down+up = tap
  await expect(overlay).toHaveCount(0); // overlay unmounted
  // Wait 4.2s — overlay should come back.
  await page.waitForTimeout(4200);
  await expect(page.getByTestId('feed-swipe-overlay')).toBeVisible();

  // Clean up.
  await page.getByTestId('angel-exit').click();
});
```

- [ ] **Step 5.4: Run the new tests**

```bash
npx playwright test tests/feed-swipe-smoke.spec.ts
```
Expected: 3 passing. If the TikTok iframe takes too long to embed on slow CI (30s+), the first test may need a wait-for-selector tweak; first run locally before concluding.

- [ ] **Step 5.5: Commit**

```bash
git add tests/budget-feed-smoke.spec.ts tests/nav-smoke.spec.ts tests/feed-swipe-smoke.spec.ts
git commit -m "test(feed): swipe + angel-exit tests; rename feed-done → angel-exit"
```

---

### Task 6: Full suite green + PR

- [ ] **Step 6.1: Run the full suite**

```bash
npx playwright test
```
Expected: ~41 tests (38 existing - 2 renamed still counted + 3 new feed-swipe) all passing.

Failure modes to watch:
- TikTok iframes sometimes don't load on first CI run due to rate-limiting or region. If `feed-swipe-smoke` flakes, re-run once. If it still flakes, the swipe assertion may need to wait on the iframe's `src` attribute instead of network-ready state.
- `budget-feed-smoke` session-cleanup flow: make sure both tests use `angel-exit` not `feed-done`.

- [ ] **Step 6.2: Push + PR**

```bash
git push -u origin redesign-phase4
gh pr create --title "Phase 4: feed — TikTok content + vertical swipe + angel exit" --body "$(cat <<'EOF'
## Summary

- **`<VideoEmbed />`** — new dual-source iframe wrapper. TikTok uses `https://www.tiktok.com/player/v1/{id}?autoplay=1&mute=0&controls=1&...`. Auto-unmute via postMessage `{ 'x-tiktok-player': true, type: 'unMute' }` after iframe load + staggered fallback timers (browsers force-mute autoplay without user gesture).
- **Content**: 5 YT classics → 18 public TikTok videos (Khaby Lame, Zach King, Bella Poarch, etc). IDs from learntok-v2's seed_presets.py.
- **Swipe gesture**: invisible overlay on top of iframe. `onWheel` (desktop) + Pointer Events (mobile) detect vertical direction past a 50px/30deltaY threshold → triggers 300ms `translateY` slide-out → advances `vidIdx`. 800ms throttle between swipes. Tap on overlay (|dy|<6px, <250ms) hides it for 4s so the user can interact with TikTok's native UI.
- **Angel exit**: bottom pill button with \`public/characters/angel.png\` + "回去学习" label replaces the old "done now" button. Tap → POST /api/sessions/end → /home (no confirmation sheet, direct exit).
- **Removed**: ↓next button + feed-done testid.

## Deviations from the original Phase 4 spec

- **Single iframe + swipe**, not scroll-snap stack. Reason: learntok-v2's production code uses single-iframe (lighter, iOS Safari + scroll-snap + iframe has known jank per the original spec itself).
- **Bottom Angel exit bar**, not top-left AngelHandle. Reason: Phase 3 taught us floating corner handles are unreliable on mobile (edge gestures, tiny hit targets). A full-width bottom button is a safer mobile pattern.
- **No confirmation sheet** before exit. Simpler UX; user can still recover via Relax nav tab if they regret.

## Test plan

- [x] \`npx tsc --noEmit\` — 0 errors
- [x] \`npx playwright test\` — full suite green (existing renames + 3 new feed-swipe tests)
- [ ] Manual on phone via Vercel preview: TikTok autoplays unmuted; swipe up advances; tap pauses overlay 4s; angel exit → /home

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

1. **Spec coverage.** Phase 4 spec demands vertical swipe ✓ (via single-iframe + gesture), AngelHandle ✓ (as Angel exit bar, not corner floating — deliberate deviation documented), "↓ next" removal ✓, keep heartbeat/budget mechanics ✓.
2. **Placeholder scan.** No TBD / TODO. Every code block is pastable.
3. **Type consistency.** `FEED_VIDS` new shape `{ id, source, caption }` drops `user` field — cleanup enforced at Step 2.1. `VideoEmbedProps` interface exported from `components/feed/VideoEmbed.tsx` matches `app/feed/FeedPlayer.tsx` consumer site.
4. **File-path accuracy.** `components/feed/VideoEmbed.tsx` is a new subdir; the parent `components/feed/` exists currently only via `app/feed/` which is a separate thing. Create the dir automatically on first file write — no extra mkdir step needed with Next.js path alias `@/components/feed/VideoEmbed`.
5. **SSR safety.** `VideoEmbed` uses `'use client'` and only touches `window` inside `useEffect`. `FeedPlayer` already `'use client'`.
6. **iframe resource cost.** Only one `<iframe>` at a time (single slot). Slide animation is CSS-only; no double iframe during transition (the old slot animates out, then the new `vid.id` swap-in mounts a fresh iframe). Consequence: tiny flash between videos when the old one animates out and the new one boots. Acceptable for v1; could preload via a 2-slot carousel later.
7. **Gesture edge cases.** Pointer capture on `onPointerDown` → `onPointerUp` guarantees we see the up event even if the finger leaves the overlay. `onPointerCancel` resets state if the OS steals the gesture (e.g. iOS back-swipe from edge).
8. **Autoplay + unmute failure modes.** If `unMute` postMessage is lost (first videos in some regions), the video plays muted. User can click the TikTok player's mute icon directly (that's why we have the tap-to-hide-overlay escape hatch). Graceful degradation.
