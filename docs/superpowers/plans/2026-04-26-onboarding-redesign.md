# Onboarding Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 9-slide onboarding with a 2-page flow (rate slider + topic picker) that, on submit, atomically writes `profiles.{rate, interests, onboarded}` and seeds the user's shelf via a new `profile_courses` table. Filter `/home` to only render rails for picked topics and courses on the user's shelf.

**Architecture:** New migration adds `profile_courses` and widens `profiles.rate` precision. The existing `app/onboarding/page.tsx` (Server Component) gains a topics query and passes them to a rewritten client `Onboarding` component. The client component holds two pages of state, no DB writes during navigation, and submits everything through a single rewritten Server Action that does two awaited writes (profile update, then bulk shelf insert). `app/home/page.tsx` adds a `profile_courses` query and filters topics/courses accordingly.

**Tech Stack:** Next.js 14 App Router, React Server Components + Client Components, TypeScript (strict), Supabase (Postgres + RLS via `@supabase/ssr`), zod for input validation, Playwright for the E2E test.

**Verification model:** Each DB-touching task ends with a Playwright E2E run (the test in Task 8 covers the full flow). Pure UI/style tasks verify with `npx tsc --noEmit` + `npm run lint` + a manual `npm run dev` browser check at `http://localhost:3000/onboarding`. Schema tasks verify by running `npm run supabase:reset` and inspecting tables with the Supabase Studio UI or `\d` in psql.

**Source spec:** [`docs/superpowers/specs/2026-04-26-onboarding-redesign-design.md`](../specs/2026-04-26-onboarding-redesign-design.md)

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/0007_onboarding_redesign.sql` | create | New `profile_courses` table + RLS + widen `profiles.rate` to `numeric(5,3)` |
| `lib/supabase/database.types.ts` | regenerate | Reflect the new table + altered column |
| `app/onboarding/actions.ts` | rewrite | New `completeOnboarding({rate, topicIds})` server action: validate, update profile, bulk insert shelf, redirect to `/home` |
| `components/onboarding/Onboarding.tsx` | rewrite | Two-page client flow: Page 1 (deal + ratio slider), Page 2 (topic picker), submit on Page 2 CTA |
| `components/onboarding/Scenes.tsx` | delete | No comic scenes anymore |
| `app/onboarding/page.tsx` | modify | Fetch preset topics in addition to profile, pass `{topics, initialRate, initialTopicIds}` to client component |
| `app/home/page.tsx` | modify | Add a `profile_courses` query; filter topics by `profile.interests`; filter courses by shelf membership |
| `tests/onboarding.spec.ts` | create | Playwright E2E: reset dev user, walk both pages, assert DB writes + filtered home |

The order applies the schema migration first (everything else depends on the new table existing), then regenerates types (later tasks need the typed shapes), then layers in the server action → client UI → page wiring → home filter → test. Each task is independently committable.

---

## Task 1: Schema migration — new table + widen rate column

**Files:**
- Create: `supabase/migrations/0007_onboarding_redesign.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0007_onboarding_redesign.sql` with exactly this content:

```sql
-- 0007_onboarding_redesign.sql
-- (1) User's "shelf": references to courses they're following.
--     Preset courses are NOT cloned — multiple users reference the same row.
-- (2) Widen profiles.rate to allow the new ratio range (5/learnMinutes, min ~0.083).

create table public.profile_courses (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  position  int  not null default 0,
  added_at  timestamptz not null default now(),
  primary key (user_id, course_id)
);

create index on public.profile_courses (user_id, position);

alter table public.profile_courses enable row level security;

create policy profile_courses_read_own on public.profile_courses
  for select using (user_id = auth.uid());

create policy profile_courses_insert_own on public.profile_courses
  for insert with check (user_id = auth.uid());

create policy profile_courses_update_own on public.profile_courses
  for update using (user_id = auth.uid());

create policy profile_courses_delete_own on public.profile_courses
  for delete using (user_id = auth.uid());

-- Widen rate precision (was numeric(3,1) — only 1 decimal).
alter table public.profiles
  alter column rate type numeric(5,3) using rate::numeric(5,3);
