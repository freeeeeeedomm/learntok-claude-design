import { test, expect } from '@playwright/test';
import { admin, anyPresetLessonId, devAuthedContext } from './helpers/session';

test('complete: preset lesson returns completedAt close to now', async () => {
  const { ctx, userId } = await devAuthedContext();
  const lessonId = await anyPresetLessonId();

  const before = Date.now();
  const res = await ctx.post('/api/lessons/complete', { data: { lessonId } });
  expect(res.status()).toBe(200);
  const { completedAt } = await res.json();
  const ts = Date.parse(completedAt);
  expect(Number.isFinite(ts)).toBe(true);
  expect(ts).toBeGreaterThanOrEqual(before - 1000);
  expect(ts).toBeLessThanOrEqual(Date.now() + 1000);

  // DB should reflect the upsert.
  const a = admin();
  const { data: row } = await a
    .from('lesson_progress')
    .select('completed_at')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .single();
  expect(row?.completed_at).toBe(completedAt);

  await ctx.dispose();
});

test('complete: repeat call is idempotent (upsert)', async () => {
  const { ctx } = await devAuthedContext();
  const lessonId = await anyPresetLessonId();

  const first = await ctx.post('/api/lessons/complete', { data: { lessonId } });
  expect(first.status()).toBe(200);
  const { completedAt: t1 } = await first.json();

  // Small wait so the second timestamp is usually strictly later, but assert >=.
  await new Promise((r) => setTimeout(r, 50));

  const second = await ctx.post('/api/lessons/complete', { data: { lessonId } });
  expect(second.status()).toBe(200);
  const { completedAt: t2 } = await second.json();
  expect(Date.parse(t2)).toBeGreaterThanOrEqual(Date.parse(t1));

  await ctx.dispose();
});

test('complete: bogus lessonId returns 403', async () => {
  const { ctx } = await devAuthedContext();
  const res = await ctx.post('/api/lessons/complete', {
    data: { lessonId: '00000000-0000-0000-0000-000000000000' },
  });
  expect(res.status()).toBe(403);
  await ctx.dispose();
});

test('complete: lesson in another user-owned course returns 403', async () => {
  const { ctx } = await devAuthedContext();
  const a = admin();
  const { data: other } = await a.auth.admin.createUser({
    email: `other-${Date.now()}@learntok.local`,
    password: 'p',
    email_confirm: true,
  });
  try {
    // Create a private course + lesson owned by the other user.
    const { data: course } = await a
      .from('courses')
      .insert({
        owner_id: other.user!.id,
        is_preset: false,
        title: 'foreign course',
      })
      .select('id')
      .single();
    const { data: lesson } = await a
      .from('lessons')
      .insert({
        course_id: course!.id,
        position: 1,
        title: 'foreign lesson',
        yt_id: 'dQw4w9WgXcQ',
        duration_seconds: 60,
      })
      .select('id')
      .single();

    const res = await ctx.post('/api/lessons/complete', {
      data: { lessonId: lesson!.id },
    });
    expect(res.status()).toBe(403);
  } finally {
    await a.auth.admin.deleteUser(other.user!.id);
    await ctx.dispose();
  }
});

test('complete: malformed body returns 400', async () => {
  const { ctx } = await devAuthedContext();
  const res = await ctx.post('/api/lessons/complete', { data: { lessonId: 'not-a-uuid' } });
  expect(res.status()).toBe(400);
  await ctx.dispose();
});
