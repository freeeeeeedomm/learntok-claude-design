import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';

// Dev-only shortcut: creates (or resets) a fixed dev user, wipes their profile
// to a post-onboarded state (onboarded: true so /home renders directly), and
// signs them in via cookie so subsequent requests from the same context are
// authed. Never enabled in production.

const DEV_EMAIL = 'dev@learntok.local';
const DEV_PASSWORD = 'devlogin-ChangeMe-2025';

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
      email_confirm: true, // skip email confirmation
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    userId = data.user?.id;
  } else {
    // Re-set password in case it rotated; ensures login works idempotently.
    await admin.auth.admin.updateUserById(userId, { password: DEV_PASSWORD });
  }

  if (!userId) {
    return NextResponse.json({ error: 'could_not_provision_user' }, { status: 500 });
  }

  // The 5 preset topic UUIDs from supabase/seed.sql.
  const PRESET_TOPIC_IDS = [
    '10000000-0000-0000-0000-000000000001', // Physics
    '10000000-0000-0000-0000-000000000002', // Biology
    '10000000-0000-0000-0000-000000000003', // Economics
    '10000000-0000-0000-0000-000000000004', // Math
    '10000000-0000-0000-0000-000000000005', // Programming
  ];

  // The 10 preset starter course UUIDs from supabase/seed.sql (2 per topic).
  const PRESET_STARTER_COURSE_IDS = [
    '20000000-0000-0000-0000-000000000011', // Physics — Forces & Newton's Laws
    '20000000-0000-0000-0000-000000000012', // Physics — Motion & Energy
    '20000000-0000-0000-0000-000000000021', // Biology — Cell Structure
    '20000000-0000-0000-0000-000000000022', // Biology — Cell Organelles
    '20000000-0000-0000-0000-000000000031', // Economics — Intro to Economics
    '20000000-0000-0000-0000-000000000032', // Economics — Supply & Demand
    '20000000-0000-0000-0000-000000000041', // Math — Intro to Limits
    '20000000-0000-0000-0000-000000000042', // Math — Algebra Basics
    '20000000-0000-0000-0000-000000000051', // Programming — Intro to CS (Python)
    '20000000-0000-0000-0000-000000000052', // Programming — Algorithms
  ];

  // Reset profile to a known post-onboarded state so /home renders without
  // a detour through /onboarding. interests holds preset topic UUIDs (the
  // new contract), and profile_courses is re-seeded with all preset starter
  // courses so every preset topic rail shows 2 courses.
  await admin
    .from('profiles')
    .update({
      onboarded: true,
      display_name: 'sam',
      interests: PRESET_TOPIC_IDS,
      rate: 1.0,
      streak: 0,
      last_study_date: null,
    })
    .eq('id', userId);

  // Re-seed the dev user's shelf.
  await admin.from('profile_courses').delete().eq('user_id', userId);
  await admin.from('profile_courses').insert(
    PRESET_STARTER_COURSE_IDS.map((course_id, position) => ({
      user_id: userId,
      course_id,
      position,
    })),
  );

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

  return NextResponse.json({ email: DEV_EMAIL, password: DEV_PASSWORD });
}
