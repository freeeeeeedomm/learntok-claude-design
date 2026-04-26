# PR 2: Home + Profile Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home greeting/stats block with a denser stats hero card, add per-rail topic-edit and per-card course-remove flows, and rename `/progress` → `/profile` with display-name editing, an in-app earn-ratio slider, a learning-rhythm visualization, and a recent-activity list.

**Architecture:** Three coupled chunks. (1) **Shared `<RestSlider>`** extracted from onboarding's `<PageDeal>` so both onboarding and the new profile settings share one source of truth for the Learn-1h + Rest-variable widget. (2) **Home rework**: greeting block deleted, `<StatsCard>` swapped for `<StatsHero>` (5-row banded layout lifted from progress summary), `<ContinueRow>` gets a section eyebrow, `<TopicRail>` gets edit popover + per-card remove × button. (3) **Profile route created** at `/profile` (server component) reading profile + sessions + ledger; old `/progress` page becomes a redirect; `<ProgressView>` is deleted. Server actions live in `app/home/actions.ts` (delete topic + delete course, both with confirm gating) and `app/profile/actions.ts` (display name + rest minutes).

**Tech Stack:** Next.js 14 App Router (server components for data, client components for interactive popovers/modals/sliders), Supabase (RLS-scoped queries), Playwright (`@playwright/test`), Lucide React (icons reused from existing imports), no new deps.

**Worktree:** `C:\Users\admin\Desktop\ClaudeProjects\learntok-claude-design\.claude\worktrees\polish-redesign-brainstorm`
**Branch:** `claude/pr2-home-profile` (already created at `origin/main` after PR #29 merged).

**Spec reference:** `docs/superpowers/specs/2026-04-26-multi-page-polish-redesign-design.md` § 2, § 3, § 4 + the PR 2 file table.

**Out of scope:**
- BottomNav 4-tab change (PR 3)
- Discover redesign / topic icons / English group titles (PR 3)
- Relax page polish, feed exhaustion modal (PR 3)

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `components/onboarding/RestSlider.tsx` | Create | Shared widget: Learn-1h static row + Rest-variable row + slider 5-60 step 5 + mood label. Stateless presentational; parent owns `restMin`. Used by both onboarding's `<PageDeal>` and profile's `<SettingsSection>`. Exports `moodLabel(restMin)` so both call sites stay in sync. |
| `components/onboarding/Onboarding.tsx` | Modify | Delete inline `moodLabel`, `REST_*` constants, slider markup. Replace the slider/labels portion of `<PageDeal>` with `<RestSlider restMin={restMin} onChange={onChange} />`. Keep eyebrow + headline + CTA + page wrapper. |
| `components/home/StatsHero.tsx` | Create | Replaces `<StatsCard>`. 5-row banded layout: Balance / Streak / Earned today / Spent today / Scope cell (week/month/total) — scope toggle behavior preserved from `<StatsCard>` (popover + localStorage). |
| `components/home/StatsCard.tsx` | Delete | Replaced by `<StatsHero>`. |
| `components/home/ContinueRow.tsx` | Modify | Drop the inline `continue · ` prefix from `.continue-eyebrow`. Section eyebrow on home page now provides the label. |
| `components/home/TopicRail.tsx` | Modify | Add `<TopicRailEdit>` to right side of `.rail-title`. Pass `onRemoveCourse` to each card via prop drilling (cards become `<RailCourseCard>` for the × button). |
| `components/home/TopicRailEdit.tsx` | Create | Client popover triggered by ⋯ button. Two items: `+ add course` (Link to `/discover/topic/[id]`), `delete topic` (calls `removeTopic` action; shows `<DeleteTopicConfirm>` if action returns `requiresConfirm`). |
| `components/home/DeleteTopicConfirm.tsx` | Create | Client modal: `Delete [topic name]? You have N courses with M completed lessons. This will remove all of them and your progress.` Cancel / Delete buttons. |
| `components/home/RailCourseCard.tsx` | Create | Wraps existing rail-card markup; adds top-right × button calling `removeCourse(course.id)`. Splitting out the card avoids inline JSX bloat in `<TopicRail>`. **Naming divergence from spec:** spec called this `CourseCardRemove`, but the component owns the entire card markup (not just the × button), so `RailCourseCard` is the more honest name. |
| `components/home/DeleteCourseConfirm.tsx` | Create | Client modal: `Remove [course name]? You've completed M lessons. This deletes the course and your progress.` Cancel / Delete. |
| `app/home/page.tsx` | Modify | Remove greeting block + jar chip header (lines 211-229). Insert `Continue learning` section eyebrow above `<ContinueRow>`. Swap `<StatsCard>` for `<StatsHero>` and pass balance + ledger sums. Pass `removeTopic`/`removeCourse` actions and progress counts to `<TopicRail>`. Drop the now-unused `weekday` const + `fmtBank` import. |
| `app/home/actions.ts` | Create | `removeTopic(topicId) → { ok, cascaded } \| { requiresConfirm, courseCount, completedLessonCount }`. `confirmRemoveTopic(topicId) → { ok }`. `removeCourse(courseId) → { ok } \| { requiresConfirm, completedLessonCount }`. `confirmRemoveCourse(courseId) → { ok }`. All RLS-scoped via `createClient()`. |
| `app/profile/page.tsx` | Create | New server route. Auth gate, profile + sessions (last 30d) + ledger (last 30) queries. Renders `<SettingsSection>`, `<LearningRhythm>`, `<RecentActivity>`, `<SignOutButton>`. |
| `app/profile/actions.ts` | Create | `updateDisplayName(name) → { ok } \| { error }`. `updateRestMinutes(restMin) → { ok, rate } \| { error }`. RLS-scoped. |
| `components/profile/SettingsSection.tsx` | Create | Client component. Two rows: inline-editable display name input (save on blur/Enter), and `<RestSlider>` driven by local state (save on `pointerup`, optimistic UI with revert-on-error). |
| `components/profile/LearningRhythm.tsx` | Create | Client component. Receives sessions array from server, renders per-day horizontal segmented bars + totals. Window toggle (`week` default, `month`). |
| `components/profile/RecentActivity.tsx` | Create | Server-rendered. Lifted from `ProgressView` ledger list (lines 123-155). |
| `components/profile/SignOutButton.tsx` | Create | Client. Calls `supabase.auth.signOut()` then `router.push('/login')`. |
| `app/progress/page.tsx` | Modify | Replace contents with `redirect('/profile')`. Keep file so old links 307 instead of 404. |
| `app/progress/ProgressView.tsx` | Delete | Pieces lifted into `<StatsHero>` (summary), `<RecentActivity>` (ledger list). Courses tab dropped per spec. |
| `app/globals.css` | Modify | Add `.stats-hero` / `.stats-hero-row` / `.stats-hero-band` rules (5-row banded layout). Add `.rail-title` flex tweak for the ⋯ button. Add `.rail-card` `.rail-x` button absolute positioning. Add `.modal-overlay` / `.modal-card` if not already present. Add `.profile-section` and `.rhythm-row` / `.rhythm-bar` / `.rhythm-block` rules. |
| `tests/home-edit.spec.ts` | Create | Three Playwright cases: (1) topic-edit popover opens, "delete topic" with no progress deletes immediately; (2) topic-edit popover with progress shows confirm modal, confirm cascades; (3) per-card × on a course with progress shows confirm modal. |
| `tests/profile.spec.ts` | Create | Four cases: (1) `/progress` 307s to `/profile`; (2) profile page renders all sections; (3) `updateDisplayName` persists and re-renders; (4) `updateRestMinutes` persists and recomputes rate. |
| `tests/full-flow.spec.ts` | Modify | Update step 8 to NOT assert the greeting (it's gone). Update the home-renders section to assert `<StatsHero>` testid present. |
| `middleware.ts` | (no change) | Spec table listed this, but the actual middleware has no route-specific allowlist — `/profile` is gated by the default authed-route rule like `/home`. The `/progress` redirect happens inside the page component (server-side `redirect('/profile')`), which middleware just passes through. **No edit needed.** |

---

## Task 1: Extract `<RestSlider>` shared component

**Files:**
- Create: `components/onboarding/RestSlider.tsx`
- Modify: `components/onboarding/Onboarding.tsx:17-27, 111-186` (remove inline `moodLabel`, constants, and replace the slider portion of `PageDeal`)

This task is pure refactor — the on-screen result must be byte-identical to current onboarding. The new component is the dependency for Task 4 (profile SettingsSection).

- [ ] **Step 1: Create `components/onboarding/RestSlider.tsx`**

```tsx
'use client';
import React from 'react';

export const REST_MIN = 5;
export const REST_MAX = 60;
export const REST_STEP = 5;

export function moodLabel(restMin: number): string {
  if (restMin <= 5)  return 'monk mode';   // 5      → 12:1 learn:play
  if (restMin <= 15) return 'focused';     // 10-15  → 6:1 to 4:1
  if (restMin <= 30) return 'balanced';    // 20-30  → 3:1 to 2:1
  if (restMin <= 50) return 'easygoing';   // 35-50  → ~1.7:1 to ~1.2:1
  return 'playtime';                       // 55-60  → ~1.1:1 to 1:1
}

type Props = {
  restMin: number;
  onChange: (n: number) => void;
  /**
   * Optional callback fired on slider release. Profile page uses this to save
   * the value to the server only when the user lifts the pointer, not on every
   * tick. Onboarding doesn't pass it (it commits at CTA click instead).
   */
  onCommit?: (n: number) => void;
  /**
   * If true, drop the testids that are specific to the onboarding flow. Default
   * false so existing onboarding tests keep passing.
   */
  hideOnboardingTestIds?: boolean;
};

/**
 * Two info rows + slider + mood label. Used by both the onboarding deal card
 * and the profile settings card. Parent owns the `restMin` value; this is
 * stateless. The "Learn 1 hour" anchor is fixed; the slider varies "Rest".
 */
export function RestSlider({
  restMin,
  onChange,
  onCommit,
  hideOnboardingTestIds = false,
}: Props) {
  return (
    <div className="col gap-12">
      <div className="row between aic">
        <span className="body" style={{ color: 'var(--ink)' }}>Learn</span>
        <span className="display" style={{ fontSize: 22 }}>1 hour</span>
      </div>
      <div className="row between aic">
        <span className="body" style={{ color: 'var(--ink)' }}>Rest</span>
        <span
          className="display"
          style={{ fontSize: 28, color: 'var(--accent)' }}
          data-testid={hideOnboardingTestIds ? undefined : 'deal-rest-min'}
        >
          {restMin} min
        </span>
      </div>

      <input
        type="range"
        min={REST_MIN}
        max={REST_MAX}
        step={REST_STEP}
        value={restMin}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        onPointerUp={(e) =>
          onCommit?.(parseInt((e.target as HTMLInputElement).value, 10))
        }
        onKeyUp={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            onCommit?.(parseInt((e.target as HTMLInputElement).value, 10));
          }
        }}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
        data-testid={hideOnboardingTestIds ? 'rest-slider' : 'deal-slider'}
      />

      <div
        className="row"
        style={{
          justifyContent: 'center',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'var(--ink-mute)',
        }}
        data-testid={hideOnboardingTestIds ? 'rest-mood' : 'deal-mood'}
      >
        {moodLabel(restMin)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `components/onboarding/Onboarding.tsx`** — delete the inline constants and `moodLabel`, replace the slider markup in `PageDeal`.

Find lines 1-2:

```tsx
'use client';
import React from 'react';
```

Replace with:

```tsx
'use client';
import React from 'react';
import { RestSlider } from './RestSlider';
```

Find lines 17-27:

```tsx
const REST_MIN = 5;
const REST_MAX = 60;
const REST_STEP = 5;

function moodLabel(restMin: number): string {
  if (restMin <= 5)  return 'monk mode';   // 5      → 12:1 learn:play
  if (restMin <= 15) return 'focused';     // 10-15  → 6:1 to 4:1
  if (restMin <= 30) return 'balanced';    // 20-30  → 3:1 to 2:1
  if (restMin <= 50) return 'easygoing';   // 35-50  → ~1.7:1 to ~1.2:1
  return 'playtime';                       // 55-60  → ~1.1:1 to 1:1
}
```

Delete those 11 lines entirely.

Find the body of `PageDeal` (lines 121-184 in the post-PR1 file). Replace the entire `<div className="card mt-16 col gap-12"> ... </div>` block (the card containing the two rows + slider + mood label + footnote) with:

```tsx
      <div className="card mt-16">
        <RestSlider restMin={restMin} onChange={onChange} />
        <div className="body" style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 12 }}>
          you can adjust this later in profile.
        </div>
      </div>
