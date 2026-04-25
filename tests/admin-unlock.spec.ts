import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env not set');

test('admin unlock: wrong password rejected, no cookie, error visible', async ({
  page,
}) => {
  await page.goto('/admin/unlock');
  await page.getByTestId('admin-unlock-input').fill('definitely-not-the-right-password');
  await page.getByTestId('admin-unlock-submit').click();

  await expect(page.getByTestId('admin-unlock-error')).toContainText('wrong password');

  // Cookie must not have been set.
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === 'admin_unlock')).toBeUndefined();
});

test('admin unlock: right password sets cookie and redirects to /admin', async ({
  page,
}) => {
  await page.goto('/admin/unlock');
  await page.getByTestId('admin-unlock-input').fill(ADMIN_PASSWORD!);
  await page.getByTestId('admin-unlock-submit').click();

  await page.waitForURL('**/admin', { timeout: 5000 });

  const cookies = await page.context().cookies();
  const c = cookies.find((c) => c.name === 'admin_unlock');
  expect(c).toBeDefined();
  expect(c!.httpOnly).toBe(true);
});