```

- [ ] **Step 2: Apply the migration locally**

Run:
```bash
npm run supabase:reset
```

Expected: `supabase db reset` runs all migrations 0001 → 0007 cleanly + applies the seed. No errors. The dev user (if it existed) is gone — recreate it on next `/api/dev/login` call.

- [ ] **Step 3: Verify the schema**

Run a quick check via `psql` against the local Supabase DB (port 54322 by default) — or use Supabase Studio at `http://localhost:54323`:

```bash
psql "postgres://postgres:postgres@127.0.0.1:54322/postgres" -c "\d public.profile_courses"
psql "postgres://postgres:postgres@127.0.0.1:54322/postgres" -c "\d public.profiles" | grep rate
```

Expected:
- `profile_courses` table exists with columns `user_id, course_id, position, added_at` and PK `(user_id, course_id)`.
- `profiles.rate` shows `numeric(5,3)`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_onboarding_redesign.sql
git commit -m "feat(db): add profile_courses table and widen profiles.rate precision"
```

---

## Task 2: Regenerate Supabase TypeScript types

**Files:**
- Modify: `lib/supabase/database.types.ts`

- [ ] **Step 1: Regenerate the types**

Run from worktree root:
```bash
npm run gen:types
```

Expected: `lib/supabase/database.types.ts` is overwritten. Diff should show a new `profile_courses` table type (with `Row`, `Insert`, `Update` variants) and `profiles.rate` typed as `number` (already was — only precision changed).

- [ ] **Step 2: Verify TypeScript still compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/database.types.ts
git commit -m "chore(types): regenerate after 0007 migration"
```

---

## Task 3: Rewrite the `completeOnboarding` server action

**Files:**
- Modify: `app/onboarding/actions.ts`

The server action's responsibilities, in order:

1. Auth-gate the caller.
2. Validate the input shape (rate range matches learnMinutes 10-60; topicIds = array of UUIDs, length 0-32).
3. Confirm every requested topic exists and is preset (no spoofing user-owned topic IDs).
4. Look up the top-2 preset courses per requested topic (`order by topic_id, position`, take first 2 per topic).
5. Update `profiles.{rate, interests, onboarded}`.
6. If there are courses to seed, bulk `insert into profile_courses (user_id, course_id, position) values …` with `position` running across the flattened list.
7. Redirect to `/home`.

- [ ] **Step 1: Replace the file contents**

Open `app/onboarding/actions.ts` and replace the entire file with:

```ts
'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

// Input contract:
// - rate: 5 / learnMinutes; learnMinutes ∈ [10, 60] → rate ∈ [~0.0833, 0.5].
//   Lower bound rounded down a hair to absorb float-arithmetic noise.
// - topicIds: 0-32 preset topic UUIDs (current preset count is 5; 32 is a
//   liberal upper bound that defends against malicious oversize payloads
//   without hard-coding the current count).
const Payload = z.object({
  rate: z.number().min(0.08).max(0.5),
  topicIds: z.array(z.string().uuid()).max(32),
});

export async function completeOnboarding(raw: { rate: number; topicIds: string[] }) {
  const parsed = Payload.safeParse(raw);
  if (!parsed.success) throw new Error('invalid_payload');
  const { rate, topicIds } = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('unauth');

  // Resolve only-preset topic rows. RLS already restricts reads to preset or
  // owned topics, but we additionally require is_preset = true here so a
  // malicious caller can't stuff their own topic UUIDs into interests.
  let presetIds: string[] = [];
  if (topicIds.length > 0) {
    const { data: topicsData, error: topicsErr } = await supabase
      .from('topics')
      .select('id')
      .eq('is_preset', true)
      .in('id', topicIds);
    if (topicsErr) throw new Error(topicsErr.message);
    presetIds = (topicsData ?? []).map((t) => t.id);
    if (presetIds.length !== topicIds.length) {
      throw new Error('invalid_topic');
    }
  }

  // Fetch the starter courses (top 2 per topic by `position`).
  // Pull all preset courses under the requested topics, then group + slice in JS.
  let starterCourseIds: string[] = [];
  if (presetIds.length > 0) {
    const { data: coursesData, error: coursesErr } = await supabase
      .from('courses')
      .select('id, topic_id, position')
      .eq('is_preset', true)
      .in('topic_id', presetIds)
      .order('position', { ascending: true });
    if (coursesErr) throw new Error(coursesErr.message);

    const byTopic = new Map<string, { id: string; position: number }[]>();
    for (const c of coursesData ?? []) {
      if (!c.topic_id) continue;
      const arr = byTopic.get(c.topic_id) ?? [];
      arr.push({ id: c.id, position: c.position });
      byTopic.set(c.topic_id, arr);
    }
    // Walk requested topics in user-pick order (the order in topicIds) so the
    // shelf positions reflect the user's selection sequence.
    for (const tid of topicIds) {
      const list = byTopic.get(tid) ?? [];
      for (const c of list.slice(0, 2)) starterCourseIds.push(c.id);
    }
  }

  // Two writes. We accept the small atomicity gap (see spec § "Implementation
  // note") because the second write is idempotent (PK conflict on retry).
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({
      rate,
      interests: topicIds, // store topic UUIDs as text
      onboarded: true,
    })
    .eq('id', user.id);
  if (profileErr) throw new Error(profileErr.message);

  if (starterCourseIds.length > 0) {
    const rows = starterCourseIds.map((course_id, position) => ({
      user_id: user.id,
      course_id,
      position,
    }));
    const { error: shelfErr } = await supabase
      .from('profile_courses')
      .upsert(rows, { onConflict: 'user_id,course_id' });
    if (shelfErr) throw new Error(shelfErr.message);
  }

  redirect('/home');
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. (`profile_courses` types come from Task 2's regen.)

- [ ] **Step 3: Verify lint passes**

```bash
npm run lint
```

Expected: no new warnings/errors in this file.

- [ ] **Step 4: Commit**

```bash
git add app/onboarding/actions.ts
git commit -m "feat(onboarding): rewrite completeOnboarding for new rate+shelf flow"
```

---

## Task 4: Rewrite the `Onboarding` client component

**Files:**
- Modify: `components/onboarding/Onboarding.tsx`

Two pages of state. No DB writes mid-flow. CTA on Page 2 calls the (already updated) server action.

- [ ] **Step 1: Replace the file contents**

Open `components/onboarding/Onboarding.tsx` and replace the entire file with:

```tsx
'use client';
import React from 'react';

