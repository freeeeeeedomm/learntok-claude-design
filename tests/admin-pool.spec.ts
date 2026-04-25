import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env not set');

const TEST_VIDEO_IDS = [
  '9999999999000000001',
  '9999999999000000002',
  '9999999999000000003',
];

test.beforeEach(async () => {
  // Hard-delete any leftover test rows (avoid "row already exists, soft-deleted")
  // so each test starts from a known clean slate.
  const a = admin();
  await a.from('video_pool').delete().in('video_id', TEST_VIDEO_IDS);

  await a.from('video_pool').insert([
    {
      video_id: TEST_VIDEO_IDS[0],
      source: 'tiktok',
      category: '喜剧',
      title: 'test comedy A',
      author: 'testuser',
      thumbnail_url: null,
    },
    {
      video_id: TEST_VIDEO_IDS[1],
      source: 'tiktok',
      category: '喜剧',
      title: 'test comedy B',
      author: 'testuser',
      thumbnail_url: null,
    },
    {
      video_id: TEST_VIDEO_IDS[2],
      source: 'tiktok',
      category: '动物',
      title: 'test animal',
      author: 'testuser',
      thumbnail_url: null,
    },
  ]);
});

test.afterEach(async () => {
  const a = admin();
  await a.from('video_pool').delete().in('video_id', TEST_VIDEO_IDS);
});

test('admin pool: grid shows seeded videos and category tab filters', async ({
  page,
}) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });

  await page.goto('/admin');
  await expect(page.getByTestId('admin-video-grid')).toBeVisible();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[0]}`)).toBeVisible();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[2]}`)).toBeVisible();

  // Filter to 喜剧: animal video should be hidden, two comedy videos visible.
  await page.getByTestId('admin-tab-喜剧').click();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[0]}`)).toBeVisible();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[2]}`)).toHaveCount(0);
});

test('admin pool: soft delete removes card and persists across reload', async ({
  page,
}) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });

  await page.goto('/admin');

  // Click delete and wait for the PATCH response before reloading — otherwise
  // the in-flight request can be aborted by the navigation.
  const patchResponse = page.waitForResponse(
    (res) =>
      res.url().includes('/api/admin/video-pool/') && res.request().method() === 'PATCH'
  );
  await page.getByTestId(`admin-video-delete-${TEST_VIDEO_IDS[0]}`).click();
  const response = await patchResponse;
  expect(response.status()).toBe(200);

  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[0]}`)).toHaveCount(0);

  // Reload — the row should still be gone (soft delete persisted).
  await page.reload();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[0]}`)).toHaveCount(0);
  // Other test videos still present.
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[1]}`)).toBeVisible();
});
