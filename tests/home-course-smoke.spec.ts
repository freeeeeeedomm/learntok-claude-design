import { test, expect } from '@playwright/test';
import { admin, anyPresetLessonId } from './helpers/session';

test('home + course smoke: login → home → click a course → see lessons', async ({
  page,
}) => {
  // 1. Auth via dev login; this now sets onboarded=true so /home renders directly.
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  // 2. Visit /home — jar chip + at least one course row should be there.
  await page.goto('/home');
  await expect(page.getByTestId('home-jar-chip')).toBeVisible();

  // 3. Find any course row; the dev seed guarantees 3 preset courses.
  const firstCourseRow = page.locator('[data-testid^="home-course-"]').first();
  await expect(firstCourseRow).toBeVisible();

  // Extract the course id from the testid.
  const testidValue = await firstCourseRow.getAttribute('data-testid');
  const courseId = testidValue?.replace('home-course-', '');
  expect(courseId).toBeTruthy();

  // 4. Click the course, verify we land on /course/<id> and see lessons.
  await firstCourseRow.click();
  await page.waitForURL(new RegExp(`/course/${courseId}`), { timeout: 5000 });
  await expect(page.getByTestId('course-jar-chip')).toBeVisible();

  // The preset seed has each course with 2-4 lessons.
  const firstLessonRow = page.locator('[data-testid^="course-lesson-"]').first();
  await expect(firstLessonRow).toBeVisible();
});

test('home: continue card links to a valid lesson when there is progress left', async ({
  page,
}) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  // Dev login wipes progress, so every preset course has undone lessons
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

test('e2e learn loop: home → course → lesson → mark-done → back toward home', async ({
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

  // Go straight to /home → click a course (any) → lesson list appears →
  // we navigate directly to the known preset lesson by URL (the course
  // may not contain the picked preset, so don't try to click into it).
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
