import { test, expect } from '@playwright/test';
import { admin as svcAdmin } from './helpers/session';

const SEED_VID = '5555555555000000099';

test.beforeAll(async () => {
  const a = svcAdmin();
  await a.from('video_pool').delete().eq('video_id', SEED_VID);
  await a.from('video_pool').insert({
    video_id: SEED_VID,
    source: 'tiktok' as const,
    category: '喜剧',
    title: 'feed-from-db-seed',
  });
});

test.afterAll(async () => {
  const a = svcAdmin();
  await a.from('video_pool').delete().eq('video_id', SEED_VID);
});

test('feed reads from video_pool: seeded video appears in iframe', async ({
  page,
}) => {
  // Wipe other rows so the seeded one is the only candidate (otherwise
  // the random shuffle might land elsewhere).
  const a = svcAdmin();
  const { data: others } = await a
    .from('video_pool')
    .select('id')
    .neq('video_id', SEED_VID);
  const otherIds = (others ?? []).map((r) => r.id);
  if (otherIds.length) {
    await a.from('video_pool').update({ is_active: false }).in('id', otherIds);
  }

  try {
    const loginRes = await page.request.post('/api/dev/login');
    expect(loginRes.ok()).toBeTruthy();

    await page.goto('/budget');
    await page.getByTestId('budget-preset-120').click();
    await page.getByTestId('budget-start').click();
    await page.waitForURL(/\/feed\?session=/, { timeout: 10_000 });

    const src = await page.getByTestId('video-embed').locator('iframe').getAttribute('src');
    expect(src).toContain(SEED_VID);

    await page.getByTestId('angel-exit').click();
    await page.waitForURL('**/home', { timeout: 10_000 });
  } finally {
    // Restore any previously-active rows.
    if (otherIds.length) {
      await a.from('video_pool').update({ is_active: true }).in('id', otherIds);
    }
  }
});
