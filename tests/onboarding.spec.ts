import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

const DEV_EMAIL = 'dev@learntok.local';
const TOPICS_PER_GROUP = 2;
const COURSES_PER_TOPIC = 3;

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

type GroupRow = { id: string; key: string; position: number };

async function getPresetGroups(): Promise<GroupRow[]> {
  const a = admin();
  const { data } = await a
    .from('topic_groups')
    .select('id, key, position')
    .eq('is_preset', true)
    .order('position', { ascending: true });
  expect((data ?? []).length, 'seed must contain preset topic_groups').toBeGreaterThan(0);
  return (data ?? []).map((g) => ({ id: g.id, key: g.key ?? '', position: g.position }));
}

async function topTopicsForGroups(groups: GroupRow[]): Promise<string[]> {
  // Mirrors completeOnboarding's derivation: top-2 topics per group by ascending position,
  // walked in user-pick order.
  const a = admin();
  const { data } = await a
    .from('topics')
    .select('id, group_id, position')
    .eq('is_preset', true)
    .in('group_id', groups.map((g) => g.id))
    .order('position', { ascending: true });
  const byGroup = new Map<string, { id: string; position: number }[]>();
  for (const t of data ?? []) {
    if (!t.group_id) continue;
    const arr = byGroup.get(t.group_id) ?? [];
    arr.push({ id: t.id, position: t.position });
    byGroup.set(t.group_id, arr);
  }
  const out: string[] = [];
  for (const g of groups) {
    const list = byGroup.get(g.id) ?? [];
    for (const t of list.slice(0, TOPICS_PER_GROUP)) out.push(t.id);
  }
  return out;
}

test('onboarding: deal page → group page → submit → home shows derived rails', async ({
  page,
}) => {
  // 1. Auth + reset to pre-onboarding state.
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();
  const userId = await devUserId();
  await resetForOnboarding(userId);

  const groups = await getPresetGroups();
  // Pick two non-adjacent groups to verify pick-order is preserved.
  const pickA = groups[0]; // finance
  const pickB = groups[2]; // stem

  // 2. Land on /onboarding. Page 1 (deal) is visible.
  await page.goto('/onboarding');
  await expect(page.getByTestId('onboarding-page-deal')).toBeVisible();
  await expect(page.getByTestId('deal-learn-min')).toHaveText('20 min');
  await expect(page.getByTestId('deal-mood')).toHaveText('balanced');

  // 3. Drag the slider to 30 (focused).
  await page.getByTestId('deal-slider').fill('30');
  await expect(page.getByTestId('deal-learn-min')).toHaveText('30 min');
  await expect(page.getByTestId('deal-mood')).toHaveText('focused');

  // 4. Advance to page 2.
  await page.getByTestId('deal-cta').click();
  await expect(page.getByTestId('onboarding-page-topics')).toBeVisible();
  await expect(page.getByTestId('topics-cta')).toHaveText('skip for now →');

  // 5. Pick two groups (finance then stem).
  await page.getByTestId(`group-tile-${pickA.key}`).click();
  await page.getByTestId(`group-tile-${pickB.key}`).click();
  await expect(page.getByTestId('topics-cta')).toHaveText('continue (2 picked) →');

  // 6. Submit → expect /home.
  const navHome1 = page.waitForURL('**/home', { timeout: 10_000 });
  await page.getByTestId('topics-cta').click();
  await navHome1;

  // 7. Assert DB writes — derive what we expect server-side to have written.
  const expectedTopicIds = await topTopicsForGroups([pickA, pickB]);
  expect(expectedTopicIds.length).toBe(2 * TOPICS_PER_GROUP);

  const a = admin();
  const { data: profile } = await a
    .from('profiles')
    .select('rate, interests, onboarded')
    .eq('id', userId)
    .single();
  expect(profile?.onboarded).toBe(true);
  expect(Number(profile?.rate)).toBeCloseTo(5 / 30, 3);
  expect(profile?.interests).toEqual(expectedTopicIds);

  const { data: shelf } = await a
    .from('profile_courses')
    .select('course_id, position, courses!inner(topic_id)')
    .eq('user_id', userId)
    .order('position', { ascending: true });
  // 2 groups × 2 topics × 3 courses (assuming each topic has ≥3 preset courses, which Khan-seeded topics all do).
  expect((shelf ?? []).length).toBe(2 * TOPICS_PER_GROUP * COURSES_PER_TOPIC);
  // Topic order in the shelf reflects pick order: pickA's topics first, then pickB's.
  const topicSeq = (shelf ?? []).map((r: any) => r.courses.topic_id);
  for (let i = 0; i < TOPICS_PER_GROUP * COURSES_PER_TOPIC; i++) {
    expect(expectedTopicIds.slice(0, TOPICS_PER_GROUP)).toContain(topicSeq[i]);
  }
  for (let i = TOPICS_PER_GROUP * COURSES_PER_TOPIC; i < topicSeq.length; i++) {
    expect(expectedTopicIds.slice(TOPICS_PER_GROUP)).toContain(topicSeq[i]);
  }

  // 8. /home shows rails for each derived topic.
  for (const tid of expectedTopicIds) {
    await expect(page.getByTestId(`topic-rail-${tid}`)).toBeVisible();
  }
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

  const navHome2 = page.waitForURL('**/home', { timeout: 10_000 });
  await page.getByTestId('topics-cta').click();
  await navHome2;

  const a = admin();
  const { data: profile } = await a
    .from('profiles')
    .select('interests, onboarded')
    .eq('id', userId)
    .single();
  expect(profile?.onboarded).toBe(true);
  expect(profile?.interests).toEqual([]);

  const { count, error: countErr } = await a
    .from('profile_courses')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  expect(countErr).toBeNull();
  expect(count).toBe(0);
});