```

(Note: the testids `deal-rest-min`, `deal-slider`, `deal-mood` are preserved by `<RestSlider>`'s default behavior, so existing onboarding tests keep passing.)

- [ ] **Step 3: Type-check passes**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Run onboarding-related tests to verify byte-identical behavior**

Run (against the dev server already up on whichever port):
```bash
PW_BASE_URL=http://localhost:3003 corepack pnpm test tests/full-flow.spec.ts tests/onboarding.spec.ts 2>&1 | tail -10
```
Expected: full-flow passes (it exercises the deal card with `deal-rest-min` / `deal-slider` / `deal-mood` testids, all preserved). `onboarding.spec.ts` may have its own preexisting failures from PR 1's reframe; check the tail — only NEW failures introduced by this refactor count.

- [ ] **Step 5: Commit**

```bash
git add components/onboarding/RestSlider.tsx components/onboarding/Onboarding.tsx
git commit -m "refactor(onboarding): extract <RestSlider> shared component

Foundation for profile SettingsSection (PR 2). On-screen behavior
identical: same testids, same labels, same slider range/step.
Adds onCommit callback (used by profile to save on pointerup;
onboarding ignores it, commits at CTA click)."
```

---

## Task 2: Profile actions — `updateDisplayName` + `updateRestMinutes`

**Files:**
- Create: `app/profile/actions.ts`

This task ships the server actions before the UI consumes them, so Task 4's optimistic UI has a real endpoint to call.

- [ ] **Step 1: Create `app/profile/actions.ts`**

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const NameSchema = z
  .string()
  .trim()
  .min(1, 'empty_name')
  .max(40, 'name_too_long');

export async function updateDisplayName(
  raw: string,
): Promise<{ ok: true } | { error: string }> {
  const parsed = NameSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'invalid_name' };
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'unauth' };

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: parsed.data })
    .eq('id', user.id);
  if (error) return { error: error.message };

  revalidatePath('/profile');
  return { ok: true };
}

const RestSchema = z
  .number()
  .int()
  .min(5, 'rest_out_of_range')
  .max(60, 'rest_out_of_range');

export async function updateRestMinutes(
  raw: number,
): Promise<{ ok: true; rate: number } | { error: string }> {
  // Snap to 5-min step before validating so a stray 7 from a misbehaving
  // client UI gets normalized rather than rejected.
  const snapped = Math.round(Number(raw) / 5) * 5;
  const parsed = RestSchema.safeParse(snapped);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'invalid_rest' };
  }
  // Same formula as onboarding: rate = restMin / 60.
  // Round to 3 decimals so storage matches numeric(4,3) without surprise drift.
  const rate = Math.round((parsed.data / 60) * 1000) / 1000;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'unauth' };

  const { error } = await supabase
    .from('profiles')
    .update({ rate })
    .eq('id', user.id);
  if (error) return { error: error.message };

  revalidatePath('/profile');
  return { ok: true, rate };
}
```

- [ ] **Step 2: Type-check passes**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/profile/actions.ts
git commit -m "feat(profile-actions): add updateDisplayName + updateRestMinutes

Validates input (trim + length for name, snap-to-5 + range for
rest), updates profiles row via user-scoped client (RLS enforced).
updateRestMinutes computes rate = restMin / 60 and stores at
3-decimal precision to match the numeric(4,3) column."
```

---

## Task 3: Profile route shell + redirect from `/progress`

**Files:**
- Create: `app/profile/page.tsx`
- Create: `components/profile/SignOutButton.tsx`
- Modify: `app/progress/page.tsx` (replace with redirect)
- Delete: `app/progress/ProgressView.tsx`

This task creates the route at `/profile` with placeholders for the three section components (Settings, LearningRhythm, RecentActivity). Sections are filled in Tasks 4-6. The placeholder is enough that Task 7's "page renders" Playwright test can be written and passes once each section lands.

- [ ] **Step 1: Create `components/profile/SignOutButton.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    if (pending) return;
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={onClick}
      disabled={pending}
      data-testid="profile-sign-out"
      style={{ width: '100%' }}
    >
      {pending ? 'signing out…' : 'Sign out'}
    </button>
  );
}
```

- [ ] **Step 2: Create `app/profile/page.tsx` with placeholder children**

The placeholders return `null` for now. Tasks 4, 5, 6 swap them out for real components. This decouples the route from the section work and keeps each task small.

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SettingsSection } from '@/components/profile/SettingsSection';
import { LearningRhythm } from '@/components/profile/LearningRhythm';
import { RecentActivity } from '@/components/profile/RecentActivity';
import { SignOutButton } from '@/components/profile/SignOutButton';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, rate, jar_balance_cached, streak, onboarded')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarded) redirect('/onboarding');

  // Sessions for the rhythm viz: last 30 days, all kinds (learn + feed).
  // We keep the window flexible; the viz toggles between week (last 7) and
  // month (last 30) client-side from the same dataset.
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

  const [sessionsRes, ledgerRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, kind, started_at, ended_at, last_heartbeat_at')
      .eq('user_id', user.id)
      .gte('started_at', thirtyDaysAgo.toISOString())
      .order('started_at', { ascending: true }),
    supabase
      .from('ledger_entries')
      .select('id, delta_seconds, label, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  // Compute duration per session: ended_at if present, else last_heartbeat_at
  // (still-open sessions count up to their last ping). Floor to int seconds.
  const sessions = (sessionsRes.data ?? []).map((s) => {
    const endIso = s.ended_at ?? s.last_heartbeat_at;
    const durSec = Math.max(
      0,
      Math.floor(
        (new Date(endIso).getTime() - new Date(s.started_at).getTime()) / 1000,
      ),
    );
    return {
      id: s.id,
      kind: s.kind as 'learn' | 'feed',
      startedAt: s.started_at,
      durationSec: durSec,
    };
  });

  const ledger = (ledgerRes.data ?? []).map((e) => ({
    id: e.id,
    label: e.label,
    delta: e.delta_seconds,
    createdAt: e.created_at,
  }));

  return (
    <main className="app">
      <div className="topbar">
        <a href="/home" className="back" data-testid="profile-back">
          ‹
        </a>
        <div className="eyebrow">profile</div>
        <div style={{ width: 36 }} />
      </div>

      <div className="pad pad-top" style={{ paddingTop: 80 }} data-testid="profile-page">
        <div className="display" style={{ fontSize: 28 }}>profile</div>

        <SettingsSection
          initialDisplayName={profile.display_name ?? ''}
          initialRate={profile.rate ?? 1.0}
        />

        <LearningRhythm sessions={sessions} />

        <RecentActivity ledger={ledger} />

        <div className="mt-24" style={{ paddingBottom: 32 }}>
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create stub child components so the page imports resolve**

Create `components/profile/SettingsSection.tsx` (stub, fleshed out in Task 4):

```tsx
'use client';
type Props = { initialDisplayName: string; initialRate: number };
export function SettingsSection(_props: Props) {
  return <div data-testid="profile-settings" className="mt-24" />;
}
```

Create `components/profile/LearningRhythm.tsx` (stub, fleshed out in Task 5):

```tsx
'use client';
type Session = { id: string; kind: 'learn' | 'feed'; startedAt: string; durationSec: number };
type Props = { sessions: Session[] };
export function LearningRhythm(_props: Props) {
  return <div data-testid="profile-rhythm" className="mt-24" />;
}
```

Create `components/profile/RecentActivity.tsx` (stub, fleshed out in Task 6):

```tsx
type LedgerEntry = { id: number; label: string; delta: number; createdAt: string };
type Props = { ledger: LedgerEntry[] };
export function RecentActivity(_props: Props) {
  return <div data-testid="profile-activity" className="mt-24" />;
}
```

- [ ] **Step 4: Replace `app/progress/page.tsx` with a redirect**

Delete the entire current contents of `app/progress/page.tsx` and write:

```ts
import { redirect } from 'next/navigation';

