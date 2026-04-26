import { test, expect } from '@playwright/test';
import { devLoginAndOnboard, seedJarBalance, startFeedSession } from './helpers';

test.describe('feed extend (PR 3)', () => {
  test('exhaustion shows modal; extend +60s succeeds when balance >= 60', async ({ page, request }) => {
    await devLoginAndOnboard(page);
    await seedJarBalance(request, 600);  // 10 min in jar
    const { sessionId } = await startFeedSession(request, 5);  // 5s budget

    await page.goto(`/feed?session=${sessionId}`);

    const modal = page.getByTestId('feed-exhaustion-modal');
    await expect(modal).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('feed-exhaustion-back')).toBeVisible();
    const extendBtn = page.getByTestId('feed-exhaustion-extend');
    await expect(extendBtn).toBeVisible();

    await extendBtn.click();
    await expect(modal).toBeHidden({ timeout: 5_000 });

    // After extend: remaining counter should reset to ~60s
    await expect(page.getByTestId('feed-remaining')).toContainText('1:00', { timeout: 3_000 });

    // Verify the ledger entry exists.
    const ledger = await request.get('/api/dev/ledger?label=feed_extend').then((r) => r.json());
    expect(ledger.entries.length).toBeGreaterThanOrEqual(1);
    expect(ledger.entries[0].delta_seconds).toBe(-60);
  });

  test('extend button hidden when balance < 60', async ({ page, request }) => {
    await devLoginAndOnboard(page);
    await seedJarBalance(request, 30);  // below threshold
    const { sessionId } = await startFeedSession(request, 5);

    await page.goto(`/feed?session=${sessionId}`);

    await expect(page.getByTestId('feed-exhaustion-modal')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('feed-exhaustion-extend')).toHaveCount(0);
    await page.getByTestId('feed-exhaustion-back').click();
    await expect(page).toHaveURL(/\/home$/);
  });
});
