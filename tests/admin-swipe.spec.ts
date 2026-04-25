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

  await page.goto('/admin/喜剧');
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

test('admin swipe: delete + undo within 3s → DB unchanged', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });

  await page.goto('/admin/喜剧');
  await page.getByTestId('admin-review-enter').click();

  // Confirm we're on video 1/3.
  await expect(page.getByTestId('admin-swipe-progress')).toContainText('喜剧 · 1/3');

  // Click delete — toast appears, progress advances.
  await page.getByTestId('admin-swipe-delete').click();
  await expect(page.getByTestId('admin-swipe-undo')).toBeVisible();
  await expect(page.getByTestId('admin-swipe-progress')).toContainText('喜剧 · 2/3');

  // Click undo inside the 3s window.
  await page.getByTestId('admin-swipe-undo').click();
  await expect(page.getByTestId('admin-swipe-undo')).toHaveCount(0);

  // Wait longer than what would have been the commit timer.
  await page.waitForTimeout(3500);

  // DB unchanged — all 3 rows still is_active = true.
  const a = svcAdmin();
  const { data: rows } = await a
    .from('video_pool')
    .select('video_id, is_active')
    .in('video_id', TEST_VIDEO_IDS);
  expect(rows?.length).toBe(3);
  expect(rows?.every((r) => r.is_active)).toBe(true);
});

test('admin swipe: delete + timeout → soft-delete persisted + grid shrinks', async ({
  page,
}) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });

  await page.goto('/admin/喜剧');
  await page.getByTestId('admin-review-enter').click();

  // Identify which video is shown first (depends on created_at desc order,
  // which for the 3 beforeEach-inserted rows matches the insertion order's
  // reverse — the LAST inserted is newest = first. Don't assume, read from DOM.)
  const iframeSrc1 = await page
    .getByTestId('admin-swipe-current')
    .locator('iframe')
    .getAttribute('src');
  const deletedId = TEST_VIDEO_IDS.find((id) => iframeSrc1!.includes(id));
  expect(deletedId, 'iframe src should match one of the seeded video_ids').toBeTruthy();

  await page.getByTestId('admin-swipe-delete').click();
  await expect(page.getByTestId('admin-swipe-undo')).toBeVisible();

  // Past the 3s commit window.
  await page.waitForTimeout(3500);

  // Toast gone, PATCH fired.
  await expect(page.getByTestId('admin-swipe-undo')).toHaveCount(0);

  // Verify DB: deleted row is now is_active = false.
  const a = svcAdmin();
  const { data: row } = await a
    .from('video_pool')
    .select('is_active')
    .eq('video_id', deletedId!)
    .single();
  expect(row?.is_active).toBe(false);

  // Exit → grid should show only 2 cards (the other 2 seeded rows).
  await page.getByTestId('admin-swipe-exit').click();
  await expect(page.getByTestId('admin-swipe-view')).toHaveCount(0);
  await expect(page.getByTestId(`admin-video-card-${deletedId}`)).toHaveCount(0);

  const otherIds = TEST_VIDEO_IDS.filter((id) => id !== deletedId);
  for (const id of otherIds) {
    await expect(page.getByTestId(`admin-video-card-${id}`)).toBeVisible();
  }
});
