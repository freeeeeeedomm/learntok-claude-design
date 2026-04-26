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
});
