import { test, expect } from '@playwright/test';
import { admin, anyPresetLessonId } from './helpers/session';

test('home + topic smoke: login → home → click a topic → see courses', async ({
  page,
}) => {
  // 1. Auth via dev login; this now sets onboarded=true so /home renders directly.
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  // 2. Visit /home — jar chip + at least one topic row should be there.
  await page.goto('/home');
  await expect(page.getByTestId('home-jar-chip')).toBeVisible();

  // 3. Find any topic row; the dev seed guarantees 5 preset topics.
  const firstTopicRow = page.locator('[data-testid^="home-topic-"]').first();
  await expect(firstTopicRow).toBeVisible();

  // Extract the topic id from the testid.
  const testidValue = await firstTopicRow.getAttribute('data-testid');
  const topicId = testidValue?.replace('home-topic-', '');
  expect(topicId).toBeTruthy();

  // 4. Click the topic, land on /topic/<id>, see course rows.
  await firstTopicRow.click();
  await page.waitForURL(new RegExp(`/topic/${topicId}`), { timeout: 5000 });
  await expect(page.getByTestId('topic-jar-chip')).toBeVisible();

  // Each preset topic ships with 2 courses.
  const firstCourseRow = page.locator('[data-testid^="topic-course-"]').first();
  await expect(firstCourseRow).toBeVisible();

  // 5. Click through to /course/<id> and verify a lesson row renders.
  await firstCourseRow.click();
  await page.waitForURL(/\/course\/[0-9a-f-]{36}/, { timeout: 5000 });
  await expect(page.getByTestId('course-jar-chip')).toBeVisible();
  // PR-D renamed the per-row testid prefix from `course-lesson-` to
  // `course-lecture-` when the inline list moved into CourseLectureSection.
  const firstLessonRow = page.locator('[data-testid^="course-lecture-"]').first();
  await expect(firstLessonRow).toBeVisible();
});

test('home: continue card links to a valid lesson when there is progress left', async ({
  page,
}) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  // Dev login wipes progress, so every preset topic/course has undone lessons
  // → a continue card should render.
  await page.goto('/home');
  const continueCard = page.getByTestId('home-continue-card');
  await expect(continueCard).toBeVisible({ timeout: 5000 });

  // The card's href should point at a real lesson id.
  const href = await continueCard.getAttribute('href');
  expect(href).toMatch(/^\/lesson\/[0-9a-f-]{36}$/);
});

test('course page: bogus id redirects to /home', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/course/00000000-0000-0000-0000-000000000000');
  await page.waitForURL('**/home', { timeout: 5000 });
});

test('e2e learn loop: home → topic → course → lesson → mark-done → back toward home', async ({
  page,
}) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();
  const { email } = await loginRes.json();
  const a = admin();
  const { data: users } = await a.auth.admin.listUsers();
  const userId = users.users.find((u) => u.email === email)!.id;

  const lessonId = await anyPresetLessonId();

  // Wipe this lesson's progress so mark-done is meaningful.
  await a
    .from('lesson_progress')
    .delete()
    .eq('user_id', userId)
    .eq('lesson_id', lessonId);

  // Go to /home (topic rows render), then navigate straight to the known
  // preset lesson by URL (the topic/course we picked may not be the one the
  // helper grabbed, so don't try to click through).
  await page.goto('/home');
  await expect(page.getByTestId('home-jar-chip')).toBeVisible();

  await page.goto(`/lesson/${lessonId}`);
  await expect(page.getByTestId('mark-done')).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId('mark-done').click();

  // /home (or /onboarding — dev user is onboarded=true now so it should
  // be /home, but accept both to be robust across dev-login behavior).
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 10_000 });

  // Progress row exists.
  const { data: row } = await a
    .from('lesson_progress')
    .select('completed_at')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .single();
  expect(row?.completed_at).toBeTruthy();
});
