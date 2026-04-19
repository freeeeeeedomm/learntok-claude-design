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
