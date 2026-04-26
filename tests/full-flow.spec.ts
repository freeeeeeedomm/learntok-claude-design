import { test, expect } from '@playwright/test';
import { admin } from './helpers/session';

const DEV_EMAIL = 'dev@learntok.local';

// End-to-end exercise of the onboarding → home → discover → add-course path.
// Uses /api/dev/login-onboarding to start each run from a clean pre-onboarding
// state so the test is idempotent across reruns.
//
// Picks specific groups + verifies derivation details (top-2 topics × top-3
// courses per group) so a regression in completeOnboarding's logic, the seed
// catalog, or the home filter would all be caught here.

test('full flow: dev test login → onboarding → home rails → discover → add course → home updates', async ({
  page,
}) => {
  // 1. Reset dev user + sign in via the new test-login endpoint.
  const loginRes = await page.request.post('/api/dev/login-onboarding');
  expect(loginRes.ok(), 'dev login-onboarding must succeed').toBeTruthy();
  const loginBody = await loginRes.json();
  expect(loginBody.redirect).toBe('/onboarding');

  const a = admin();
  const { data: userList } = await a.auth.admin.listUsers();
  const userId = userList.users.find((u) => u.email === DEV_EMAIL)!.id;
  expect(userId, 'dev user must exist').toBeTruthy();

  // 2. Confirm we're at the rest-slider step.
  // The dev login-onboarding route resets rate=1.0 → rateToRestMinutes(1) = 60.
  await page.goto('/onboarding');
  await expect(page.getByTestId('onboarding-page-deal')).toBeVisible();
  await expect(page.getByTestId('deal-rest-min')).toHaveText('60 min');
  await expect(page.getByTestId('deal-mood')).toHaveText('playtime');

  // 3. Drag slider to 15 min rest ⇒ "focused" mood (per moodLabel thresholds).
  await page.getByTestId('deal-slider').fill('15');
  await expect(page.getByTestId('deal-rest-min')).toHaveText('15 min');
  await expect(page.getByTestId('deal-mood')).toHaveText('focused');

  // 4. Advance to the group-picker step.
  await page.getByTestId('deal-cta').click();
  await expect(page.getByTestId('onboarding-page-topics')).toBeVisible();

  // 5. Verify all 5 preset groups render with their subtitles.
  const expectedGroups: { key: string; title: string; minTopicCount: number }[] = [
    { key: 'finance',    title: '经济金融', minTopicCount: 3 },
    { key: 'humanities', title: '人文历史', minTopicCount: 4 },
    { key: 'stem',       title: '理工',     minTopicCount: 6 },
    { key: 'math',       title: '数学',     minTopicCount: 9 },
    { key: 'cs',         title: '编程',     minTopicCount: 2 },
  ];
  for (const g of expectedGroups) {
    const tile = page.getByTestId(`group-tile-${g.key}`);
    await expect(tile, `group chip "${g.key}" should be visible`).toBeVisible();
    await expect(tile).toContainText(g.title);
    const subtitle = page.getByTestId(`group-tile-${g.key}-subtitle`);
    // Format is "title · N 学科"; just check the count is at least the seed minimum.
    const subtitleText = (await subtitle.textContent()) ?? '';
    const m = subtitleText.match(/·\s*(\d+)\s*学科/);
    expect(m, `subtitle "${subtitleText}" must match "·  N 学科"`).toBeTruthy();
    expect(parseInt(m![1], 10)).toBeGreaterThanOrEqual(g.minTopicCount);
  }

  // 6. Pick stem + cs (non-adjacent, validates pick-order preservation).
  await page.getByTestId('group-tile-stem').click();
  await page.getByTestId('group-tile-cs').click();
  await expect(page.getByTestId('topics-cta')).toHaveText('continue (2 picked) →');

  // 7. Submit → should land on /home.
  const navHome = page.waitForURL('**/home', { timeout: 15_000 });
  await page.getByTestId('topics-cta').click();
  await navHome;

  // 8. Verify the DB writes match the W4 derivation rule.
  // Pull preset groups, then top-2 topics per picked group by ascending position.
  const { data: pickedGroups } = await a
    .from('topic_groups')
    .select('id, key')
    .eq('is_preset', true)
    .in('key', ['stem', 'cs']);
  expect(pickedGroups?.length).toBe(2);
  const groupIdByKey = new Map(pickedGroups!.map((g) => [g.key!, g.id]));
  const orderedGroupIds = ['stem', 'cs'].map((k) => groupIdByKey.get(k)!);

  const { data: derivedTopics } = await a
    .from('topics')
    .select('id, group_id, position')
    .eq('is_preset', true)
    .in('group_id', orderedGroupIds)
    .order('position', { ascending: true });
  const topicsByGroup = new Map<string, { id: string; position: number }[]>();
  for (const t of derivedTopics ?? []) {
    if (!t.group_id) continue;
    const arr = topicsByGroup.get(t.group_id) ?? [];
    arr.push({ id: t.id, position: t.position });
    topicsByGroup.set(t.group_id, arr);
  }
  const expectedTopicIds: string[] = [];
  for (const gid of orderedGroupIds) {
    for (const t of (topicsByGroup.get(gid) ?? []).slice(0, 2)) expectedTopicIds.push(t.id);
  }
  expect(expectedTopicIds.length).toBe(4); // 2 groups × 2 topics

  const { data: profile } = await a
    .from('profiles')
    .select('rate, interests, onboarded')
    .eq('id', userId)
    .single();
  expect(profile?.onboarded).toBe(true);
  // Slider was dragged to 15 → rate = 15 / 60 = 0.25.
  expect(Number(profile?.rate)).toBeCloseTo(15 / 60, 3);
  expect(profile?.interests).toEqual(expectedTopicIds);

  // Expected shelf size = sum of min(3, courses_in_topic) over picked topics.
  // Some topics have <3 preset courses (e.g. Computer Science has 2), so the
  // straight 4×3 multiplication isn't a safe assumption.
  const { data: pickedCoursesAll } = await a
    .from('courses')
    .select('topic_id, position')
    .eq('is_preset', true)
    .in('topic_id', expectedTopicIds)
    .order('position', { ascending: true });
  const coursesPerTopic = new Map<string, number>();
  for (const c of pickedCoursesAll ?? []) {
    if (!c.topic_id) continue;
    coursesPerTopic.set(c.topic_id, (coursesPerTopic.get(c.topic_id) ?? 0) + 1);
  }
  const expectedShelfSize = expectedTopicIds.reduce(
    (sum, tid) => sum + Math.min(3, coursesPerTopic.get(tid) ?? 0),
    0,
  );

  const { data: shelf } = await a
    .from('profile_courses')
    .select('course_id, position, courses!inner(topic_id)')
    .eq('user_id', userId)
    .order('position', { ascending: true });
  expect((shelf ?? []).length).toBe(expectedShelfSize);

  // 9. /home renders one rail per derived topic.
  for (const tid of expectedTopicIds) {
    await expect(page.getByTestId(`topic-rail-${tid}`)).toBeVisible();
  }

  // 10. Tap the "+ browse" header link → /discover.
  await page.getByTestId('home-browse-link').click();
  await page.waitForURL('**/discover');
  // 5 group sections all render.
  for (const g of expectedGroups) {
    await expect(page.getByTestId(`discover-group-${g.key}`)).toBeVisible();
  }

  // 11. Find a topic NOT in interests so we can verify auto-add.
  // "humanities" wasn't picked, take its first topic.
  const { data: humanitiesGroup } = await a
    .from('topic_groups')
    .select('id')
    .eq('key', 'humanities')
    .single();
  const { data: humTopics } = await a
    .from('topics')
    .select('id, position')
    .eq('group_id', humanitiesGroup!.id)
    .eq('is_preset', true)
    .order('position', { ascending: true })
    .limit(1);
  const newTopicId = humTopics![0].id;
  expect(profile?.interests).not.toContain(newTopicId);

  await page.getByTestId(`discover-topic-${newTopicId}`).click();
  await page.waitForURL(`**/discover/topic/${newTopicId}`);

  // 12. Pick the first preset course in this topic and add it.
  const { data: humCourses } = await a
    .from('courses')
    .select('id, position')
    .eq('topic_id', newTopicId)
    .eq('is_preset', true)
    .order('position', { ascending: true })
    .limit(1);
  const newCourseId = humCourses![0].id;

  const addBtn = page.getByTestId(`shelf-toggle-${newCourseId}`);
  await expect(addBtn).toContainText('add');
  await addBtn.click();
  await expect(addBtn).toContainText('in library', { timeout: 5_000 });

  // 13. Verify the action wrote both the shelf row AND auto-added the topic.
  await expect.poll(async () => {
    const { count } = await a
      .from('profile_courses')
      .select('course_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('course_id', newCourseId);
    return count;
  }, { timeout: 5_000 }).toBe(1);

  const { data: profileAfter } = await a
    .from('profiles')
    .select('interests')
    .eq('id', userId)
    .single();
  expect(profileAfter?.interests).toContain(newTopicId);

  // 14. Go back to /home → the new topic rail should appear.
  await page.goto('/home');
  await expect(page.getByTestId(`topic-rail-${newTopicId}`)).toBeVisible();

  // 15. Open the new course → header has the inline shelf toggle in "in library" state.
  await page.goto(`/course/${newCourseId}`);
  const inlineToggle = page.getByTestId(`shelf-toggle-${newCourseId}`);
  await expect(inlineToggle).toContainText('in library');

  // 16. Toggle off → rail stays (interests not auto-pruned per spec).
  await inlineToggle.click();
  await expect(inlineToggle).toContainText('add', { timeout: 5_000 });
  await page.goto('/home');
  await expect(page.getByTestId(`topic-rail-${newTopicId}`)).toBeVisible();
});
