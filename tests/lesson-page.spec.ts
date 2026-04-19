import { test, expect } from '@playwright/test';
import { admin, anyPresetLessonId } from './helpers/session';

test('lesson page: renders chrome and mark-done writes progress', async ({ page }) => {
  // 1. Auth via dev login — cookie is attached to the page's context.
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();
  const { email } = await loginRes.json();

  const a = admin();
  const { data: users } = await a.auth.admin.listUsers();
  const userId = users.users.find((u) => u.email === email)!.id;

  const lessonId = await anyPresetLessonId();

  // Clear prior progress for THIS lesson only, so a separate test that
  // may have populated progress for other lessons doesn't get wiped.
  await a
    .from('lesson_progress')
    .delete()
    .eq('user_id', userId)
    .eq('lesson_id', lessonId);

  // 2. Navigate.
  await page.goto(`/lesson/${lessonId}`);

  // 3. Wait for the iframe + mark-done button to appear (session start resolved).
  await expect(page.locator('iframe')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('jar-chip')).toBeVisible();
  await expect(page.getByTestId('mark-done')).toBeEnabled({ timeout: 10_000 });

  // 4. Click mark-done → should land on /home (or /onboarding since the dev
  //    user has onboarded=false and app/home/page.tsx redirects non-onboarded
  //    users to /onboarding). Either destination proves the navigation fired
  //    and mark-done worked; the DB assertion below is the real check.
  await page.getByTestId('mark-done').click();
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 10_000 });

  // 5. DB verification: lesson_progress row exists with completed_at set.
  const { data: row } = await a
    .from('lesson_progress')
    .select('completed_at')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .single();
  expect(row?.completed_at).toBeTruthy();
});