type TopicLite = {
  id: string;
  title: string;
  icon: string | null;
  color: string | null;
};

type Props = {
  topics: TopicLite[];
  initialLearnMinutes: number;       // derived in page.tsx from profile.rate
  initialTopicIds: string[];          // existing topic UUIDs in profile.interests
  onFinish: (payload: { rate: number; topicIds: string[] }) => Promise<void> | void;
};

const LEARN_MIN = 10;
const LEARN_MAX = 60;
const LEARN_STEP = 5;

function moodLabel(learnMin: number): string {
  if (learnMin <= 10) return 'easygoing';
  if (learnMin <= 25) return 'balanced';
  if (learnMin <= 45) return 'focused';
  return 'monk mode';
}

export function Onboarding({ topics, initialLearnMinutes, initialTopicIds, onFinish }: Props) {
  const [step, setStep] = React.useState<0 | 1>(0);
  const [learnMin, setLearnMin] = React.useState<number>(initialLearnMinutes);
  const [picked, setPicked] = React.useState<string[]>(initialTopicIds);
  const [submitting, setSubmitting] = React.useState(false);

  const togglePick = (id: string) =>
    setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onFinish({ rate: 5 / learnMin, topicIds: picked });
    } catch (e) {
      setSubmitting(false);
      // Surface the failure so the user can retry. A toast system would be
      // nicer; alert() is fine for v1 because this only fires on auth/RLS
      // failures or network errors that the user must act on.
      alert((e as Error).message ?? 'submit_failed');
    }
  };

  return (
    <div className="app fade-enter" data-testid="onboarding-root">
      {/* Progress dots (2 dots since 2 steps) */}
      <div
        style={{
          position: 'absolute', top: 52, left: 0, right: 0,
          display: 'flex', gap: 4, justifyContent: 'center', zIndex: 10,
        }}
      >
        {[0, 1].map((idx) => (
          <div
            key={idx}
            style={{
              width: idx === step ? 18 : 6,
              height: 4,
              borderRadius: 2,
              background: idx <= step ? 'var(--accent)' : 'var(--line)',
              transition: 'all 0.25s',
            }}
          />
        ))}
      </div>

      {/* Back button on step 2 */}
      {step === 1 && (
        <button
          type="button"
          onClick={() => setStep(0)}
          aria-label="back"
          style={{
            position: 'absolute', top: 48, left: 16, zIndex: 10,
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--bg-2)', border: '1px solid var(--line)',
            color: 'var(--ink)', cursor: 'pointer', fontSize: 18,
          }}
        >‹</button>
      )}

      {step === 0 ? (
        <PageDeal
          learnMin={learnMin}
          onChange={setLearnMin}
          onNext={() => setStep(1)}
        />
      ) : (
        <PageTopics
          topics={topics}
          picked={picked}
          onToggle={togglePick}
          onSubmit={submit}
          submitting={submitting}
        />
      )}
    </div>
  );
}

