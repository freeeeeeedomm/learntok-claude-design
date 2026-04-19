# Sessions lifecycle + player/idle hooks — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/api/sessions/{start,heartbeat,end}` server-trusted session primitives and `use-youtube-player` + `use-idle-detection` client hooks that Track C (lesson page) and Track H (feed page) will consume.

**Architecture:** Three Next.js App Router API routes write exclusively through `adminClient()` (service role) so RLS never blocks ledger inserts. Heartbeat computes a trusted `delta` from its own `last_heartbeat_at` timestamps, capped at `MAX_CREDIT_PER_HEARTBEAT = 20`. Two pure client hooks encapsulate the YT iframe postMessage protocol and a latched idle timer — the lesson page will gate heartbeat with `effectivePlaying = playing && !isIdle` so credit stays suspended until the user acknowledges the "still studying?" sheet.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, zod, Supabase JS v2 (`@supabase/supabase-js`, `@supabase/ssr`), Playwright for E2E tests.

---

## File layout

| File | Purpose | State |
|---|---|---|
| `app/api/dev/login/route.ts` | **Additive extension** — after provisioning dev user, sign them in via the ssr client so the response sets the auth cookie. Keeps the existing `{ email, password }` return value intact for any non-test callers. | modify |
| `app/api/sessions/start/route.ts` | POST handler — creates session, auto-closes orphans | new |
| `app/api/sessions/heartbeat/route.ts` | POST handler — trusted delta + feed debit + budget exhaustion | modify |
| `app/api/sessions/end/route.ts` | POST handler — idempotent session close | new |
| `hooks/use-youtube-player.ts` | Client hook — YT iframe postMessage bridge | new |
| `hooks/use-idle-detection.ts` | Client hook — latched idle timer | new |
| `playwright.config.ts` | E2E test config with webServer | new |
| `tests/helpers/session.ts` | Authed request context + seed lookup + backdate helpers | new |
| `tests/sessions.spec.ts` | Four E2E scenarios + supporting cases | new |

**Files explicitly NOT touched:** `middleware.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `tailwind.config.ts`, anything under `app/onboarding/*` or `components/onboarding/*` (reserved for the other worktree).

---

## Prerequisites for running tests

Tests require the full local stack to be up before `pnpm test`:

```bash
# Terminal 1 — Supabase local stack (Docker required)
supabase start

# Terminal 2 — run migrations and seed
pnpm supabase:reset

# .env.local must contain (pnpm supabase:reset prints the keys)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_DEV_PANEL=true   # enables /api/dev/login used by tests
```

Playwright's `webServer` config will boot `pnpm dev` automatically; Supabase must be running beforehand.

---

## Task 1: Extend `/api/dev/login` to set auth cookie via ssr client

**Rationale:** the existing route provisions the dev user and returns creds, but does NOT sign them in from the server side. For tests we need the response to carry the `@supabase/ssr` auth cookie so subsequent requests in the same Playwright context are authenticated. The extension is additive — existing callers still receive `{ email, password }`.

**Files:**
- Modify: `app/api/dev/login/route.ts`

- [ ] **Step 1: Patch the route**

Edit `app/api/dev/login/route.ts`. After the existing "Wipe ledger and re-insert the welcome gift" block and before the final `return NextResponse.json({ email: DEV_EMAIL, password: DEV_PASSWORD });`, insert:

```ts
  // Sign the dev user in server-side so the response sets the @supabase/ssr
  // auth cookie. Used by Playwright E2E tests; no-op for any caller that
  // ignores Set-Cookie headers.
  const { createServerClient } = await import('@supabase/ssr');
  const { cookies } = await import('next/headers');
  const cookieStore = cookies();
  const ssr = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => cookieStore.get(n)?.value,
        set: (n: string, v: string, o: any) => {
          try { cookieStore.set({ name: n, value: v, ...o }); } catch {}
        },
        remove: (n: string, o: any) => {
          try { cookieStore.set({ name: n, value: '', ...o }); } catch {}
        },
      },
    }
  );
  const { error: signInError } = await ssr.auth.signInWithPassword({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
  });
  if (signInError) {
    return NextResponse.json({ error: signInError.message }, { status: 500 });
  }
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke test the route manually**

With `supabase start` + `pnpm dev` + `NEXT_PUBLIC_DEV_PANEL=true` running:

```bash
curl -i -X POST http://localhost:3000/api/dev/login
```

Expected: `200`, body `{ "email": "dev@learntok.local", "password": "..." }`, and `Set-Cookie: sb-<ref>-auth-token=...` in headers.

- [ ] **Step 4: Commit**

```bash
git add app/api/dev/login/route.ts
git commit -m "chore(dev): /api/dev/login also signs user in so Set-Cookie works for tests"
```

---

## Task 2: Playwright config + shared test helpers

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/helpers/session.ts`

- [ ] **Step 1: Create `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,         // tests share the dev user; serialize to avoid races
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    extraHTTPHeaders: { 'content-type': 'application/json' },
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

- [ ] **Step 2: Create `tests/helpers/session.ts`**

```ts
import { APIRequestContext, expect, request as pwRequest } from '@playwright/test';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const admin = () =>
  createAdminClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

/**
 * Returns an APIRequestContext that is already authenticated as the dev user,
 * plus that user's id. A single POST to /api/dev/login both provisions the
 * user (resetting their ledger back to the 300s welcome gift) and sets the
 * Supabase auth cookie on the response; Playwright's request context then
 * persists that cookie across subsequent calls automatically.
 */
