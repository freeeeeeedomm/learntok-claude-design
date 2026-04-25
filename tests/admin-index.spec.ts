import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env not set');

test('/admin renders category index with hero + 12 cards + new-tile', async ({
  page,
}) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin');
  await expect(page.getByTestId('admin-all-hero')).toBeVisible();
  await expect(page.getByTestId('admin-category-grid')).toBeVisible();
  await expect(page.getByTestId('admin-category-card-喜剧')).toBeVisible();
  await expect(page.getByTestId('admin-category-card-动物')).toBeVisible();
  await expect(page.getByTestId('admin-new-category-tile')).toBeVisible();
});

test('clicking a category card navigates to /admin/[slug]', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin');
  await page.getByTestId('admin-category-card-喜剧').click();
  await expect(page.getByTestId('admin-video-grid')).toBeVisible();
});

test('hero card navigates to /admin/all', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin');
  await page.getByTestId('admin-all-hero').click();
  await expect(page).toHaveURL(/\/admin\/all$/);
  await expect(page.getByTestId('admin-video-grid')).toBeVisible();
});
