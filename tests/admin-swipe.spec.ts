import { test, expect } from '@playwright/test';
import { admin as svcAdmin } from './helpers/session';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env not set');

const TEST_VIDEO_IDS = [
  '4444444444000000001',
  '4444444444000000002',
  '4444444444000000003',
];

test.beforeEach(async () => {
  const a = svcAdmin();
  await a.from('video_pool').delete().in('video_id', TEST_VIDEO_IDS);
  await a.from('video_pool').insert([
    { video_id: TEST_VIDEO_IDS[0], source: 'tiktok', category: '喜剧', title: 'swipe-seed-1' },
    { video_id: TEST_VIDEO_IDS[1], source: 'tiktok', category: '喜剧', title: 'swipe-seed-2' },
    { video_id: TEST_VIDEO_IDS[2], source: 'tiktok', category: '喜剧', title: 'swipe-seed-3' },
  ]);
});

test.afterEach(async () => {
  const a = svcAdmin();
  await a.from('video_pool').delete().in('video_id', TEST_VIDEO_IDS);
});

test('admin swipe: enter → navigate → exit', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });

  await page.goto('/admin');
  await page.getByTestId('admin-tab-喜剧').click();
  await page.getByTestId('admin-review-enter').click();

  await expect(page.getByTestId('admin-swipe-view')).toBeVisible();
  await expect(page.getByTestId('admin-swipe-progress')).toContainText('喜剧 · 1/3');

  const src1 = await page
    .getByTestId('admin-swipe-current')
    .locator('iframe')
    .getAttribute('src');
  expect(src1).toContain('tiktok.com/player/v1/');

  // Wheel down → next video.
  await page.getByTestId('admin-swipe-overlay').hover();
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(400); // 300ms slide + commit margin
  await expect(page.getByTestId('admin-swipe-progress')).toContainText('喜剧 · 2/3');

  const src2 = await page
    .getByTestId('admin-swipe-current')
    .locator('iframe')
    .getAttribute('src');
  expect(src2).not.toBe(src1);

  // Past the 800ms throttle.
  await page.waitForTimeout(900);

  // Wheel up → back to first.
  await page.getByTestId('admin-swipe-overlay').hover();
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(400);
  await expect(page.getByTestId('admin-swipe-progress')).toContainText('喜剧 · 1/3');

  // Exit → back to grid.
  await page.getByTestId('admin-swipe-exit').click();
  await expect(page.getByTestId('admin-swipe-view')).toHaveCount(0);
  await expect(page.getByTestId('admin-video-grid')).toBeVisible();
});
