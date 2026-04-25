import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env not set');

// Stable public TikTok URL: Khaby Lame "peel a banana" — was in the
// pre-PR-#10 hardcoded FEED_VIDS list. Public, oembed reliably returns
// metadata. If TikTok ever pulls the video the test breaks; that's
// acceptable for an integration test that depends on real services.
const TEST_URL = 'https://www.tiktok.com/@khaby.lame/video/6950627842518568197';
const TEST_VIDEO_ID = '6950627842518568197';

test.beforeEach(async () => {
  const a = admin();
  await a.from('video_pool').delete().eq('video_id', TEST_VIDEO_ID);
});

test.afterEach(async () => {
  const a = admin();
  await a.from('video_pool').delete().eq('video_id', TEST_VIDEO_ID);
});

test('admin: add a video by URL on /admin/[slug]', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin/喜剧');

  await page.getByTestId('admin-new-video-trigger').click();
  await page.getByTestId('admin-new-video-input').fill(TEST_URL);
  await page.getByTestId('admin-new-video-submit').click();

  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_ID}`)).toBeVisible({
    timeout: 15000,
  });

  await page.reload();
  await expect(page.getByTestId(`admin-video-card-${TEST_VIDEO_ID}`)).toBeVisible({
    timeout: 15000,
  });
});

test('admin: rejects malformed URL with inline error', async ({ page }) => {
  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin/喜剧');

  await page.getByTestId('admin-new-video-trigger').click();
  await page.getByTestId('admin-new-video-input').fill('not-a-url');
  await page.getByTestId('admin-new-video-submit').click();

  await expect(page.getByTestId('admin-new-video-error')).toContainText('URL 不对');
});

test('admin: rejects already-active duplicate', async ({ page }) => {
  const a = admin();
  await a.from('video_pool').insert({
    video_id: TEST_VIDEO_ID,
    source: 'tiktok',
    category: '喜剧',
    title: 'preseed',
    author: 'khaby.lame',
    thumbnail_url: null,
  });

  await page.request.post('/api/admin/unlock', { data: { password: ADMIN_PASSWORD } });
  await page.goto('/admin/动物');

  await page.getByTestId('admin-new-video-trigger').click();
  await page.getByTestId('admin-new-video-input').fill(TEST_URL);
  await page.getByTestId('admin-new-video-submit').click();

  await expect(page.getByTestId('admin-new-video-error')).toContainText('已经在');
});
