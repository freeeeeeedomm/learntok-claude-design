import { test, expect } from '@playwright/test';
import { admin, anyPresetLessonId, backdateHeartbeat, devAuthedContext } from './helpers/session';

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
  try {
    const lessonId = await anyPresetLessonId();
    const { data: foreign } = await a
      .from('sessions')
      .insert({ user_id: other.user!.id, kind: 'learn', lesson_id: lessonId })
      .select('id')
      .single();

    const res = await ctx.post('/api/sessions/end', { data: { sessionId: foreign!.id } });
    expect(res.status()).toBe(403);
  } finally {
    await a.auth.admin.deleteUser(other.user!.id);
    await ctx.dispose();
  }
});

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

test('scenario: learn start → 3× heartbeat → end sums to total', async () => {
  const { ctx, userId } = await devAuthedContext();
  const lessonId = await anyPresetLessonId();
  const { sessionId } = await (await ctx.post('/api/sessions/start', {
    data: { kind: 'learn', lessonId },
  })).json();

  // Three heartbeats, each backdated 15s so each credits 15.
  for (let i = 0; i < 3; i++) {
    await backdateHeartbeat(sessionId, 15);
    const hb = await ctx.post('/api/sessions/heartbeat', {
      data: { sessionId, playing: true },
    });
    expect((await hb.json()).credited).toBe(15);
  }

  const { data: entries } = await admin()
    .from('ledger_entries')
    .select('delta_seconds, label')
    .eq('user_id', userId)
    .neq('label', 'welcome_gift');
  expect(entries).toHaveLength(3);
  expect(entries!.every((e) => e.delta_seconds === 15 && e.label === 'lesson')).toBe(true);

  const end = await ctx.post('/api/sessions/end', { data: { sessionId } });
  const payload = await end.json();
  expect(payload.ok).toBe(true);
  expect(payload.earnedOrSpent).toBe(45);

  const { data: session } = await admin()
    .from('sessions')
    .select('ended_at')
    .eq('id', sessionId)
    .single();
  expect(session?.ended_at).not.toBeNull();

  await ctx.dispose();
});
