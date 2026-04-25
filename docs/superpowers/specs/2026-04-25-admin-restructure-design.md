# Admin Restructure: Category Index + Manual Add

**Goal:** Replace the current top-level grid (with horizontal-scroll category tabs) with a drill-in information architecture. Add UI for manually inserting a single TikTok video URL into a category, and for creating new categories. No DB schema changes.

**Status:** spec — not yet implemented.

---

## Why

The current `/admin` shows all 357 videos at once with 13 horizontal-scroll category tabs (`全部`, plus 12 categories). At 12+ categories the tab row crowds the top of the screen, and the user has flagged the mechanism (not just the visuals) as the wrong fit. The pool also currently has no way to grow except `pnpm scrape:tiktok` — a single curated URL needs a manual path.

## Scope

In-scope:
- Replace `/admin` with a category index (cards drill-in to per-category pages).
- Manual add for a single TikTok video URL on a category page.
- Manual add for a new category on the index.

Out of scope:
- YouTube manual add (categories are TikTok-chip-shaped; adding YouTube to the pool is a separate decision).
- Batch URL pasting (use `pnpm scrape:tiktok` for bulk).
- UI for browsing soft-deleted videos.
- Editing category metadata (display order, icons).
- Schema changes (`categories` and `video_pool` already cover everything).

## Information Architecture

```
/admin              Category index (server component)
                    - "全部 357" hero card                → /admin/all
                    - 12 category cards (name, count,    → /admin/[slug]
                      one sample thumbnail)
                    - "+ 新分类" tile                    → inline NewCategoryForm

/admin/all          All active videos (server component)
                    - VideoCard grid + "🎬 审一遍"
                    - No "+ 加视频" button (no default category)

/admin/[slug]       Single category (server component)
                    - "+ 加视频" button (defaults category = slug)
                    - VideoCard grid + "🎬 审一遍"

/admin/unlock       Unchanged.
```

`all` is a reserved category slug — `POST /api/admin/categories` rejects it to prevent collision with `/admin/all`.

## Components

### New
- **`app/admin/CategoryView.tsx`** (client) — wrapper that renders a video grid + the swipe-review trigger + (optional) the add-video button. Used by `/admin/all` and `/admin/[slug]`.
- **`app/admin/NewVideoForm.tsx`** (client) — inline form on a category page. Single TikTok URL input → POST → optimistic insert into grid.
- **`app/admin/NewCategoryForm.tsx`** (client) — inline form on the index. Single slug input → POST → optimistic card on the index.

### Reused unchanged
- `app/admin/VideoCard.tsx`
- `app/admin/AdminSwipeView.tsx`
- `app/api/admin/video-pool/[id]/route.ts` (soft delete PATCH)
- `app/api/admin/video-pool/thumbnail/[videoId]/route.ts` (thumbnail proxy)

### Removed
- `app/admin/AdminPoolView.tsx` — its concerns split between the index and `CategoryView`.

### Shared helper
- **`lib/tiktok-url.ts`** — `extractVideoId(url): { videoId, author } | null` and a format check. The scraper's `verifyEmbed()` is refactored to call this helper so URL parsing lives in one place.

## Data Flow

