import { test, expect } from '@playwright/test';

// Assumes the test harness's auth/onboarding helpers exist (used in
// full-flow.spec.ts). If a project-local helper isn't available, this
// test should mirror full-flow's beforeEach setup.
import { devLoginAndOnboard } from './helpers';

test.describe('discover (PR 3)', () => {
  test.beforeEach(async ({ page }) => {
    await devLoginAndOnboard(page);
  });

  test('renders 5 group sections with English titles + Lucide icons', async ({ page }) => {
    await page.goto('/discover');
    await expect(page.getByTestId('discover-group-finance')).toBeVisible();
    await expect(page.getByTestId('discover-group-humanities')).toBeVisible();
    await expect(page.getByTestId('discover-group-stem')).toBeVisible();
    await expect(page.getByTestId('discover-group-math')).toBeVisible();
    await expect(page.getByTestId('discover-group-cs')).toBeVisible();

    await expect(page.getByText('Finance & Economics')).toBeVisible();
    await expect(page.getByText('Mathematics')).toBeVisible();
    // Lucide icons render as <svg>; assert one inside the finance header.
    const financeSection = page.getByTestId('discover-group-finance');
    await expect(financeSection.locator('svg').first()).toBeVisible();
  });

  test('tiles render in a 2-col grid with course count', async ({ page }) => {
    await page.goto('/discover');
    const grid = page.getByTestId('topic-grid').first();
    await expect(grid).toBeVisible();
    // First Finance topic = Microeconomics
    const microId = '10be2d17-1ed0-5300-94c2-96c65e9aac6f';
    const tile = page.getByTestId(`discover-topic-${microId}`);
    await expect(tile).toBeVisible();
    await expect(tile).toContainText('Microeconomics');
    await expect(tile).toContainText(/courses?$/);
  });
});
