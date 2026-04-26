import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';

// Dev-only shortcut: creates (or resets) a fixed dev user, wipes their profile
// to a post-onboarded state (onboarded: true so /home renders directly), and
// signs them in via cookie so subsequent requests from the same context are
// authed. Never enabled in production.

const DEV_EMAIL = 'dev@learntok.local';
const DEV_PASSWORD = 'devlogin-ChangeMe-2025';

const TOPICS_PER_GROUP = 2;
const COURSES_PER_TOPIC = 3;

export async function POST() {
  if (process.env.NEXT_PUBLIC_DEV_PANEL !== 'true') {
    return NextResponse.json({ error: 'dev_panel_disabled' }, { status: 403 });
  }

  const admin = adminClient();

  // Find or create the dev user. listUsers returns up to 50 by default; the
  // dev user is the only one we ever hit here so that's fine for local use.
  const { data: list } = await admin.auth.admin.listUsers();
  let userId = list?.users?.find((u) => u.email === DEV_EMAIL)?.id;

  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
      email_confirm: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    userId = data.user?.id;
  } else {
    await admin.auth.admin.updateUserById(userId, { password: DEV_PASSWORD });
  }

  if (!userId) {
    return NextResponse.json({ error: 'could_not_provision_user' }, { status: 500 });
  }

  // Re-derive starter topics + courses using the same W4 rule as
  // completeOnboarding: pick all 5 preset groups, take top-2 topics per group
  // (sorted by topic position), then top-3 courses per topic. Result:
  //   2 × 5 = 10 topic rails on home
  //   3 × 10 = 30 starter courses on the shelf
  const { data: groups } = await admin
    .from('topic_groups')
    .select('id, position')
    .eq('is_preset', true)
    .order('position', { ascending: true });

  const groupIds = (groups ?? []).map((g) => g.id);
  let pickedTopicIds: string[] = [];
  let starterCourseIds: string[] = [];

  if (groupIds.length > 0) {
    const { data: topicsData } = await admin
      .from('topics')
      .select('id, group_id, position')
      .eq('is_preset', true)
      .in('group_id', groupIds)
      .order('position', { ascending: true });

    const topicsByGroup = new Map<string, { id: string; position: number }[]>();
    for (const t of topicsData ?? []) {
      if (!t.group_id) continue;
      const arr = topicsByGroup.get(t.group_id) ?? [];
      arr.push({ id: t.id, position: t.position });
      topicsByGroup.set(t.group_id, arr);
    }
    for (const gid of groupIds) {
      const list = topicsByGroup.get(gid) ?? [];
      for (const t of list.slice(0, TOPICS_PER_GROUP)) pickedTopicIds.push(t.id);
    }

    if (pickedTopicIds.length > 0) {
      const { data: coursesData } = await admin
        .from('courses')
        .select('id, topic_id, position')
        .eq('is_preset', true)
        .in('topic_id', pickedTopicIds)
        .order('position', { ascending: true });

      const coursesByTopic = new Map<string, { id: string; position: number }[]>();
      for (const c of coursesData ?? []) {
        if (!c.topic_id) continue;
        const arr = coursesByTopic.get(c.topic_id) ?? [];
        arr.push({ id: c.id, position: c.position });
        coursesByTopic.set(c.topic_id, arr);
      }
      for (const tid of pickedTopicIds) {
        const list = coursesByTopic.get(tid) ?? [];
        for (const c of list.slice(0, COURSES_PER_TOPIC)) starterCourseIds.push(c.id);
      }
    }
  }

  // Reset profile to a known post-onboarded state so /home renders without
  // a detour through /onboarding.
  await admin
    .from('profiles')
    .update({
      onboarded: true,
      display_name: 'sam',
      interests: pickedTopicIds,
      rate: 1.0,
      streak: 0,
      last_study_date: null,
    })
    .eq('id', userId);

  // Re-seed the dev user's shelf.
  await admin.from('profile_courses').delete().eq('user_id', userId);
  if (starterCourseIds.length > 0) {
    await admin.from('profile_courses').insert(
      starterCourseIds.map((course_id, position) => ({
        user_id: userId,
        course_id,
        position,
      })),
    );
  }

  // Wipe ledger and re-insert the welcome gift so the jar shows 5 min again.
  await admin.from('ledger_entries').delete().eq('user_id', userId);
  await admin.from('ledger_entries').insert({
    user_id: userId,
    delta_seconds: 300,
    label: 'welcome_gift',
  });

  // Sign the dev user in server-side so the response sets the @supabase/ssr
  // auth cookie. Used by Playwright E2E tests; no-op for any caller that
  // ignores Set-Cookie headers.
  const { createServerClient } = await import('@supabase/ssr');
  const { cookies } = await import('next/headers');
  const cookieStore = cookies();
  const ssr = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => cookieStore.get(n)?.value,
        set: (n: string, v: string, o: any) => {
          try { cookieStore.set({ name: n, value: v, ...o }); } catch {}
        },
        remove: (n: string, o: any) => {
          try { cookieStore.set({ name: n, value: '', ...o }); } catch {}
        },
      },
    }
  );
  const { error: signInError } = await ssr.auth.signInWithPassword({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
  });
  if (signInError) {
    return NextResponse.json({ error: signInError.message }, { status: 500 });
  }

  return NextResponse.json({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
    seededTopics: pickedTopicIds.length,
    seededCourses: starterCourseIds.length,
  });
}
