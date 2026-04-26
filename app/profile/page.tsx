import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SettingsSection } from '@/components/profile/SettingsSection';
import { LearningRhythm } from '@/components/profile/LearningRhythm';
import { RecentActivity } from '@/components/profile/RecentActivity';
import { SignOutButton } from '@/components/profile/SignOutButton';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, rate, jar_balance_cached, streak, onboarded')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarded) redirect('/onboarding');

  // Sessions for the rhythm viz: last 30 days, all kinds (learn + feed).
  // We keep the window flexible; the viz toggles between week (last 7) and
  // month (last 30) client-side from the same dataset.
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

  const [sessionsRes, ledgerRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, kind, started_at, ended_at, last_heartbeat_at')
      .eq('user_id', user.id)
      .gte('started_at', thirtyDaysAgo.toISOString())
      .order('started_at', { ascending: true }),
    supabase
      .from('ledger_entries')
      .select('id, delta_seconds, label, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  // Compute duration per session: ended_at if present, else last_heartbeat_at
  // (still-open sessions count up to their last ping). Floor to int seconds.
  const sessions = (sessionsRes.data ?? []).map((s) => {
    const endIso = s.ended_at ?? s.last_heartbeat_at;
    const durSec = Math.max(
      0,
      Math.floor(
        (new Date(endIso).getTime() - new Date(s.started_at).getTime()) / 1000,
      ),
    );
    return {
      id: s.id,
      kind: s.kind as 'learn' | 'feed',
      startedAt: s.started_at,
      durationSec: durSec,
    };
  });

  const ledger = (ledgerRes.data ?? []).map((e) => ({
    id: e.id,
    label: e.label,
    delta: e.delta_seconds,
    createdAt: e.created_at,
  }));

  return (
    <main className="app">
      <div className="topbar">
        <a href="/home" className="back" data-testid="profile-back">
          ‹
        </a>
        <div className="eyebrow">profile</div>
        <div style={{ width: 36 }} />
      </div>

      <div className="pad pad-top" style={{ paddingTop: 80 }} data-testid="profile-page">
        <div className="display" style={{ fontSize: 28 }}>profile</div>

        <SettingsSection
          initialDisplayName={profile.display_name ?? ''}
          initialRate={profile.rate ?? 1.0}
        />

        <LearningRhythm sessions={sessions} />

        <RecentActivity ledger={ledger} />

        <div className="mt-24" style={{ paddingBottom: 32 }}>
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
