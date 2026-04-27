import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';
import { devLoginAndOnboard } from './helpers';

const PRESET_TOPIC_TITLE = 'Physics';

/**
 * Wipe any owner-owned topic the dev user previously imported from
 * the named preset. Lets the test start from a clean slate so the
 * "Add to home" button is the visible CTA. Cleans up dependent rows
 * (courses + lessons) so the unique index doesn't trip a re-run.
 */
async function clearImported(presetTopicId: string, userId: string) {
  const a = admin();
  const { data: owned } = await a
    .from('topics')
    .select('id')
    .eq('owner_id', userId)
    .eq('source_topic_id', presetTopicId);
  for (const t of owned ?? []) {
    const { data: courses } = await a
      .from('courses')
      .select('id')
      .eq('topic_id', t.id);
    for (const c of courses ?? []) {
      await a.from('lessons').delete().eq('course_id', c.id);
    }
    await a.from('courses').delete().eq('topic_id', t.id);
    await a.from('topics').delete().eq('id', t.id);
  }
}

async function devUserId(): Promise<string> {
  const a = admin();
  const { data } = await a.auth.admin.listUsers();
  const dev = data.users.find((u) => u.email === 'dev@learntok.local');
  expect(dev, 'dev user must exist (run /api/dev/login first)').toBeTruthy();
  return dev!.id;
}

test('Add to home → topic page → Discover shows Open', async ({ page }) => {
  await devLoginAndOnboard(page);
  const a = admin();

  const { data: preset } = await a
    .from('topics')
    .select('id, title')
    .eq('is_preset', true)
    .eq('title', PRESET_TOPIC_TITLE)
    .single();
  expect(preset, `seed must contain a preset topic titled "${PRESET_TOPIC_TITLE}"`).toBeTruthy();

  const userId = await devUserId();
  await clearImported(preset!.id, userId);

  await page.goto('/discover');
  // Before import: the "+ add to home" CTA is the only one for this card.
  await expect(
    page.getByTestId(`discover-topic-${preset!.id}-add`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`discover-topic-${preset!.id}-open`),
  ).toHaveCount(0);

  await page.getByTestId(`discover-topic-${preset!.id}-add`).click();
  // Lands on the user's new topic page.
  await page.waitForURL(/\/topic\/[\w-]+$/);

  // Re-open Discover; CTA should now be Open.
  await page.goto('/discover');
  await expect(
    page.getByTestId(`discover-topic-${preset!.id}-open`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`discover-topic-${preset!.id}-add`),
  ).toHaveCount(0);

  // Verify the deep-copy in DB: owner topic + its courses each carry a
  // non-null source_*_id pointing back to the preset.
  const { data: ownerTopic } = await a
    .from('topics')
    .select('id, source_topic_id')
    .eq('owner_id', userId)
    .eq('source_topic_id', preset!.id)
    .single();
  expect(ownerTopic).toBeTruthy();

  const { data: ownerCourses } = await a
    .from('courses')
    .select('id, source_course_id')
    .eq('owner_id', userId)
    .eq('topic_id', ownerTopic!.id);
  expect((ownerCourses ?? []).length).toBeGreaterThan(0);
  for (const c of ownerCourses ?? []) {
    expect(c.source_course_id).toBeTruthy();
  }
});

test('Add to home twice fails (unique index)', async ({ page }) => {
  await devLoginAndOnboard(page);
  const a = admin();

  const { data: preset } = await a
    .from('topics')
    .select('id')
    .eq('is_preset', true)
    .eq('title', PRESET_TOPIC_TITLE)
    .single();
  expect(preset).toBeTruthy();

  const userId = await devUserId();
  await clearImported(preset!.id, userId);

  // First import via UI.
  await page.goto('/discover');
  await page.getByTestId(`discover-topic-${preset!.id}-add`).click();
  await page.waitForURL(/\/topic\/[\w-]+$/);

  // Going back to Discover, the button is now Open — so double-import via
  // UI is impossible. Confirm by attempting it server-side via admin client
  // (simulating a stale UI):
  const { error } = await a.from('topics').insert({
    owner_id: userId,
    is_preset: false,
    title: 'X',
    source_topic_id: preset!.id,
  });
  expect(error).toBeTruthy();
  expect(error?.code).toBe('23505'); // unique_violation
});