export async function devAuthedContext(): Promise<{
  ctx: APIRequestContext;
  userId: string;
}> {
  const ctx = await pwRequest.newContext({
    baseURL: 'http://localhost:3000',
    extraHTTPHeaders: { 'content-type': 'application/json' },
  });
  const res = await ctx.post('/api/dev/login');
  expect(res.ok(), 'dev login route must succeed').toBeTruthy();
  const { email } = await res.json();

  const a = admin();
  const { data } = await a.auth.admin.listUsers();
  const userId = data.users.find((u) => u.email === email)!.id;

  return { ctx, userId };
}

/** Pick the first preset lesson — deterministic across test runs via seed. */
export async function anyPresetLessonId(): Promise<string> {
  const a = admin();
  const { data } = await a
    .from('lessons')
    .select('id, courses!inner(is_preset)')
    .eq('courses.is_preset', true)
    .limit(1)
    .single();
  expect(data?.id, 'seed must contain at least one preset lesson').toBeTruthy();
  return data!.id as string;
}

/** Directly backdate a session's last_heartbeat_at for gap-based tests. */
export async function backdateHeartbeat(sessionId: string, secondsAgo: number) {
  const a = admin();
  const when = new Date(Date.now() - secondsAgo * 1000).toISOString();
  await a.from('sessions').update({ last_heartbeat_at: when }).eq('id', sessionId);
}
```

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts tests/helpers/session.ts
git commit -m "test: add Playwright config + cookie-carrying dev-auth helper"
```

---

## Task 3: `/api/sessions/start` — learn path

**Files:**
- Create: `tests/sessions.spec.ts`
- Create: `app/api/sessions/start/route.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/sessions.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { admin, anyPresetLessonId, devAuthedContext } from './helpers/session';

test('start learn session: inserts sessions row and returns sessionId', async () => {
  const { ctx, userId } = await devAuthedContext();
  const lessonId = await anyPresetLessonId();

  const res = await ctx.post('/api/sessions/start', {
    data: { kind: 'learn', lessonId },
  });
  expect(res.status()).toBe(200);
  const { sessionId } = await res.json();
  expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);

  const { data: session } = await admin()
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  expect(session?.user_id).toBe(userId);
  expect(session?.kind).toBe('learn');
  expect(session?.lesson_id).toBe(lessonId);
  expect(session?.ended_at).toBeNull();
  expect(session?.earned_or_spent_seconds).toBe(0);

  await ctx.dispose();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/sessions.spec.ts
```

Expected: FAIL with 404 from `/api/sessions/start` (route does not exist).

- [ ] **Step 3: Implement the route**

