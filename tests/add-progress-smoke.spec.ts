import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

test('youtube parse: recognized URL returns oembed fallback with duration=0', async ({
  page,
}) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  const res = await page.request.get(
    '/api/youtube/parse?url=' +
      encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  );
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.ytId).toBe('dQw4w9WgXcQ');
  expect(typeof body.title).toBe('string');
  expect(body.title.length).toBeGreaterThan(0);
  // Without YOUTUBE_API_KEY, oembed path returns source: 'oembed' + duration 0.
  expect(body.source).toBe('oembed');
  expect(body.durationSeconds).toBe(0);
});

test('youtube parse: non-youtube url returns 400', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  const res = await page.request.get(
    '/api/youtube/parse?url=' + encodeURIComponent('https://example.com/video')
  );
  expect(res.status()).toBe(400);
});

test('/add flow: paste → parse → save creates course+lesson, lands on /course/[id]', async ({
  page,
}) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();
  const { email } = await loginRes.json();
  const a = admin();
  const { data: users } = await a.auth.admin.listUsers();
  const userId = users.users.find((u) => u.email === email)!.id;

  // Cleanup: drop any courses this user has made in prior runs so we can
  // assert cleanly below.
  await a
    .from('courses')
    .delete()
    .eq('owner_id', userId)
    .eq('is_preset', false);

  await page.goto('/add');
  await expect(page.getByTestId('add-url-input')).toBeVisible();

  await page
    .getByTestId('add-url-input')
    .fill('https://www.youtube.com/watch?v=jNQXAC9IVRw');
  await page.getByTestId('add-parse').click();

  // Preview card should render within a few seconds (network-dependent).
  await expect(page.getByTestId('add-preview')).toBeVisible({ timeout: 15_000 });

  // Save → navigate to /course/[id]
  await page.getByTestId('add-save').click();
  await page.waitForURL(/\/course\/[0-9a-f-]{36}/, { timeout: 15_000 });

  // Confirm a course + lesson exist in DB.
  const { data: courses } = await a
    .from('courses')
    .select('id, title')
    .eq('owner_id', userId)
    .eq('is_preset', false);
  expect(courses?.length).toBeGreaterThanOrEqual(1);

  const courseIds = (courses ?? []).map((c) => c.id);
  const { data: lessons } = await a
    .from('lessons')
    .select('yt_id, duration_seconds')
    .in('course_id', courseIds);
  expect(lessons?.length).toBeGreaterThanOrEqual(1);
  expect(lessons!.some((l) => l.yt_id === 'jNQXAC9IVRw')).toBeTruthy();
});

test('/progress renders summary + tabs', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/progress');
  await expect(page.getByTestId('progress-summary')).toBeVisible();
  await expect(page.getByTestId('tab-ledger')).toBeVisible();
  await expect(page.getByTestId('tab-courses')).toBeVisible();

  // Switch to courses tab.
  await page.getByTestId('tab-courses').click();
  await expect(page.getByTestId('progress-courses')).toBeVisible();
});
