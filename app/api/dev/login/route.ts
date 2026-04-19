import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';

// Dev-only shortcut: creates (or resets) a fixed dev user, wipes their profile
// to pre-onboarded state, and returns the credentials so the client can
// sign in with password. Never enabled in production.

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

  // Reset profile to pre-onboarded state.
  await admin
    .from('profiles')
    .update({
      onboarded: false,
      interests: [],
      rate: 1.0,
      streak: 0,
      last_study_date: null,
    })
    .eq('id', userId);

  // Wipe ledger and re-insert the welcome gift so the jar shows 5 min again.
  await admin.from('ledger_entries').delete().eq('user_id', userId);
  await admin.from('ledger_entries').insert({
    user_id: userId,
    delta_seconds: 300,
    label: 'welcome_gift',
  });

  return NextResponse.json({ email: DEV_EMAIL, password: DEV_PASSWORD });
}