Create `app/api/sessions/start/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, adminClient } from '@/lib/supabase/server';

const Body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('learn'), lessonId: z.string().uuid() }),
  z.object({ kind: z.literal('feed'), budgetSeconds: z.number().int().positive() }),
]);

export async function POST(req: Request) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad' }, { status: 400 });
  const body = parsed.data;

  const admin = adminClient();

  if (body.kind === 'learn') {
    // Verify the lesson is visible to this user (owned course OR preset).
    const { data: lesson } = await admin
      .from('lessons')
      .select('id, courses!inner(owner_id, is_preset)')
      .eq('id', body.lessonId)
      .single();
    const course = (lesson as any)?.courses;
    const visible = !!lesson && (course?.is_preset === true || course?.owner_id === user.id);
    if (!visible) return NextResponse.json({ error: 'lesson_not_visible' }, { status: 403 });
  }

  // Auto-close any open sessions for this user so at most one is active.
  await admin
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('ended_at', null);

  const insertRow = {
    user_id: user.id,
    kind: body.kind,
    lesson_id: body.kind === 'learn' ? body.lessonId : null,
    budget_seconds: body.kind === 'feed' ? body.budgetSeconds : null,
  };
  const { data: created, error } = await admin
    .from('sessions')
    .insert(insertRow)
    .select('id')
    .single();
  if (error || !created) {
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ sessionId: created.id });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/sessions.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/sessions.spec.ts app/api/sessions/start/route.ts
git commit -m "feat(api): POST /api/sessions/start — learn path with preset visibility check"
```

---

## Task 4: `/api/sessions/start` — feed path + orphan cleanup

**Files:**
- Modify: `tests/sessions.spec.ts` (append tests)

Route already handles feed + orphan cleanup — these tests lock in that behavior.

- [ ] **Step 1: Add feed-path test**

Append to `tests/sessions.spec.ts`:

```ts
test('start feed session: stores budget_seconds, no ledger side-effects', async () => {
  const { ctx, userId } = await devAuthedContext();

  const res = await ctx.post('/api/sessions/start', {
    data: { kind: 'feed', budgetSeconds: 120 },
  });
  expect(res.status()).toBe(200);
  const { sessionId } = await res.json();

  const { data: session } = await admin()
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  expect(session?.kind).toBe('feed');
  expect(session?.budget_seconds).toBe(120);
  expect(session?.lesson_id).toBeNull();

  // Welcome gift is the only ledger entry after dev-login reset.
  const { data: entries } = await admin()
    .from('ledger_entries')
    .select('label')
    .eq('user_id', userId);
  expect(entries?.map((e) => e.label).sort()).toEqual(['welcome_gift']);

  await ctx.dispose();
});

test('start: closes any prior open session for the same user', async () => {
  const { ctx } = await devAuthedContext();
  const lessonId = await anyPresetLessonId();

  const first = await ctx.post('/api/sessions/start', { data: { kind: 'learn', lessonId } });
  const firstId = (await first.json()).sessionId;

  const second = await ctx.post('/api/sessions/start', { data: { kind: 'feed', budgetSeconds: 60 } });
  const secondId = (await second.json()).sessionId;
  expect(secondId).not.toBe(firstId);

  const { data: prior } = await admin()
    .from('sessions')
    .select('ended_at')
    .eq('id', firstId)
    .single();
  expect(prior?.ended_at).not.toBeNull();

  await ctx.dispose();
});
```

- [ ] **Step 2: Add invalid-body test**

Append:

```ts
test('start: rejects bad body with 400', async () => {
  const { ctx } = await devAuthedContext();
  const res = await ctx.post('/api/sessions/start', { data: { kind: 'learn' } }); // missing lessonId
  expect(res.status()).toBe(400);
  await ctx.dispose();
});

test('start: rejects feed with zero budget', async () => {
  const { ctx } = await devAuthedContext();
  const res = await ctx.post('/api/sessions/start', { data: { kind: 'feed', budgetSeconds: 0 } });
  expect(res.status()).toBe(400);
  await ctx.dispose();
});
```

- [ ] **Step 3: Run to verify all pass**

```bash
pnpm test tests/sessions.spec.ts
```

Expected: PASS (4 tests total).

- [ ] **Step 4: Commit**

```bash
git add tests/sessions.spec.ts
git commit -m "test: cover feed-path start + orphan cleanup + bad-body cases"
```

---

## Task 5: `/api/sessions/end` — idempotent close

**Files:**
- Create: `app/api/sessions/end/route.ts`
- Modify: `tests/sessions.spec.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/sessions.spec.ts`:

