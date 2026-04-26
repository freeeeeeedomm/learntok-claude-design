# PR 1: Earn Ratio Fix + Onboarding Reframe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the bug where `profiles.rate` is stored at onboarding but never applied when crediting the time-bank, and reframe the onboarding "deal" card from `Learn variable + Scroll fixed 5min` to `Learn fixed 1h + Rest variable 5-60min`.

**Architecture:** Two coupled changes. Backend: `apply_heartbeat_delta` RPC reads `profiles.rate` and multiplies it into learn-session credits (feed debits unchanged); column type widens from `numeric(3,1)` to `numeric(4,3)` so 3-decimal rate values round-trip exactly. Frontend: onboarding's `<PageDeal>` flips its anchor — Learn is now displayed as a fixed "1 hour" label, the slider controls Rest minutes (5–60 step 5, 12 positions), and the formula stored is `rate = restMinutes / 60`.

**Tech Stack:** Supabase Postgres (migrations + RPC), Next.js 14 App Router (server components + client components), Playwright (`@playwright/test`), `zod` (validator).

**Worktree:** `C:\Users\admin\Desktop\ClaudeProjects\learntok-claude-design\.claude\worktrees\polish-redesign-brainstorm`
**Branch:** `claude/polish-redesign` (already created at `origin/main` with two prior commits adding the spec doc; this PR lands on top).

**Spec reference:** `docs/superpowers/specs/2026-04-26-multi-page-polish-redesign-design.md` § 1, § 1.1, and the PR 1 file table.

---

## File structure

| File | Action | Lines (approx) | Responsibility |
|---|---|---|---|
| `supabase/migrations/0012_apply_rate_to_earn.sql` | Create | ~70 | Widen `profiles.rate` precision; replace `apply_heartbeat_delta` RPC to multiply learn credits by `profiles.rate`. |
| `app/api/sessions/heartbeat/route.ts` | Modify | edit ~3 lines | Read `credited` from RPC return value instead of trusting the input `signedDelta` (RPC may have rounded after rate multiplication). |
| `app/onboarding/actions.ts` | Modify | edit ~10 lines | Update `Payload` validator (`max(1.0)`), update comment block to describe new formula `rate = restMin / 60`. |
| `components/onboarding/Onboarding.tsx` | Modify | edit ~30 lines | Flip the deal-card framing: rename `learnMin` → `restMin`, replace `LEARN_*` constants with `REST_*`, update formula in `submit`, update mood label thresholds (new polarity), update card UI text (`Learn 1 hour` static + `Rest X min` dynamic), drop "guilty-free" from headline. |
| `app/onboarding/page.tsx` | Modify | edit ~10 lines | Rename `rateToLearnMinutes` → `rateToRestMinutes`, update derivation formula (`rate * 60`), pass `initialRestMinutes` prop. |
| `tests/earn-ratio.spec.ts` | Create | ~140 | Three test groups: (a) RPC applies rate to learn credits across rate=1.0/0.5/0.167/0.083, (b) RPC leaves feed debits at 1:1 regardless of rate, (c) heartbeat HTTP route returns rate-adjusted `credited` field. |
| `tests/full-flow.spec.ts` | Modify | edit ~7 lines | Update onboarding-step assertions to use new testid `deal-rest-min` and new mood labels. |

---

## Task 1: Failing test — RPC must apply rate on learn credits

**Files:**
- Create: `tests/earn-ratio.spec.ts`

This task creates the test file with the rate-multiplication assertion. It will fail because the current RPC ignores `profiles.rate`. Task 2 makes it pass.

- [ ] **Step 1: Read existing test helpers to understand the `admin()` pattern**

Run:
```bash
cat tests/helpers/session.ts
```
Expected: file exists and exports `admin()` returning a Supabase service-role client. (If not, the heartbeat tests in `tests/full-flow.spec.ts` already use it on line 2 / 23 — confirm via grep.)

- [ ] **Step 2: Create the test file with the first failing assertion (rate=0.5)**

Create `tests/earn-ratio.spec.ts` with:

```ts
import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

const DEV_EMAIL = 'dev@learntok.local';

// Verifies that profiles.rate is correctly applied as an earn-side multiplier
// when apply_heartbeat_delta credits learn sessions, and is correctly ignored
// on the feed-debit side. Each test resets via /api/dev/login-onboarding so
// runs are idempotent.

async function resetUserAndGetId(request: any): Promise<string> {
  const res = await request.post('/api/dev/login-onboarding');
  expect(res.ok(), 'dev login-onboarding must succeed').toBeTruthy();
  const a = admin();
  const { data: userList } = await a.auth.admin.listUsers();
  const userId = userList.users.find((u: any) => u.email === DEV_EMAIL)?.id;
  expect(userId, 'dev user must exist').toBeTruthy();
  return userId!;
}

async function setRate(userId: string, rate: number) {
  const a = admin();
  const { error } = await a.from('profiles').update({ rate }).eq('id', userId);
  expect(error, `setting rate=${rate} must succeed`).toBeNull();
}

async function pickFirstPresetLessonId(): Promise<string> {
  const a = admin();
  const { data: lesson } = await a
    .from('lessons')
    .select('id')
    .eq('is_preset', true)
    .order('position', { ascending: true })
    .limit(1)
    .single();
  expect(lesson?.id, 'at least one preset lesson must exist in seed').toBeTruthy();
  return lesson!.id;
}

async function makeLearnSession(userId: string, lessonId: string): Promise<string> {
  const a = admin();
  const { data: session, error } = await a
    .from('sessions')
    .insert({ user_id: userId, kind: 'learn', lesson_id: lessonId })
    .select('id')
    .single();
  expect(error, 'creating learn session must succeed').toBeNull();
  return session!.id;
}

async function callRpcDirect(sessionId: string, userId: string, delta: number, label: string, refId: string) {
  const a = admin();
  const { data, error } = await a.rpc('apply_heartbeat_delta', {
    p_session_id: sessionId,
    p_user_id: userId,
    p_delta: delta,
    p_label: label,
    p_ref_id: refId,
    p_now: new Date().toISOString(),
  });
  expect(error, 'RPC call must not error').toBeNull();
  return data as { new_earned_or_spent: number; ended: boolean; reason: string | null; credited?: number };
}

async function readBalance(userId: string): Promise<number> {
  const a = admin();
  const { data: profile } = await a
    .from('profiles')
    .select('jar_balance_cached')
    .eq('id', userId)
    .single();
  return profile?.jar_balance_cached ?? 0;
}

test.describe('apply_heartbeat_delta — earn-side rate multiplication', () => {
  test('rate=0.5 → 60s learn delta credits 30s', async ({ request }) => {
    const userId = await resetUserAndGetId(request);
    await setRate(userId, 0.5);
    const lessonId = await pickFirstPresetLessonId();
    const sessionId = await makeLearnSession(userId, lessonId);

    const balanceBefore = await readBalance(userId);
    await callRpcDirect(sessionId, userId, 60, 'lesson', lessonId);
    const balanceAfter = await readBalance(userId);

    expect(balanceAfter - balanceBefore, '60s × 0.5 should credit exactly 30s').toBe(30);
  });
});
```

- [ ] **Step 3: Verify dev server is running on port 3000 (or note alternate port)**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/dev/login-onboarding -X POST
```
Expected: `200`. If `000` (connection refused), start the dev server in another terminal: `pnpm dev`. If a sibling worktree has port 3000, set `PW_PORT=3001 PW_BASE_URL=http://localhost:3001 pnpm dev` and prefix subsequent test runs.

- [ ] **Step 4: Run the test and verify it FAILS with the expected mismatch**

Run:
```bash
pnpm test tests/earn-ratio.spec.ts
```
Expected: 1 failed. Failure message contains `Expected: 30  Received: 60` — confirming the bug (rate is ignored, all 60s credit unmodified).

- [ ] **Step 5: Commit the failing test**

```bash
git add tests/earn-ratio.spec.ts
git commit -m "test(earn-ratio): failing assertion for rate=0.5 learn credit"
```

---

## Task 2: Migration 0012 — widen rate column + apply rate in RPC

**Files:**
- Create: `supabase/migrations/0012_apply_rate_to_earn.sql`

This task makes Task 1's failing test pass by fixing both schema precision and RPC behavior.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/0012_apply_rate_to_earn.sql` with:

