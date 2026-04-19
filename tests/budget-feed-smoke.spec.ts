import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

test('budget → feed happy path: pick preset, start, land on feed, done now', async ({
  page,
}) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/budget');
  await expect(page.getByTestId('budget-jar-chip')).toBeVisible();
  await expect(page.getByTestId('budget-start')).toBeEnabled();

  const preset = page.getByTestId('budget-preset-120');
  await expect(preset).toBeVisible();
  await preset.click();

  await page.getByTestId('budget-start').click();
  await page.waitForURL(/\/feed\?session=/, { timeout: 10_000 });
  await expect(page.getByTestId('feed-root')).toBeVisible();
  await expect(page.getByTestId('feed-remaining')).toContainText(/^[0-9]+:[0-9]{2}$/);

  await page.getByTestId('angel-exit').click();
  await page.waitForURL('**/home', { timeout: 15_000 });
});

test('feed: session cleanup writes ended_at on exit', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();
  const { email } = await loginRes.json();
  const a = admin();
  const { data: users } = await a.auth.admin.listUsers();
  const userId = users.users.find((u) => u.email === email)!.id;

  await page.goto('/budget');
  await page.getByTestId('budget-preset-120').click();
  await page.getByTestId('budget-start').click();
  await page.waitForURL(/\/feed\?session=/, { timeout: 10_000 });

  // Grab the session id from the URL.
  const url = new URL(page.url());
  const sessionId = url.searchParams.get('session');
  expect(sessionId).toBeTruthy();

  await page.getByTestId('angel-exit').click();
  await page.waitForURL('**/home', { timeout: 10_000 });

  // Confirm server closed the session.
  const { data: row } = await a
    .from('sessions')
    .select('ended_at, kind')
    .eq('id', sessionId!)
    .single();
  expect(row?.kind).toBe('feed');
  expect(row?.ended_at).toBeTruthy();
});

test('/feed without session param bounces to /budget', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/feed');
  await page.waitForURL('**/budget', { timeout: 5000 });
});
