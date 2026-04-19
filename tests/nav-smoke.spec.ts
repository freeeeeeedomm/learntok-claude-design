import { test, expect } from '@playwright/test';

test('bottom nav shows three tabs (home / relax / progress) and they navigate', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/home');
  await expect(page.getByTestId('bottom-nav')).toBeVisible();
  await expect(page.getByTestId('nav-home')).toBeVisible();
  await expect(page.getByTestId('nav-relax')).toBeVisible();
  await expect(page.getByTestId('nav-progress')).toBeVisible();

  // Relax → /budget + stays active there.
  await page.getByTestId('nav-relax').click();
  await page.waitForURL('**/budget');
  await expect(page.getByTestId('bottom-nav')).toBeVisible();
  await expect(page.getByTestId('nav-relax')).toHaveAttribute('aria-current', 'page');

  // Progress → /progress.
  await page.getByTestId('nav-progress').click();
  await page.waitForURL('**/progress');
  await expect(page.getByTestId('bottom-nav')).toBeVisible();
  await expect(page.getByTestId('nav-progress')).toHaveAttribute('aria-current', 'page');
});

test('bottom nav hidden on /lesson/[id]', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/lesson/30000000-0000-0000-0000-000000000111');
  await expect(page.getByTestId('mark-done')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('bottom-nav')).toHaveCount(0);
});

test('bottom nav hidden on /feed', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/budget');
  await page.getByTestId('budget-preset-120').click();
  await page.getByTestId('budget-start').click();
  await page.waitForURL(/\/feed\?session=/);
  await expect(page.getByTestId('bottom-nav')).toHaveCount(0);

  try { await page.getByTestId('angel-exit').click(); } catch {}
});

test('bottom nav hidden on /login and /', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('bottom-nav')).toHaveCount(0);

  await page.goto('/login');
  await expect(page.getByTestId('bottom-nav')).toHaveCount(0);
});
