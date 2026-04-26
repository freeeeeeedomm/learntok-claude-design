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
