import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

test.skip('add lectures via paste — single video', async ({ page }) => {
  // Skipped by default because it hits the live YouTube API.
  // Un-skip locally with a known-good public video to verify e2e.
  await page.request.post('/api/dev/login');
  const a = admin();
  const { data: { users } } = await a.auth.admin.listUsers();
  const dev = users.find((u) => u.email?.startsWith('dev'))!;
  const { data: topic } = await a.from('topics').insert({
    owner_id: dev.id, is_preset: false, title: 'T',
  }).select('id').single();
  const { data: course } = await a.from('courses').insert({
    owner_id: dev.id, topic_id: topic!.id, is_preset: false, title: 'C',
  }).select('id').single();

  await page.goto(`/course/${course!.id}`);
  await page.getByTestId('course-add-lecture').click();
  await page
    .getByTestId('add-lecture-textarea')
    .fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByTestId('add-lecture-submit').click();

  await expect(page.locator('[data-testid^="course-lecture-"]')).toHaveCount(1, {
    timeout: 10000,
  });
});

test('rename lecture', async ({ page }) => {
  await page.request.post('/api/dev/login');
  const a = admin();
  const { data: { users } } = await a.auth.admin.listUsers();
  const dev = users.find((u) => u.email?.startsWith('dev'))!;
  const { data: topic } = await a.from('topics').insert({
    owner_id: dev.id, is_preset: false, title: 'T',
  }).select('id').single();
  const { data: course } = await a.from('courses').insert({
    owner_id: dev.id, topic_id: topic!.id, is_preset: false, title: 'C',
  }).select('id').single();
  const { data: lec } = await a.from('lessons').insert({
    course_id: course!.id, position: 0, title: 'OldName',
    yt_id: 'dQw4w9WgXcQ', duration_seconds: 213, video_provider: 'youtube',
  }).select('id').single();

  await page.goto(`/course/${course!.id}`);
  await page.getByTestId(`course-lecture-${lec!.id}-menu`).click();
  await page.getByText('Rename').click();
  await page.getByTestId('rename-input').fill('NewName');
  await page.getByTestId('rename-submit').click();

  await expect(page.getByText('NewName')).toBeVisible();
});