```sql
-- 0012_apply_rate_to_earn.sql
-- Two coupled fixes:
--   1. Widen profiles.rate from numeric(3,1) to numeric(4,3) so 3-decimal
--      values produced by the new onboarding formula (rate = restMinutes / 60,
--      e.g. 0.083, 0.167, 0.333) round-trip exactly. The old precision was
--      collapsing distinct slider positions to the same stored value.
--   2. Replace apply_heartbeat_delta to multiply learn-session credits by
--      profiles.rate (the long-standing bug: rate was set at onboarding but
--      never applied at credit time, so every user effectively had rate=1.0).
--      Feed debits stay unchanged (rate is an earn-only multiplier per spec).

alter table public.profiles
  alter column rate type numeric(4,3);

create or replace function public.apply_heartbeat_delta(
  p_session_id uuid,
  p_user_id uuid,
  p_delta int,                -- signed: positive for learn credit (raw study seconds), negative for feed debit
  p_label text,               -- 'lesson' or 'feed'
  p_ref_id uuid,              -- lesson_id for learn, session_id for feed
  p_now timestamptz
) returns json
language plpgsql
as $func$
declare
  v_new_eos int;
  v_kind text;
  v_budget int;
  v_rate numeric;
  v_credit int;
  v_ended boolean := false;
  v_reason text := null;
begin
  -- Look up rate first (cheap; uses PK).
  select rate into v_rate from public.profiles where id = p_user_id;
  if v_rate is null then
    raise exception 'profile_not_found_for_rate_lookup';
  end if;

  -- For learn sessions: multiply raw study seconds by rate (earn-only multiplier).
  -- For feed sessions: pass through unchanged (rate does not apply on spend side).
  -- p_delta carries the sign: positive = learn credit, negative = feed debit.
  if p_delta > 0 then
    v_credit := round(p_delta * v_rate);
  else
    v_credit := p_delta;
  end if;

  -- Atomic increment; Postgres acquires a row lock so concurrent callers serialize.
  update public.sessions
    set earned_or_spent_seconds = earned_or_spent_seconds + v_credit,
        last_heartbeat_at = p_now
    where id = p_session_id
      and ended_at is null
    returning earned_or_spent_seconds, kind, budget_seconds
    into v_new_eos, v_kind, v_budget;

  if not found then
    raise exception 'session_not_found_or_closed';
  end if;

  insert into public.ledger_entries (user_id, delta_seconds, label, ref_id)
    values (p_user_id, v_credit, p_label, p_ref_id);

  -- Feed budget exhaustion — one overdraft heartbeat allowed, then force-close.
  if v_kind = 'feed' and (-v_new_eos) > v_budget then
    update public.sessions
      set ended_at = p_now
      where id = p_session_id;
    v_ended := true;
    v_reason := 'budget_exhausted';
  end if;

  return json_build_object(
    'new_earned_or_spent', v_new_eos,
    'credited', v_credit,
    'ended', v_ended,
    'reason', v_reason
  );
end;
$func$;

-- Re-revoke (create or replace preserves grants in some cases, but be explicit).
revoke all on function public.apply_heartbeat_delta(uuid, uuid, int, text, uuid, timestamptz) from public;
revoke all on function public.apply_heartbeat_delta(uuid, uuid, int, text, uuid, timestamptz) from anon, authenticated;
```

- [ ] **Step 2: Apply the migration locally and reset DB**

Run:
```bash
pnpm supabase:reset
```
Expected: output ends with `Finished supabase db reset`. The reset re-applies all migrations 0001 through 0012 plus seed.

- [ ] **Step 3: Re-run the failing test from Task 1**

Run:
```bash
pnpm test tests/earn-ratio.spec.ts
```
Expected: 1 passed. The test now asserts `30 == 30` because the RPC multiplied 60 × 0.5.

- [ ] **Step 4: Commit the migration**

```bash
git add supabase/migrations/0012_apply_rate_to_earn.sql
git commit -m "fix(rate): apply profiles.rate to learn credits in heartbeat RPC

Migration 0012 widens profiles.rate to numeric(4,3) so 3-decimal
rate values round-trip exactly, then replaces apply_heartbeat_delta
to multiply learn-session p_delta by profiles.rate. Feed debits are
unchanged. Fixes the bug where every user effectively had rate=1.0
because the RPC never read profiles.rate."
```

---

## Task 3: Expand earn-ratio test coverage

**Files:**
- Modify: `tests/earn-ratio.spec.ts`

Add the remaining rate scenarios + feed-side regression + the heartbeat-route HTTP test.

- [ ] **Step 1: Add three more learn-side rate scenarios**

Append inside `test.describe('apply_heartbeat_delta — earn-side rate multiplication', () => {` block in `tests/earn-ratio.spec.ts`, immediately after the rate=0.5 test:

```ts
  test('rate=1.0 → 60s learn delta credits 60s (1:1 playtime)', async ({ request }) => {
    const userId = await resetUserAndGetId(request);
    await setRate(userId, 1.0);
    const lessonId = await pickFirstPresetLessonId();
    const sessionId = await makeLearnSession(userId, lessonId);

    const before = await readBalance(userId);
    await callRpcDirect(sessionId, userId, 60, 'lesson', lessonId);
    const after = await readBalance(userId);

    expect(after - before).toBe(60);
  });

  test('rate=0.167 → 60s learn delta credits 10s (6:1 focused)', async ({ request }) => {
    const userId = await resetUserAndGetId(request);
    await setRate(userId, 0.167);
    const lessonId = await pickFirstPresetLessonId();
    const sessionId = await makeLearnSession(userId, lessonId);

    const before = await readBalance(userId);
    await callRpcDirect(sessionId, userId, 60, 'lesson', lessonId);
    const after = await readBalance(userId);

    // round(60 * 0.167) = round(10.02) = 10
    expect(after - before).toBe(10);
  });

  test('rate=0.083 → 60s learn delta credits 5s (12:1 monk mode)', async ({ request }) => {
    const userId = await resetUserAndGetId(request);
    await setRate(userId, 0.083);
    const lessonId = await pickFirstPresetLessonId();
    const sessionId = await makeLearnSession(userId, lessonId);

    const before = await readBalance(userId);
    await callRpcDirect(sessionId, userId, 60, 'lesson', lessonId);
    const after = await readBalance(userId);

    // round(60 * 0.083) = round(4.98) = 5
    expect(after - before).toBe(5);
  });
});
```

