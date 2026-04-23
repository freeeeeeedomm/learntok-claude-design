# Admin Swipe Review Mode — Design

## Problem

`/admin` currently shows the video pool as a grid of small 9:16 thumbnails. This is great for "find a specific video by thumbnail and delete it" but it's not great for "review all 360 videos one by one and decide which to keep." The thumbnails are too small to judge a video's vibe without clicking preview, and the grid layout makes reviewing a whole category feel like a chore.

For the actual scraping → curation workflow, the admin needs to go through the pool quickly, one full-size autoplay video at a time, and either (a) keep it or (b) kill it. TikTok's vertical swipe is the gold standard for that kind of review.

## Goal

Add a full-screen swipe-review mode to `/admin` that reuses the TikTok-like playback + gesture pattern from `/feed`, plus a single delete button with a 3-second undo toast.

Coexists with the grid — does not replace it.

## Non-Goals

- Replacing the grid view entirely.
- Keyboard shortcuts (can add later if useful; not blocking).
- Cross-category swipe (category is locked per session — change = exit → pick tab → re-enter).
- Bulk delete / multi-select.
- Undoable beyond 3 s (once the toast times out, the PATCH fires and it's a normal soft-delete that only comes back via re-scraping or direct DB edit).
- Starting from a specific video ("review from here"). Always starts from index 0 of the selected category.
- Position memory across sessions (always fresh start).

## Architecture

Three loosely-coupled additions, all on the frontend — no new backend routes, no schema changes:

1. **New: `app/admin/AdminSwipeView.tsx`** — client component owning the swipe UX (iframe via existing `VideoEmbed`, wheel + pointer gesture, delete button, undo toast, progress pill, exit button). Receives `vids: AdminVideo[]` + `categoryLabel: string` + `onExit()` + `onCommitDelete(id: string)` callbacks. Self-contained — doesn't know about Supabase, zod, or routing.
2. **Modified: `app/admin/AdminPoolView.tsx`** — adds `🎬 审一遍` button next to the category tabs; adds `swipeMode: boolean` state; when true, renders `<AdminSwipeView>` covering the grid. The existing optimistic-delete flow in AdminPoolView handles the real PATCH when the swipe view calls `onCommitDelete(id)` — we reuse the current handler, not reimplement it.
3. **Reused: existing building blocks** — `components/feed/VideoEmbed` for the iframe + autoplay unmute, `PATCH /api/admin/video-pool/[id]` for the soft-delete (already admin-gated), `tests/helpers/session.ts admin()` for test seeding.

## Data Flow

```
AdminPoolView (grid)
  ├─ state: videos, activeCat, deletingIds, swipeMode ← NEW
  ├─ grid view (unchanged)
  └─ on click "🎬 审一遍" → setSwipeMode(true)

AdminSwipeView (takes over when swipeMode = true)
  ├─ props: vids (filtered to activeCat), categoryLabel, onExit, onCommitDelete
  ├─ state: index, pendingDeleteId, slideDirection, overlayHidden
  ├─ renders VideoEmbed for vids[index]
  ├─ handles wheel/pointer swipe → index ± 1 (throttled 800 ms, slide 300 ms)
  ├─ on click 🗑 → pendingDeleteId = current.id, index++, 3 s timer
  │    ├─ if user clicks Undo within 3 s → clear timer, pendingDeleteId = null
  │    └─ if timer fires → onCommitDelete(pendingDeleteId), pendingDeleteId = null
  └─ on click ✕ → flush any pending delete, onExit()
```

Parent (`AdminPoolView`) is the single source of truth for `videos: AdminVideo[]`. Child (`AdminSwipeView`) receives the subset to review as a prop and calls back for commit/exit. When commit fires, AdminPoolView's existing optimistic delete handler runs, which is what the grid already uses.

This design keeps the swipe view pure UI — no DB access, no fetch calls. Easier to test, easier to replace, follows the same `(grid, list) → interactive view` pattern we used in `/feed` (server page fetches, client player renders).

## Components

### AdminSwipeView interface

```ts
export function AdminSwipeView({
  vids,
  categoryLabel,
  onExit,
  onCommitDelete,
}: {
  vids: AdminVideo[];            // subset to review, already filtered to the current tab
  categoryLabel: string;         // e.g. "喜剧" or "全部"
  onExit: () => void;            // called when user clicks ✕ or on end-of-list "回去"
  onCommitDelete: (id: string) => void; // called 3 s after click 🗑 (or on flush)
}): JSX.Element;
```

**Behavioral contract** (leave exact state shape to the plan):

- Maintains the original list length `N` as a fixed denominator for the "progress" label. Deletions don't shrink the denominator mid-session.
- Tracks which video is currently displayed (by id or index — plan's choice).
- Tracks at most one `pendingDelete` at a time: `{ video, timer }`.
- A pending-delete video is **excluded from navigation** (swipe up/down skips it) but **counted in the denominator** (so progress stays "2/3" after the first delete of 3, not "1/2").
- Slide animation state for the 300 ms transition.
- Overlay-hidden state for tap-to-hide (4 s, same as `FeedPlayer`).

**Refs (same pattern as `FeedPlayer`):**
- `lastSwipeRef` — `performance.now()` of last swipe, for the 800 ms throttle
- `pointerStart` — `{ y, t }` for swipe-vs-tap discrimination
- `overlayTimerRef` — timer for the 4 s overlay re-show
- `deleteTimerRef` — 3 s timer for the pending delete commit

### UI layout (full-screen overlay on top of the admin page)

```
┌────────────────────────────────────────────┐
│ [✕]              [喜剧 · 12/30]       [🗑] │  ← fixed overlay bar (top)
│                                            │
│                                            │
│              VideoEmbed                    │  ← 9:16 iframe, fills below the bar
│                                            │
│                                            │
│                                            │
│                [undo toast]                │  ← shown for 3 s after 🗑, bottom-center
└────────────────────────────────────────────┘
```

- **✕ button** (top-left, ~44 px tap target): `onClick={onExitWithFlush}`. Label: 12 px "×" in an icon-button.
- **Progress pill** (top-center): `{categoryLabel} · {index + 1}/{visibleVids.length}`. `display: none` when `isAtEnd`.
- **🗑 button** (top-right, ~44 px tap target, red accent color `var(--bad)`): `onClick={triggerDelete}`. Disabled while `pendingDeleteId !== null` (enforces one pending at a time — if user is fast-tapping, see "fast-tap semantics" below).
- **Swipe overlay** — transparent `feed-swipe-overlay`-style div covering the iframe area, handles wheel/pointer events. Hidden for 4 s when tapped (same as FeedPlayer).
- **End-of-list card** — when `isAtEnd`, iframe replaced with a centered card:
  > 审完了 🎉
  > 这个分类全看过一遍
  > [ 回列表 ]
  The "回列表" button calls `onExit`.
- **Undo toast** — when `pendingDeleteId !== null`, a bottom-center toast:
  > 已删除 · [撤回]
  The "撤回" link clears `deleteTimerRef` and `setPendingDeleteId(null)`. Toast has a subtle 3 s countdown animation (CSS linear progress bar on the toast's bottom edge) so the user sees how much time they have.

### AdminPoolView modifications

```ts
// add to existing state
const [swipeMode, setSwipeMode] = useState(false);

// add button next to the tabs row
<button
  type="button"
  className="btn btn-primary"
  onClick={() => setSwipeMode(true)}
  disabled={filtered.length === 0}
  data-testid="admin-review-enter"
  style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
>
  🎬 审一遍
</button>

// conditional render at the top of the return (covers the grid)
{swipeMode && (
  <AdminSwipeView
    vids={filtered}
    categoryLabel={activeCat === ALL ? '全部' : activeCat}
    onExit={() => setSwipeMode(false)}
    onCommitDelete={onDelete}  // existing optimistic-delete handler
  />
)}
```

The swipe view's `onCommitDelete` calls `onDelete`, which is the handler the grid already uses for the 🗑 button on each card. Same PATCH, same optimistic remove, same revert-on-error. Zero new network code.

## Interaction Details

### Swipe gesture

Identical semantics to `FeedPlayer`:
- Wheel down (`deltaY > 30`) → next video
- Wheel up (`deltaY < -30`) → previous video
- Pointer drag `|dy| > 50 && dt > 50 ms` → swipe direction by sign of `dy` (finger up = next)
- 800 ms throttle between commits
- 300 ms slide animation on commit (reuse `.feed-slide-up` / `.feed-slide-down` CSS)
- Tap (no meaningful movement, `dt < 250 ms`) → hide overlay for 4 s, then restore

Navigation bounds:
- `next` at end → advance to `index = visibleVids.length` (renders end card)
- `prev` at start → clamp to 0 (no wrap, no animation)

### Delete + undo

1. User clicks 🗑 on the current video → mark it as pending-delete, **advance the displayed video to the next one**, start a 3 s timer. Progress label reflects the new position (e.g. "1/3" → "2/3").
2. Toast appears at the bottom. 🗑 disabled while any delete is pending.
3. User options during the 3 s:
   - **Ignore** → timer fires → `onCommitDelete(pendingVideo.id)` (parent does PATCH) → clear pending → toast gone, 🗑 re-enabled.
   - **Undo** → clear timer → clear pending → the previously-pending video returns to the navigable list at its original position. The user stays on whatever video they're currently viewing (no auto-jump backward); if they want to see the restored video, they swipe up.
   - **Another 🗑** — 🗑 is disabled while pending, so this can't happen. User must wait for the toast to clear or click undo first.

### End-of-list

When the user swipes past the last navigable video (all videos either reviewed or pending-delete):
- Iframe is replaced by a centered "all done" card: "审完了 🎉 · 这个分类全看过一遍" + a "回列表" button that calls `onExit()`.
- Further swipe-down does nothing.
- Swipe-up jumps back to the last navigable video.

### Exit flush

When user clicks ✕ or "回列表":
- If `pendingDeleteId !== null`: flush immediately — `clearTimeout(deleteTimerRef)` + `onCommitDelete(pendingDeleteId)`. Don't leave a PATCH in limbo just because user navigated away.
- Then `onExit()`.

### Fast-tap semantics

🗑 button is `disabled={pendingDeleteId !== null}`. User physically cannot start a second pending delete until the current one commits or is undone. This avoids needing to reason about chains of pending deletes.

## Error Handling

All inherited from the existing grid handler (`onDelete` in AdminPoolView):
- PATCH returns non-ok or throws → video is re-inserted into parent's `videos` state. Because the swipe view uses parent's filtered list as its `vids` prop via a derived `useMemo`, the re-insertion propagates back into the swipe view too (video reappears in the list). If the user has already exited the swipe view by then, the video just reappears in the grid.
- `ADMIN_PASSWORD` env var missing on server → PATCH returns 401 (`checkAdminForApi` fails) → optimistic revert → toast shows error? For now, the existing grid handler only `console.error`s; we inherit the same behavior. Can add a user-visible error toast in a follow-up.

## Testing

New spec: `tests/admin-swipe.spec.ts`.

**Seed:** `beforeEach` inserts 3 videos in `喜剧` with test-id prefix `4444444444...` via service-role admin helper. `afterEach` hard-deletes them.

**Tests (3):**

1. **Enter, navigate, exit**:
   - Login + unlock admin
   - Visit `/admin` → click `admin-tab-喜剧` → click `admin-review-enter`
   - Expect `admin-swipe-view` visible, `admin-swipe-progress` reads "喜剧 · 1/3"
   - `page.mouse.wheel(0, 200)` → progress now "喜剧 · 2/3", iframe src contains `44444444440000000002`
   - Wheel up → back to 1/3, iframe src contains `...0001`
   - Click `admin-swipe-exit` → swipe view gone, grid visible, all 3 cards still there

2. **Delete + undo within 3 s**:
   - Enter swipe mode
   - Click `admin-swipe-delete` → expect `admin-swipe-undo` visible, progress updates to "喜剧 · 2/3" (the pending-delete video no longer in visibleVids, but index advanced)
   - Click undo (inside 3 s) → toast gone, DB unchanged (verify via service-role query: `is_active` still true for that video)
   - Exit → return to grid, all 3 cards still present

3. **Delete + timeout → real soft-delete persisted**:
   - Enter swipe mode
   - Click `admin-swipe-delete`
   - `page.waitForTimeout(3500)` — past the 3 s undo window
   - Verify via service-role: `is_active = false` for the deleted video_id
   - Exit → grid now shows 2 cards (the deleted one is gone because RLS `select where is_active = true` filters it AND AdminPoolView's optimistic remove filtered it from client state)

Not tested (out of scope for this spec):
- Autoplay unmute behavior (covered by FeedPlayer tests indirectly)
- Wheel velocity edge cases (throttle covered by feed-swipe tests)
- End-of-list card rendering (minor UI, easy to visually verify)

## Testids

- `admin-review-enter` — the "🎬 审一遍" button in the grid header
- `admin-swipe-view` — the full-screen container
- `admin-swipe-exit` — the ✕ button
- `admin-swipe-delete` — the 🗑 button
- `admin-swipe-undo` — the toast's undo link
- `admin-swipe-progress` — the "category · N/M" pill
- `admin-swipe-empty` — the end-of-list "all done" card
- `admin-swipe-current` — wrapper around the current VideoEmbed (for iframe src assertions)

## Future Extensions (not in this spec)

- Keyboard shortcuts: `Space` = pause, `Delete` = delete, `Esc` = exit, arrow keys = prev/next.
- Position memory: save `lastReviewedIndex` per category in `localStorage` so refreshing mid-review picks up where you left off.
- Bulk delete in grid: shift-click + delete.
- User-visible error toast for PATCH failures in both grid and swipe (retroactively improves current grid too).
- Per-video "keep forever" flag so repeated scraping doesn't re-offer already-kept videos for deletion.
- Review queue: require decision on each (Tinder-style) — explicitly rejected in this spec.

## Decisions Log

- **Coexist with grid** (not replace) — grid is still the right tool for "find a specific video and delete."
- **Category locked in per swipe session** — exit → pick tab → re-enter. Keeps the UI clean; no hidden state.
- **🗑 top-right + 3 s undo toast (option D)** — safest UX. Errors are the norm in bulk review.
- **Single pending delete at a time** (button disabled while pending) — simpler than chain semantics.
- **Reuse `AdminPoolView.onDelete` handler via callback** — no duplicate PATCH logic.
- **Reuse `components/feed/VideoEmbed`** — no new playback component.
- **No backend changes** — PATCH route already exists and is admin-gated.
- **CSS reuse** — reuse `.feed-swipe-overlay` / `.feed-slide-up` / `.feed-slide-down` from FeedPlayer's styles.
