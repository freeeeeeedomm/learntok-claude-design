import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

const DEV_EMAIL = 'dev@learntok.local';

async function devUserId(): Promise<string> {
  const a = admin();
  const { data } = await a.auth.admin.listUsers();
  const u = data.users.find((x) => x.email === DEV_EMAIL);
  expect(u, 'dev user must exist after /api/dev/login').toBeTruthy();
  return u!.id;
}

async function resetForOnboarding(userId: string) {
  const a = admin();
  // Roll the dev user back to a pre-onboarding state.
  await a
    .from('profiles')
    .update({ onboarded: false, interests: [], rate: 1.0 })
    .eq('id', userId);
  // Wipe any prior shelf entries.
  await a.from('profile_courses').delete().eq('user_id', userId);
}

async function getPresetTopics(): Promise<Array<{ id: string; title: string; position: number }>> {
  const a = admin();
  const { data } = await a
    .from('topics')
    .select('id, title, position')
    .eq('is_preset', true)
    .order('position', { ascending: true });
  expect((data ?? []).length, 'seed must contain preset topics').toBeGreaterThan(0);
  return data!;
}

test('onboarding: deal page → topic page → submit → home shows picked rails', async ({
  page,
}) => {
  // 1. Auth + reset to pre-onboarding state.
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();
  const userId = await devUserId();
  await resetForOnboarding(userId);

  const presets = await getPresetTopics();
  const pickA = presets[0]; // Physics (per seed)
  const pickB = presets[3]; // Math (per seed) — pick non-adjacent to verify ordering

  // 2. Land on /onboarding. Page 1 (deal) is visible.
  await page.goto('/onboarding');
  await expect(page.getByTestId('onboarding-page-deal')).toBeVisible();
  await expect(page.getByTestId('deal-learn-min')).toHaveText('20 min');
  await expect(page.getByTestId('deal-mood')).toHaveText('balanced');

  // 3. Drag the slider to 30 (focused). Range inputs need fill() in Playwright.
  await page.getByTestId('deal-slider').fill('30');
  await expect(page.getByTestId('deal-learn-min')).toHaveText('30 min');
  await expect(page.getByTestId('deal-mood')).toHaveText('focused');

  // 4. Advance to page 2.
  await page.getByTestId('deal-cta').click();
  await expect(page.getByTestId('onboarding-page-topics')).toBeVisible();

  // CTA copy reflects 0 picks initially.
  await expect(page.getByTestId('topics-cta')).toHaveText('skip for now →');

  // 5. Pick two topics (Physics then Math).
  await page.getByTestId(`topic-tile-${pickA.id}`).click();
  await page.getByTestId(`topic-tile-${pickB.id}`).click();
  await expect(page.getByTestId('topics-cta')).toHaveText('continue (2 picked) →');

  // 6. Submit → expect /home.
  await Promise.all([
    page.waitForURL('**/home', { timeout: 10_000 }),
    page.getByTestId('topics-cta').click(),
  ]);

  // 7. Assert DB writes.
  const a = admin();
  const { data: profile } = await a
    .from('profiles')
    .select('rate, interests, onboarded')
    .eq('id', userId)
    .single();
  expect(profile?.onboarded).toBe(true);
  // rate = 5/30 ≈ 0.167 — allow a small float tolerance.
  expect(Number(profile?.rate)).toBeCloseTo(5 / 30, 3);
  expect(profile?.interests).toEqual([pickA.id, pickB.id]);

  const { data: shelf } = await a
    .from('profile_courses')
    .select('course_id, position, courses!inner(topic_id)')
    .eq('user_id', userId)
    .order('position', { ascending: true });
  expect((shelf ?? []).length).toBe(4); // 2 topics × 2 starter courses
  // First 2 rows belong to pickA's topic, next 2 to pickB's.
  const topicSeq = (shelf ?? []).map((r: any) => r.courses.topic_id);
  expect(topicSeq.slice(0, 2).every((t) => t === pickA.id)).toBe(true);
  expect(topicSeq.slice(2, 4).every((t) => t === pickB.id)).toBe(true);

  // 8. /home shows exactly 2 rails (one per picked topic).
  // The DOM uses data-testid="topic-rail-{id}" per components/home/TopicRail.tsx.
  await expect(page.getByTestId(`topic-rail-${pickA.id}`)).toBeVisible();
  await expect(page.getByTestId(`topic-rail-${pickB.id}`)).toBeVisible();
  // A topic NOT picked should not have a rail.
  const unpicked = presets.find((t) => t.id !== pickA.id && t.id !== pickB.id)!;
  await expect(page.getByTestId(`topic-rail-${unpicked.id}`)).toHaveCount(0);
});

test('onboarding: 0-pick path writes empty interests and no shelf rows', async ({
  page,
}) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();
  const userId = await devUserId();
  await resetForOnboarding(userId);

  await page.goto('/onboarding');
  await page.getByTestId('deal-cta').click();
  await expect(page.getByTestId('topics-cta')).toHaveText('skip for now →');

  await Promise.all([
    page.waitForURL('**/home', { timeout: 10_000 }),
    page.getByTestId('topics-cta').click(),
  ]);

  const a = admin();
  const { data: profile } = await a
    .from('profiles')
    .select('interests, onboarded')
    .eq('id', userId)
    .single();
  expect(profile?.onboarded).toBe(true);
  expect(profile?.interests).toEqual([]);

  const { count } = await a
    .from('profile_courses')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  expect(count).toBe(0);
});
