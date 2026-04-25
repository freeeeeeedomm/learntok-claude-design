import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env not set');

test('/admin/all renders the all-videos grid', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin/all');
  await expect(page.getByTestId('admin-video-grid')).toBeVisible();
  await expect(page.getByTestId('admin-review-enter')).toBeVisible();
});

test('/admin/[slug] renders a single category', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin/喜剧');
  await expect(page.getByTestId('admin-video-grid')).toBeVisible();
  await expect(page.getByTestId('admin-new-video-trigger')).toBeVisible();
});

test('/admin/[slug] returns 404 for an unknown slug', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  const res = await page.goto('/admin/__definitely_not_a_category__');
  expect(res?.status()).toBe(404);
});