- [ ] **Step 2: Add the feed-side regression test (rate must NOT affect debits)**

Append a new describe block at end of file:

```ts
test.describe('apply_heartbeat_delta — feed debits unaffected by rate', () => {
  test('rate=0.5 + feed debit of -30s decrements balance by exactly 30', async ({ request }) => {
    const userId = await resetUserAndGetId(request);
    await setRate(userId, 0.5);

    // Give the user 600s so the debit doesn't underflow / trigger exhaustion.
    const a = admin();
    await a.from('ledger_entries').insert({ user_id: userId, delta_seconds: 600, label: 'test_seed' });

    // Feed sessions need budget_seconds set.
    const { data: session } = await a
      .from('sessions')
      .insert({ user_id: userId, kind: 'feed', budget_seconds: 300 })
      .select('id')
      .single();
    expect(session?.id).toBeTruthy();

    const before = await readBalance(userId);
    await callRpcDirect(session!.id, userId, -30, 'feed', session!.id);
    const after = await readBalance(userId);

    // Rate=0.5 must NOT halve the debit — feed is 1:1.
    expect(before - after).toBe(30);
  });

  test('rate=1.0 + feed debit of -45s decrements balance by exactly 45', async ({ request }) => {
    const userId = await resetUserAndGetId(request);
    await setRate(userId, 1.0);
    const a = admin();
    await a.from('ledger_entries').insert({ user_id: userId, delta_seconds: 600, label: 'test_seed' });
    const { data: session } = await a
      .from('sessions')
      .insert({ user_id: userId, kind: 'feed', budget_seconds: 300 })
      .select('id')
      .single();

    const before = await readBalance(userId);
    await callRpcDirect(session!.id, userId, -45, 'feed', session!.id);
    const after = await readBalance(userId);

    expect(before - after).toBe(45);
  });
});
```

- [ ] **Step 3: Add the heartbeat-route HTTP test**

Append a third describe block at end of file:

```ts
test.describe('POST /api/sessions/heartbeat — returns rate-adjusted credited', () => {
  test('rate=0.5 + 30s gap → response credited = 15 (30 × 0.5)', async ({ request }) => {
    // The route caps delta at MAX_CREDIT_PER_HEARTBEAT (20s). To exercise the
    // cap path, set last_heartbeat_at to 30s ago so gapSec=30, clamped to 20,
    // multiplied by rate=0.5 → credited=10.
    const userId = await resetUserAndGetId(request);
    await setRate(userId, 0.5);
    const lessonId = await pickFirstPresetLessonId();

    const a = admin();
    const thirtySecAgo = new Date(Date.now() - 30_000).toISOString();
    const { data: session } = await a
      .from('sessions')
      .insert({
        user_id: userId,
        kind: 'learn',
        lesson_id: lessonId,
        last_heartbeat_at: thirtySecAgo,
      })
      .select('id')
      .single();
    expect(session?.id).toBeTruthy();

    // Route uses cookie auth; resetUserAndGetId already set the dev cookie.
    const res = await request.post('/api/sessions/heartbeat', {
      data: { sessionId: session!.id, playing: true },
    });
    expect(res.ok(), 'heartbeat must succeed').toBeTruthy();
    const body = await res.json();

    // gapSec=30 → clamped to 20 → 20 × 0.5 = 10 credited.
    expect(body.credited, 'route should return rate-adjusted credited value').toBe(10);
  });
});
```

- [ ] **Step 4: Run the new tests and verify the route test FAILS**

Run:
```bash
pnpm test tests/earn-ratio.spec.ts
```
Expected: 5 passed (the 4 RPC tests including the existing rate=0.5), 1 failed (the route test). The route test fails because the route currently sets `credited = signedDelta` (line 58 of `app/api/sessions/heartbeat/route.ts`) — it returns 20 (the raw clamped delta) instead of 10 (the rate-adjusted value the RPC actually wrote).

- [ ] **Step 5: Commit the new tests**

```bash
git add tests/earn-ratio.spec.ts
git commit -m "test(earn-ratio): cover all rate scenarios + feed unchanged + route response"
```

---

## Task 4: Heartbeat route — pass through actual `credited` from RPC

**Files:**
- Modify: `app/api/sessions/heartbeat/route.ts:58-59`

The route currently returns `signedDelta` as the `credited` value to the client. After Task 2, the RPC may write a different number (raw × rate, rounded). The route must pass the RPC's reported `credited` back to the client so the displayed "+X" matches the actual jar credit.

- [ ] **Step 1: Update the route to read `credited` from the RPC response**

Edit `app/api/sessions/heartbeat/route.ts`. Find lines 58-63:

```ts
    credited = signedDelta;
    const result = rpcResult as { new_earned_or_spent: number; ended: boolean; reason: string | null };
    if (result.ended) {
      ended = true;
      reason = (result.reason ?? 'budget_exhausted') as 'budget_exhausted';
    }
```

Replace with:

```ts
    const result = rpcResult as { new_earned_or_spent: number; credited: number; ended: boolean; reason: string | null };
    credited = result.credited;
    if (result.ended) {
      ended = true;
      reason = (result.reason ?? 'budget_exhausted') as 'budget_exhausted';
    }
```

- [ ] **Step 2: Re-run the earn-ratio tests**

Run:
```bash
pnpm test tests/earn-ratio.spec.ts
```
Expected: 6 passed, 0 failed. The route test now reads `credited=10` from the RPC return.

- [ ] **Step 3: Commit the route fix**

```bash
git add app/api/sessions/heartbeat/route.ts
git commit -m "fix(heartbeat-route): return RPC-reported credited (rate-adjusted)

The RPC now multiplies p_delta by profiles.rate before writing
to the ledger. The route must surface that adjusted value to
the client so any UI showing '+X seconds' matches the actual
jar balance change."
```

---

## Task 5: Onboarding actions — update validator + comments

**Files:**
- Modify: `app/onboarding/actions.ts:6-15`

The validator currently caps rate at 0.5 (max under old `5 / learnMinutes` formula with min learnMinutes=10). New formula `rate = restMinutes / 60` with restMinutes∈[5, 60] yields rate∈[0.083, 1.0]. Lift the cap.

- [ ] **Step 1: Update the validator and the comment block**

Edit `app/onboarding/actions.ts`. Find lines 6-15:

```ts
// Input contract:
// - rate: 5 / learnMinutes; learnMinutes ∈ [10, 60] → rate ∈ [~0.0833, 0.5].
//   Lower bound rounded down a hair to absorb float-arithmetic noise.
// - groupKeys: 0–5 preset group keys. Topics + starter courses are derived
//   server-side using the W4 rule (top-2 topics × top-3 courses per group).
const VALID_GROUP_KEYS = ['finance', 'humanities', 'stem', 'math', 'cs'] as const;
const Payload = z.object({
  rate: z.number().min(0.08).max(0.5),
  groupKeys: z.array(z.enum(VALID_GROUP_KEYS)).max(VALID_GROUP_KEYS.length),
});
```

Replace with:

```ts
// Input contract:
// - rate: restMinutes / 60; restMinutes ∈ [5, 60] → rate ∈ [~0.0833, 1.0].
//   The slider on the deal card lets users pick how many minutes of "rest"
//   (feed time) they want for every hour of learning. Rate is stored as the
//   ratio so the heartbeat RPC can multiply raw study seconds by it directly.
//   Lower bound rounded down a hair to absorb float-arithmetic noise.
// - groupKeys: 0–5 preset group keys. Topics + starter courses are derived
//   server-side using the W4 rule (top-2 topics × top-3 courses per group).
const VALID_GROUP_KEYS = ['finance', 'humanities', 'stem', 'math', 'cs'] as const;
const Payload = z.object({
  rate: z.number().min(0.08).max(1.0),
  groupKeys: z.array(z.enum(VALID_GROUP_KEYS)).max(VALID_GROUP_KEYS.length),
});
```

- [ ] **Step 2: Type-check passes**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/onboarding/actions.ts
git commit -m "refactor(onboarding): widen rate validator to [0.08, 1.0]"
```

---

## Task 6: Onboarding component reframe (Onboarding.tsx)

**Files:**
- Modify: `components/onboarding/Onboarding.tsx`

Flip the deal-card framing. The slider now controls `restMin` (5-60), the formula becomes `rate = restMin / 60`, the mood label polarity flips, and the headline drops "guilty-free".

- [ ] **Step 1: Replace constants and `moodLabel` (lines 17-26)**

Edit `components/onboarding/Onboarding.tsx`. Find lines 17-26:

```ts
const LEARN_MIN = 10;
const LEARN_MAX = 60;
const LEARN_STEP = 5;

function moodLabel(learnMin: number): string {
  if (learnMin <= 10) return 'easygoing';
  if (learnMin <= 25) return 'balanced';
  if (learnMin <= 45) return 'focused';
  return 'monk mode';
}
```

Replace with:

```ts
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

- [ ] **Step 2: Rename prop and state in the `Onboarding` function (lines 11-32)**

Find:

```ts
type Props = {
  groups: GroupLite[];
  initialLearnMinutes: number;
  onFinish: (payload: { rate: number; groupKeys: string[] }) => Promise<void> | void;
};
```

Replace with:

```ts
type Props = {
  groups: GroupLite[];
  initialRestMinutes: number;
  onFinish: (payload: { rate: number; groupKeys: string[] }) => Promise<void> | void;
};
```

Then find:

```ts
export function Onboarding({ groups, initialLearnMinutes, onFinish }: Props) {
  const [step, setStep] = React.useState<0 | 1>(0);
  const [learnMin, setLearnMin] = React.useState<number>(initialLearnMinutes);
```

Replace with:

```ts
export function Onboarding({ groups, initialRestMinutes, onFinish }: Props) {
  const [step, setStep] = React.useState<0 | 1>(0);
  const [restMin, setRestMin] = React.useState<number>(initialRestMinutes);
```

