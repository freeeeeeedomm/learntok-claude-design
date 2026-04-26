import { test, expect } from '@playwright/test';
import { admin, anyPresetLessonId } from './helpers/session';

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
  // Mark onboarded so the row passes the heartbeat route's auth/onboarding gate.
  const { error } = await a.from('profiles').update({ rate, onboarded: true }).eq('id', userId);
  expect(error, `setting rate=${rate} must succeed`).toBeNull();
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

async function callRpcDirect(
  sessionId: string,
  userId: string,
  delta: number,
  label: string,
  refId: string,
) {
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
  return data as {
    new_earned_or_spent: number;
    ended: boolean;
    reason: string | null;
    credited?: number;
  };
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
    const lessonId = await anyPresetLessonId();
    const sessionId = await makeLearnSession(userId, lessonId);

    const balanceBefore = await readBalance(userId);
    await callRpcDirect(sessionId, userId, 60, 'lesson', lessonId);
    const balanceAfter = await readBalance(userId);

    expect(balanceAfter - balanceBefore, '60s × 0.5 should credit exactly 30s').toBe(30);
  });

  test('rate=1.0 → 60s learn delta credits 60s (1:1 playtime)', async ({ request }) => {
    const userId = await resetUserAndGetId(request);
    await setRate(userId, 1.0);
    const lessonId = await anyPresetLessonId();
    const sessionId = await makeLearnSession(userId, lessonId);

    const before = await readBalance(userId);
    await callRpcDirect(sessionId, userId, 60, 'lesson', lessonId);
    const after = await readBalance(userId);

    expect(after - before).toBe(60);
  });

  test('rate=0.167 → 60s learn delta credits 10s (6:1 focused)', async ({ request }) => {
    const userId = await resetUserAndGetId(request);
    await setRate(userId, 0.167);
    const lessonId = await anyPresetLessonId();
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
    const lessonId = await anyPresetLessonId();
    const sessionId = await makeLearnSession(userId, lessonId);

    const before = await readBalance(userId);
    await callRpcDirect(sessionId, userId, 60, 'lesson', lessonId);
    const after = await readBalance(userId);

    // round(60 * 0.083) = round(4.98) = 5
    expect(after - before).toBe(5);
  });
});

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

test.describe('POST /api/sessions/heartbeat — returns rate-adjusted credited', () => {
  test('rate=0.5 + 30s gap → response credited = 10 (clamped 20 × 0.5)', async ({ request }) => {
    // The route caps delta at MAX_CREDIT_PER_HEARTBEAT (20s). To exercise the
    // cap path, set last_heartbeat_at to 30s ago so gapSec=30, clamped to 20,
    // multiplied by rate=0.5 → credited=10.
    const userId = await resetUserAndGetId(request);
    await setRate(userId, 0.5);
    const lessonId = await anyPresetLessonId();

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
