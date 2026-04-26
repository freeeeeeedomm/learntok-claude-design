import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';

// Dev-only sibling of /api/dev/login that drops the dev user back into the
// /onboarding flow. Used to test the full onboarding → home → discover path
// end-to-end without needing a fresh email each time.
//
// Differences from /api/dev/login:
// - profiles.onboarded = false   (so middleware lets /onboarding render)
// - profiles.interests = []
// - profile_courses wiped         (no shelf rows; onboarding will populate)
// - lesson_progress wiped         (otherwise old completed lessons stick around)
// - same dev user / same password / same cookie flow

const DEV_EMAIL = 'dev@learntok.local';
const DEV_PASSWORD = 'devlogin-ChangeMe-2025';

export async function POST() {
  if (process.env.NEXT_PUBLIC_DEV_PANEL !== 'true') {
    return NextResponse.json({ error: 'dev_panel_disabled' }, { status: 403 });
  }

  const admin = adminClient();

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

  // Roll user back to a pre-onboarding state.
  await admin
    .from('profiles')
    .update({
      onboarded: false,
      display_name: 'sam',
      interests: [],
      rate: 1.0,
      streak: 0,
      last_study_date: null,
    })
    .eq('id', userId);

  await admin.from('profile_courses').delete().eq('user_id', userId);
  await admin.from('lesson_progress').delete().eq('user_id', userId);

  // Reset ledger to a clean welcome gift so the jar shows 5 min when /home renders.
  await admin.from('ledger_entries').delete().eq('user_id', userId);
  await admin.from('ledger_entries').insert({
    user_id: userId,
    delta_seconds: 300,
    label: 'welcome_gift',
  });

  // Sign the user in via cookie so the redirect to /onboarding hits an authed
  // session immediately.
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
    redirect: '/onboarding',
  });
}