```ts
test('end: closes an open session and returns earnedOrSpent', async () => {
  const { ctx } = await devAuthedContext();
  const lessonId = await anyPresetLessonId();

  const start = await ctx.post('/api/sessions/start', { data: { kind: 'learn', lessonId } });
  const { sessionId } = await start.json();

  const end = await ctx.post('/api/sessions/end', { data: { sessionId } });
  expect(end.status()).toBe(200);
  const payload = await end.json();
  expect(payload.ok).toBe(true);
  expect(payload.earnedOrSpent).toBe(0);

  const { data: session } = await admin()
    .from('sessions')
    .select('ended_at')
    .eq('id', sessionId)
    .single();
  expect(session?.ended_at).not.toBeNull();

  await ctx.dispose();
});

test('end: is idempotent — second call returns same row without error', async () => {
  const { ctx } = await devAuthedContext();
  const lessonId = await anyPresetLessonId();
  const { sessionId } = await (await ctx.post('/api/sessions/start', {
    data: { kind: 'learn', lessonId },
  })).json();

  const first = await ctx.post('/api/sessions/end', { data: { sessionId } });
  const firstEndedAt = (await admin().from('sessions').select('ended_at').eq('id', sessionId).single()).data?.ended_at;

  const second = await ctx.post('/api/sessions/end', { data: { sessionId } });
  expect(second.status()).toBe(200);

  const { data: after } = await admin().from('sessions').select('ended_at').eq('id', sessionId).single();
  expect(after?.ended_at).toBe(firstEndedAt); // second call must NOT overwrite

  await ctx.dispose();
});

test('end: rejects other users\' sessions with 403', async () => {
  const { ctx } = await devAuthedContext();
  // Insert a session owned by a fake other user via service role.
  const a = admin();
  const { data: other } = await a.auth.admin.createUser({
    email: `other-${Date.now()}@learntok.local`,
    password: 'p',
    email_confirm: true,
  });
  const lessonId = await anyPresetLessonId();
  const { data: foreign } = await a
    .from('sessions')
    .insert({ user_id: other.user!.id, kind: 'learn', lesson_id: lessonId })
    .select('id')
    .single();

  const res = await ctx.post('/api/sessions/end', { data: { sessionId: foreign!.id } });
  expect(res.status()).toBe(403);

  // Cleanup
  await a.auth.admin.deleteUser(other.user!.id);
  await ctx.dispose();
});
```

- [ ] **Step 2: Run — confirm FAIL (route missing)**

```bash
pnpm test tests/sessions.spec.ts -g 'end:'
```

Expected: FAIL with 404.

- [ ] **Step 3: Implement the route**

Create `app/api/sessions/end/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, adminClient } from '@/lib/supabase/server';

const Body = z.object({ sessionId: z.string().uuid() });

export async function POST(req: Request) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad' }, { status: 400 });

  const admin = adminClient();
  const { data: session } = await admin
    .from('sessions')
    .select('user_id, ended_at, earned_or_spent_seconds')
    .eq('id', parsed.data.sessionId)
    .single();
  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (session.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (session.ended_at) {
    return NextResponse.json({ ok: true, earnedOrSpent: session.earned_or_spent_seconds });
  }

  const { data: updated } = await admin
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', parsed.data.sessionId)
    .select('earned_or_spent_seconds')
    .single();

  return NextResponse.json({ ok: true, earnedOrSpent: updated?.earned_or_spent_seconds ?? 0 });
}
```

- [ ] **Step 4: Run — confirm PASS**

```bash
pnpm test tests/sessions.spec.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/sessions/end/route.ts tests/sessions.spec.ts
git commit -m "feat(api): POST /api/sessions/end — idempotent session close"
```

---

## Task 6: `/api/sessions/heartbeat` — drop gap check, keep clamp

**Files:**
- Modify: `app/api/sessions/heartbeat/route.ts`
- Modify: `tests/sessions.spec.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/sessions.spec.ts`:

