import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env not set');

const TEST_SLUG = `__test_${Math.random().toString(36).slice(2, 8)}`;

test.afterEach(async () => {
  const a = admin();
  await a.from('categories').delete().eq('slug', TEST_SLUG);
});

test('admin: create new category from /admin index', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin');

  await page.getByTestId('admin-new-category-tile').click();
  await page.getByTestId('admin-new-category-input').fill(TEST_SLUG);
  await page.getByTestId('admin-new-category-submit').click();

  await expect(page.getByTestId(`admin-category-card-${TEST_SLUG}`)).toBeVisible();
});

test('admin: rejects duplicate category slug', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin');

  await page.getByTestId('admin-new-category-tile').click();
  await page.getByTestId('admin-new-category-input').fill('喜剧');
  await page.getByTestId('admin-new-category-submit').click();

  await expect(page.getByTestId('admin-new-category-error')).toContainText('已经存在');
});

test('admin: rejects reserved slug "all"', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin');

  await page.getByTestId('admin-new-category-tile').click();
  await page.getByTestId('admin-new-category-input').fill('all');
  await page.getByTestId('admin-new-category-submit').click();

  await expect(page.getByTestId('admin-new-category-error')).toContainText('保留字');
});