// /progress was renamed to /profile in PR 2. This stub preserves any deep
// links / bookmarks pointing at the old URL.
export default function ProgressPage(): never {
  redirect('/profile');
}
```

- [ ] **Step 5: Delete `app/progress/ProgressView.tsx`**

```bash
git rm app/progress/ProgressView.tsx
```

- [ ] **Step 6: Type-check passes**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Smoke-test the redirect + profile shell**

Run (with dev server up on 3003):
```bash
curl -s -o nul -w "/progress=%{http_code} -> " -X GET http://localhost:3003/progress -L --max-redirs 0 && echo done
```
Expected: `307` (Next emits 307 for `redirect()` in server components). For a fully-rendered chain, follow:
```bash
curl -s -L http://localhost:3003/profile | grep -oE 'data-testid="profile-page"' | head -1
```
Expected: `data-testid="profile-page"` (the page renders).

- [ ] **Step 8: Commit**

```bash
git add app/profile/page.tsx components/profile/ app/progress/page.tsx
git rm -f app/progress/ProgressView.tsx 2>/dev/null || true
git commit -m "feat(profile): create /profile route + redirect /progress

Server route reads profile + sessions (30d) + ledger (30 entries).
Renders SettingsSection / LearningRhythm / RecentActivity (stubs
for now; filled in Tasks 4-6) + SignOutButton. /progress -> /profile
via 307 to preserve deep links. Deletes legacy ProgressView."
```

---

## Task 4: SettingsSection — display name + rest slider with optimistic save

**Files:**
- Modify: `components/profile/SettingsSection.tsx` (replace stub)
- Modify: `app/globals.css` (add `.profile-section` rule)

- [ ] **Step 1: Add CSS for profile sections**

Append to `app/globals.css` (anywhere after the existing component styles, before the `@layer` close if any):

```css
/* Profile page sections — bordered cards with section eyebrow on top. */
.profile-section {
  margin-top: 24px;
}
.profile-section-title {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--ink-mute);
  margin-bottom: 8px;
}
.profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
}
.profile-row + .profile-row {
  border-top: 1px solid var(--line);
}
.profile-name-input {
  font-family: var(--serif);
  font-size: 18px;
  background: transparent;
  border: none;
  border-bottom: 1px dashed var(--line);
  text-align: right;
  color: var(--ink);
  padding: 4px 2px;
  width: 60%;
  outline: none;
}
.profile-name-input:focus {
  border-bottom-color: var(--accent);
}
```

- [ ] **Step 2: Replace `components/profile/SettingsSection.tsx` with the real implementation**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { RestSlider } from '@/components/onboarding/RestSlider';
import { updateDisplayName, updateRestMinutes } from '@/app/profile/actions';

type Props = {
  initialDisplayName: string;
  initialRate: number; // numeric, e.g. 0.5
};

// Mirror of app/onboarding/page.tsx's rateToRestMinutes — kept tiny here
// to avoid coupling client component to a server file.
function rateToRestMinutes(rate: number): number {
  if (!rate || rate <= 0) return 30;
  const m = Math.round((rate * 60) / 5) * 5;
  if (m < 5 || m > 60) return 30;
  return m;
}

export function SettingsSection({ initialDisplayName, initialRate }: Props) {
  const [name, setName] = useState(initialDisplayName);
  const [savedName, setSavedName] = useState(initialDisplayName);
  const [restMin, setRestMin] = useState<number>(rateToRestMinutes(initialRate));
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed === savedName) return;
    if (!trimmed) {
      setName(savedName); // revert empty entry
      return;
    }
    startTransition(async () => {
      const res = await updateDisplayName(trimmed);
      if ('error' in res) {
        setError(res.error);
        setName(savedName);
      } else {
        setSavedName(trimmed);
        setError(null);
      }
    });
  };

  const commitRest = (next: number) => {
    startTransition(async () => {
      const res = await updateRestMinutes(next);
      if ('error' in res) {
        setError(res.error);
      } else {
        setError(null);
      }
    });
  };

  return (
    <section className="profile-section" data-testid="profile-settings">
      <div className="profile-section-title">settings</div>

      <div className="card">
        <div className="profile-row">
          <span className="body" style={{ color: 'var(--ink)' }}>Display name</span>
          <input
            type="text"
            className="profile-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setName(savedName);
                (e.target as HTMLInputElement).blur();
              }
            }}
            maxLength={40}
            data-testid="profile-name-input"
          />
        </div>

        <div className="profile-row" style={{ display: 'block', paddingTop: 16 }}>
          <RestSlider
            restMin={restMin}
            onChange={setRestMin}
            onCommit={commitRest}
            hideOnboardingTestIds
          />
        </div>
      </div>

      {error && (
        <div
          className="body"
          role="alert"
          style={{ color: 'var(--bad)', fontSize: 12, marginTop: 8 }}
          data-testid="profile-settings-error"
        >
          {error}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Type-check passes**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Manual smoke check (no test yet; Task 7 covers it)**

Visit http://localhost:3003/profile in the browser (after dev login). Edit the display name, blur the input — name persists across reload. Drag the rest slider, release — `profile.rate` row in DB should change.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css components/profile/SettingsSection.tsx
git commit -m "feat(profile-settings): inline-edit display name + rest slider

Display name commits on blur/Enter, reverts on Escape or empty.
Rest slider uses shared <RestSlider>; commits on pointerup via
onCommit callback to avoid hammering the server during drag."
```

---

## Task 5: LearningRhythm — per-day segmented bars

**Files:**
- Modify: `components/profile/LearningRhythm.tsx` (replace stub)
- Modify: `app/globals.css` (add `.rhythm-*` rules)

- [ ] **Step 1: Add CSS for the rhythm viz**

Append to `app/globals.css`:

```css
/* Learning rhythm — one row per day, segmented blocks per session. */
.rhythm-row {
  display: grid;
  grid-template-columns: 64px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 8px 0;
  font-size: 13px;
}
.rhythm-row + .rhythm-row {
  border-top: 1px solid var(--line);
}
.rhythm-day {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-mute);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.rhythm-bar {
  display: flex;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: var(--bg-2);
}
.rhythm-block {
  height: 100%;
}
.rhythm-block.learn {
  background: var(--accent);
}
.rhythm-block.feed {
  background: repeating-linear-gradient(
    45deg,
    var(--ink-mute),
    var(--ink-mute) 3px,
    var(--bg-2) 3px,
    var(--bg-2) 6px
  );
}
.rhythm-empty {
  font-size: 12px;
  color: var(--ink-mute);
  font-style: italic;
}
.rhythm-totals {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-mute);
  text-align: right;
  white-space: nowrap;
}
.rhythm-window-toggle {
  display: inline-flex;
  gap: 6px;
  margin-left: auto;
}
.rhythm-window-toggle button {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border: 1px solid var(--line);
  background: transparent;
  padding: 4px 10px;
  border-radius: 999px;
  color: var(--ink-mute);
  cursor: pointer;
}
.rhythm-window-toggle button.active {
  background: var(--ink);
  color: var(--bg);
  border-color: var(--ink);
}
```

- [ ] **Step 2: Replace `components/profile/LearningRhythm.tsx`**