```ts
import { backdateHeartbeat } from './helpers/session';

test('heartbeat learn (playing=true): credits min(gap, 20) and writes ledger', async () => {
  const { ctx, userId } = await devAuthedContext();
  const lessonId = await anyPresetLessonId();
  const { sessionId } = await (await ctx.post('/api/sessions/start', {
    data: { kind: 'learn', lessonId },
  })).json();

  // Backdate so gap is well within clamp.
  await backdateHeartbeat(sessionId, 15);

  const hb = await ctx.post('/api/sessions/heartbeat', {
    data: { sessionId, playing: true },
  });
  expect(hb.status()).toBe(200);
  const body = await hb.json();
  expect(body.credited).toBe(15);
  expect(body.ended).toBeUndefined();

  const { data: entries } = await admin()
    .from('ledger_entries')
    .select('delta_seconds, label, ref_id')
    .eq('user_id', userId)
    .neq('label', 'welcome_gift');
  expect(entries).toHaveLength(1);
  expect(entries![0].delta_seconds).toBe(15);
  expect(entries![0].label).toBe('lesson');
  expect(entries![0].ref_id).toBe(lessonId);

  await ctx.dispose();
});

test('heartbeat learn (playing=true, huge gap): credited capped at 20', async () => {
  const { ctx, userId } = await devAuthedContext();
  const lessonId = await anyPresetLessonId();
  const { sessionId } = await (await ctx.post('/api/sessions/start', {
    data: { kind: 'learn', lessonId },
  })).json();

  // 90s gap — with the gapSec<=60 rule gone, we still credit but capped at 20.
  await backdateHeartbeat(sessionId, 90);
  const hb = await ctx.post('/api/sessions/heartbeat', {
    data: { sessionId, playing: true },
  });
  const { credited } = await hb.json();
  expect(credited).toBe(20);

  const { data: entries } = await admin()
    .from('ledger_entries')
    .select('delta_seconds')
    .eq('user_id', userId)
    .neq('label', 'welcome_gift');
  expect(entries).toHaveLength(1);
  expect(entries![0].delta_seconds).toBe(20);

  await ctx.dispose();
});

test('heartbeat (playing=false): no credit, no ledger entry, timestamp updates', async () => {
  const { ctx, userId } = await devAuthedContext();
  const lessonId = await anyPresetLessonId();
  const { sessionId } = await (await ctx.post('/api/sessions/start', {
    data: { kind: 'learn', lessonId },
  })).json();

  await backdateHeartbeat(sessionId, 30);
  const hb = await ctx.post('/api/sessions/heartbeat', {
    data: { sessionId, playing: false },
  });
  expect((await hb.json()).credited).toBe(0);

  const { data: entries } = await admin()
    .from('ledger_entries')
    .select('id')
    .eq('user_id', userId)
    .neq('label', 'welcome_gift');
  expect(entries).toHaveLength(0);

  // last_heartbeat_at was refreshed (now very recent).
  const { data: session } = await admin()
    .from('sessions')
    .select('last_heartbeat_at')
    .eq('id', sessionId)
    .single();
  const ageMs = Date.now() - new Date(session!.last_heartbeat_at).getTime();
  expect(ageMs).toBeLessThan(5000);

  await ctx.dispose();
});
```

- [ ] **Step 2: Run — 90s-gap test should FAIL (current code refuses gap>60)**

```bash
pnpm test tests/sessions.spec.ts -g 'huge gap'
```

Expected: FAIL — `credited` is 0 under the current `gapSec <= 60` rule.

- [ ] **Step 3: Remove the gap refusal from heartbeat**

Edit `app/api/sessions/heartbeat/route.ts`. Replace the block:

```ts
  const lastBeat = new Date(session.last_heartbeat_at).getTime();
  const now = Date.now();
  const gapSec = Math.max(0, Math.floor((now - lastBeat) / 1000));

  // If gap too large, treat as idle and don't credit
  const creditable = body.data.playing && gapSec <= 60;
  const delta = creditable ? Math.min(gapSec, MAX_CREDIT_PER_HEARTBEAT) : 0;
```

with:

```ts
  const lastBeat = new Date(session.last_heartbeat_at).getTime();
  const now = Date.now();
  const gapSec = Math.max(0, Math.floor((now - lastBeat) / 1000));

  // Anti-cheat is the per-heartbeat cap; idle detection lives on the client.
  const delta = body.data.playing ? Math.min(gapSec, MAX_CREDIT_PER_HEARTBEAT) : 0;
```

- [ ] **Step 4: Run — all three new tests PASS**

```bash
pnpm test tests/sessions.spec.ts -g 'heartbeat'
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/sessions/heartbeat/route.ts tests/sessions.spec.ts
git commit -m "refactor(api): drop gapSec<=60 refusal; 20s cap is the anti-cheat layer"
```

---

## Task 7: `/api/sessions/heartbeat` — feed branch with budget exhaustion