- [ ] **Step 3: Update the `submit` formula (line 42)**

Find:

```ts
      await onFinish({ rate: 5 / learnMin, groupKeys: picked });
```

Replace with:

```ts
      await onFinish({ rate: restMin / 60, groupKeys: picked });
```

- [ ] **Step 4: Update the step-0 props passed to `<PageDeal>` (lines 92-97)**

Find:

```ts
      {step === 0 ? (
        <PageDeal
          learnMin={learnMin}
          onChange={setLearnMin}
          onNext={() => setStep(1)}
        />
      ) : (
```

Replace with:

```ts
      {step === 0 ? (
        <PageDeal
          restMin={restMin}
          onChange={setRestMin}
          onNext={() => setStep(1)}
        />
      ) : (
```

- [ ] **Step 5: Rewrite `PageDeal` (lines 111-186)**

Find the entire `PageDeal` function:

```ts
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
          you can adjust this later.
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
```

Replace with:

```ts
function PageDeal({
  restMin,
  onChange,
  onNext,
}: {
  restMin: number;
  onChange: (n: number) => void;
  onNext: () => void;
}) {
  return (
    <div className="col gap-8 pad" style={{ minHeight: '100vh' }} data-testid="onboarding-page-deal">
      <div className="eyebrow" style={{ color: 'var(--accent)', marginTop: 80 }}>
        01 · the deal
      </div>

      <div className="display" style={{ fontSize: 28, marginTop: 12 }}>
        Earn your scroll<br />time by learning.
      </div>

      <div className="card mt-16 col gap-12">
        <div className="row between aic">
          <span className="body" style={{ color: 'var(--ink)' }}>Learn</span>
          <span className="display" style={{ fontSize: 22 }}>1 hour</span>
        </div>
        <div className="row between aic">
          <span className="body" style={{ color: 'var(--ink)' }}>Rest</span>
          <span
            className="display"
            style={{ fontSize: 28, color: 'var(--accent)' }}
            data-testid="deal-rest-min"
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
          {moodLabel(restMin)}
        </div>

        <div className="body" style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
          you can adjust this later in profile.
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
```

- [ ] **Step 6: Type-check passes**

Run:
```bash
npx tsc --noEmit
```
Expected: errors only on `app/onboarding/page.tsx` referencing the old prop name `initialLearnMinutes` (will be fixed in Task 7).

- [ ] **Step 7: Commit**

```bash
git add components/onboarding/Onboarding.tsx
git commit -m "feat(onboarding): flip deal card to Learn-1h fixed + Rest variable

Slider now controls restMin (5-60 step 5, 12 positions). Formula
becomes rate = restMin / 60. Mood label polarity flips so monk-mode
is at low rest, playtime at high rest. Headline drops 'guilty-free'."
```

---

## Task 7: Onboarding page — derive `initialRestMinutes`

**Files:**
- Modify: `app/onboarding/page.tsx:6-14, 60-65`

The page derives the slider's initial value from existing `profile.rate`. Old derivation used `5 / rate`; new uses `rate * 60`.

- [ ] **Step 1: Replace `rateToLearnMinutes` with `rateToRestMinutes`**

Edit `app/onboarding/page.tsx`. Find lines 6-14:

```ts
// Map an existing profiles.rate (= 5/learnMinutes for users from this flow,
// or anything in [0.5, 2.0] for legacy users) back to a slider position in
// our 10–60 range. For values outside the new range we snap to the default.
function rateToLearnMinutes(rate: number | null | undefined): number {
  if (!rate || rate <= 0) return 20;
  const m = Math.round(5 / rate / 5) * 5; // snap to step of 5
  if (m < 10 || m > 60) return 20;
  return m;
}
```

Replace with:

```ts
// Map an existing profiles.rate (= restMinutes / 60) back to a slider
// position in the 5–60 range. Values from the legacy formula (5 / learnMin
// → rate ≤ 0.5) still map cleanly because the new range is a superset.
function rateToRestMinutes(rate: number | null | undefined): number {
  if (!rate || rate <= 0) return 30;            // default: 30 min rest = balanced
  const m = Math.round((rate * 60) / 5) * 5;    // snap to step of 5
  if (m < 5 || m > 60) return 30;
  return m;
}
```

- [ ] **Step 2: Update the `<Onboarding>` JSX prop**

Find lines 60-65:

```ts
  return (
    <Onboarding
      groups={groups}
      initialLearnMinutes={rateToLearnMinutes(profile?.rate)}
      onFinish={completeOnboarding}
    />
  );
```

Replace with:

```ts
  return (
    <Onboarding
      groups={groups}
      initialRestMinutes={rateToRestMinutes(profile?.rate)}
      onFinish={completeOnboarding}
    />
  );
```

- [ ] **Step 3: Type-check passes cleanly**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Manually verify the dev page renders**

