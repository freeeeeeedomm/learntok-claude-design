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
