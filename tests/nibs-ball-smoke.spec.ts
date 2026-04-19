import { test, expect } from '@playwright/test';

test('nibs ball visible on /home and hidden on /lesson', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/home');
  await expect(page.getByTestId('nibs-ball')).toBeVisible();

  // Navigate to a preset lesson — ball should hide.
  await page.goto('/lesson/30000000-0000-0000-0000-000000000111');
  await expect(page.getByTestId('mark-done')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('nibs-ball')).toHaveCount(0);
});

test('nibs ball tap opens BreakSheet → ask → budget → start → /feed', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/home');
  await page.getByTestId('nibs-ball').click();

  // Ask stage.
  await expect(page.getByTestId('break-sheet')).toBeVisible();
  await expect(page.getByTestId('break-yes')).toBeVisible();
  await expect(page.getByTestId('break-no')).toBeVisible();

  // Advance to budget stage.
  await page.getByTestId('break-yes').click();
  await expect(page.getByTestId('break-budget-presets')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('break-budget-preset-120').click();

  // Start.
  await page.getByTestId('break-start').click();
  await page.waitForURL(/\/feed\?session=/, { timeout: 10_000 });
  await expect(page.getByTestId('feed-root')).toBeVisible();

  // Clean up so session doesn't linger.
  try { await page.getByTestId('feed-done').click(); } catch {}
});

test('nibs ball tap → cancel (再学一下) closes sheet', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/home');
  await page.getByTestId('nibs-ball').click();
  await expect(page.getByTestId('break-sheet')).toBeVisible();
  await page.getByTestId('break-no').click();
  await expect(page.getByTestId('break-sheet')).toHaveCount(0);
});

test('nibs ball position persists across reloads', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/home');
  const ball = page.getByTestId('nibs-ball');
  await expect(ball).toBeVisible();

  // Capture initial position, drag 100px left + 100px up.
  const before = await ball.boundingBox();
  expect(before).not.toBeNull();
  const centerX = before!.x + before!.width / 2;
  const centerY = before!.y + before!.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX - 100, centerY - 100, { steps: 10 });
  await page.mouse.up();

  const afterDrag = await ball.boundingBox();
  expect(afterDrag).not.toBeNull();
  // Fuzzy check: ball moved at least 50px in the expected direction.
  expect(afterDrag!.x).toBeLessThan(before!.x - 40);
  expect(afterDrag!.y).toBeLessThan(before!.y - 40);

  // Reload → position should be restored from localStorage.
  await page.reload();
  const afterReload = await page.getByTestId('nibs-ball').boundingBox();
  expect(afterReload).not.toBeNull();
  expect(Math.abs(afterReload!.x - afterDrag!.x)).toBeLessThan(10);
  expect(Math.abs(afterReload!.y - afterDrag!.y)).toBeLessThan(10);
});