If dev server is running, visit `http://localhost:3000/onboarding` (after dev login that resets onboarding state — `/api/dev/login-onboarding`). Expected: page shows new framing with `Learn 1 hour` static row, `Rest 30 min` dynamic row, slider snaps to 5-min steps from 5 to 60.

- [ ] **Step 5: Commit**

```bash
git add app/onboarding/page.tsx
git commit -m "refactor(onboarding-page): derive initialRestMinutes via rate * 60"
```

---

## Task 8: Update full-flow.spec.ts onboarding assertions

**Files:**
- Modify: `tests/full-flow.spec.ts:28-37`

The existing full-flow test reads `deal-learn-min` text "20 min" then drags to "30" expecting mood "focused". After PR 1, those testids and labels change.

- [ ] **Step 1: Replace the deal-page assertions**

Edit `tests/full-flow.spec.ts`. Find lines 28-37:

```ts
  // 2. Confirm we're at the rate-slider step.
  await page.goto('/onboarding');
  await expect(page.getByTestId('onboarding-page-deal')).toBeVisible();
  await expect(page.getByTestId('deal-learn-min')).toHaveText('20 min');
  await expect(page.getByTestId('deal-mood')).toHaveText('balanced');

  // 3. Drag slider to 30 min ⇒ "focused" mood.
  await page.getByTestId('deal-slider').fill('30');
  await expect(page.getByTestId('deal-learn-min')).toHaveText('30 min');
  await expect(page.getByTestId('deal-mood')).toHaveText('focused');
```

Replace with:

```ts
  // 2. Confirm we're at the rest-slider step.
  // Default for fresh user: rest=30 min (= rate 0.5 = 2:1 balanced).
  await page.goto('/onboarding');
  await expect(page.getByTestId('onboarding-page-deal')).toBeVisible();
  await expect(page.getByTestId('deal-rest-min')).toHaveText('30 min');
  await expect(page.getByTestId('deal-mood')).toHaveText('balanced');

  // 3. Drag slider to 15 min rest ⇒ "focused" mood (per moodLabel thresholds).
  await page.getByTestId('deal-slider').fill('15');
  await expect(page.getByTestId('deal-rest-min')).toHaveText('15 min');
  await expect(page.getByTestId('deal-mood')).toHaveText('focused');
```

- [ ] **Step 2: Run the full-flow test**

Run:
```bash
pnpm test tests/full-flow.spec.ts
```
Expected: 1 passed (the test now uses the new testids and labels).

- [ ] **Step 3: Commit**

```bash
git add tests/full-flow.spec.ts
git commit -m "test(full-flow): update onboarding assertions for rest-slider framing"
```

---

## Task 9: Apply migration 0012 to the remote Supabase project

**Files:** None (uses Supabase MCP).

The local DB has the migration after `pnpm supabase:reset`. The remote project (where the dev account points) needs the same migration applied so production heartbeat behavior is fixed.

- [ ] **Step 1: Verify the local migration content one more time**

Run:
```bash
cat supabase/migrations/0012_apply_rate_to_earn.sql
```
Expected: the file from Task 2, unchanged. (No edits should have happened to it after Task 2 step 4.)

- [ ] **Step 2: Apply via Supabase MCP**

Use the MCP tool `mcp__supabase__apply_migration` with:
- `name`: `apply_rate_to_earn`
- `query`: the entire contents of `supabase/migrations/0012_apply_rate_to_earn.sql`

Expected response: success (no error). If MCP returns an error like "function already exists with different signature", investigate — the existing remote RPC must have a matching parameter list to be replaceable.

- [ ] **Step 3: Verify the remote schema and function**

Use MCP `mcp__supabase__execute_sql` with:

```sql
select column_name, data_type, numeric_precision, numeric_scale
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'rate';
```

Expected: `data_type=numeric, numeric_precision=4, numeric_scale=3`.

Then:

```sql
select pg_get_functiondef('public.apply_heartbeat_delta(uuid, uuid, int, text, uuid, timestamptz)'::regprocedure);
```

Expected: function source contains the line `v_credit := round(p_delta * v_rate);`.

- [ ] **Step 4: Smoke-test against remote**

Run the earn-ratio test suite again — it uses whatever Supabase env vars are set in `.env.local`. If those point to the remote project, the test exercises remote behavior. Otherwise, do a manual check: open the app in a browser, dev-login-onboarding, complete a lesson for ~30s, observe whether jar balance increases by approximately `30 × rate` rather than 30.

```bash
pnpm test tests/earn-ratio.spec.ts
```
Expected: all 6 tests pass against whichever DB the env points at.

(No commit for this task — the migration file itself was committed in Task 2 step 4. This task is purely a deployment + verification step.)

---

## Task 10: Push branch + open PR #29

**Files:** None (git + gh).

- [ ] **Step 1: Verify branch state**

