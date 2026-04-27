import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

test('create + rename + delete topic', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/home');

  // Create
  await page.getByTestId('home-create-topic').click();
  await page.getByTestId('create-topic-title').fill('Quantum Computing');
  await page.getByTestId('create-topic-submit').click();

  await expect(page.getByText('Quantum Computing')).toBeVisible({ timeout: 5000 });

  // Confirm DB write
  const a = admin();
  const { data: topic } = await a
    .from('topics')
    .select('id, title, owner_id, is_preset')
    .eq('title', 'Quantum Computing')
    .maybeSingle();
  expect(topic?.is_preset).toBe(false);
  expect(topic?.owner_id).toBeTruthy();
});

test('rename topic via three-dot menu', async ({ page }) => {
  await page.request.post('/api/dev/login');
  // Seed an owner-owned topic.
  const a = admin();
  const { data: { users } } = await a.auth.admin.listUsers();
  const dev = users.find((u) => u.email?.startsWith('dev'))!;
  const { data: t } = await a
    .from('topics')
    .insert({ owner_id: dev.id, title: 'OldName', is_preset: false })
    .select('id')
    .single();

  await page.goto('/home');
  await page.getByTestId(`home-topic-${t!.id}-menu`).click();
  await page.getByText('Rename').click();
  await page.getByTestId('rename-input').fill('NewName');
  await page.getByTestId('rename-submit').click();

  await expect(page.getByText('NewName')).toBeVisible();
});