function PageDeal({
  learnMin,
  onChange,
  onNext,
}: {
  learnMin: number;
  onChange: (n: number) => void;
  onNext: () => void;
}) {
  return (
    <div className="col gap-8 pad" style={{ minHeight: '100vh' }} data-testid="onboarding-page-deal">
      <div className="eyebrow" style={{ color: 'var(--accent)', marginTop: 80 }}>
        01 · the deal
      </div>

      <div className="display" style={{ fontSize: 28, marginTop: 12 }}>
        Earn your guilty-free<br />scroll time by learning.
      </div>

      <div className="card mt-16 col gap-12">
        <div className="row between aic">
          <span className="body" style={{ color: 'var(--ink)' }}>Learn</span>
          <span
            className="display"
            style={{ fontSize: 28, color: 'var(--accent)' }}
            data-testid="deal-learn-min"
          >
            {learnMin} min
          </span>
        </div>
        <div className="row between aic">
          <span className="body" style={{ color: 'var(--ink)' }}>Scroll</span>
          <span className="display" style={{ fontSize: 22 }}>5 min</span>
        </div>

        <input
          type="range"
          min={LEARN_MIN}
          max={LEARN_MAX}
          step={LEARN_STEP}
          value={learnMin}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
          data-testid="deal-slider"
        />

        <div
          className="row"
          style={{
            justifyContent: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--ink-mute)',
          }}
          data-testid="deal-mood"
        >
          {moodLabel(learnMin)}
        </div>

        <div className="body" style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
          you can change this anytime.
        </div>
      </div>

      <div className="mt-auto">
        <button
          className="btn btn-primary"
          onClick={onNext}
          data-testid="deal-cta"
        >
          sounds fair →
        </button>
      </div>
    </div>
  );
}

