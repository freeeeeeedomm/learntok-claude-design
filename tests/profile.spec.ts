import { test, expect } from '@playwright/test';
import { admin, devAuthedContext } from './helpers/session';

test.describe('/profile route', () => {
  test('GET /progress redirects to /profile', async ({ request }) => {
    // First need an authed session. Use the dev login and follow the resulting
    // cookie via the request context.
    const { ctx } = await devAuthedContext();
    const res = await ctx.get('/progress', { maxRedirects: 0 });
    // Next emits 307 for server-component redirect()
    expect([307, 308]).toContain(res.status());
    expect(res.headers()['location']).toMatch(/\/profile$/);
  });

  test('profile page renders all sections', async ({ page, request }) => {
    await request.post('/api/dev/login');
    await page.goto('/profile');
    await expect(page.getByTestId('profile-page')).toBeVisible();
    await expect(page.getByTestId('profile-settings')).toBeVisible();
    await expect(page.getByTestId('profile-rhythm')).toBeVisible();
    await expect(page.getByTestId('profile-activity')).toBeVisible();
    await expect(page.getByTestId('profile-sign-out')).toBeVisible();
  });

  test('updateDisplayName persists across reload', async ({ page, request }) => {
    await request.post('/api/dev/login');
    await page.goto('/profile');
    const input = page.getByTestId('profile-name-input');
    await input.fill('Test User Renamed');
    await input.blur();
    // The server action revalidates; reload to confirm DB was written.
    await page.reload();
    await expect(page.getByTestId('profile-name-input')).toHaveValue('Test User Renamed');

    const a = admin();
    const { data: list } = await a.auth.admin.listUsers();
    const userId = list.users.find((u) => u.email === 'dev@learntok.local')!.id;
    const { data: profile } = await a
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single();
    expect(profile?.display_name).toBe('Test User Renamed');
  });

  test('updateRestMinutes recomputes rate', async ({ page, request }) => {
    await request.post('/api/dev/login');
    await page.goto('/profile');
    const slider = page.getByTestId('rest-slider');
    await slider.fill('30');
    // Slider commits on pointerup; .fill() doesn't fire pointer events on input
    // type=range. Dispatch keyup on End-key as a proxy for "user lifted finger".
    await slider.evaluate((el) => {
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'End', bubbles: true }));
    });
    // Server action is fire-and-forget from useTransition; poll the DB.
    const a = admin();
    const { data: list } = await a.auth.admin.listUsers();
    const userId = list.users.find((u) => u.email === 'dev@learntok.local')!.id;
    await expect.poll(async () => {
      const { data } = await a.from('profiles').select('rate').eq('id', userId).single();
      return Number(data?.rate);
    }, { timeout: 5_000 }).toBeCloseTo(0.5, 3);
  });
});
