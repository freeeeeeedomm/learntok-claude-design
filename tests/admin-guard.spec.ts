import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env not set');

test('admin guard: anonymous user → redirect to /admin/unlock', async ({ page }) => {
  // Fresh context, no auth, no cookies.
  await page.goto('/admin');
  await page.waitForURL('**/admin/unlock', { timeout: 5000 });
  await expect(page.getByTestId('admin-unlock-form')).toBeVisible();
});

test('admin guard: logged-in non-admin user → still redirected to /admin/unlock', async ({
  page,
}) => {
  // Dev login creates dev@learntok.local — is_admin defaults to false.
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/admin');
  await page.waitForURL('**/admin/unlock', { timeout: 5000 });
});

test('admin guard: cookie unlocks /admin', async ({ page }) => {
  // Unlock via the password cookie path — proves the OR-gate accepts cookie mode.
  const unlockRes = await page.request.post('/api/admin/unlock', {
    data: { password: ADMIN_PASSWORD },
  });
  expect(unlockRes.ok()).toBeTruthy();

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin$/);
  // Page itself isn't built yet (Task 3) — for now just assert we did NOT
  // bounce to /admin/unlock.
  await expect(page).not.toHaveURL(/\/admin\/unlock/);
});
