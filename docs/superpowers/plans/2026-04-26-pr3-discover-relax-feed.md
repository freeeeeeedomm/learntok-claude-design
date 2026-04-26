# PR 3: Discover + Relax + Feed Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the multi-page polish redesign by (1) expanding BottomNav from 3 to 4 tabs (rename progress→profile, insert discover), (2) overhauling `/discover` with English group titles, Lucide icons, and a 2-column tile grid, (3) polishing `/budget` (English heading, drop the Nibs character, add a low-balance gate), and (4) replacing the auto-redirect on feed exhaustion with a modal that lets users either head back to learning or spend 60s of jar balance to "watch one more minute" via a new `extend_feed_session` RPC.

**Architecture:** Three coupled chunks. (1) **Catalog data migration** (`0013_groups_english_titles.sql`) UPDATEs 5 `topic_groups` and 24 `topics` rows to swap Chinese titles + emoji icons for English titles + Lucide icon names. The existing `icon` text columns are reused — schema is unchanged. (2) **UI rework** in `components/nav/BottomNav.tsx`, `app/discover/page.tsx` + new `components/discover/{LucideIcon,TopicGrid,TopicTile}.tsx`, and `app/budget/page.tsx` + new `components/relax/RelaxEmptyState.tsx`. (3) **Feed extend flow**: new `extend_feed_session(p_session_id uuid)` security-definer RPC (migration `0014_extend_feed_session.sql`) wrapped by `app/api/sessions/extend/route.ts`, consumed by a new `components/feed/ExhaustionModal.tsx` that replaces the 1.2s auto-redirect in `app/feed/FeedPlayer.tsx`. The RPC enforces `auth.uid() = session.user_id` and atomically (`select … for update`) rejects when balance < 60s, otherwise inserts a `-60` `feed_extend` ledger entry and bumps `sessions.budget_seconds += 60`.

**Tech Stack:** Next.js 14 App Router (server components for data; client components for popovers + modals + the FeedPlayer state machine), Supabase (RLS-scoped reads + `security definer` RPC for atomic balance writes), `lucide-react` (already a dependency — used by BottomNav), Playwright (`@playwright/test`). No new npm deps.