**Files:**
- Modify: `app/api/sessions/heartbeat/route.ts`
- Modify: `tests/sessions.spec.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/sessions.spec.ts`:

```ts
test('heartbeat feed: writes negative ledger entry, updates earned_or_spent', async () => {
  const { ctx, userId } = await devAuthedContext();
  const { sessionId } = await (await ctx.post('/api/sessions/start', {
    data: { kind: 'feed', budgetSeconds: 300 },
  })).json();

  await backdateHeartbeat(sessionId, 15);
  const hb = await ctx.post('/api/sessions/heartbeat', {
    data: { sessionId, playing: true },
  });
  const body = await hb.json();
  expect(body.credited).toBe(-15);
  expect(body.ended).toBeUndefined();

  const { data: entries } = await admin()
    .from('ledger_entries')
    .select('delta_seconds, label, ref_id')
    .eq('user_id', userId)
    .neq('label', 'welcome_gift');
  expect(entries).toHaveLength(1);
  expect(entries![0].delta_seconds).toBe(-15);
  expect(entries![0].label).toBe('feed');
  expect(entries![0].ref_id).toBe(sessionId);

  const { data: session } = await admin()
    .from('sessions')
    .select('earned_or_spent_seconds')
    .eq('id', sessionId)
    .single();
  expect(session?.earned_or_spent_seconds).toBe(-15);

  await ctx.dispose();
});

test('heartbeat feed: one overdraft allowed, then force-close', async () => {
  const { ctx } = await devAuthedContext();
  const { sessionId } = await (await ctx.post('/api/sessions/start', {
    data: { kind: 'feed', budgetSeconds: 30 },
  })).json();

  // Heartbeat 1: backdate 15s, spent = 15. Within budget.
  await backdateHeartbeat(sessionId, 15);
  let body = await (await ctx.post('/api/sessions/heartbeat', {
    data: { sessionId, playing: true },
  })).json();
  expect(body.credited).toBe(-15);
  expect(body.ended).toBeUndefined();

  // Heartbeat 2: backdate 15s, spent = 30. Exactly at budget, NOT over → still open.
  await backdateHeartbeat(sessionId, 15);
  body = await (await ctx.post('/api/sessions/heartbeat', {
    data: { sessionId, playing: true },
  })).json();
  expect(body.credited).toBe(-15);
  expect(body.ended).toBeUndefined();

  // Heartbeat 3: backdate 15s, spent = 45. Over budget → this heartbeat IS
  // the one-shot overdraft; session closes after it.
  await backdateHeartbeat(sessionId, 15);
  body = await (await ctx.post('/api/sessions/heartbeat', {
    data: { sessionId, playing: true },
  })).json();
  expect(body.credited).toBe(-15);
  expect(body.ended).toBe(true);
  expect(body.reason).toBe('budget_exhausted');

  const { data: session } = await admin()
    .from('sessions')
    .select('ended_at, earned_or_spent_seconds')
    .eq('id', sessionId)
    .single();
  expect(session?.ended_at).not.toBeNull();
  expect(session?.earned_or_spent_seconds).toBe(-45);

  // Subsequent heartbeats on a closed session return 400 session_closed.
  const stale = await ctx.post('/api/sessions/heartbeat', {
    data: { sessionId, playing: true },
  });
  expect(stale.status()).toBe(400);

  await ctx.dispose();
});
```

- [ ] **Step 2: Run — confirm FAIL**

```bash
pnpm test tests/sessions.spec.ts -g 'feed'
```

Expected: FAIL — current heartbeat doesn't write ledger entries for feed (the else-branch just updates the timestamp).

- [ ] **Step 3: Rewrite the heartbeat handler**

Replace the full body of `app/api/sessions/heartbeat/route.ts` with:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, adminClient } from '@/lib/supabase/server';

// Client sends a heartbeat every ~15s while in a lesson or feed.
// Server computes a trusted delta and inserts a ledger entry.

const Body = z.object({
  sessionId: z.string().uuid(),
  playing: z.boolean(),
});

const MAX_CREDIT_PER_HEARTBEAT = 20; // seconds — caps accidental over-crediting