function PageTopics({
  topics,
  picked,
  onToggle,
  onSubmit,
  submitting,
}: {
  topics: TopicLite[];
  picked: string[];
  onToggle: (id: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const ctaText =
    picked.length === 0
      ? 'skip for now →'
      : `continue (${picked.length} picked) →`;

  return (
    <div className="col gap-8 pad" style={{ minHeight: '100vh' }} data-testid="onboarding-page-topics">
      <div className="eyebrow" style={{ color: 'var(--accent)', marginTop: 80 }}>
        02 · pick what catches your eye
      </div>

      <div className="display" style={{ fontSize: 28, marginTop: 12 }}>
        What sounds interesting?
      </div>

      <div className="col gap-8 mt-16">
        {topics.map((t) => {
          const isOn = picked.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              role="checkbox"
              aria-checked={isOn}
              onClick={() => onToggle(t.id)}
              data-testid={`topic-tile-${t.id}`}
              data-selected={isOn ? 'true' : 'false'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 16px',
                borderRadius: 14,
                border: `1px solid ${isOn ? 'var(--accent)' : 'var(--line)'}`,
                background: isOn ? 'var(--bg-3, var(--bg-2))' : 'var(--bg-2)',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--ink)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* left-edge color bar — only when selected */}
              {isOn && t.color && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    background: t.color,
                  }}
                />
              )}
              <span style={{ fontSize: 20, marginLeft: isOn ? 6 : 0 }}>
                {t.icon ?? '•'}
              </span>
              <span style={{ fontFamily: 'var(--serif)', fontSize: 18 }}>
                {t.title}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="body mt-12"
        style={{ fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center' }}
      >
        pick any number — none is fine too.<br />
        you can add topics or paste a YouTube link later.
      </div>

      <div className="mt-auto">
        <button
          className="btn btn-primary"
          onClick={onSubmit}
          disabled={submitting}
          data-testid="topics-cta"
        >
          {submitting ? 'starting…' : ctaText}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Verify lint passes**

```bash
npm run lint
```

Expected: no warnings/errors in this file.

- [ ] **Step 4: Commit (with the page wiring + Scenes deletion to keep the repo compiling)**

Defer the commit to Task 6 — Tasks 4, 5, 6 must land together because Task 5 deletes the file Task 4 stops importing, and Task 6 is the only place `topics` and `initialLearnMinutes` get supplied. Skip to Task 5.

---

## Task 5: Delete `components/onboarding/Scenes.tsx`

**Files:**
- Delete: `components/onboarding/Scenes.tsx`

- [ ] **Step 1: Confirm no remaining importers**

Run:
```bash
grep -rn "from '@/components/onboarding/Scenes'" app components || true
grep -rn "from './Scenes'"                         components/onboarding || true
```

Expected: no matches (Task 4's rewrite drops the import).

- [ ] **Step 2: Delete the file**

```bash
git rm components/onboarding/Scenes.tsx
```

- [ ] **Step 3: Defer commit to Task 6**

Skip to Task 6.

---

## Task 6: Wire the new component in `app/onboarding/page.tsx`

**Files:**
- Modify: `app/onboarding/page.tsx`

The server component needs to fetch the preset topics and translate the existing `profile.rate` into `initialLearnMinutes` for the slider.

- [ ] **Step 1: Replace the file contents**

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Onboarding } from '@/components/onboarding/Onboarding';
import { completeOnboarding } from './actions';

// Map an existing profiles.rate (= 5/learnMinutes for users from this flow,
// or anything in [0.5, 2.0] for legacy users) back to a slider position in
// our 10–60 range. For values outside the new range we snap to the default.
function rateToLearnMinutes(rate: number | null | undefined): number {
  if (!rate || rate <= 0) return 20;
  const m = Math.round(5 / rate / 5) * 5; // snap to step of 5
  if (m < 10 || m > 60) return 20;
  return m;
}

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('interests, rate, onboarded')
    .eq('id', user.id)
    .single();

  if (profile?.onboarded) redirect('/home');

  const { data: topicsData } = await supabase
    .from('topics')
    .select('id, title, icon, color, position')
    .eq('is_preset', true)
    .order('position', { ascending: true });

  const topics = (topicsData ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    icon: t.icon,
    color: t.color,
  }));

  // profile.interests was previously free-text; only keep entries that match
  // a current preset topic UUID so legacy strings don't pre-select anything.
  const validIds = new Set(topics.map((t) => t.id));
  const initialTopicIds = (profile?.interests ?? []).filter((s) =>
    validIds.has(s),
  );

  return (
    <Onboarding
      topics={topics}
      initialLearnMinutes={rateToLearnMinutes(profile?.rate)}
      initialTopicIds={initialTopicIds}
      onFinish={completeOnboarding}
    />
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Verify lint passes**

```bash
npm run lint
```

Expected: no warnings/errors.

- [ ] **Step 4: Manual smoke check**

Run:
```bash
npm run dev
```

In a browser, do this manual checklist:

1. If you have a current dev session, log out (or open a private window) so you're unauthenticated.
2. Go to `/onboarding` directly. Middleware redirects you to `/login` (expected).
3. Use `/login` (or `/api/dev/login` from a curl/devtools fetch) to authenticate. **First** clear the `onboarded` flag on the dev profile so `/onboarding` doesn't redirect you to `/home`:

```bash
curl -X POST http://localhost:3000/api/dev/login >/dev/null
psql "postgres://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "update public.profiles set onboarded = false, interests = '{}' where email = 'dev@learntok.local';"
```

4. Reload `/onboarding`. You should see Page 1: "01 · the deal", "Learn 20 min / Scroll 5 min", slider, "balanced" mood label, "sounds fair →" button.
5. Drag the slider to 10. Mood label should switch to "easygoing". Drag to 60 → "monk mode".
6. Click "sounds fair →" → Page 2: "02 · pick what catches your eye", 5 topic tiles. CTA reads "skip for now →".
7. Click two tiles. Their borders should highlight, a left-edge color bar appears, CTA reads "continue (2 picked) →".
8. Click the back arrow (top-left) → returns to Page 1 with the slider value preserved.
9. Forward to Page 2 → the two tiles are still selected.

If any step fails, fix in code; do not move on.

- [ ] **Step 5: Commit Tasks 4 + 5 + 6 together**

```bash
git add components/onboarding/Onboarding.tsx app/onboarding/page.tsx
# Scenes.tsx already staged for deletion via git rm in Task 5
git commit -m "feat(onboarding): replace 9-slide flow with 2-page deal+topics UI"
```

---

## Task 7: Filter `/home` by interests and shelf

**Files:**
- Modify: `app/home/page.tsx`

Two changes:
1. Add a query for the user's `profile_courses` rows.
2. Filter `topics` to only those in `profile.interests`. Filter `courses` to only those whose id is on the user's shelf.

- [ ] **Step 1: Edit the data fetch + filter**

Open `app/home/page.tsx`. Find the `Promise.all([...])` that fetches topics, courses, lessons, progress (currently 4 entries). Replace it with a 5-entry version that adds `profile_courses`:

Replace:

```ts
  const [topicsRes, coursesRes, lessonsRes, progressRes] = await Promise.all([
    supabase
      .from('topics')
      .select('id, title, icon, color, position, is_preset')
      .order('is_preset', { ascending: false })
      .order('position', { ascending: true }),
    supabase
      .from('courses')
      .select('id, topic_id, title, icon, position, is_preset')
      .order('position', { ascending: true }),
    supabase
      .from('lessons')
      .select('id, course_id, position, title, duration_seconds, yt_id')
      .order('position', { ascending: true }),
    supabase
      .from('lesson_progress')
      .select('lesson_id, completed_at')
      .eq('user_id', user.id),
  ]);

  const topics = topicsRes.data ?? [];
  const courses = coursesRes.data ?? [];
  const lessons = lessonsRes.data ?? [];
  const progress = progressRes.data ?? [];
```

with:

```ts
  const interestIds = (profile?.interests ?? []) as string[];

  const [topicsRes, shelfRes, lessonsRes, progressRes] = await Promise.all([
    interestIds.length > 0
      ? supabase
          .from('topics')
          .select('id, title, icon, color, position, is_preset')
          .in('id', interestIds)
          .order('is_preset', { ascending: false })
          .order('position', { ascending: true })
      : Promise.resolve({ data: [] as Array<{
          id: string; title: string; icon: string | null;
          color: string | null; position: number; is_preset: boolean;
        }>, error: null }),
    supabase
      .from('profile_courses')
      .select('course_id, position, courses!inner(id, topic_id, title, icon, position, is_preset)')
      .eq('user_id', user.id)
      .order('position', { ascending: true }),
    supabase
      .from('lessons')
      .select('id, course_id, position, title, duration_seconds, yt_id')
      .order('position', { ascending: true }),
    supabase
      .from('lesson_progress')
      .select('lesson_id, completed_at')
      .eq('user_id', user.id),
  ]);

  const topics = topicsRes.data ?? [];
  // Flatten the join result into the same shape as the previous courses array.
  const courses = (shelfRes.data ?? []).map((row: any) => ({
    id: row.courses.id as string,
    topic_id: row.courses.topic_id as string | null,
    title: row.courses.title as string,
    icon: row.courses.icon as string | null,
    position: row.position as number, // shelf-position, not course.position
    is_preset: row.courses.is_preset as boolean,
  }));
  const lessons = lessonsRes.data ?? [];
  const progress = progressRes.data ?? [];
```

The rest of the function (lessons-by-course grouping, courses-by-topic grouping, continue-card derivation, JSX render) keeps working unchanged because the shapes match.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. (If the shelf-row typing complains, the explicit `(row: any) => ...` cast handles it; the regenerated types do support this join but nested joins can be awkward to type — the cast is intentional.)

- [ ] **Step 3: Verify lint passes**

```bash
npm run lint
```

Expected: no warnings/errors.

- [ ] **Step 4: Manual smoke check**

Run `npm run dev`. With the dev user (after running through the new onboarding once with 2 topics picked), `/home` should show exactly 2 topic rails (the picked ones), each containing 2 course cards (the seeded shelf courses). The continue card should point at one of those courses' first undone lesson.

Reset and try with 0 picks: `/home` should render no rails, just the dashed "+ paste YouTube link" row.

- [ ] **Step 5: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat(home): filter rails by interests and courses by shelf membership"
```

---

## Task 8: Playwright E2E test

**Files:**
- Create: `tests/onboarding.spec.ts`

Walks the full flow against the live dev server, asserts DB state, and checks home filtering.

- [ ] **Step 1: Write the test**

Create `tests/onboarding.spec.ts` with exactly this content:

```ts
import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

const DEV_EMAIL = 'dev@learntok.local';

async function devUserId(): Promise<string> {
  const a = admin();
  const { data } = await a.auth.admin.listUsers();
  const u = data.users.find((x) => x.email === DEV_EMAIL);
  expect(u, 'dev user must exist after /api/dev/login').toBeTruthy();
  return u!.id;
}

async function resetForOnboarding(userId: string) {
  const a = admin();
  // Roll the dev user back to a pre-onboarding state.
  await a
    .from('profiles')
    .update({ onboarded: false, interests: [], rate: 1.0 })
    .eq('id', userId);
  // Wipe any prior shelf entries.
  await a.from('profile_courses').delete().eq('user_id', userId);
}

async function getPresetTopics(): Promise<Array<{ id: string; title: string; position: number }>> {
  const a = admin();
  const { data } = await a
    .from('topics')
    .select('id, title, position')
    .eq('is_preset', true)
    .order('position', { ascending: true });
  expect((data ?? []).length, 'seed must contain preset topics').toBeGreaterThan(0);
  return data!;
}

test('onboarding: deal page → topic page → submit → home shows picked rails', async ({
  page,
}) => {
  // 1. Auth + reset to pre-onboarding state.
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();
  const userId = await devUserId();
  await resetForOnboarding(userId);

  const presets = await getPresetTopics();
  const pickA = presets[0]; // Physics (per seed)
  const pickB = presets[3]; // Math (per seed) — pick non-adjacent to verify ordering

  // 2. Land on /onboarding. Page 1 (deal) is visible.
  await page.goto('/onboarding');
  await expect(page.getByTestId('onboarding-page-deal')).toBeVisible();
  await expect(page.getByTestId('deal-learn-min')).toHaveText('20 min');
  await expect(page.getByTestId('deal-mood')).toHaveText('balanced');

  // 3. Drag the slider to 30 (focused). Range inputs need fill() in Playwright.
  await page.getByTestId('deal-slider').fill('30');
  await expect(page.getByTestId('deal-learn-min')).toHaveText('30 min');
  await expect(page.getByTestId('deal-mood')).toHaveText('focused');

  // 4. Advance to page 2.
  await page.getByTestId('deal-cta').click();
  await expect(page.getByTestId('onboarding-page-topics')).toBeVisible();

  // CTA copy reflects 0 picks initially.
  await expect(page.getByTestId('topics-cta')).toHaveText('skip for now →');

  // 5. Pick two topics (Physics then Math).
  await page.getByTestId(`topic-tile-${pickA.id}`).click();
  await page.getByTestId(`topic-tile-${pickB.id}`).click();
  await expect(page.getByTestId('topics-cta')).toHaveText('continue (2 picked) →');

  // 6. Submit → expect /home.
  await Promise.all([
    page.waitForURL('**/home', { timeout: 10_000 }),
    page.getByTestId('topics-cta').click(),
  ]);

  // 7. Assert DB writes.
  const a = admin();
  const { data: profile } = await a
    .from('profiles')
    .select('rate, interests, onboarded')
    .eq('id', userId)
    .single();
  expect(profile?.onboarded).toBe(true);
  // rate = 5/30 ≈ 0.167 — allow a small float tolerance.
  expect(Number(profile?.rate)).toBeCloseTo(5 / 30, 3);
  expect(profile?.interests).toEqual([pickA.id, pickB.id]);

  const { data: shelf } = await a
    .from('profile_courses')
    .select('course_id, position, courses!inner(topic_id)')
    .eq('user_id', userId)
    .order('position', { ascending: true });
  expect((shelf ?? []).length).toBe(4); // 2 topics × 2 starter courses
  // First 2 rows belong to pickA's topic, next 2 to pickB's.
  const topicSeq = (shelf ?? []).map((r: any) => r.courses.topic_id);
  expect(topicSeq.slice(0, 2).every((t) => t === pickA.id)).toBe(true);
  expect(topicSeq.slice(2, 4).every((t) => t === pickB.id)).toBe(true);

  // 8. /home shows exactly 2 rails (one per picked topic).
  // The DOM uses data-testid="topic-rail-{id}" per components/home/TopicRail.tsx.
  await expect(page.getByTestId(`topic-rail-${pickA.id}`)).toBeVisible();
  await expect(page.getByTestId(`topic-rail-${pickB.id}`)).toBeVisible();
  // A topic NOT picked should not have a rail.
  const unpicked = presets.find((t) => t.id !== pickA.id && t.id !== pickB.id)!;
  await expect(page.getByTestId(`topic-rail-${unpicked.id}`)).toHaveCount(0);
});

test('onboarding: 0-pick path writes empty interests and no shelf rows', async ({
  page,
}) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();
  const userId = await devUserId();
  await resetForOnboarding(userId);

  await page.goto('/onboarding');
  await page.getByTestId('deal-cta').click();
  await expect(page.getByTestId('topics-cta')).toHaveText('skip for now →');

  await Promise.all([
    page.waitForURL('**/home', { timeout: 10_000 }),
    page.getByTestId('topics-cta').click(),
  ]);

  const a = admin();
  const { data: profile } = await a
    .from('profiles')
    .select('interests, onboarded')
    .eq('id', userId)
    .single();
  expect(profile?.onboarded).toBe(true);
  expect(profile?.interests).toEqual([]);

  const { count } = await a
    .from('profile_courses')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  expect(count).toBe(0);
});
```

- [ ] **Step 2: Run only this spec**

```bash
npm test tests/onboarding.spec.ts
```

Expected: both tests pass.

If a test fails, debug:
- Page-1 selectors not found → check that `data-testid` attributes were added in Task 4.
- DB assertions fail → confirm the migration ran (`psql ... -c "\d profile_courses"`) and that the dev user got reset.
- `/home` rail testids missing → confirm `components/home/TopicRail.tsx` already exposes `data-testid="topic-rail-${topic.id}"` (it does, as of [components/home/TopicRail.tsx:44](../../components/home/TopicRail.tsx)).

- [ ] **Step 3: Run the full suite to make sure nothing else regressed**

```bash
npm test
```

Expected: all specs pass. If any pre-existing spec breaks because it relied on `onboarded=true` after `/api/dev/login` (it does — see `app/api/dev/login/route.ts`), the dev-login route's behavior is unchanged by this plan, so nothing should have moved. If a spec does fail, capture the failure and fix the underlying code (do not weaken the test).

- [ ] **Step 4: Commit**

```bash
git add tests/onboarding.spec.ts
git commit -m "test(onboarding): e2e covering deal+topics flow and 0-pick path"
```

---

## Self-Review Notes (already applied inline)

- The plan implements every spec section: D1-D16 decisions are all reflected in Tasks 1–8 (schema D14/D16 in Task 1; rate semantics D2-D4 + slider in Task 4; topic tiles D6-D8 + D12 in Task 4; 0-pick D7/D15 covered by Task 8 second test; B2 timing D11 by Task 3 doing all writes in one action; D13 legacy-string handling by `validIds` filter in Task 6 + the spec note that legacy users won't re-enter onboarding; D5 daily-goal removal is a non-action, ensured by absence of any goal-collecting UI).
- Task 4's component imports nothing from `Scenes.tsx` (deleted in Task 5), nothing from the old `INTERESTS` constant (removed wholesale), and nothing else stale. The grep step in Task 5 will catch any straggler.
- Type names are consistent: `TopicLite` shape `{id, title, icon, color}` is defined in Task 4 and produced by Task 6. The shelf-join shape in Task 7 is cast through `any` deliberately because the nested join is awkward to type — annotated.
- Onboarding test relies on `data-testid="topic-rail-${id}"` from `components/home/TopicRail.tsx` (already present, see existing file content).

---

## Out of plan (explicit)

- **`/topics` browser page** — for 0-pick users to grow their shelf later. Spec Open Item.
- **Settings page** to edit rate and interests post-onboarding. Spec Open Item.
- **`/add` updates** to write to `profile_courses` when pasting a YouTube URL. Spec Open Item.
- **`complete_onboarding` Postgres RPC** — preferred long-term, deferred per spec note.
- **CSS polish** for the topic tiles' empty/selected states beyond the inline styles in Task 4. The current treatment uses existing variables; a future pass can promote it into `globals.css` once design tokens settle.