Run:
```bash
git log --oneline origin/main..HEAD
```
Expected: 8 commits (2 spec docs from prior + 7 from PR 1 tasks). Approximately:
```
<sha> test(full-flow): update onboarding assertions for rest-slider framing
<sha> refactor(onboarding-page): derive initialRestMinutes via rate * 60
<sha> feat(onboarding): flip deal card to Learn-1h fixed + Rest variable
<sha> refactor(onboarding): widen rate validator to [0.08, 1.0]
<sha> fix(heartbeat-route): return RPC-reported credited (rate-adjusted)
<sha> test(earn-ratio): cover all rate scenarios + feed unchanged + route response
<sha> fix(rate): apply profiles.rate to learn credits in heartbeat RPC
<sha> test(earn-ratio): failing assertion for rate=0.5 learn credit
<sha> docs(spec): reframe onboarding deal as Learn-1h + Rest-variable
<sha> docs(spec): multi-page polish redesign design
```

- [ ] **Step 2: Push the branch**

Run:
```bash
git push -u origin claude/polish-redesign
```
Expected: branch pushed; remote tracking set.

- [ ] **Step 3: Open the PR via gh**

Run:
```bash
gh pr create --title "Fix earn ratio bug + reframe onboarding deal" --body "$(cat <<'EOF'
## Summary
- Fixes the long-standing bug where `profiles.rate` was set at onboarding but never applied at heartbeat-credit time. Every user effectively had rate=1.0 (free 1:1 study↔scroll), regardless of their slider choice. `apply_heartbeat_delta` RPC now multiplies learn-session p_delta by `profiles.rate`. Feed debits are unchanged (rate is earn-only).
- Widens `profiles.rate` from `numeric(3,1)` to `numeric(4,3)` so 3-decimal rates round-trip cleanly through the slider.
- Reframes the onboarding "deal" card: `Learn 1 hour` is now the fixed anchor and the slider controls `Rest 5-60 min` (12 step-5 positions). Formula stored becomes `rate = restMin / 60` → range `[0.083, 1.0]`. Old range `[0.083, 0.5]` is a subset, so existing-user rate values stay valid (no backfill).
- Drops "guilty-free" from the headline.

## Test plan
- [ ] `pnpm test tests/earn-ratio.spec.ts` — 6 cases: 4 rate values on learn credit, 2 feed-debit regressions, 1 HTTP route round-trip
- [ ] `pnpm test tests/full-flow.spec.ts` — onboarding-step assertions updated to `deal-rest-min` and new mood labels
- [ ] Manual: log in via `/api/dev/login-onboarding`, drag onboarding slider, verify mood label changes per polarity (low rest = monk mode, high = playtime)
- [ ] Migration `0012_apply_rate_to_earn.sql` applied to remote via Supabase MCP; remote `profiles.rate` is `numeric(4,3)` and remote RPC source contains `v_credit := round(p_delta * v_rate)`

## Spec
`docs/superpowers/specs/2026-04-26-multi-page-polish-redesign-design.md` § 1 + § 1.1
EOF
)"
```
Expected: PR URL printed. Note the URL.

- [ ] **Step 4: Verify PR is mergeable**

Run:
```bash
gh pr view --json mergeable,mergeStateStatus,changedFiles,additions,deletions
```
Expected: `mergeable=MERGEABLE, changedFiles=7 (or 8 if spec counted), additions ~250, deletions ~30`.

---

## Definition of Done

- [ ] All 6 test cases in `tests/earn-ratio.spec.ts` pass locally against the local Supabase
- [ ] `tests/full-flow.spec.ts` passes locally (verifies the new onboarding UI)
- [ ] Migration 0012 applied to remote project; remote schema + RPC source confirmed via MCP
- [ ] PR opened and `mergeable=MERGEABLE`
- [ ] Manual eyeball check: onboarding shows new framing in browser

## Out of scope (deferred to PR 2 / PR 3)

- Profile page (`/profile`) — built in PR 2; will reuse the slider via a `<RestSlider>` extracted from `<PageDeal>`
- Stats hero on home page — PR 2
- Discover redesign / topic icons / English group names — PR 3
- Feed exhaustion modal — PR 3
- Relax page polish — PR 3

## Risks

- **Remote function drop+create** : `create or replace function` preserves the parameter signature. If a previous deploy somehow has a different signature, the replace fails. If MCP returns a signature mismatch in Task 9 step 2, drop the function explicitly first: `drop function public.apply_heartbeat_delta(uuid, uuid, int, text, uuid, timestamptz);` then re-apply.
- **Existing user with stored rate from old precision**: `numeric(3,1)` value `0.1` (was rate=0.083 collapsed) survives the `alter column type numeric(4,3)` as `0.100`. Heartbeat RPC will multiply by 0.100 instead of the original 0.083 — a 20% over-credit relative to the user's original onboarding intent. Acceptable: this only affects existing alpha users (one user at the moment), and they can re-pick the rate on the Profile page in PR 2 to restore precision.
- **Round() banker's rounding**: Postgres `round()` is round-half-away-from-zero, NOT banker's. Sub-second rounding error per heartbeat is bounded; cumulative drift over a 1-hour session is at most ~1 second. Acceptable.