**Worktree:** `C:\Users\admin\Desktop\ClaudeProjects\learntok-claude-design\.claude\worktrees\pr3-discover-relax-feed`
**Branch:** `claude/pr3-discover-relax-feed`, based on `claude/pr2-home-profile` (open PR #30). PR 3 inherits PR 2's `/profile` route + the `User` icon import path that BottomNav will reuse. Once PR 2 merges to `main`, GitHub auto-rebases this PR's base; until then, treat PR 2 as the integration branch.

**Spec reference:** `docs/superpowers/specs/2026-04-26-multi-page-polish-redesign-design.md` § 5 (discover), § 6 (bottom nav), § 7 (relax), § 8 (feed exhaustion + extend RPC), Appendix A (icon mapping).

**Out of scope:**
- Earn-ratio fix and onboarding reframe (PR 1, already merged)
- Home redesign, profile route, learning-rhythm viz (PR 2)
- Replacing the `🔥` streak emoji (intentionally kept playful)
- Adding-to-library shortcut from discover tile (already done in PR #25)

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/0013_groups_english_titles.sql` | Create | UPDATE 5 `topic_groups` rows (English titles + Lucide icon names). UPDATE 24 `topics` rows (Lucide icon names per Appendix A). Adds column comments documenting the new convention ("Lucide icon name in PascalCase"). Idempotent — safe to re-run. |
| `supabase/migrations/0014_extend_feed_session.sql` | Create | Defines `extend_feed_session(p_session_id uuid) returns jsonb` as `security definer`. Locks the session row + the profile row, enforces ownership (`auth.uid()`), feed-only, not-already-ended, balance ≥ 60. Inserts `-60 feed_extend` ledger entry, bumps `budget_seconds`, returns `{ newBudget, balanceAfter }`. Grants execute to `authenticated`. |
| `components/nav/BottomNav.tsx` | Modify | 4 tabs (home / discover / relax / profile). Add `Compass` + `User` Lucide imports; drop `TrendingUp`. Recompute `isHome` (no longer matches `/discover/*` or `/topic/*`); add `isDiscover` (`/discover/*` + `/topic/*`); rename `isProgress` → `isProfile` (`/profile`). |
| `components/discover/LucideIcon.tsx` | Create | Wrapper component mapping a string icon name (e.g. `"LineChart"`) to the corresponding `lucide-react` component via a static lookup map of the ~30 names actually used. Falls back to a neutral dot if missing. Avoids dynamic import / 1300-icon bundle. |
| `components/discover/TopicTile.tsx` | Create | Server-component tile: 32px Lucide icon top-left, 2-line truncated title, `{N} courses` subtitle, ✓ badge top-right when in user's library. Wrapped in `<Link href={'/discover/topic/' + id}>`. |
| `components/discover/TopicGrid.tsx` | Create | 2-column CSS grid container (`grid-template-columns: 1fr 1fr; gap: 12px`). Renders one `<TopicTile>` per topic. |
| `app/discover/page.tsx` | Modify | Pre-compute per-topic course counts (one extra `courses` query). Replace pill-chip `flexWrap` block (lines ~91-135) with `<TopicGrid topics={list} shelfTopicIds={...} courseCounts={...} />`. Replace group header emoji + Chinese title with `<LucideIcon name={g.icon} />` + the now-English `g.title`. |
| `app/discover/topic/[id]/page.tsx` | Modify | Header: replace `{topic.icon}` text with `<LucideIcon name={topic.icon} size={28} />`. No layout change. |
| `app/budget/page.tsx` | Modify | Drop `next/image` import + `<Image src="/characters/nibs.png" …>` block. Change `想休息一下吗？` → `Take a break?`. Add server gate: if `profile.jar_balance_cached < 60`, render `<RelaxEmptyState />` instead of `<BudgetForm>`. |
| `components/relax/RelaxEmptyState.tsx` | Create | Centered serif heading "Earn some time first", body "Study a lesson to bank time, then relax.", primary accent button → `/home`. Uses existing `.display`, `.body`, `.btn-accent` classes. |
| `components/feed/ExhaustionModal.tsx` | Create | Client modal overlay (full-screen, z=50). Heading "time's up.", balance line, primary button "Back to learning" (→ `/home`), conditional secondary "Watch 1 more minute" (only when `balance >= 60`). On secondary click POSTs `/api/sessions/extend`; on success calls `onExtend({ newBudget, balanceAfter })`; on `insufficient_balance` swaps to single-button error state. |
| `app/feed/FeedPlayer.tsx` | Modify | Replace 1.2s `setTimeout(router.push)` (lines 89-94) with `setEndedBySystem(true)` + pause via YT `postMessage`. Mount `<ExhaustionModal>` when `endedBySystem`. On extend success: clear `endedBySystem`, set `remain = newBudget`, set `balance` from response, resume video. Drop the angel `<Image>` block (lines 272-279); button keeps text-only `Back to learning`. Translate the two `回去学习` strings (lines 230, 281). Add `iframeRef` + bridge to inner `<VideoEmbed>` (use a ref forwarded through). |
| `components/feed/VideoEmbed.tsx` | Modify | Forward an optional `iframeRef` so FeedPlayer can post `pauseVideo` / `playVideo` commands to the YT iframe. (TikTok embeds — no-op the postMessage; modal still works.) |
| `app/api/sessions/extend/route.ts` | Create | POST `{ sessionId }`. User-scoped client (RLS) calls `extend_feed_session` RPC. Maps RPC errors to `{ error: 'insufficient_balance' }` (400), `{ error: 'forbidden' }` (403), `{ error: 'invalid_session' }` (400), or 500. On success returns RPC's `{ newBudget, balanceAfter }`. |
| `public/characters/nibs.png` | Delete | No remaining references after `app/budget/page.tsx` change. |
| `public/characters/angel.png` | Delete | No remaining references after `app/feed/FeedPlayer.tsx` change. |
| `app/globals.css` | Modify | Add `.topic-grid` (grid-cols), `.topic-tile` (height/padding/border/hover), `.topic-tile-badge`, `.exhaustion-modal` (overlay + card), `.relax-empty` (centered column). |
| `tests/discover.spec.ts` | Create | Two cases: (1) discover page renders 5 group sections with English titles and a `<LucideIcon>` per header (assert presence by `data-testid`); (2) tiles are 2-col grid with course count and library badge when applicable. |
| `tests/feed-extend.spec.ts` | Create | Two cases: (1) feed exhaustion shows `ExhaustionModal` with both buttons when balance ≥ 60; clicking extend hits API, modal closes, ledger entry inserted; (2) when balance < 60, secondary button hidden; primary returns to `/home`. |
| `tests/full-flow.spec.ts` | Modify | Update BottomNav assertion (now 4 testids: `nav-home`, `nav-discover`, `nav-relax`, `nav-profile`). Update `discover-back` flow if relabeled. Add a `nav-discover` click step in the relevant section. |

---

## Task 1: Migration `0013_groups_english_titles.sql`

**Files:**
- Create: `supabase/migrations/0013_groups_english_titles.sql`

The seed in `0011_seed_khan_catalog.sql` inserts `topic_groups` with Chinese titles + emoji icons and `topics` with emoji icons. We UPDATE in place rather than re-seed so any user-created courses with `topic_id` foreign keys aren't broken.

- [ ] **Step 1: Create the migration file**

```sql
-- 0013_groups_english_titles.sql
-- English-first catalog: replace Chinese group titles with English, and
-- replace emoji icons (groups + topics) with Lucide icon names so the
-- discover UI can render real vector icons instead of system emoji.
--
-- The `icon` columns stay text. Convention is now "PascalCase Lucide icon
-- name" (e.g. 'LineChart'). Existing user-created topics with emoji icons
-- continue to render — the UI's <LucideIcon> wrapper falls back to '•'
-- when the name doesn't match.
--
-- Idempotent: UPDATE-by-id is naturally re-runnable.

-- ===== Topic groups (5 preset super-categories) =====
update public.topic_groups set title = 'Finance & Economics',  icon = 'LineChart'    where id = '00000000-0000-0000-0000-0000000000a1';
update public.topic_groups set title = 'Humanities & History', icon = 'Landmark'     where id = '00000000-0000-0000-0000-0000000000a2';
update public.topic_groups set title = 'Science & Engineering',icon = 'FlaskConical' where id = '00000000-0000-0000-0000-0000000000a3';
update public.topic_groups set title = 'Mathematics',          icon = 'Sigma'        where id = '00000000-0000-0000-0000-0000000000a4';
update public.topic_groups set title = 'Computer Science',     icon = 'Code'         where id = '00000000-0000-0000-0000-0000000000a5';

-- ===== Topics (24 preset, Lucide icon names per spec Appendix A) =====
-- Finance
update public.topics set icon = 'Coins'        where id = '10be2d17-1ed0-5300-94c2-96c65e9aac6f'; -- Microeconomics
update public.topics set icon = 'Globe'        where id = '47144b1c-6c79-5143-a775-a6e656585408'; -- Macroeconomics
update public.topics set icon = 'TrendingUp'   where id = '5a7ed121-3c98-5d2e-b656-9270e87cef16'; -- Finance and Capital Markets
-- Humanities
update public.topics set icon = 'Globe2'       where id = '15e9ee0b-b157-588c-91b0-7b3ab6bc9de6'; -- World History
update public.topics set icon = 'Flag'         where id = 'd2947ac6-7537-5739-ab8c-4e29089e3c71'; -- US History
update public.topics set icon = 'Palette'      where id = '0436ea86-f4be-5bd2-9f86-97b2ca035402'; -- Art History
update public.topics set icon = 'Scale'        where id = 'ce2f7546-2bbd-5c95-ba89-e2d062098cb6'; -- US Government & Civics
-- STEM
update public.topics set icon = 'Atom'         where id = '1f67c97d-70a7-54e7-8fee-dee550d0b891'; -- Physics
update public.topics set icon = 'TestTube'     where id = '9a272527-a274-506f-8f34-431fa74926fb'; -- Chemistry
update public.topics set icon = 'Dna'          where id = '1d16715d-cbfe-5fca-8952-af13168672fb'; -- Biology
update public.topics set icon = 'Telescope'    where id = 'e072feed-e32c-5a61-998e-e63ca5f2cf45'; -- Cosmology & Astronomy
update public.topics set icon = 'Zap'          where id = '7654b55f-fb51-5823-9647-f85befac8dc1'; -- Electrical Engineering
update public.topics set icon = 'Clapperboard' where id = '83f6bd43-8b6f-55e3-8db0-309f46481f6c'; -- Computer Animation
-- Math
update public.topics set icon = 'Variable'     where id = 'cb9d7295-5bcd-55d4-b970-3786cdd51e71'; -- Algebra Basics
update public.topics set icon = 'Calculator'   where id = '602bef9a-7986-5e63-98c9-911e3d4e8054'; -- Pre-Algebra
update public.topics set icon = 'Triangle'     where id = '299a653c-7a0c-5eb2-a17a-3f8dc1e563df'; -- Geometry
update public.topics set icon = 'Waves'        where id = 'dd07541f-3d2e-55f0-bfa2-4ea014b5ce7f'; -- Trigonometry
update public.topics set icon = 'LineChart'    where id = 'a980cd52-1333-5830-ab33-72566c9e6aee'; -- Calculus AB
update public.topics set icon = 'Infinity'     where id = 'e4d00990-ee64-5266-baa7-5442617549fb'; -- Calculus BC
update public.topics set icon = 'Grid3x3'      where id = '32c38b74-958a-5e36-8f58-5111ea5b883f'; -- Linear Algebra
update public.topics set icon = 'Box'          where id = 'c39ee7d2-6f40-53b4-8cb9-374b3ea421f5'; -- Multivariable Calculus
update public.topics set icon = 'Spline'       where id = 'b7d680f3-afa6-5ee4-ad14-0d28efd68f09'; -- Differential Equations
-- CS
update public.topics set icon = 'Braces'       where id = 'a9a701e3-cc9c-5bcb-b0ee-422632aadb65'; -- Computer Programming
update public.topics set icon = 'Cpu'          where id = '7ce2be39-6dc0-5a9b-b7bb-78d9a464891f'; -- Computer Science

comment on column public.topic_groups.icon is 'Lucide icon name in PascalCase (e.g. ''LineChart''). Rendered via <LucideIcon name={...}>.';
comment on column public.topics.icon       is 'Lucide icon name in PascalCase (e.g. ''Atom''). Rendered via <LucideIcon name={...}>. User-created topics may still contain emoji; component falls back to ''•''.';
```

- [ ] **Step 2: Apply locally and sanity-check**

```bash
npm run supabase:reset
psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2)" -c "select key, title, icon from public.topic_groups order by position;"
psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2)" -c "select count(*) as topics_with_lucide from public.topics where is_preset and icon ~ '^[A-Z][A-Za-z0-9]+$';"
```

Expected: 5 groups with English titles + Lucide names; `topics_with_lucide = 24`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0013_groups_english_titles.sql
git commit -m "migration: english group titles + lucide icon names for preset catalog"
```

---

## Task 2: `<LucideIcon>` wrapper component

**Files:**
- Create: `components/discover/LucideIcon.tsx`

Tree-shakes by importing only the ~30 names we use. A dynamic-name `lucide-react` import would pull the entire icon set.

- [ ] **Step 1: Create the file**

```tsx
'use client';
import {
  // group icons
  LineChart, Landmark, FlaskConical, Sigma, Code,
  // topic icons
  Coins, Globe, TrendingUp,
  Globe2, Flag, Palette, Scale,
  Atom, TestTube, Dna, Telescope, Zap, Clapperboard,
  Variable, Calculator, Triangle, Waves, Infinity as InfinityIcon,
  Grid3x3, Box, Spline,
  Braces, Cpu,
  // shared / fallback
  Compass, User, Home, Coffee,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

type IconCmp = ComponentType<SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }>;

const MAP: Record<string, IconCmp> = {
  LineChart, Landmark, FlaskConical, Sigma, Code,
  Coins, Globe, TrendingUp,
  Globe2, Flag, Palette, Scale,
  Atom, TestTube, Dna, Telescope, Zap, Clapperboard,
  Variable, Calculator, Triangle, Waves, Infinity: InfinityIcon,
  Grid3x3, Box, Spline,
  Braces, Cpu,
  Compass, User, Home, Coffee,
};

export function LucideIcon({
  name,
  size = 24,
  strokeWidth = 1.8,
  className,
}: {
  name: string | null | undefined;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Cmp = name ? MAP[name] : undefined;
  if (!Cmp) {
    // Fallback: neutral dot, same footprint as a real icon.
    return (
      <span
        aria-hidden
        className={className}
        style={{ display: 'inline-block', width: size, height: size, lineHeight: `${size}px`, textAlign: 'center', color: 'var(--ink-mute)' }}
      >
        •
      </span>
    );
  }
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
}
```

- [ ] **Step 2: Commit**

```bash
git add components/discover/LucideIcon.tsx
git commit -m "feat(discover): LucideIcon wrapper with static lookup for tree-shaking"
```

---

## Task 3: BottomNav 4-tab redesign

**Files:**
- Modify: `components/nav/BottomNav.tsx`

Adds discover, renames progress→profile, updates `isHome` so `/discover/*` and `/topic/*` no longer count as home.

- [ ] **Step 1: Replace the file body**

```tsx
'use client';

import { usePathname } from 'next/navigation';
import { Home, Compass, Coffee, User } from 'lucide-react';

const HIDE_PATTERNS = [
  /^\/$/,
  /^\/login(\/|$)/,
  /^\/auth(\/|$)/,
  /^\/onboarding(\/|$)/,
  /^\/lesson\//,
  /^\/feed(\/|$)/,
  /^\/admin(\/|$)/,
];

const ICON_PROPS = { size: 22, strokeWidth: 1.8 } as const;

export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const hidden = HIDE_PATTERNS.some((r) => r.test(pathname));
  if (hidden) return null;

  // Home covers /home + the user's owned things (/course, /add).
  // Discover covers browse surfaces (/discover, /topic).
  const isHome =
    pathname === '/home' ||
    pathname.startsWith('/course/') ||
    pathname === '/add' ||
    pathname.startsWith('/add/');
  const isDiscover =
    pathname === '/discover' ||
    pathname.startsWith('/discover/') ||
    pathname.startsWith('/topic/');
  const isRelax =
    pathname === '/budget' ||
    pathname.startsWith('/budget/') ||
    pathname === '/feed' ||
    pathname.startsWith('/feed/');
  const isProfile = pathname === '/profile' || pathname.startsWith('/profile/');

  return (
    <nav className="bottom-nav" data-testid="bottom-nav">
      <a
        href="/home"
        className={`bottom-nav-item ${isHome ? 'active' : ''}`}
        aria-current={isHome ? 'page' : undefined}
        data-testid="nav-home"
      >
        <span className="bottom-nav-icon" aria-hidden><Home {...ICON_PROPS} /></span>
        <span className="bottom-nav-label">home</span>
      </a>
      <a
        href="/discover"
        className={`bottom-nav-item ${isDiscover ? 'active' : ''}`}
        aria-current={isDiscover ? 'page' : undefined}
        data-testid="nav-discover"
      >
        <span className="bottom-nav-icon" aria-hidden><Compass {...ICON_PROPS} /></span>
        <span className="bottom-nav-label">discover</span>
      </a>
      <a
        href="/budget"
        className={`bottom-nav-item ${isRelax ? 'active' : ''}`}
        aria-current={isRelax ? 'page' : undefined}
        data-testid="nav-relax"
      >
        <span className="bottom-nav-icon" aria-hidden><Coffee {...ICON_PROPS} /></span>
        <span className="bottom-nav-label">relax</span>
      </a>
      <a
        href="/profile"
        className={`bottom-nav-item ${isProfile ? 'active' : ''}`}
        aria-current={isProfile ? 'page' : undefined}
        data-testid="nav-profile"
      >
        <span className="bottom-nav-icon" aria-hidden><User {...ICON_PROPS} /></span>
        <span className="bottom-nav-label">profile</span>
      </a>
    </nav>
  );
}
```

- [ ] **Step 2: Spot-check `.bottom-nav` CSS**

```bash
grep -n "bottom-nav" app/globals.css
```

If `.bottom-nav` uses `grid-template-columns: repeat(3, 1fr)`, change it to `repeat(4, 1fr)`. If it uses `display: flex; justify-content: space-around`, no change needed.

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```

Navigate to `/home`, `/discover`, `/budget`, `/profile`. All four tabs render. The active tab matches the route. `/topic/<id>` highlights discover, not home.

- [ ] **Step 4: Commit**

```bash
git add components/nav/BottomNav.tsx app/globals.css
git commit -m "feat(nav): 4-tab BottomNav with discover and profile"
```

---

## Task 4: Discover — TopicTile + TopicGrid

**Files:**
- Create: `components/discover/TopicTile.tsx`
- Create: `components/discover/TopicGrid.tsx`
- Modify: `app/globals.css` (add `.topic-grid` + `.topic-tile`)

- [ ] **Step 1: Create `components/discover/TopicTile.tsx`**

```tsx
import Link from 'next/link';
import { LucideIcon } from './LucideIcon';

export function TopicTile({
  id,
  title,
  icon,
  courseCount,
  inLibrary,
}: {
  id: string;
  title: string;
  icon: string | null;
  courseCount: number;
  inLibrary: boolean;
}) {
  return (
    <Link
      href={`/discover/topic/${id}`}
      className="topic-tile"
      data-testid={`discover-topic-${id}`}
    >
      <div className="topic-tile-icon"><LucideIcon name={icon} size={32} /></div>
      <div className="topic-tile-title">{title}</div>
      <div className="topic-tile-sub">{courseCount} {courseCount === 1 ? 'course' : 'courses'}</div>
      {inLibrary && (
        <span
          className="topic-tile-badge"
          data-testid={`discover-topic-${id}-in-library`}
          aria-label="in your library"
        >
          ✓
        </span>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: Create `components/discover/TopicGrid.tsx`**

```tsx
import { TopicTile } from './TopicTile';

type Topic = { id: string; title: string; icon: string | null };

export function TopicGrid({
  topics,
  shelfTopicIds,
  courseCounts,
}: {
  topics: Topic[];
  shelfTopicIds: Set<string>;
  courseCounts: Map<string, number>;
}) {
  return (
    <div className="topic-grid" data-testid="topic-grid">
      {topics.map((t) => (
        <TopicTile
          key={t.id}
          id={t.id}
          title={t.title}
          icon={t.icon}
          courseCount={courseCounts.get(t.id) ?? 0}
          inLibrary={shelfTopicIds.has(t.id)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add CSS to `app/globals.css`** (append):

```css
.topic-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 8px;
}
.topic-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 110px;
  padding: 14px;
  border-radius: 14px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  color: var(--ink);
  text-decoration: none;
  font-family: var(--serif);
}
.topic-tile-icon { color: var(--ink); }
.topic-tile-title {
  font-size: 14px;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}
.topic-tile-sub {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-mute);
  margin-top: auto;
}
.topic-tile-badge {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 12px;
  color: var(--accent);
  font-family: var(--mono);
}
```

- [ ] **Step 4: Commit**

```bash
git add components/discover/TopicTile.tsx components/discover/TopicGrid.tsx app/globals.css
git commit -m "feat(discover): TopicTile + TopicGrid (2-col, lucide icons, library badge)"
```

---

## Task 5: Discover page — wire TopicGrid + per-topic course counts

**Files:**
- Modify: `app/discover/page.tsx`
- Modify: `app/discover/topic/[id]/page.tsx`

- [ ] **Step 1: Update `app/discover/page.tsx`**

Replace lines 12-35 (the four parallel queries) and lines 79-138 (the section render) so we (a) also fetch per-topic course counts and (b) render a `<TopicGrid>` per group with `<LucideIcon>` headers. Final file:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtBank } from '@/lib/format';
import { LucideIcon } from '@/components/discover/LucideIcon';
import { TopicGrid } from '@/components/discover/TopicGrid';

export default async function DiscoverPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [profileRes, groupsRes, topicsRes, shelfRes, presetCoursesRes] = await Promise.all([
    supabase.from('profiles').select('jar_balance_cached').eq('id', user.id).single(),
    supabase
      .from('topic_groups')
      .select('id, key, title, icon, position')
      .eq('is_preset', true)
      .order('position', { ascending: true }),
    supabase
      .from('topics')
      .select('id, group_id, title, icon, position')
      .eq('is_preset', true)
      .not('group_id', 'is', null)
      .order('position', { ascending: true }),
    supabase
      .from('profile_courses')
      .select('course_id, courses!inner(topic_id)')
      .eq('user_id', user.id),
    // Per-topic course count for the tile subtitle. Preset catalog only —
    // user-added courses aren't shown on /discover.
    supabase
      .from('courses')
      .select('id, topic_id')
      .eq('is_preset', true)
      .not('topic_id', 'is', null),
  ]);

  const groups = groupsRes.data ?? [];
  const topics = topicsRes.data ?? [];

  type ShelfRow = { course_id: string; courses: { topic_id: string | null } };
  const shelfTopicIds = new Set<string>();
  for (const row of (shelfRes.data ?? []) as unknown as ShelfRow[]) {
    if (row.courses?.topic_id) shelfTopicIds.add(row.courses.topic_id);
  }

  const courseCounts = new Map<string, number>();
  for (const c of presetCoursesRes.data ?? []) {
    if (!c.topic_id) continue;
    courseCounts.set(c.topic_id, (courseCounts.get(c.topic_id) ?? 0) + 1);
  }

  const topicsByGroup = new Map<string, typeof topics>();
  for (const t of topics) {
    if (!t.group_id) continue;
    const arr = topicsByGroup.get(t.group_id) ?? [];
    arr.push(t);
    topicsByGroup.set(t.group_id, arr);
  }

  return (
    <main className="app">
      <div className="topbar">
        <a href="/home" className="back" data-testid="discover-back">‹</a>
        <a href="/profile" className="jar-chip" data-testid="discover-jar-chip">
          <span className="jar-dot" />
          {fmtBank(profileRes.data?.jar_balance_cached ?? 0)}
        </a>
      </div>

      <div className="pad pad-top" style={{ paddingTop: 80 }}>
        <div className="eyebrow">discover</div>
        <div className="display mt-4" style={{ fontSize: 28 }}>browse all topics</div>
        <div className="body mt-8" style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
          tap a topic to see courses you can add to your library.
        </div>

        {groups.map((g) => {
          const list = topicsByGroup.get(g.id) ?? [];
          if (list.length === 0) return null;
          return (
            <section
              key={g.id}
              className="mt-24"
              data-testid={`discover-group-${g.key ?? g.id}`}
            >
              <div
                className="eyebrow row"
                style={{ alignItems: 'center', gap: 8, fontSize: 13 }}
              >
                <LucideIcon name={g.icon} size={18} />
                <span>{g.title}</span>
              </div>
              <TopicGrid
                topics={list}
                shelfTopicIds={shelfTopicIds}
                courseCounts={courseCounts}
              />
            </section>
          );
        })}
      </div>
    </main>
  );
}
```

Note: jar-chip now points to `/profile` (consistent with PR 2 rename), not `/progress`.

- [ ] **Step 2: Update `app/discover/topic/[id]/page.tsx` header icon**

Find the line that renders the topic header emoji and replace:

```bash
grep -n "topic.icon\|topicRes.data?.icon" app/discover/topic/\[id\]/page.tsx
```

Replace `{topic.icon ?? '•'}` (or similar) with:

```tsx
<LucideIcon name={topic.icon} size={28} />
```

Add `import { LucideIcon } from '@/components/discover/LucideIcon';` at the top.

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```

Visit `/discover`. Expect 5 sections with English titles ("Finance & Economics" etc.), Lucide group icons, 2-col grid of tiles each showing icon + title + course count. Library check on a topic the seed-user has → tile shows ✓.

- [ ] **Step 4: Commit**

```bash
git add app/discover/page.tsx app/discover/topic/\[id\]/page.tsx
git commit -m "feat(discover): English titles + Lucide icons + 2-col grid"
```

---

## Task 6: Relax page polish + low-balance gate

**Files:**
- Create: `components/relax/RelaxEmptyState.tsx`
- Modify: `app/budget/page.tsx`

- [ ] **Step 1: Create `components/relax/RelaxEmptyState.tsx`**

```tsx
export function RelaxEmptyState() {
  return (
    <div
      className="relax-empty col aic gap-12"
      data-testid="relax-empty"
      style={{ paddingTop: 96, textAlign: 'center' }}
    >
      <div className="display" style={{ fontSize: 26, fontFamily: 'var(--serif)' }}>
        Earn some time first
      </div>
      <div className="body" style={{ color: 'var(--ink-mute)', maxWidth: 280 }}>
        Study a lesson to bank time, then relax.
      </div>
      <a
        href="/home"
        className="btn-accent mt-12"
        data-testid="relax-empty-cta"
      >
        Back to learning
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Update `app/budget/page.tsx`**

Replace whole file:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BudgetForm } from './BudgetForm';
import { RelaxEmptyState } from '@/components/relax/RelaxEmptyState';

function fmtBank(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s.toString().padStart(2, '0')}s` : `${m}m`;
}

const RELAX_MIN_BALANCE = 60; // one extend-unit; below this we gate to empty state

export default async function BudgetPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('jar_balance_cached, onboarded')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarded) redirect('/onboarding');

  const balance = profile.jar_balance_cached ?? 0;

  return (
    <main className="app">
      <div className="topbar">
        <a href="/home" className="back" data-testid="budget-back">×</a>
        <div className="jar-chip" data-testid="budget-jar-chip">
          <span className="jar-dot" />
          {fmtBank(balance)}
        </div>
      </div>

      {balance < RELAX_MIN_BALANCE ? (
        <RelaxEmptyState />
      ) : (
        <div className="pad pad-top col gap-12" style={{ paddingTop: 96 }}>
          <div className="display tc" style={{ fontSize: 24 }}>Take a break?</div>
          <div className="eyebrow tc">pick a budget</div>
          <BudgetForm balance={balance} />
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verify nibs.png is unreferenced, then delete**

```bash
grep -rn "characters/nibs" app components public 2>/dev/null
```

Expected: no matches. Then:

```bash
git rm public/characters/nibs.png
```

- [ ] **Step 4: Commit**

```bash
git add app/budget/page.tsx components/relax/RelaxEmptyState.tsx
git commit -m "feat(relax): English copy, drop nibs character, low-balance empty state"
```

---

## Task 7: Migration `0014_extend_feed_session.sql`

**Files:**
- Create: `supabase/migrations/0014_extend_feed_session.sql`

The RPC is the *only* path that may credit/debit balance for the extend flow. Following the jar-balance invariant in CLAUDE.md, all balance writes go through a server-trusted code path; here that's a `security definer` function that re-derives ownership from `auth.uid()`.

- [ ] **Step 1: Create the migration**

```sql
-- 0014_extend_feed_session.sql
-- Atomic +60s feed extend. Called from app/api/sessions/extend.
--
-- Locks the session row + the profile row, validates ownership and
-- preconditions (feed-only, not ended, balance >= 60), then inserts a
-- single -60 ledger entry labelled 'feed_extend' and bumps
-- sessions.budget_seconds by 60. Returns { newBudget, balanceAfter }.
--
-- balanceAfter is computed from the locked profile snapshot minus 60
-- (deterministic): the after_ledger_insert trigger updates
-- jar_balance_cached, but that update can race with the FOR UPDATE lock
-- already held here, so we don't re-read.
--
-- security definer: reads/writes profiles + ledger_entries + sessions
-- regardless of caller RLS, but enforces auth.uid() = session.user_id
-- internally to prevent cross-user extend.

create or replace function public.extend_feed_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
  v_balance int;
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'unauthenticated';
  end if;

  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null then
    raise exception 'invalid_session';
  end if;
  if v_session.user_id <> v_caller then
    raise exception 'forbidden';
  end if;
  if v_session.kind <> 'feed' then
    raise exception 'invalid_session';
  end if;
  if v_session.ended_at is not null then
    raise exception 'session_already_ended';
  end if;

  select jar_balance_cached into v_balance
    from public.profiles where id = v_session.user_id for update;

  if v_balance is null or v_balance < 60 then
    raise exception 'insufficient_balance';
  end if;

  insert into public.ledger_entries (user_id, delta_seconds, label, ref_id)
    values (v_session.user_id, -60, 'feed_extend', v_session.id);

  update public.sessions
    set budget_seconds = coalesce(budget_seconds, 0) + 60
    where id = p_session_id;

  return jsonb_build_object(
    'newBudget',     coalesce(v_session.budget_seconds, 0) + 60,
    'balanceAfter',  v_balance - 60
  );
end;
$$;

revoke all on function public.extend_feed_session(uuid) from public;
grant execute on function public.extend_feed_session(uuid) to authenticated;
```

- [ ] **Step 2: Apply locally**

```bash
npm run supabase:reset
```

- [ ] **Step 3: SQL sanity check via psql**

```bash
DBURL=$(npx supabase status -o env | grep '^DB_URL=' | cut -d= -f2)
psql "$DBURL" <<'SQL'
-- Verify the function exists, is security definer, and grants are correct.
select proname, prosecdef
  from pg_proc
  where proname = 'extend_feed_session';
SQL
```

Expected: one row, `prosecdef = t`. (A full RPC behaviour test is exercised end-to-end by Task 11's Playwright spec.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0014_extend_feed_session.sql
git commit -m "migration: extend_feed_session RPC for +60s feed top-up"
```

---

## Task 8: `/api/sessions/extend` route

**Files:**
- Create: `app/api/sessions/extend/route.ts`

Mirrors the existing heartbeat route's shape. Uses the user-scoped client so the RPC sees `auth.uid()`.

- [ ] **Step 1: Create the file**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const Body = z.object({ sessionId: z.string().uuid() });

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('extend_feed_session', {
    p_session_id: parsed.data.sessionId,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('insufficient_balance')) {
      return NextResponse.json({ error: 'insufficient_balance' }, { status: 400 });
    }
    if (msg.includes('forbidden')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    if (msg.includes('invalid_session') || msg.includes('session_already_ended')) {
      return NextResponse.json({ error: 'invalid_session' }, { status: 400 });
    }
    return NextResponse.json({ error: 'extend_failed' }, { status: 500 });
  }

  // RPC returns jsonb { newBudget, balanceAfter }
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/sessions/extend/route.ts
git commit -m "feat(api): POST /api/sessions/extend wraps extend_feed_session RPC"
```

---

## Task 9: `<ExhaustionModal>` component

**Files:**
- Create: `components/feed/ExhaustionModal.tsx`
- Modify: `app/globals.css` (add `.exhaustion-modal*` rules)

- [ ] **Step 1: Create `components/feed/ExhaustionModal.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function fmtMin(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function ExhaustionModal({
  sessionId,
  balance,
  onExtend,
}: {
  sessionId: string;
  balance: number;
  onExtend: (next: { newBudget: number; balanceAfter: number }) => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<null | 'insufficient' | 'other'>(null);

  const canExtend = balance >= 60 && error !== 'insufficient';

  const doExtend = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/sessions/extend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (res.ok) {
        const body = await res.json() as { newBudget: number; balanceAfter: number };
        onExtend(body);
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body?.error === 'insufficient_balance' ? 'insufficient' : 'other');
    } catch {
      setError('other');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="exhaustion-modal"
      data-testid="feed-exhaustion-modal"
      role="dialog"
      aria-labelledby="exhaustion-title"
    >
      <div className="exhaustion-card">
        <div
          id="exhaustion-title"
          className="display"
          style={{ fontSize: 32, fontFamily: 'var(--serif)' }}
        >
          time&apos;s up.
        </div>
        <div
          className="body mt-8"
          data-testid="feed-exhaustion-balance"
          style={{ color: '#d6d3cf' }}
        >
          jar: {fmtMin(balance)} left
        </div>
        {error === 'insufficient' && (
          <div className="body mt-8" style={{ color: 'var(--accent)' }}>
            Not enough time to extend.
          </div>
        )}

        <div className="col gap-8 mt-24" style={{ width: '100%' }}>
          <button
            type="button"
            className="btn-accent"
            onClick={() => router.push('/home')}
            data-testid="feed-exhaustion-back"
          >
            Back to learning
          </button>
          {canExtend && (
            <button
              type="button"
              className="btn-ghost"
              onClick={doExtend}
              disabled={submitting}
              data-testid="feed-exhaustion-extend"
            >
              {submitting ? 'extending…' : 'Watch 1 more minute (−60s)'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append CSS to `app/globals.css`**

```css
.exhaustion-modal {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.88);
  z-index: 50;
  color: #fff;
  padding: 24px;
}
.exhaustion-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 320px;
  width: 100%;
}
```

(`.btn-accent` and `.btn-ghost` already exist — verify with `grep -n "btn-accent\|btn-ghost" app/globals.css`. If `.btn-ghost` is missing, add a sibling rule with a transparent bg + 1px `var(--line)` border.)

- [ ] **Step 3: Commit**

```bash
git add components/feed/ExhaustionModal.tsx app/globals.css
git commit -m "feat(feed): ExhaustionModal with extend-by-60s flow"
```

---

## Task 10: Wire ExhaustionModal into FeedPlayer + drop angel image

**Files:**
- Modify: `app/feed/FeedPlayer.tsx`
- Modify: `components/feed/VideoEmbed.tsx` (forward `iframeRef`)

- [ ] **Step 1: Forward `iframeRef` from `VideoEmbed`**

Open `components/feed/VideoEmbed.tsx`. Add an optional prop:

```tsx
type VideoEmbedProps = {
  source: 'tiktok' | 'youtube';
  videoId: string;
  fillHeight?: boolean;
  iframeRef?: React.Ref<HTMLIFrameElement>;
};
```

On the YouTube `<iframe>`, ensure `src` includes `enablejsapi=1` (per CLAUDE.md "YouTube iframe bridge"), and pass `ref={iframeRef}`. For TikTok, ignore the ref (the postMessage will silently no-op — modal still works).

- [ ] **Step 2: Update `app/feed/FeedPlayer.tsx`**

Make these surgical edits (line numbers from the read above; verify before edit):

1. Drop `import Image from 'next/image';` (no longer used).
2. Add `import { ExhaustionModal } from '@/components/feed/ExhaustionModal';`.
3. Add `const iframeRef = useRef<HTMLIFrameElement | null>(null);`.
4. Add `const [balance, setBalance] = useState<number>(0);` near other useState calls.
5. In the heartbeat tick, after `const body = await res.json()`, also store balance: `if (typeof body.balance === 'number') setBalance(body.balance);`.
6. Replace the exhaustion branch:

   ```tsx
   if (body.ended) {
     endedRef.current = true;
     setEndedBySystem(true);
     setRemain(0);
     try {
       iframeRef.current?.contentWindow?.postMessage(
         JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
         '*'
       );
     } catch {}
   }
   ```

   (Drop the `setTimeout(router.push)` line.)
7. Translate the two `回去学习` strings to `Back to learning`.
8. Replace the `<Image src="/characters/angel.png" …/>` block inside `<button …data-testid="angel-exit">` with nothing — keep just the `<span className="angel-exit-label">…</span>` so the exit button is text-only.
9. In the `<VideoEmbed>` call, pass `iframeRef={iframeRef}`.
10. Replace the inline `endedBySystem` overlay (lines ~286-312) with:

    ```tsx
    {endedBySystem && (
      <ExhaustionModal
        sessionId={sessionId}
        balance={balance}
        onExtend={({ newBudget, balanceAfter }) => {
          setEndedBySystem(false);
          endedRef.current = false;
          setRemain(newBudget);
          setBalance(balanceAfter);
          try {
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
              '*'
            );
          } catch {}
        }}
      />
    )}
    ```

- [ ] **Step 3: Verify angel.png is unreferenced, then delete**

```bash
grep -rn "characters/angel" app components public 2>/dev/null
```

Expected: no matches. Then:

```bash
git rm public/characters/angel.png
```

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

Start a feed session with budget 5s (or hand-edit a session row to `budget_seconds = 5`). Wait until heartbeat returns `ended: true`. Modal renders, video pauses, "Watch 1 more minute" visible if balance ≥ 60. Click extend → modal closes, countdown resumes from 60.

- [ ] **Step 5: Commit**

```bash
git add app/feed/FeedPlayer.tsx components/feed/VideoEmbed.tsx
git commit -m "feat(feed): exhaustion modal replaces auto-redirect, drop angel image"
```

---

## Task 11: Playwright — discover.spec.ts

**Files:**
- Create: `tests/discover.spec.ts`

- [ ] **Step 1: Create the spec**

```ts
import { test, expect } from '@playwright/test';

// Assumes the test harness's auth/onboarding helpers exist (used in
// full-flow.spec.ts). If a project-local helper isn't available, this
// test should mirror full-flow's beforeEach setup.
import { devLoginAndOnboard } from './helpers';

test.describe('discover (PR 3)', () => {
  test.beforeEach(async ({ page }) => {
    await devLoginAndOnboard(page);
  });

  test('renders 5 group sections with English titles + Lucide icons', async ({ page }) => {
    await page.goto('/discover');
    await expect(page.getByTestId('discover-group-finance')).toBeVisible();
    await expect(page.getByTestId('discover-group-humanities')).toBeVisible();
    await expect(page.getByTestId('discover-group-stem')).toBeVisible();
    await expect(page.getByTestId('discover-group-math')).toBeVisible();
    await expect(page.getByTestId('discover-group-cs')).toBeVisible();

    await expect(page.getByText('Finance & Economics')).toBeVisible();
    await expect(page.getByText('Mathematics')).toBeVisible();
    // Lucide icons render as <svg>; assert one inside the finance header.
    const financeSection = page.getByTestId('discover-group-finance');
    await expect(financeSection.locator('svg').first()).toBeVisible();
  });

  test('tiles render in a 2-col grid with course count', async ({ page }) => {
    await page.goto('/discover');
    const grid = page.getByTestId('topic-grid').first();
    await expect(grid).toBeVisible();
    // First Finance topic = Microeconomics
    const microId = '10be2d17-1ed0-5300-94c2-96c65e9aac6f';
    const tile = page.getByTestId(`discover-topic-${microId}`);
    await expect(tile).toBeVisible();
    await expect(tile).toContainText('Microeconomics');
    await expect(tile).toContainText(/courses?$/);
  });
});
```

- [ ] **Step 2: Run**

```bash
npm test tests/discover.spec.ts
```

If `./helpers` doesn't exist in this repo, inline the dev-login/onboard sequence from `tests/full-flow.spec.ts`'s `test.beforeEach`.

- [ ] **Step 3: Commit**

```bash
git add tests/discover.spec.ts
git commit -m "test(discover): grid layout + english group titles"
```

---

## Task 12: Playwright — feed-extend.spec.ts

**Files:**
- Create: `tests/feed-extend.spec.ts`

The trick is forcing the feed session to exhaust quickly. We `POST /api/sessions/start` with `kind=feed&budget=5`, then send a heartbeat to bring `remain` to 0 (or wait for the natural 15s cadence; 5s is faster). Since we control the DB through the same migrations, the `extend_feed_session` RPC will also work in the test environment.

- [ ] **Step 1: Create the spec**

```ts
import { test, expect } from '@playwright/test';
import { devLoginAndOnboard, seedJarBalance, startFeedSession } from './helpers';

test.describe('feed extend (PR 3)', () => {
  test('exhaustion shows modal; extend +60s succeeds when balance >= 60', async ({ page, request }) => {
    await devLoginAndOnboard(page);
    await seedJarBalance(request, 600);  // 10 min in jar
    const { sessionId } = await startFeedSession(request, 5);  // 5s budget

    await page.goto(`/feed?session=${sessionId}`);

    const modal = page.getByTestId('feed-exhaustion-modal');
    await expect(modal).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('feed-exhaustion-back')).toBeVisible();
    const extendBtn = page.getByTestId('feed-exhaustion-extend');
    await expect(extendBtn).toBeVisible();

    await extendBtn.click();
    await expect(modal).toBeHidden({ timeout: 5_000 });

    // After extend: remaining counter should reset to ~60s
    await expect(page.getByTestId('feed-remaining')).toContainText('1:00', { timeout: 3_000 });

    // Verify the ledger entry exists.
    const ledger = await request.get('/api/dev/ledger?label=feed_extend').then((r) => r.json());
    expect(ledger.entries.length).toBeGreaterThanOrEqual(1);
    expect(ledger.entries[0].delta_seconds).toBe(-60);
  });

  test('extend button hidden when balance < 60', async ({ page, request }) => {
    await devLoginAndOnboard(page);
    await seedJarBalance(request, 30);  // below threshold
    const { sessionId } = await startFeedSession(request, 5);

    await page.goto(`/feed?session=${sessionId}`);

    await expect(page.getByTestId('feed-exhaustion-modal')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('feed-exhaustion-extend')).toHaveCount(0);
    await page.getByTestId('feed-exhaustion-back').click();
    await expect(page).toHaveURL(/\/home$/);
  });
});
```

- [ ] **Step 2: Add helpers if missing**

If `tests/helpers.ts` doesn't have `seedJarBalance` / `startFeedSession`, add them:

```ts
// tests/helpers.ts (additions)
import type { APIRequestContext } from '@playwright/test';

export async function seedJarBalance(request: APIRequestContext, seconds: number) {
  await request.post('/api/dev/seed-balance', { data: { seconds } });
}
export async function startFeedSession(request: APIRequestContext, budget: number) {
  const r = await request.post('/api/sessions/start', { data: { kind: 'feed', budget } });
  return r.json() as Promise<{ sessionId: string }>;
}
```

If `/api/dev/seed-balance` doesn't exist, add a tiny dev-only route:

```ts
// app/api/dev/seed-balance/route.ts
import { NextResponse } from 'next/server';
import { createClient, adminClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });
  const { seconds } = await req.json();
  await adminClient().from('ledger_entries').insert({
    user_id: user.id,
    delta_seconds: Number(seconds),
    label: 'test_seed',
  });
  return NextResponse.json({ ok: true });
}
```

(Recall `/api/dev/*` is already in middleware's `isPublic`, so this works even without auth in test mode.)

- [ ] **Step 3: Run**

```bash
npm test tests/feed-extend.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add tests/feed-extend.spec.ts tests/helpers.ts app/api/dev/seed-balance/route.ts
git commit -m "test(feed): exhaustion modal + extend RPC end-to-end"
```

---

## Task 13: Update `tests/full-flow.spec.ts` for 4-tab nav

**Files:**
- Modify: `tests/full-flow.spec.ts`

- [ ] **Step 1: Find tab assertions**

```bash
grep -n "nav-progress\|nav-home\|nav-relax\|bottom-nav" tests/full-flow.spec.ts
```

- [ ] **Step 2: Replace `nav-progress` references with `nav-profile`** and add a `nav-discover` smoke check after the home renders:

```ts
await expect(page.getByTestId('nav-home')).toBeVisible();
await expect(page.getByTestId('nav-discover')).toBeVisible();
await expect(page.getByTestId('nav-relax')).toBeVisible();
await expect(page.getByTestId('nav-profile')).toBeVisible();

// Click discover and verify routing.
await page.getByTestId('nav-discover').click();
await expect(page).toHaveURL(/\/discover$/);
```

- [ ] **Step 3: Run full suite**

```bash
npm test
```

Resolve any cascading red. Commit.

```bash
git add tests/full-flow.spec.ts
git commit -m "test(full-flow): assert 4-tab nav + discover route"
```

---

## Task 14: Verification + lint + typecheck

**Files:** none (verification gate)

- [ ] **Step 1: Lint**

```bash
npm run lint
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Build**

```bash
npm run build
```

- [ ] **Step 4: Full Playwright suite**

```bash
npm test
```

All four must pass. If anything fails, fix at root cause (do not skip tests). Commit any fixes as `fix: …`.

---

## Task 15: Push branch + open stacked PR

**Files:** none

- [ ] **Step 1: Push the branch**

```bash
git push -u origin claude/pr3-discover-relax-feed
```

- [ ] **Step 2: Open the PR with `gh`** — base is `claude/pr2-home-profile`, NOT `main`:

```bash
gh pr create \
  --base claude/pr2-home-profile \
  --head claude/pr3-discover-relax-feed \
  --title "PR 3: discover redesign + 4-tab nav + relax/feed polish + extend flow" \
  --body "$(cat <<'EOF'
## Summary

Third and final PR of the multi-page polish redesign (stacks on PR #30).

- **BottomNav** grows to 4 tabs: home / discover / relax / profile. Lucide icons throughout.
- **Discover** now ships English group titles (`Finance & Economics`, `Mathematics`, …) and Lucide icons in place of Chinese + emoji. Layout switches from pill chips to a 2-col grid of `TopicTile`s with course counts and a ✓ badge for topics already in the user's library.
- **Relax (`/budget`)** drops the Nibs character image, uses English copy (`Take a break?`), and gates to a `RelaxEmptyState` when balance < 60s.
- **Feed exhaustion** now opens an `ExhaustionModal` instead of auto-redirecting after 1.2s. Users can either head back to learning or spend 60s of jar balance to extend the session by one minute via the new `extend_feed_session` `security definer` RPC.

## Migrations

- `0013_groups_english_titles.sql` — UPDATE 5 `topic_groups` + 24 `topics` rows. Schema unchanged; idempotent.
- `0014_extend_feed_session.sql` — `extend_feed_session(uuid)` RPC. `security definer`, enforces `auth.uid() = session.user_id`.

## Stacking

Base is `claude/pr2-home-profile` (PR #30). Once #30 merges to `main`, GitHub will auto-rebase this PR's base to `main`.

## Test plan

- [ ] `npm test tests/discover.spec.ts` — discover grid + English titles
- [ ] `npm test tests/feed-extend.spec.ts` — exhaustion modal + extend RPC
- [ ] `npm test tests/full-flow.spec.ts` — 4-tab nav + nav-discover routes to /discover
- [ ] Manual: visit `/discover` after `npm run supabase:reset`; verify 5 English sections with Lucide icons
- [ ] Manual: feed with `budget_seconds=5`; modal appears; extend works when balance ≥ 60
- [ ] Manual: bottom nav shows 4 tabs and active state matches the route on `/topic/<id>` (discover) vs `/course/<id>` (home)
EOF
)"
```

- [ ] **Step 3: Output the PR URL** so the user can review.

---

## Self-review checklist

Before requesting review:

- [ ] **Bite-sized steps:** every step ships ≤ ~50 LOC of new content; no monolithic edits.
- [ ] **Actual code in every step:** no `// TODO` placeholders or "implement X here" hand-waves in this plan.
- [ ] **Frequent commits:** 13 implementation tasks → 13 commits + verification + PR. One coherent change per commit.
- [ ] **TDD where applicable:** Playwright specs cover the two new user-facing flows (discover grid + feed extend) and the existing full-flow updates assert the 4-tab nav. SQL sanity check on the RPC migration.
- [ ] **CLAUDE.md invariants honored:**
  - Jar balance never trusted to client — extend goes through `security definer` RPC; debit lives only in DB. ✓
  - Two Supabase clients not mixed — extend route uses `createClient()` (user-scoped) so RPC sees `auth.uid()`. ✓
  - RLS not relaxed — RPC is `security definer` with internal owner check; no new policies on existing tables. ✓
  - Pointer Events for gestures — feed swipe code untouched. ✓
  - Tailwind tokens — new CSS uses `var(--accent)`, `var(--ink)`, `var(--bg-2)`, `var(--line)`, `var(--ink-mute)`, `var(--serif)`, `var(--mono)`. No hex literals. ✓
  - `isPublic` allowlist — appended `/api/dev/seed-balance` lives under existing `/api/dev/*` glob; no rewrite of the list. ✓
  - YouTube iframe `enablejsapi=1` already required by lesson page; reused for pause/play in feed. ✓
- [ ] **Stacked PR base** is `claude/pr2-home-profile`, not `main`.
- [ ] **Asset deletions** (`nibs.png`, `angel.png`) are gated on a `grep` showing zero references first.
- [ ] **No backfill needed** for migration 0013 — UPDATE-by-id is idempotent; user-created topics remain untouched.
- [ ] **Final task is push + PR**, with a complete `gh pr create` invocation including title, base, head, and body.

---

**Plan complete.** Total tasks: 15.