**Index page server query.** `/admin/page.tsx` runs one DB call per request — fetching `(category, video_id, created_at)` for all `is_active` rows, ordered newest-first — and aggregates in the page component to produce, per category, a count and the single most recent `video_id` to use as the sample thumbnail. The "全部" hero gets the count and the `video_id` of the globally newest row from the same in-memory pass. Sample thumbnails go through the existing thumbnail proxy. (Avoids `distinct on` so the implementation isn't tied to a specific SQL flavor; with ~360 rows the JS aggregation is trivial.)

**Add-video flow.** Client posts `{ url, category }` to `POST /api/admin/video-pool`:
1. `checkAdminForApi()` gate.
2. `extractVideoId(url)` — bail on bad format.
3. Fetch TikTok oembed for that URL → `title`, `thumbnail_url`, `author_name`.
4. Upsert into `video_pool` with `onConflict: 'video_id'`:
   - If row didn't exist → plain insert.
   - If row existed and `is_active = false` → revive: set `is_active=true`, refresh `title/thumbnail_url/author/scraped_at`. (Decision: solo admin, deletions are rarely re-submitted accidentally.)
   - If row existed and `is_active = true` → return 409 `already_active`.
5. Return new row JSON.

Client behavior:
- On success: optimistic prepend to grid + close form + `router.refresh()` to reconcile with server truth.
- On failure: keep form open, render inline error below the input.

**Add-category flow.** Client posts `{ slug }` to `POST /api/admin/categories`:
1. Auth gate.
2. Validate: 1 ≤ length ≤ 30, not `'all'`, not already in `categories`.
3. `display_order = (max(display_order) over categories) + 1`.
4. Insert + return new row.

Client behavior:
- On success: optimistic card with `count = 0` + `router.refresh()`.
- On failure: inline error below input.

## Error Handling (UI strings)

**Add video:**
- Bad URL: `URL 不对,得是 https://www.tiktok.com/@x/video/N 这种`
- oembed fails: `嵌入失败 — 视频可能被删了或设了隐私`
- Already active: `这条已经在「[分类]」里了`
- Network/oembed timeout: `TikTok 暂时不通,稍后再试`

**Add category:**
- Empty: `slug 不能空`
- Duplicate: `「[slug]」已经存在了`
- Reserved: `all 是保留字,换一个`
- Too long: `slug 太长(最多 30 字)`

All errors render as inline red text directly under the form input — same visual region as the user's cursor, no toast.

## Testing

### Updated
- **`tests/admin-pool.spec.ts`** — change `page.goto('/admin')` to `page.goto('/admin/喜剧')`. Existing testids (`admin-video-grid`, `admin-video-card-*`, `admin-video-delete-*`) stay valid because `CategoryView` reuses `VideoCard`.

### New
- **`tests/admin-index.spec.ts`** — visit `/admin`, expect `admin-category-card-*` for each seeded category and an `admin-all-hero` card with the global count.
- **`tests/admin-add-video.spec.ts`** — visit `/admin/喜剧`, paste a real public TikTok URL, expect new card to appear, reload, expect it to persist. Marked slow (hits TikTok oembed live). Cleans up by hard-deleting the inserted row in `afterEach`.
- **`tests/admin-add-category.spec.ts`** — create a temporary slug like `__test_cat_<rand>`, expect card on index, delete row in `afterEach`.

### Unchanged
- admin-unlock, admin-guard, admin-swipe, feed-from-db, feed-swipe-smoke, budget-feed-smoke, nav-smoke, plus all topic/lesson/session/onboarding tests.

## Migration / Compatibility

- **No DB migration.** `categories(slug pk, display_order, is_active)` and `video_pool` already support everything.
- **Routing break:** old `/admin` URL semantics change from "grid with tabs" to "category index". Solo admin, no external bookmarks — break is acceptable.
- **Scraper:** refactored to import `lib/tiktok-url.ts`. Behavior unchanged; `pnpm scrape:tiktok` should run identically.

## Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Mechanism for category switching | Drill-in (B) | 12+ categories outgrew horizontal tabs; index gives natural home for "+ 新分类" tile |
| Keep an "全部" entry? | Yes — hero card on /admin → /admin/all | Lets us still swipe-review across all categories in one session |
| URL prefix for category pages | `/admin/[slug]` (not `/admin/category/[slug]`) | Shorter; collision risk handled by reserving `'all'` |
| Manual add: source | TikTok only | Categories are TikTok-chip-shaped; YouTube would need a separate model |
| Manual add: shape | Single URL at a time | Failure on one URL doesn't taint others; bulk is `pnpm scrape:tiktok` |
| Add-category fields | slug only | YAGNI for icon / display_order overrides; auto-incremented order is enough |
| Re-submit a soft-deleted URL | Auto-revive | Solo admin, low risk of unintended re-add; surprising-but-rare beats blocked-and-confusing |
| Sample thumbnail per category card | `distinct on (category)` server-side | One DB roundtrip vs N proxy hits; fewer requests |
| Refactor `verifyEmbed` into shared helper? | Yes | Two callers (scraper + new POST route) doing the same parsing — DRY |
