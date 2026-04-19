import { test, expect } from '@playwright/test';

// Preset UUIDs pinned in supabase/seed.sql.
const PHYSICS_TOPIC_ID = '10000000-0000-0000-0000-000000000001';
const FORCES_COURSE_ID = '20000000-0000-0000-0000-000000000011';
const MOTION_COURSE_ID = '20000000-0000-0000-0000-000000000012';

test('topic page: physics shows 2 courses + click into /course/[id]', async ({
  page,
}) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto(`/topic/${PHYSICS_TOPIC_ID}`);

  // Header exists.
  await expect(page.getByTestId('topic-back')).toBeVisible();
  await expect(page.getByTestId('topic-jar-chip')).toBeVisible();

  // Both preset Physics courses are listed.
  await expect(page.getByTestId(`topic-course-${FORCES_COURSE_ID}`)).toBeVisible();
  await expect(page.getByTestId(`topic-course-${MOTION_COURSE_ID}`)).toBeVisible();

  // Click the first course → lands on /course/<id>.
  await page.getByTestId(`topic-course-${FORCES_COURSE_ID}`).click();
  await page.waitForURL(new RegExp(`/course/${FORCES_COURSE_ID}$`));
});

test('home: topic row click navigates to /topic/[id]', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/home');

  const row = page.getByTestId(`home-topic-${PHYSICS_TOPIC_ID}`);
  await expect(row).toBeVisible();
  await row.click();
  await page.waitForURL(new RegExp(`/topic/${PHYSICS_TOPIC_ID}$`));
});

test('course back link returns to the parent topic page', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto(`/course/${FORCES_COURSE_ID}`);
  await page.getByTestId('course-back').click();
  await page.waitForURL(new RegExp(`/topic/${PHYSICS_TOPIC_ID}$`));
});
