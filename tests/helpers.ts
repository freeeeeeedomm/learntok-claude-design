import { expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * Logs in the dev user via /api/dev/login and lands them on /home.
 * Mirrors the inline pattern used by most spec files in this repo.
 */
export async function devLoginAndOnboard(page: Page) {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok(), 'dev login must succeed').toBeTruthy();
}

/** Seed the dev user's jar balance via the dev-only seed-balance route. */
export async function seedJarBalance(request: APIRequestContext, seconds: number) {
  const r = await request.post('/api/dev/seed-balance', { data: { seconds } });
  expect(r.ok(), 'seed-balance must succeed').toBeTruthy();
}

/** Start a feed session with the given budget (seconds). */
export async function startFeedSession(
  request: APIRequestContext,
  budget: number,
): Promise<{ sessionId: string }> {
  const r = await request.post('/api/sessions/start', {
    data: { kind: 'feed', budget },
  });
  expect(r.ok(), 'sessions/start must succeed').toBeTruthy();
  return r.json() as Promise<{ sessionId: string }>;
}
