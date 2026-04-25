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

test('admin pool: each category page shows only its own videos', async ({
  page,
}) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });

  await page.goto('/admin/喜剧');
  await expect(page.getByTestId('admin-video-grid')).toBeVisible();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[0]}`)).toBeVisible();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[1]}`)).toBeVisible();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[2]}`)).toHaveCount(0);

  await page.goto('/admin/动物');
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[2]}`)).toBeVisible();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[0]}`)).toHaveCount(0);
});

test('admin pool: soft delete removes card and persists across reload', async ({
  page,
}) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });

  await page.goto('/admin/喜剧');

  const patchResponse = page.waitForResponse(
    (res) =>
      res.url().includes('/api/admin/video-pool/') && res.request().method() === 'PATCH'
  );
  await page.getByTestId(`admin-video-delete-${TEST_VIDEO_IDS[0]}`).click();
  const response = await patchResponse;
  expect(response.status()).toBe(200);

  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[0]}`)).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[0]}`)).toHaveCount(0);
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_IDS[1]}`)).toBeVisible();
});