export async function POST(req: Request) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad' }, { status: 400 });
  const body = parsed.data;

  const admin = adminClient();
  const { data: session } = await admin.from('sessions').select('*').eq('id', body.sessionId).single();
  if (!session || session.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (session.ended_at) {
    return NextResponse.json({ error: 'session_closed' }, { status: 400 });
  }

  const lastBeat = new Date(session.last_heartbeat_at).getTime();
  const nowMs = Date.now();
  const gapSec = Math.max(0, Math.floor((nowMs - lastBeat) / 1000));

  // Anti-cheat is the per-heartbeat cap; idle detection lives on the client.
  const delta = body.playing ? Math.min(gapSec, MAX_CREDIT_PER_HEARTBEAT) : 0;
  const nowIso = new Date(nowMs).toISOString();

  let credited = 0;
  let ended = false;
  let reason: 'budget_exhausted' | undefined;

  if (delta > 0 && session.kind === 'learn') {
    credited = delta;
    await admin.from('ledger_entries').insert({
      user_id: user.id,
      delta_seconds: delta,
      label: 'lesson',
      ref_id: session.lesson_id,
    });
    await admin.from('sessions').update({
      last_heartbeat_at: nowIso,
      earned_or_spent_seconds: session.earned_or_spent_seconds + delta,
    }).eq('id', session.id);
  } else if (delta > 0 && session.kind === 'feed') {
    credited = -delta;
    await admin.from('ledger_entries').insert({
      user_id: user.id,
      delta_seconds: -delta,
      label: 'feed',
      ref_id: session.id,
    });
    const newEarnedOrSpent = session.earned_or_spent_seconds - delta;
    const spent = -newEarnedOrSpent;
    const budget = session.budget_seconds ?? 0;

    if (spent > budget) {
      // One heartbeat of overdraft consumed → force-close.
      await admin.from('sessions').update({
        last_heartbeat_at: nowIso,
        earned_or_spent_seconds: newEarnedOrSpent,
        ended_at: nowIso,
      }).eq('id', session.id);
      ended = true;
      reason = 'budget_exhausted';
    } else {
      await admin.from('sessions').update({
        last_heartbeat_at: nowIso,
        earned_or_spent_seconds: newEarnedOrSpent,
      }).eq('id', session.id);
    }
  } else {
    await admin.from('sessions').update({ last_heartbeat_at: nowIso }).eq('id', session.id);
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('jar_balance_cached')
    .eq('id', user.id)
    .single();

  const res: { balance: number; credited: number; ended?: true; reason?: string } = {
    balance: profile?.jar_balance_cached ?? 0,
    credited,
  };
  if (ended) { res.ended = true; res.reason = reason; }
  return NextResponse.json(res);
}
```

- [ ] **Step 4: Run — full test suite PASS**

```bash
pnpm test tests/sessions.spec.ts
```

Expected: PASS (all scenarios).

- [ ] **Step 5: Commit**

```bash
git add app/api/sessions/heartbeat/route.ts tests/sessions.spec.ts
git commit -m "feat(api): heartbeat feed branch with one-shot overdraft + force-close"
```

---

## Task 8: `use-youtube-player` hook

**Files:**
- Create: `hooks/use-youtube-player.ts`

No tests per spec — pure React primitive, will be exercised when Track C wires the lesson page.

- [ ] **Step 1: Implement the hook**

Create `hooks/use-youtube-player.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type UseYouTubePlayerReturn = {
  playing: boolean;
  ended: boolean;
  iframeProps: {
    ref: React.RefObject<HTMLIFrameElement>;
    onLoad: () => void;
  };
};

/**
 * Bridge to the YouTube iframe postMessage API (no external SDK).
 * Consumer renders <iframe src={`https://www.youtube.com/embed/${ytId}?enablejsapi=1`} {...iframeProps} />.
 *
 * playing  — playerState === 1
 * ended    — playerState === 0 (latched; does not flip back)
 */
export function useYouTubePlayer(): UseYouTubePlayerReturn {
  const ref = useRef<HTMLIFrameElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);

  const onLoad = useCallback(() => {
    try {
      ref.current?.contentWindow?.postMessage(
        '{"event":"listening","id":1}',
        '*'
      );
    } catch {
      // iframe unmounted between load and handshake — safe to ignore
    }
  }, []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (typeof e.data !== 'string') return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(e.data);
      } catch {
        return;
      }
      const d = parsed as { event?: string; info?: { playerState?: number } };
      if (d.event !== 'infoDelivery' || d.info?.playerState === undefined) return;
      const state = d.info.playerState;
      setPlaying(state === 1);
      if (state === 0) setEnded(true);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return {
    playing,
    ended,
    iframeProps: { ref, onLoad },
  };
}
```

- [ ] **Step 2: Verify it typechecks**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/use-youtube-player.ts
git commit -m "feat(hooks): useYouTubePlayer — YT iframe postMessage bridge"
```

