import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

// Resolve a preset topic at runtime so this stays valid across seed regenerations.
// Picks "Physics" because it's stable across the preset catalog and has ≥2 courses.
async function resolvePhysics(): Promise<{ topicId: string; courseIds: string[] }> {
  const a = admin();
  const { data: topic } = await a
    .from('topics')
    .select('id')
    .eq('is_preset', true)
    .eq('title', 'Physics')
    .maybeSingle();
  expect(topic, 'seed must contain a "Physics" preset topic').toBeTruthy();
  const { data: courses } = await a
    .from('courses')
    .select('id')
    .eq('is_preset', true)
    .eq('topic_id', topic!.id)
    .order('position', { ascending: true })
    .limit(2);
  expect((courses ?? []).length, 'Physics must have ≥2 preset courses').toBeGreaterThanOrEqual(2);
  return { topicId: topic!.id, courseIds: (courses ?? []).map((c) => c.id) };
}

test('topic page: physics shows preset courses + click into /course/[id]', async ({
  page,
}) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  const { topicId, courseIds } = await resolvePhysics();
  const [firstCourseId, secondCourseId] = courseIds;

  await page.goto(`/topic/${topicId}`);

  await expect(page.getByTestId('topic-back')).toBeVisible();
  await expect(page.getByTestId('topic-jar-chip')).toBeVisible();

  // Both preset Physics courses are listed.
  await expect(page.getByTestId(`topic-course-${firstCourseId}`)).toBeVisible();
  await expect(page.getByTestId(`topic-course-${secondCourseId}`)).toBeVisible();

  // Click the first course → lands on /course/<id>.
  await page.getByTestId(`topic-course-${firstCourseId}`).click();
  await page.waitForURL(new RegExp(`/course/${firstCourseId}$`));
});

test('home: topic row click navigates to /topic/[id]', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  const { topicId } = await resolvePhysics();

  await page.goto('/home');

  const row = page.getByTestId(`home-topic-${topicId}`);
  await expect(row).toBeVisible();
  await row.click();
  await page.waitForURL(new RegExp(`/topic/${topicId}$`));
});

test('course back link returns to the parent topic page', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  const { topicId, courseIds } = await resolvePhysics();
  const [firstCourseId] = courseIds;

  await page.goto(`/course/${firstCourseId}`);
  await page.getByTestId('course-back').click();
  await page.waitForURL(new RegExp(`/topic/${topicId}$`));
});