```tsx
'use client';
import { useMemo, useState } from 'react';

type Session = {
  id: string;
  kind: 'learn' | 'feed';
  startedAt: string; // ISO
  durationSec: number;
};

type Props = { sessions: Session[] };

type Window = 'week' | 'month';

function fmtDur(sec: number): string {
  if (sec <= 0) return '0m';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

// Date-only key in the user's local tz: YYYY-MM-DD.
function dayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayLabel(iso: string, todayKey: string, yesterdayKey: string): string {
  const k = dayKey(iso);
  if (k === todayKey) return 'Today';
  if (k === yesterdayKey) return 'Yesterday';
  const d = new Date(iso);
  const ageDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (ageDays < 7) {
    return d.toLocaleDateString('en', { weekday: 'short' });
  }
  return d.toLocaleDateString('en', { month: '2-digit', day: '2-digit' });
}

export function LearningRhythm({ sessions }: Props) {
  const [window, setWindow] = useState<Window>('week');

  const view = useMemo(() => {
    const now = new Date();
    const dayCount = window === 'week' ? 7 : 30;

    // Build the list of date-keys to render, newest first.
    const days: { key: string; iso: string }[] = [];
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      days.push({ key: dayKey(d.toISOString()), iso: d.toISOString() });
    }

    // Bucket sessions by day-key.
    const byDay = new Map<string, Session[]>();
    for (const s of sessions) {
      if (s.durationSec <= 0) continue;
      const k = dayKey(s.startedAt);
      const arr = byDay.get(k) ?? [];
      arr.push(s);
      byDay.set(k, arr);
    }

    // Per-day totals + a global max for relative bar scaling.
    let maxTotal = 0;
    const rows = days.map(({ key, iso }) => {
      const items = (byDay.get(key) ?? []).slice().sort((a, b) =>
        a.startedAt.localeCompare(b.startedAt),
      );
      const learnSec = items
        .filter((s) => s.kind === 'learn')
        .reduce((sum, s) => sum + s.durationSec, 0);
      const feedSec = items
        .filter((s) => s.kind === 'feed')
        .reduce((sum, s) => sum + s.durationSec, 0);
      const total = learnSec + feedSec;
      if (total > maxTotal) maxTotal = total;
      return { key, iso, items, learnSec, feedSec, total };
    });

    return { rows, maxTotal };
  }, [sessions, window]);

  const todayKey = dayKey(new Date().toISOString());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayKey = dayKey(yesterdayDate.toISOString());

  return (
    <section className="profile-section" data-testid="profile-rhythm">
      <div className="row between aic" style={{ marginBottom: 8 }}>
        <div className="profile-section-title" style={{ marginBottom: 0 }}>
          learning rhythm
        </div>
        <div className="rhythm-window-toggle" data-testid="rhythm-window">
          <button
            type="button"
            className={window === 'week' ? 'active' : ''}
            onClick={() => setWindow('week')}
            data-testid="rhythm-window-week"
          >
            Week
          </button>
          <button
            type="button"
            className={window === 'month' ? 'active' : ''}
            onClick={() => setWindow('month')}
            data-testid="rhythm-window-month"
          >
            Month
          </button>
        </div>
      </div>

      <div className="card">
        {view.rows.map((row) => {
          const widthPct =
            view.maxTotal > 0 ? (row.total / view.maxTotal) * 100 : 0;
          return (
            <div
              key={row.key}
              className="rhythm-row"
              data-testid={`rhythm-day-${row.key}`}
            >
              <div className="rhythm-day">
                {dayLabel(row.iso, todayKey, yesterdayKey)}
              </div>

              {row.total === 0 ? (
                <div className="rhythm-empty">— no activity —</div>
              ) : (
                <div className="rhythm-bar" style={{ width: `${widthPct}%` }}>
                  {row.items.map((s) => {
                    const blockPct = (s.durationSec / row.total) * 100;
                    return (
                      <div
                        key={s.id}
                        className={`rhythm-block ${s.kind}`}
                        style={{ width: `${blockPct}%` }}
                        title={`${s.kind} · ${fmtDur(s.durationSec)} · ${new Date(
                          s.startedAt,
                        ).toLocaleTimeString('en', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}`}
                      />
                    );
                  })}
                </div>
              )}

              <div className="rhythm-totals">
                {row.total === 0
                  ? ''
                  : `${fmtDur(row.learnSec)} learn${
                      row.feedSec > 0 ? ` · ${fmtDur(row.feedSec)} relax` : ''
                    }`}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Type-check passes**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Manual eyeball — visit /profile, verify per-day rows render**

Visit http://localhost:3003/profile. Expect 7 rows under "learning rhythm". Days with no sessions show `— no activity —`. Click `Month` toggle → 30 rows. Each block's width is proportional to its session duration relative to the day's total; the day's total bar width is proportional to its share of the heaviest day in window.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css components/profile/LearningRhythm.tsx
git commit -m "feat(profile-rhythm): per-day session timeline viz

Horizontal segmented bars, one row per day in selected window
(week=7, month=30). Block width proportional within row; bar
width proportional across rows (single global scale = max daily
total in window). Learn = solid accent, feed = striped ink-mute."
```

---

## Task 6: RecentActivity — lifted ledger list

**Files:**
- Modify: `components/profile/RecentActivity.tsx` (replace stub)

- [ ] **Step 1: Replace `components/profile/RecentActivity.tsx`**

```tsx
import { fmtBank } from '@/lib/format';

type LedgerEntry = {
  id: number;
  label: string;
  delta: number;
  createdAt: string;
};

type Props = { ledger: LedgerEntry[] };

function relTime(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ageMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function RecentActivity({ ledger }: Props) {
  return (
    <section className="profile-section" data-testid="profile-activity">
      <div className="profile-section-title">recent activity</div>

      <div className="col gap-6">
        {ledger.length === 0 && (
          <div className="body" style={{ textAlign: 'center', padding: 16 }}>
            no activity yet.
          </div>
        )}
        {ledger.map((e) => (
          <div
            key={e.id}
            className="card row between aic"
            style={{ padding: 12 }}
            data-testid={`activity-row-${e.id}`}
          >
            <div className="col" style={{ gap: 2 }}>
              <div
                className="body"
                style={{ color: 'var(--ink)', textTransform: 'capitalize' }}
              >
                {e.label.replaceAll('_', ' ')}
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: 'var(--ink-mute)',
                }}
              >
                {relTime(e.createdAt)}
              </div>
            </div>
            <div
              style={{
                color: e.delta > 0 ? 'var(--good)' : 'var(--bad)',
                fontWeight: 600,
                fontFamily: 'var(--mono)',
                fontSize: 13,
              }}
            >
              {e.delta > 0 ? '+' : '−'}
              {fmtBank(Math.abs(e.delta))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type-check passes**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/profile/RecentActivity.tsx
git commit -m "feat(profile-activity): lifted ledger list with relative times

Same data shape as old ProgressView ledger, with added
just-now/Xm/Xh/Xd timestamp under each label."
```

---

## Task 7: Profile page Playwright tests

**Files:**
- Create: `tests/profile.spec.ts`

- [ ] **Step 1: Create the test file**

```ts
import { test, expect } from '@playwright/test';
import { admin, devAuthedContext } from './helpers/session';

test.describe('/profile route', () => {
  test('GET /progress redirects to /profile', async ({ request }) => {
    // First need an authed session. Use the dev login and follow the resulting
    // cookie via the request context.
    const { ctx } = await devAuthedContext();
    const res = await ctx.get('/progress', { maxRedirects: 0 });
    // Next emits 307 for server-component redirect()
    expect([307, 308]).toContain(res.status());
    expect(res.headers()['location']).toMatch(/\/profile$/);
  });

  test('profile page renders all sections', async ({ page, request }) => {
    await request.post('/api/dev/login');
    await page.goto('/profile');
    await expect(page.getByTestId('profile-page')).toBeVisible();
    await expect(page.getByTestId('profile-settings')).toBeVisible();
    await expect(page.getByTestId('profile-rhythm')).toBeVisible();
    await expect(page.getByTestId('profile-activity')).toBeVisible();
    await expect(page.getByTestId('profile-sign-out')).toBeVisible();
  });

  test('updateDisplayName persists across reload', async ({ page, request }) => {
    await request.post('/api/dev/login');
    await page.goto('/profile');
    const input = page.getByTestId('profile-name-input');
    await input.fill('Test User Renamed');
    await input.blur();
    // The server action revalidates; reload to confirm DB was written.
    await page.reload();
    await expect(page.getByTestId('profile-name-input')).toHaveValue('Test User Renamed');

    const a = admin();
    const { data: list } = await a.auth.admin.listUsers();
    const userId = list.users.find((u) => u.email === 'dev@learntok.local')!.id;
    const { data: profile } = await a
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single();
    expect(profile?.display_name).toBe('Test User Renamed');
  });

  test('updateRestMinutes recomputes rate', async ({ page, request }) => {
    await request.post('/api/dev/login');
    await page.goto('/profile');
    const slider = page.getByTestId('rest-slider');
    await slider.fill('30');
    // Slider commits on pointerup; .fill() doesn't fire pointer events on input
    // type=range. Dispatch keyup on End-key as a proxy for "user lifted finger".
    await slider.evaluate((el) => {
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'End', bubbles: true }));
    });
    // Server action is fire-and-forget from useTransition; poll the DB.
    const a = admin();
    const { data: list } = await a.auth.admin.listUsers();
    const userId = list.users.find((u) => u.email === 'dev@learntok.local')!.id;
    await expect.poll(async () => {
      const { data } = await a.from('profiles').select('rate').eq('id', userId).single();
      return Number(data?.rate);
    }, { timeout: 5_000 }).toBeCloseTo(0.5, 3);
  });
});
```

- [ ] **Step 2: Run the suite and verify all 4 pass**

Run:
```bash
PW_BASE_URL=http://localhost:3003 corepack pnpm test tests/profile.spec.ts 2>&1 | tail -15
```
Expected: 4 passed. If "GET /progress redirects" fails because Playwright followed automatically, the `maxRedirects: 0` flag should suppress it; if it still follows, switch to `await ctx.fetch('/progress', { redirect: 'manual' })`.

- [ ] **Step 3: Commit**

```bash
git add tests/profile.spec.ts
git commit -m "test(profile): redirect, sections render, name + rate persist"
```

---

## Task 8: StatsHero — replace StatsCard on home

**Files:**
- Create: `components/home/StatsHero.tsx`
- Delete: `components/home/StatsCard.tsx`
- Modify: `app/home/page.tsx` (swap component import + props)
- Modify: `app/globals.css` (add `.stats-hero-*` rules)

The hero replaces the existing 3-column `<StatsCard>` with a 5-row banded layout (Balance / Streak / Earned today / Spent today / Scope). Scope toggle behavior (popover + localStorage) is preserved verbatim from `<StatsCard>`.

- [ ] **Step 1: Add CSS for the hero**

Append to `app/globals.css`:

```css
/* Home Stats hero — 5 banded rows, label left + value right per row.
   Replaces the older 3-column .stats-card layout. */
.stats-hero {
  border: 1px solid var(--line);
  border-radius: 18px;
  overflow: hidden;
  position: relative; /* anchors .stats-menu popover */
  margin-top: 16px;
}
.stats-hero-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  font-family: var(--sans);
}
.stats-hero-row:nth-child(odd) {
  background: var(--bg);
}
.stats-hero-row:nth-child(even) {
  background: var(--bg-2);
}
.stats-hero-label {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-mute);
}
.stats-hero-value {
  font-family: var(--serif);
  font-size: 22px;
  letter-spacing: -0.01em;
  color: var(--ink);
}
.stats-hero-value.good { color: var(--good); }
.stats-hero-value.bad  { color: var(--bad); }
.stats-hero-row.toggle {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.stats-hero-row.toggle .stats-hero-label::after {
  content: ' ▾';
  font-family: var(--sans);
  letter-spacing: 0;
}
```

- [ ] **Step 2: Create `components/home/StatsHero.tsx`**

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { fmtBank } from '@/lib/format';

type Scope = 'total' | 'week' | 'month';
const SCOPES: ReadonlyArray<Scope> = ['total', 'week', 'month'];
const STORAGE_KEY = 'home-stats-scope';

const SCOPE_LABEL: Record<Scope, string> = {
  total: 'TOTAL',
  week: 'THIS WEEK',
  month: 'THIS MONTH',
};
const SCOPE_LONG: Record<Scope, string> = {
  total: 'All time',
  week: 'This week',
  month: 'This month',
};

type Props = {
  balance: number;
  streak: number;
  earnedToday: number;
  spentToday: number;
  weekSeconds: number;
  monthSeconds: number;
  totalSeconds: number;
};

function isScope(v: unknown): v is Scope {
  return typeof v === 'string' && (SCOPES as ReadonlyArray<string>).includes(v);
}

export function StatsHero({
  balance,
  streak,
  earnedToday,
  spentToday,
  weekSeconds,
  monthSeconds,
  totalSeconds,
}: Props) {
  const [scope, setScope] = useState<Scope>('total');
  const [menuOpen, setMenuOpen] = useState(false);
  const heroRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isScope(stored)) setScope(stored);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, scope);
    } catch {}
  }, [scope]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: PointerEvent) => {
      if (heroRef.current && !heroRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [menuOpen]);

  const scopeSeconds =
    scope === 'week' ? weekSeconds : scope === 'month' ? monthSeconds : totalSeconds;

  return (
    <div ref={heroRef} className="stats-hero" data-testid="home-stats-hero">
      <div className="stats-hero-row" data-testid="hero-balance">
        <span className="stats-hero-label">Balance</span>
        <span className="stats-hero-value">{fmtBank(balance)}</span>
      </div>
      <div className="stats-hero-row" data-testid="hero-streak">
        <span className="stats-hero-label">Streak</span>
        <span className="stats-hero-value">🔥 {streak}</span>
      </div>
      <div className="stats-hero-row" data-testid="hero-earned-today">
        <span className="stats-hero-label">Earned today</span>
        <span className="stats-hero-value good">+{fmtBank(earnedToday)}</span>
      </div>
      <div className="stats-hero-row" data-testid="hero-spent-today">
        <span className="stats-hero-label">Spent today</span>
        <span className="stats-hero-value bad">−{fmtBank(spentToday)}</span>
      </div>
      <div
        className="stats-hero-row toggle"
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setMenuOpen((v) => !v);
          } else if (e.key === 'Escape') setMenuOpen(false);
        }}
        data-testid="hero-scope"
      >
        <span className="stats-hero-label">{SCOPE_LABEL[scope]}</span>
        <span className="stats-hero-value">{fmtBank(scopeSeconds)}</span>
      </div>

      {menuOpen && (
        <div className="stats-menu" role="menu" data-testid="hero-scope-menu">
          {SCOPES.map((s) => (
            <button
              key={s}
              role="menuitemradio"
              aria-checked={s === scope}
              onClick={() => {
                setScope(s);
                setMenuOpen(false);
              }}
            >
              {SCOPE_LONG[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update `app/home/page.tsx` to use `<StatsHero>` + add spent-today aggregation**

Find the imports at top (lines 1-6):

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TopicRail } from '@/components/home/TopicRail';
import { StatsCard } from '@/components/home/StatsCard';
import { ContinueRow } from '@/components/home/ContinueRow';
import { fmtBank } from '@/lib/format';
```

Replace with:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TopicRail } from '@/components/home/TopicRail';
import { StatsHero } from '@/components/home/StatsHero';
import { ContinueRow } from '@/components/home/ContinueRow';
```

(`fmtBank` is no longer used in this file — `<StatsHero>` imports it itself.)

The current parallel ledger queries (lines 73-96) only fetch `delta_seconds > 0`. We need spent-today too. Find this block:

```tsx
    supabase
      .from('ledger_entries')
      .select('delta_seconds')
      .eq('user_id', user.id)
      .gt('delta_seconds', 0)
      .gte('created_at', todayISO),
    supabase
      .from('ledger_entries')
      .select('delta_seconds')
      .eq('user_id', user.id)
      .gt('delta_seconds', 0)
      .gte('created_at', weekISO),
    supabase
      .from('ledger_entries')
      .select('delta_seconds')
      .eq('user_id', user.id)
      .gt('delta_seconds', 0)
      .gte('created_at', monthISO),
    supabase
      .from('ledger_entries')
      .select('delta_seconds')
      .eq('user_id', user.id)
      .gt('delta_seconds', 0),
```

Replace with (drop the `.gt('delta_seconds', 0)` filters; we now bucket by sign in JS):

```tsx
    supabase
      .from('ledger_entries')
      .select('delta_seconds')
      .eq('user_id', user.id)
      .gte('created_at', todayISO),
    supabase
      .from('ledger_entries')
      .select('delta_seconds')
      .eq('user_id', user.id)
      .gte('created_at', weekISO),
    supabase
      .from('ledger_entries')
      .select('delta_seconds')
      .eq('user_id', user.id)
      .gte('created_at', monthISO),
    supabase
      .from('ledger_entries')
      .select('delta_seconds')
      .eq('user_id', user.id),
```

Find the helper `sumDeltas` (line 28-30):

```tsx
function sumDeltas(rows: { delta_seconds: number }[] | null): number {
  return (rows ?? []).reduce((s, r) => s + r.delta_seconds, 0);
}
```

Replace with:

```tsx
function sumPositive(rows: { delta_seconds: number }[] | null): number {
  return (rows ?? []).filter((r) => r.delta_seconds > 0).reduce((s, r) => s + r.delta_seconds, 0);
}
function sumNegative(rows: { delta_seconds: number }[] | null): number {
  return (rows ?? []).filter((r) => r.delta_seconds < 0).reduce((s, r) => s + Math.abs(r.delta_seconds), 0);
}
```

Find the aggregation block (lines 142-145):

```tsx
  const todaySeconds = sumDeltas(todayRes.data);
  const weekSeconds = sumDeltas(weekRes.data);
  const monthSeconds = sumDeltas(monthRes.data);
  const totalSeconds = sumDeltas(totalRes.data);
```

Replace with:

```tsx
  const earnedToday = sumPositive(todayRes.data);
  const spentToday = sumNegative(todayRes.data);
  const weekSeconds = sumPositive(weekRes.data);
  const monthSeconds = sumPositive(monthRes.data);
  const totalSeconds = sumPositive(totalRes.data);
```

Find the rendered greeting + stats card block (lines 211-237):

```tsx
        <div className="row between aic">
          <div>
            <div className="eyebrow">
              {weekday} · 🔥 {profile?.streak ?? 0}
            </div>
            <div className="display mt-4" style={{ fontSize: 30 }}>
              hey, {profile?.display_name ?? 'friend'}
            </div>
          </div>
          <a
            href="/progress"
            className="jar-chip"
            data-testid="home-jar-chip"
          >
            <span className="jar-dot" />
            {fmtBank(profile?.jar_balance_cached ?? 0)}
          </a>
        </div>

        <StatsCard
          streak={profile?.streak ?? 0}
          todaySeconds={todaySeconds}
          weekSeconds={weekSeconds}
          monthSeconds={monthSeconds}
          totalSeconds={totalSeconds}
        />
```

Replace with:

```tsx
        <StatsHero
          balance={profile?.jar_balance_cached ?? 0}
          streak={profile?.streak ?? 0}
          earnedToday={earnedToday}
          spentToday={spentToday}
          weekSeconds={weekSeconds}
          monthSeconds={monthSeconds}
          totalSeconds={totalSeconds}
        />
```

Find the unused `weekday` const (lines 205-207):

```tsx
  const weekday = new Date()
    .toLocaleDateString('en', { weekday: 'long' })
    .toLowerCase();
```

Delete it.

- [ ] **Step 4: Delete the old `<StatsCard>`**

```bash
git rm components/home/StatsCard.tsx
```

- [ ] **Step 5: Type-check passes**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Eyeball — visit /home, verify hero renders 5 rows + scope toggle works**

Visit http://localhost:3003/home. Expect 5 banded rows in this order: Balance / Streak / Earned today / Spent today / TOTAL (or whatever scope is in localStorage). Tap the bottom row → popover → pick THIS WEEK → label flips. Reload → choice persists.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css components/home/StatsHero.tsx app/home/page.tsx
git rm -f components/home/StatsCard.tsx 2>/dev/null || true
git commit -m "feat(home-stats): replace StatsCard with StatsHero

5-row banded layout (balance / streak / earned today / spent
today / scope-toggle) lifted from progress summary card. Scope
toggle behavior preserved verbatim. Greeting + jar chip header
removed; balance is in row 1 now."
```

---

## Task 9: ContinueRow eyebrow + drop inline prefix

**Files:**
- Modify: `components/home/ContinueRow.tsx`
- Modify: `app/home/page.tsx`

- [ ] **Step 1: Drop `continue · ` prefix from `<ContinueRow>`**

Edit `components/home/ContinueRow.tsx`. Find:

```tsx
        <div className="continue-eyebrow">continue · {topicTitle}</div>
```

Replace with:

```tsx
        <div className="continue-eyebrow">{topicTitle}</div>
```

- [ ] **Step 2: Add section eyebrow above `<ContinueRow>` in home page**

Edit `app/home/page.tsx`. Find the `<ContinueRow ... />` block (lines ~239-248 after Task 8's edits):

```tsx
        {continueCard && (
          <ContinueRow
            topicTitle={continueCard.topicTitle}
            courseTitle={continueCard.courseTitle}
            nextLessonId={continueCard.nextLessonId}
            nextLessonDurSec={continueCard.nextLessonDurSec}
            ytId={continueCard.ytId}
            donePct={continueCard.donePct}
          />
        )}
```

Replace with:

```tsx
        {continueCard && (
          <>
            <div className="eyebrow mt-24" data-testid="home-continue-eyebrow">
              continue learning
            </div>
            <ContinueRow
              topicTitle={continueCard.topicTitle}
              courseTitle={continueCard.courseTitle}
              nextLessonId={continueCard.nextLessonId}
              nextLessonDurSec={continueCard.nextLessonDurSec}
              ytId={continueCard.ytId}
              donePct={continueCard.donePct}
            />
          </>
        )}
```

- [ ] **Step 3: Type-check passes**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/home/ContinueRow.tsx app/home/page.tsx
git commit -m "feat(home-continue): hoist 'continue learning' to section eyebrow

Section eyebrow now provides the label; row card shows just the
topic name in its own eyebrow. Avoids the duplicated 'continue'
copy."
```

---

## Task 10: Home actions — removeTopic + removeCourse with confirm gating

**Files:**
- Create: `app/home/actions.ts`

- [ ] **Step 1: Create `app/home/actions.ts`**

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const Id = z.string().uuid();

type ConfirmableTopic =
  | { ok: true; cascaded: { courses: number; lessons: number } }
  | { requiresConfirm: true; courseCount: number; completedLessonCount: number };

type ConfirmableCourse =
  | { ok: true }
  | { requiresConfirm: true; completedLessonCount: number };

async function authedClient() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('unauth');
  return { supabase, userId: user.id };
}

/**
 * Tries to remove a topic from the user's interests, cascading to all courses
 * for that topic on the user's shelf and any lesson_progress for those courses.
 *
 * If any lesson_progress row exists, this is reported back as
 * `{ requiresConfirm: true, ... }` so the client can show a destructive-action
 * modal. Call `confirmRemoveTopic(topicId)` to commit after user confirms.
 *
 * If there's no progress, the cascade happens immediately and the result is
 * `{ ok: true, cascaded: {...} }`.
 */
export async function removeTopic(rawTopicId: string): Promise<ConfirmableTopic> {
  const topicId = Id.parse(rawTopicId);
  const { supabase, userId } = await authedClient();

  // Find courses on this user's shelf for this topic.
  const { data: shelfRows } = await supabase
    .from('profile_courses')
    .select('course_id, courses!inner(topic_id)')
    .eq('user_id', userId);
  const shelfCourseIds = ((shelfRows ?? []) as unknown as Array<{
    course_id: string;
    courses: { topic_id: string | null };
  }>)
    .filter((r) => r.courses.topic_id === topicId)
    .map((r) => r.course_id);

  let completedLessonCount = 0;
  if (shelfCourseIds.length > 0) {
    const { data: progressRows } = await supabase
      .from('lesson_progress')
      .select('lesson_id, lessons!inner(course_id)')
      .eq('user_id', userId)
      .not('completed_at', 'is', null);
    completedLessonCount = ((progressRows ?? []) as unknown as Array<{
      lesson_id: string;
      lessons: { course_id: string };
    }>).filter((r) => shelfCourseIds.includes(r.lessons.course_id)).length;
  }

  if (completedLessonCount > 0) {
    return {
      requiresConfirm: true,
      courseCount: shelfCourseIds.length,
      completedLessonCount,
    };
  }

  // No progress — safe to cascade immediately.
  return cascadeRemoveTopic(topicId, shelfCourseIds, userId);
}

/**
 * Force-cascade a topic removal even if progress exists. Call this after the
 * user confirms in the destructive-action modal.
 */
export async function confirmRemoveTopic(rawTopicId: string): Promise<{ ok: true }> {
  const topicId = Id.parse(rawTopicId);
  const { supabase, userId } = await authedClient();

  const { data: shelfRows } = await supabase
    .from('profile_courses')
    .select('course_id, courses!inner(topic_id)')
    .eq('user_id', userId);
  const shelfCourseIds = ((shelfRows ?? []) as unknown as Array<{
    course_id: string;
    courses: { topic_id: string | null };
  }>)
    .filter((r) => r.courses.topic_id === topicId)
    .map((r) => r.course_id);

  const res = await cascadeRemoveTopic(topicId, shelfCourseIds, userId);
  if ('ok' in res) return { ok: true };
  // cascadeRemoveTopic only returns ok branch; the requiresConfirm branch is
  // unreachable from here because we ignore the count check.
  throw new Error('unexpected_state');
}

async function cascadeRemoveTopic(
  topicId: string,
  shelfCourseIds: string[],
  userId: string,
): Promise<{ ok: true; cascaded: { courses: number; lessons: number } }> {
  const { supabase } = await authedClient();

  let lessonsDeleted = 0;
  if (shelfCourseIds.length > 0) {
    // Find lessons in those courses so we can count progress rows precisely.
    const { data: lessons } = await supabase
      .from('lessons')
      .select('id')
      .in('course_id', shelfCourseIds);
    const lessonIds = (lessons ?? []).map((l) => l.id);
    if (lessonIds.length > 0) {
      const { count } = await supabase
        .from('lesson_progress')
        .delete({ count: 'exact' })
        .eq('user_id', userId)
        .in('lesson_id', lessonIds);
      lessonsDeleted = count ?? 0;
    }
    await supabase
      .from('profile_courses')
      .delete()
      .eq('user_id', userId)
      .in('course_id', shelfCourseIds);
  }

  // Remove the topic from the user's interests array.
  const { data: profile } = await supabase
    .from('profiles')
    .select('interests')
    .eq('id', userId)
    .single();
  const interests = ((profile?.interests ?? []) as string[]).filter((id) => id !== topicId);
  await supabase
    .from('profiles')
    .update({ interests })
    .eq('id', userId);

  revalidatePath('/home');
  revalidatePath('/discover');
  revalidatePath(`/discover/topic/${topicId}`);
  return {
    ok: true,
    cascaded: { courses: shelfCourseIds.length, lessons: lessonsDeleted },
  };
}

/**
 * Tries to remove a single course from the user's shelf. If any
 * lesson_progress exists for this course, returns `requiresConfirm` so the
 * client can show a confirmation modal.
 */
export async function removeCourse(rawCourseId: string): Promise<ConfirmableCourse> {
  const courseId = Id.parse(rawCourseId);
  const { supabase, userId } = await authedClient();

  const { data: lessons } = await supabase
    .from('lessons')
    .select('id')
    .eq('course_id', courseId);
  const lessonIds = (lessons ?? []).map((l) => l.id);

  let completedLessonCount = 0;
  if (lessonIds.length > 0) {
    const { count } = await supabase
      .from('lesson_progress')
      .select('lesson_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('lesson_id', lessonIds)
      .not('completed_at', 'is', null);
    completedLessonCount = count ?? 0;
  }

  if (completedLessonCount > 0) {
    return { requiresConfirm: true, completedLessonCount };
  }

  return cascadeRemoveCourse(courseId, lessonIds, userId);
}

export async function confirmRemoveCourse(rawCourseId: string): Promise<{ ok: true }> {
  const courseId = Id.parse(rawCourseId);
  const { supabase, userId } = await authedClient();
  const { data: lessons } = await supabase
    .from('lessons')
    .select('id')
    .eq('course_id', courseId);
  const lessonIds = (lessons ?? []).map((l) => l.id);
  const res = await cascadeRemoveCourse(courseId, lessonIds, userId);
  if ('ok' in res) return { ok: true };
  throw new Error('unexpected_state');
}

async function cascadeRemoveCourse(
  courseId: string,
  lessonIds: string[],
  userId: string,
): Promise<{ ok: true }> {
  const { supabase } = await authedClient();

  if (lessonIds.length > 0) {
    await supabase
      .from('lesson_progress')
      .delete()
      .eq('user_id', userId)
      .in('lesson_id', lessonIds);
  }
  await supabase
    .from('profile_courses')
    .delete()
    .eq('user_id', userId)
    .eq('course_id', courseId);

  // Best-effort revalidate the topic's discover page.
  const { data: course } = await supabase
    .from('courses')
    .select('topic_id')
    .eq('id', courseId)
    .maybeSingle();
  if (course?.topic_id) {
    revalidatePath(`/discover/topic/${course.topic_id}`);
  }
  revalidatePath('/home');
  return { ok: true };
}
```

- [ ] **Step 2: Type-check passes**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/home/actions.ts
git commit -m "feat(home-actions): removeTopic / removeCourse with confirm gating

Two-phase API: removeX returns either { ok, cascaded } when no
progress exists, or { requiresConfirm, ...counts } when the user
needs to acknowledge the destructive cascade. confirmRemoveX
force-deletes after user confirms. All RLS-scoped via the
user-scoped supabase client."
```

---

## Task 11: TopicRailEdit popover + DeleteTopicConfirm modal + wire into TopicRail

**Files:**
- Create: `components/home/TopicRailEdit.tsx`
- Create: `components/home/DeleteTopicConfirm.tsx`
- Modify: `components/home/TopicRail.tsx`
- Modify: `app/globals.css` (modal + popover utility classes)

- [ ] **Step 1: Add modal/overlay CSS**

Append to `app/globals.css`:

```css
/* Generic overlay + centered card used by destructive-action confirm modals. */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 24px;
}
.modal-card {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 20px;
  max-width: 360px;
  width: 100%;
}
.modal-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  justify-content: flex-end;
}
.modal-actions .btn {
  min-width: 96px;
}

/* Topic rail edit ⋯ button + popover. The base .rail-title rule already
   exists (display: flex; align-items: baseline; justify-content: space-between).
   We only add `position: relative` so the popover anchors against the title. */
.rail-title { position: relative; }
.rail-edit-btn {
  background: transparent;
  border: none;
  font-size: 18px;
  line-height: 1;
  color: var(--ink-mute);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  margin-left: auto;
}
.rail-edit-btn:hover {
  background: var(--bg-2);
  color: var(--ink);
}
.rail-edit-popover {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 6px;
  z-index: 20;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
  min-width: 160px;
}
.rail-edit-popover button,
.rail-edit-popover a {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: none;
  background: transparent;
  font-family: var(--sans);
  font-size: 13px;
  color: var(--ink);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  text-decoration: none;
}
.rail-edit-popover button:hover,
.rail-edit-popover a:hover {
  background: var(--bg-2);
}
.rail-edit-popover button.danger {
  color: var(--bad);
}

/* Per-card × button on rail cards. The base .rail-card already exists; we
   only add `position: relative` so the × button can absolute-position inside. */
.rail-card { position: relative; }
.rail-x {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rail-x:hover {
  background: rgba(0, 0, 0, 0.75);
}
```

- [ ] **Step 2: Create `components/home/DeleteTopicConfirm.tsx`**

```tsx
'use client';

type Props = {
  topicTitle: string;
  courseCount: number;
  completedLessonCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
};

export function DeleteTopicConfirm({
  topicTitle,
  courseCount,
  completedLessonCount,
  onCancel,
  onConfirm,
  pending,
}: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel} data-testid="delete-topic-modal">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="display" style={{ fontSize: 20 }}>
          Delete {topicTitle}?
        </div>
        <div className="body" style={{ marginTop: 12, color: 'var(--ink-mute)' }}>
          You have {courseCount} {courseCount === 1 ? 'course' : 'courses'} with{' '}
          {completedLessonCount} completed{' '}
          {completedLessonCount === 1 ? 'lesson' : 'lessons'}. This will remove
          all of them and your progress.
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={pending}
            data-testid="delete-topic-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={pending}
            data-testid="delete-topic-confirm"
            style={{ background: 'var(--bad)' }}
          >
            {pending ? 'deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `components/home/TopicRailEdit.tsx`**

```tsx
'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { removeTopic, confirmRemoveTopic } from '@/app/home/actions';
import { DeleteTopicConfirm } from './DeleteTopicConfirm';

type Props = {
  topicId: string;
  topicTitle: string;
};

export function TopicRailEdit({ topicId, topicTitle }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<
    null | { courseCount: number; completedLessonCount: number }
  >(null);
  const [pending, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  const onDeleteClick = () => {
    setOpen(false);
    startTransition(async () => {
      const res = await removeTopic(topicId);
      if ('requiresConfirm' in res) {
        setConfirming({
          courseCount: res.courseCount,
          completedLessonCount: res.completedLessonCount,
        });
      } else {
        router.refresh();
      }
    });
  };

  const onConfirm = () => {
    if (!confirming) return;
    startTransition(async () => {
      await confirmRemoveTopic(topicId);
      setConfirming(null);
      router.refresh();
    });
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', marginLeft: 'auto' }}>
      <button
        type="button"
        className="rail-edit-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid={`rail-edit-${topicId}`}
      >
        ⋯
      </button>
      {open && (
        <div className="rail-edit-popover" role="menu">
          <Link
            href={`/discover/topic/${topicId}`}
            data-testid={`rail-edit-add-${topicId}`}
          >
            + add course
          </Link>
          <button
            type="button"
            className="danger"
            onClick={onDeleteClick}
            disabled={pending}
            data-testid={`rail-edit-delete-${topicId}`}
          >
            delete topic
          </button>
        </div>
      )}
      {confirming && (
        <DeleteTopicConfirm
          topicTitle={topicTitle}
          courseCount={confirming.courseCount}
          completedLessonCount={confirming.completedLessonCount}
          onCancel={() => setConfirming(null)}
          onConfirm={onConfirm}
          pending={pending}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update `components/home/TopicRail.tsx` to include the edit button**

Find the imports + early return:

```tsx
import Link from 'next/link';
```

Add below it:

```tsx
import { TopicRailEdit } from './TopicRailEdit';
```

Find the rail-title block (lines 44-51):

```tsx
      <div className="rail-title">
        <span className="rt">{topic.title}</span>
        <span className="rm">
          {courses.length} {courses.length === 1 ? 'course' : 'courses'}
          {totalLessons > 0 ? ` · ${doneLessons}/${totalLessons} done` : ''}
        </span>
      </div>
```

Replace with:

```tsx
      <div className="rail-title">
        <span className="rt">{topic.title}</span>
        <span className="rm">
          {courses.length} {courses.length === 1 ? 'course' : 'courses'}
          {totalLessons > 0 ? ` · ${doneLessons}/${totalLessons} done` : ''}
        </span>
        <TopicRailEdit topicId={topic.id} topicTitle={topic.title} />
      </div>
```

- [ ] **Step 5: Type-check passes**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/home/TopicRailEdit.tsx components/home/DeleteTopicConfirm.tsx components/home/TopicRail.tsx app/globals.css
git commit -m "feat(topic-rail-edit): ⋯ popover with add-course + delete-topic

Popover anchored to rail title, two items. Delete calls
removeTopic; if action returns requiresConfirm, opens
DeleteTopicConfirm modal showing course + lesson counts.
Confirm calls confirmRemoveTopic and refreshes the page."
```

---

## Task 12: CourseCardRemove × button + DeleteCourseConfirm modal

**Files:**
- Create: `components/home/RailCourseCard.tsx`
- Create: `components/home/DeleteCourseConfirm.tsx`
- Modify: `components/home/TopicRail.tsx` (extract card markup, pass remove callback)

- [ ] **Step 1: Create `components/home/DeleteCourseConfirm.tsx`**

```tsx
'use client';

type Props = {
  courseTitle: string;
  completedLessonCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
};

export function DeleteCourseConfirm({
  courseTitle,
  completedLessonCount,
  onCancel,
  onConfirm,
  pending,
}: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel} data-testid="delete-course-modal">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="display" style={{ fontSize: 20 }}>
          Remove {courseTitle}?
        </div>
        <div className="body" style={{ marginTop: 12, color: 'var(--ink-mute)' }}>
          You&apos;ve completed {completedLessonCount}{' '}
          {completedLessonCount === 1 ? 'lesson' : 'lessons'}. This deletes the
          course and your progress.
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={pending}
            data-testid="delete-course-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={pending}
            data-testid="delete-course-confirm"
            style={{ background: 'var(--bad)' }}
          >
            {pending ? 'deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/home/RailCourseCard.tsx`**

This extracts the inline card markup from `<TopicRail>` into a focused component that owns the × button + confirm modal state.

```tsx
'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { removeCourse, confirmRemoveCourse } from '@/app/home/actions';
import { DeleteCourseConfirm } from './DeleteCourseConfirm';

type LessonLite = {
  id: string;
  title: string;
  duration_seconds: number;
  yt_id: string;
  done: boolean;
};

type Props = {
  course: { id: string; title: string };
  lessons: LessonLite[];
};

function fmtMin(totalSeconds: number): string {
  if (totalSeconds <= 0) return '';
  const m = Math.max(1, Math.round(totalSeconds / 60));
  return `${m} min`;
}

export function RailCourseCard({ course, lessons }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<
    null | { completedLessonCount: number }
  >(null);
  const [pending, startTransition] = useTransition();

  const done = lessons.filter((l) => l.done).length;
  const total = lessons.length;
  const totalSeconds = lessons.reduce(
    (sum, l) => sum + (l.duration_seconds ?? 0),
    0,
  );
  const firstYt = lessons.find((l) => l.yt_id)?.yt_id ?? null;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const onRemoveClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      const res = await removeCourse(course.id);
      if ('requiresConfirm' in res) {
        setConfirming({ completedLessonCount: res.completedLessonCount });
      } else {
        router.refresh();
      }
    });
  };

  const onConfirm = () => {
    startTransition(async () => {
      await confirmRemoveCourse(course.id);
      setConfirming(null);
      router.refresh();
    });
  };

  return (
    <>
      <Link
        href={`/course/${course.id}`}
        className="rail-card"
        data-testid={`rail-card-${course.id}`}
      >
        <button
          type="button"
          className="rail-x"
          onClick={onRemoveClick}
          disabled={pending}
          aria-label={`Remove ${course.title}`}
          data-testid={`rail-x-${course.id}`}
        >
          ×
        </button>
        <div
          className="rail-thumb"
          style={
            firstYt
              ? { backgroundImage: `url(https://i.ytimg.com/vi/${firstYt}/mqdefault.jpg)` }
              : undefined
          }
        >
          {totalSeconds > 0 && <span className="dur">{fmtMin(totalSeconds)}</span>}
        </div>
        <div className="rail-t">{course.title}</div>
        <div className="rail-meta">
          {total === 0 ? '0 lessons' : `${total} lessons${done > 0 ? ` · ${done} done` : ''}`}
        </div>
        {total > 0 && (
          <div className="rail-bar">
            <i style={{ width: `${pct}%` }} />
          </div>
        )}
      </Link>
      {confirming && (
        <DeleteCourseConfirm
          courseTitle={course.title}
          completedLessonCount={confirming.completedLessonCount}
          onCancel={() => setConfirming(null)}
          onConfirm={onConfirm}
          pending={pending}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Update `components/home/TopicRail.tsx` to use `<RailCourseCard>`**

Find the `import` block at top:

```tsx
import Link from 'next/link';
import { TopicRailEdit } from './TopicRailEdit';
```

Add:

```tsx
import { RailCourseCard } from './RailCourseCard';
```

(`Link` is no longer used directly here — keep it imported only if other markup uses it. After the edit below, it's no longer needed; delete the `Link` import line.)

Find the courses-loop body (lines ~57-89, i.e. inside `<div className="rail">` after Task 11's edit):

```tsx
          {courses.map((c) => {
            const ls = lessonsByCourse.get(c.id) ?? [];
            const done = ls.filter((l) => l.done).length;
            const total = ls.length;
            const totalSeconds = ls.reduce((sum, l) => sum + (l.duration_seconds ?? 0), 0);
            const firstYt = ls.find((l) => l.yt_id)?.yt_id ?? null;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;

            return (
              <Link key={c.id} href={`/course/${c.id}`} className="rail-card">
                <div
                  className="rail-thumb"
                  style={
                    firstYt
                      ? { backgroundImage: `url(https://i.ytimg.com/vi/${firstYt}/mqdefault.jpg)` }
                      : undefined
                  }
                >
                  {totalSeconds > 0 && <span className="dur">{fmtMin(totalSeconds)}</span>}
                </div>
                <div className="rail-t">{c.title}</div>
                <div className="rail-meta">
                  {total === 0 ? '0 lessons' : `${total} lessons${done > 0 ? ` · ${done} done` : ''}`}
                </div>
                {total > 0 && (
                  <div className="rail-bar">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                )}
              </Link>
            );
          })}
```

Replace with:

```tsx
          {courses.map((c) => (
            <RailCourseCard
              key={c.id}
              course={{ id: c.id, title: c.title }}
              lessons={lessonsByCourse.get(c.id) ?? []}
            />
          ))}
```

Also delete the now-unused local `fmtMin` function from `TopicRail.tsx` (lines 31-35) since `<RailCourseCard>` has its own copy.

- [ ] **Step 4: Type-check passes**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/home/RailCourseCard.tsx components/home/DeleteCourseConfirm.tsx components/home/TopicRail.tsx
git commit -m "feat(rail-card-remove): per-card × button with confirm modal

Each rail card now owns its own remove button + confirm-modal
state. Click × → calls removeCourse → if progress exists, shows
DeleteCourseConfirm modal; otherwise removes silently. Confirm
runs cascade and refreshes the route."
```

---

## Task 13: Home edit Playwright tests + full-flow update

**Files:**
- Create: `tests/home-edit.spec.ts`
- Modify: `tests/full-flow.spec.ts` (drop greeting assertions, assert hero)

- [ ] **Step 1: Update `tests/full-flow.spec.ts` to drop greeting assertions and assert the hero**

The existing test has at most one greeting reference (it asserts the page renders + topics). The new home no longer renders `home-jar-chip`. Search for any reference and adjust.

Find any line in `tests/full-flow.spec.ts` referencing `home-jar-chip`. If present, remove the corresponding assertion. After step 9 in the test (the topic-rail-checks block), insert:

```ts
  // After PR 2 redesign: home renders the StatsHero, not StatsCard.
  await expect(page.getByTestId('home-stats-hero')).toBeVisible();
  await expect(page.getByTestId('hero-balance')).toBeVisible();
```

- [ ] **Step 2: Create `tests/home-edit.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

const DEV_EMAIL = 'dev@learntok.local';

async function resetAndOnboard(request: any) {
  // dev/login leaves the user fully onboarded with a 4-topic shelf — perfect
  // for exercising the rail-edit flow without first walking through onboarding.
  const res = await request.post('/api/dev/login');
  expect(res.ok()).toBeTruthy();
  const a = admin();
  const { data: list } = await a.auth.admin.listUsers();
  const userId = list.users.find((u) => u.email === DEV_EMAIL)!.id;
  return { userId, a };
}

test.describe('home rail edit', () => {
  test('delete topic with no progress → silent cascade', async ({ page, request }) => {
    const { userId, a } = await resetAndOnboard(request);
    await page.goto('/home');

    // Pick the first interest topic.
    const { data: profile } = await a
      .from('profiles')
      .select('interests')
      .eq('id', userId)
      .single();
    const interests = (profile?.interests ?? []) as string[];
    expect(interests.length).toBeGreaterThan(0);
    const topicId = interests[0];

    // Wipe lesson_progress so the path takes the no-confirm branch.
    await a.from('lesson_progress').delete().eq('user_id', userId);

    await page.getByTestId(`rail-edit-${topicId}`).click();
    await page.getByTestId(`rail-edit-delete-${topicId}`).click();

    // No modal appears; rail disappears after refresh.
    await expect(page.getByTestId(`topic-rail-${topicId}`)).toBeHidden({ timeout: 5_000 });

    const { data: after } = await a
      .from('profiles')
      .select('interests')
      .eq('id', userId)
      .single();
    expect((after?.interests ?? []) as string[]).not.toContain(topicId);
  });

  test('delete topic with progress → confirm modal → cascade', async ({ page, request }) => {
    const { userId, a } = await resetAndOnboard(request);
    await page.goto('/home');

    const { data: profile } = await a
      .from('profiles')
      .select('interests')
      .eq('id', userId)
      .single();
    const topicId = ((profile?.interests ?? []) as string[])[0];

    // Force a lesson_progress row for any lesson in any course in this topic.
    const { data: shelf } = await a
      .from('profile_courses')
      .select('course_id, courses!inner(topic_id)')
      .eq('user_id', userId);
    const courseId = ((shelf ?? []) as unknown as Array<{
      course_id: string;
      courses: { topic_id: string };
    }>).find((r) => r.courses.topic_id === topicId)?.course_id;
    expect(courseId).toBeTruthy();

    const { data: lessons } = await a
      .from('lessons')
      .select('id')
      .eq('course_id', courseId!)
      .limit(1);
    const lessonId = lessons?.[0]?.id;
    expect(lessonId).toBeTruthy();

    await a.from('lesson_progress').upsert({
      user_id: userId,
      lesson_id: lessonId!,
      completed_at: new Date().toISOString(),
    });

    await page.reload();
    await page.getByTestId(`rail-edit-${topicId}`).click();
    await page.getByTestId(`rail-edit-delete-${topicId}`).click();

    await expect(page.getByTestId('delete-topic-modal')).toBeVisible();
    await page.getByTestId('delete-topic-confirm').click();

    await expect(page.getByTestId(`topic-rail-${topicId}`)).toBeHidden({ timeout: 5_000 });
  });

  test('per-card × on course with progress → confirm modal', async ({ page, request }) => {
    const { userId, a } = await resetAndOnboard(request);

    // Force progress on the first course's first lesson.
    const { data: shelf } = await a
      .from('profile_courses')
      .select('course_id')
      .eq('user_id', userId)
      .order('position', { ascending: true })
      .limit(1);
    const courseId = shelf?.[0]?.course_id;
    expect(courseId).toBeTruthy();

    const { data: lessons } = await a
      .from('lessons')
      .select('id')
      .eq('course_id', courseId!)
      .limit(1);
    const lessonId = lessons?.[0]?.id;
    await a.from('lesson_progress').upsert({
      user_id: userId,
      lesson_id: lessonId!,
      completed_at: new Date().toISOString(),
    });

    await page.goto('/home');
    await page.getByTestId(`rail-x-${courseId}`).click();
    await expect(page.getByTestId('delete-course-modal')).toBeVisible();
    await page.getByTestId('delete-course-confirm').click();

    // Course gone from shelf.
    await expect.poll(async () => {
      const { data } = await a
        .from('profile_courses')
        .select('course_id')
        .eq('user_id', userId)
        .eq('course_id', courseId!);
      return (data ?? []).length;
    }, { timeout: 5_000 }).toBe(0);
  });
});
```

- [ ] **Step 3: Run the tests**

Run:
```bash
PW_BASE_URL=http://localhost:3003 corepack pnpm test tests/home-edit.spec.ts tests/full-flow.spec.ts 2>&1 | tail -15
```
Expected: 4 passed (3 home-edit + 1 full-flow). If full-flow fails on the new hero assertion, double-check the testid `home-stats-hero` matches what was rendered.

- [ ] **Step 4: Commit**

```bash
git add tests/home-edit.spec.ts tests/full-flow.spec.ts
git commit -m "test(home-edit): topic + course delete flows; full-flow updated"
```

---

## Task 14: Push branch + open PR #30

**Files:** None (git + gh).

- [ ] **Step 1: Verify branch state**

Run:
```bash
git log --oneline origin/main..HEAD
```
Expected: ~13 commits from this PR (one per task above) on top of `aa3346e Fix earn ratio bug + reframe onboarding deal (#29)`.

- [ ] **Step 2: Push the branch**

Run:
```bash
git push -u origin claude/pr2-home-profile
```

- [ ] **Step 3: Open the PR**

Run:
```bash
gh pr create --title "Home stats hero + topic/course edit + Profile page" --body "$(cat <<'EOF'
## Summary
- Replaces home greeting + StatsCard with a 5-row banded \`<StatsHero>\` (Balance / Streak / Earned today / Spent today / scope-toggle). Scope toggle behavior preserved (popover + localStorage).
- Adds 'Continue learning' section eyebrow above the continue card; drops the inline 'continue · ' prefix from the card.
- Adds per-rail \`⋯\` edit popover with **add course** + **delete topic**. Delete checks for progress and shows a confirm modal if any lesson is completed.
- Adds per-card \`×\` remove button on rail cards with the same confirm-on-progress behavior.
- Renames \`/progress\` → \`/profile\`. New profile page has Settings (display name + Learn-1h + Rest-slider, mirroring onboarding), Learning rhythm viz (per-day segmented bars, week/month toggle), Recent activity (lifted ledger list), and Sign out. Old \`/progress\` URL 307s to \`/profile\` for deep-link safety.
- Extracts shared \`<RestSlider>\` from onboarding so both onboarding and profile drive the same widget.

## Test plan
- [ ] \`pnpm test tests/profile.spec.ts\` — 4 cases: redirect, sections render, name save, rate save
- [ ] \`pnpm test tests/home-edit.spec.ts\` — 3 cases: silent topic delete, confirm-then-delete topic, confirm-then-delete course
- [ ] \`pnpm test tests/full-flow.spec.ts\` — updated to assert \`<StatsHero>\` testid; greeting assertions removed
- [ ] \`pnpm test tests/earn-ratio.spec.ts\` — must still pass (PR 1 regression check)
- [ ] Manual: visit \`/profile\` → edit name (persists), drag slider (rate updates in DB), see 7 rhythm rows, click \`Sign out\` (lands on /login)
- [ ] Manual: \`/home\` → tap \`⋯\` on a topic rail → see popover with \`+ add course\` + \`delete topic\`; tap \`×\` on a card → modal if progress, silent if none

## Out of scope (deferred to PR 3)
- BottomNav rename progress→profile + add discover tab
- Discover redesign (English titles, Lucide icons, 2-col grid)
- Relax + feed polish + exhaustion modal

## Spec
\`docs/superpowers/specs/2026-04-26-multi-page-polish-redesign-design.md\` § 2 + § 3 + § 4
EOF
)"
```

Expected: PR URL printed. Note the URL.

- [ ] **Step 4: Verify PR is mergeable**

Run:
```bash
gh pr view --json mergeable,mergeStateStatus,changedFiles,additions,deletions
```
Expected: `mergeable=MERGEABLE`, `changedFiles ~22`, `additions ~1300`, `deletions ~250`.

---

## Definition of Done

- [ ] All 4 cases in `tests/profile.spec.ts` pass
- [ ] All 3 cases in `tests/home-edit.spec.ts` pass
- [ ] `tests/full-flow.spec.ts` passes (new hero assertion succeeds)
- [ ] `tests/earn-ratio.spec.ts` still all-green (PR 1 regression check)
- [ ] Manual eyeball: home shows hero (5 rows + scope toggle works), Continue learning eyebrow above card, ⋯ on each rail opens popover, × on each card opens confirm modal when progress exists
- [ ] Manual eyeball: profile renders all 4 sections; name edit + slider drag both persist after reload
- [ ] PR opened and `mergeable=MERGEABLE`

## Out of scope (deferred)

- BottomNav 4-tab redesign (PR 3)
- Discover redesign (PR 3)
- Relax + feed polish + exhaustion modal (PR 3)
- Onboarding name capture step (deferred to a future PR per spec)

## Risks

- **Sessions data sparse on dev account**: The dev user from `/api/dev/login` is reset to a clean ledger but `sessions` rows accumulate across runs. Learning rhythm viz might look empty on a fresh dev account; the `— no activity —` rows handle this gracefully.
- **`useTransition` + server action revalidation race**: After `removeTopic` returns, we call `router.refresh()` to re-fetch the page. If `revalidatePath('/home')` inside the action hasn't propagated to the user-scoped client cache yet, the refresh might serve stale HTML. Tests use `expect.poll` to absorb this.
- **`<RestSlider>` testid sharing**: Profile uses `hideOnboardingTestIds` to switch from `deal-*` to `rest-*` testids. If onboarding tests are flaky due to selector ambiguity (both pages renderable in same flow), they're caught by the existing full-flow test.
- **Modal escape-on-pointerdown**: Outside-click closes the popover. The modal overlay uses `onClick` with `stopPropagation` on the card; the escape-key handler is intentionally absent (Cancel button is one tap). Acceptable for a destructive action that should require deliberate input.
- **Display name length**: Schema has no length cap on `display_name`. The action enforces ≤40 chars. If the user has a longer existing name (from a legacy import), the input still shows it but rejects on save until trimmed.