---

## Task 9: `use-idle-detection` hook

**Files:**
- Create: `hooks/use-idle-detection.ts`

- [ ] **Step 1: Implement the hook**

Create `hooks/use-idle-detection.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type UseIdleDetectionOpts = {
  active: boolean;
  timeoutSec?: number;
};

export type UseIdleDetectionReturn = {
  idleFor: number;
  isIdle: boolean;
  acknowledge: () => void;
};

/**
 * Ticks `idleFor` (seconds) while `active` is true. Once idleFor reaches
 * timeoutSec, `isIdle` latches to true and stays there until `acknowledge()`
 * is called — even if `active` flips to false in the meantime. This is what
 * forces the lesson page to gate heartbeat credit until the user confirms
 * the "still studying?" sheet.
 *
 * Natural transition active: true -> false resets idleFor (back to 0) but
 * does NOT clear the latched isIdle.
 */
export function useIdleDetection({
  active,
  timeoutSec = 300,
}: UseIdleDetectionOpts): UseIdleDetectionReturn {
  const [idleFor, setIdleFor] = useState(0);
  const [isIdle, setIsIdle] = useState(false);
  const prevActive = useRef(active);

  // Reset counter on active transition true -> false (but leave isIdle latched).
  useEffect(() => {
    if (prevActive.current && !active) {
      setIdleFor(0);
    }
    prevActive.current = active;
  }, [active]);

  // Tick while active.
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setIdleFor((prev) => {
        const next = prev + 1;
        if (next >= timeoutSec) setIsIdle(true);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [active, timeoutSec]);

  const acknowledge = useCallback(() => {
    setIdleFor(0);
    setIsIdle(false);
  }, []);

  return { idleFor, isIdle, acknowledge };
}
```

- [ ] **Step 2: Verify it typechecks**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/use-idle-detection.ts
git commit -m "feat(hooks): useIdleDetection — latched idle counter with acknowledge()"
```

---

## Final verification

- [ ] **Run full test suite one more time**

```bash
pnpm test
```

Expected: all sessions tests PASS.

- [ ] **Typecheck and lint clean**

```bash
npx tsc --noEmit
pnpm lint
```

Expected: no errors. Lint warnings about unused imports from the other worktree's WIP onboarding code are acceptable — do NOT fix those (out of scope).

- [ ] **Final summary commit check**

```bash
git log --oneline lesson-track ^origin/lesson-track
```

Should list ~9 commits in this series plus the earlier spec commits.

---

## Spec coverage check (self-review)

| Spec requirement | Task |
|---|---|
| Authenticated test infrastructure | Task 1 + Task 2 |
| `POST /api/sessions/start` (learn path + preset visibility) | Task 3 |
| `POST /api/sessions/start` (feed path) | Task 4 |
| `POST /api/sessions/start` (orphan cleanup) | Task 4 |
| `POST /api/sessions/start` (zod validation / 400) | Task 4 |
| `POST /api/sessions/heartbeat` (learn branch intact) | Task 6 (regression) |
| `POST /api/sessions/heartbeat` (no gapSec refusal) | Task 6 |
| `POST /api/sessions/heartbeat` (MAX_CREDIT=20 cap) | Task 6 |
| `POST /api/sessions/heartbeat` (feed debit → negative ledger) | Task 7 |
| `POST /api/sessions/heartbeat` (budget exhaustion → force close) | Task 7 |
| `POST /api/sessions/end` (idempotent close) | Task 5 |
| `hooks/use-youtube-player.ts` (playing + ended latch) | Task 8 |
| `hooks/use-idle-detection.ts` (latched isIdle + acknowledge) | Task 9 |
| Playwright E2E suite (4 scenarios + extras) | Tasks 3–7 |
| No changes to `middleware.ts`, `lib/supabase/*`, `tailwind.config.ts` | observed throughout |
| No changes to `app/onboarding/*` or `components/onboarding/*` | observed throughout |
