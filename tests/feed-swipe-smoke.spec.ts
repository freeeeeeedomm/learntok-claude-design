import { test, expect } from '@playwright/test';

async function startFeedSession(page: import('@playwright/test').Page) {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/budget');
  await page.getByTestId('budget-preset-120').click();
  await page.getByTestId('budget-start').click();
  await page.waitForURL(/\/feed\?session=/, { timeout: 10_000 });
}

test('feed swipe: wheel-down advances to next TikTok; wheel-up goes back', async ({ page }) => {
  await startFeedSession(page);

  const firstSrc = await page.getByTestId('video-embed').locator('iframe').getAttribute('src');
  expect(firstSrc).toContain('tiktok.com/player/v1/');

  const overlay = page.getByTestId('feed-swipe-overlay');
  await expect(overlay).toBeVisible();

  // Wheel down → next. Hover first so wheel lands on the overlay.
  await overlay.hover();
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(400); // slide = 300ms + React commit margin

  const secondSrc = await page.getByTestId('video-embed').locator('iframe').getAttribute('src');
  expect(secondSrc).not.toBe(firstSrc);
  expect(secondSrc).toContain('tiktok.com/player/v1/');

  // Wait past the 800ms swipe throttle before the next gesture.
  await page.waitForTimeout(900);

  // Wheel up → back to first.
  await overlay.hover();
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(400);

  const backSrc = await page.getByTestId('video-embed').locator('iframe').getAttribute('src');
  expect(backSrc).toBe(firstSrc);

  await page.getByTestId('angel-exit').click();
  await page.waitForURL('**/home', { timeout: 10_000 });
});

test('feed angel exit: click → end session → /home', async ({ page }) => {
  await startFeedSession(page);

  await page.getByTestId('angel-exit').click();
  await page.waitForURL('**/home', { timeout: 10_000 });
});

test('feed overlay tap hides it for 4s then restores', async ({ page }) => {
  await startFeedSession(page);

  const overlayBefore = page.getByTestId('feed-swipe-overlay');
  await expect(overlayBefore).toBeVisible();

  // Playwright .click() fires pointerdown→pointerup quickly with no
  // movement — matches the tap path (|dy|<6 and dt<250ms).
  await overlayBefore.click();
  await expect(page.getByTestId('feed-swipe-overlay')).toHaveCount(0);

  // Overlay comes back after 4s.
  await page.waitForTimeout(4200);
  await expect(page.getByTestId('feed-swipe-overlay')).toBeVisible();

  await page.getByTestId('angel-exit').click();
  await page.waitForURL('**/home', { timeout: 10_000 });
});
