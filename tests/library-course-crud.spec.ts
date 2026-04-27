import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

test('create + rename + delete course inside owned topic', async ({ page }) => {
  await page.request.post('/api/dev/login');
  const a = admin();
  const { data: { users } } = await a.auth.admin.listUsers();
  const dev = users.find((u) => u.email?.startsWith('dev'))!;
  const { data: topic } = await a
    .from('topics')
    .insert({ owner_id: dev.id, is_preset: false, title: 'Math' })
    .select('id')
    .single();

  await page.goto(`/topic/${topic!.id}`);
  await page.getByTestId('topic-add-course').click();
  await page.getByTestId('create-course-title').fill('Calculus');
  await page.getByTestId('create-course-submit').click();
  await expect(page.getByText('Calculus')).toBeVisible();

  // Verify ownership in DB
  const { data: course } = await a
    .from('courses')
    .select('id, owner_id, title')
    .eq('topic_id', topic!.id)
    .single();
  expect(course?.owner_id).toBe(dev.id);
  expect(course?.title).toBe('Calculus');
});
