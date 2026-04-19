import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ProgressView } from './ProgressView';

export const dynamic = 'force-dynamic';

export default async function ProgressPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('jar_balance_cached, streak, rate, onboarded')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarded) redirect('/onboarding');

  // "today" = since UTC midnight. Close enough for a dashboard; timezone polish deferred.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [ledgerRes, courseRes, lessonsRes, progressRes] = await Promise.all([
    supabase
      .from('ledger_entries')
      .select('id, delta_seconds, label, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('courses')
      .select('id, title, topic, icon, is_preset, created_at')
      .order('is_preset', { ascending: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('lessons')
      .select('id, course_id')
      .order('position', { ascending: true }),
    supabase
      .from('lesson_progress')
      .select('lesson_id, completed_at')
      .eq('user_id', user.id),
  ]);

  const ledger = ledgerRes.data ?? [];
  const courses = courseRes.data ?? [];
  const lessons = lessonsRes.data ?? [];
  const progress = progressRes.data ?? [];
  const doneIds = new Set(
    progress.filter((p) => p.completed_at).map((p) => p.lesson_id)
  );

  // Aggregate today's earned / spent from the ledger.
  const startTs = startOfDay.getTime();
  const todayEntries = ledger.filter(
    (e) => new Date(e.created_at).getTime() >= startTs
  );
  const earnedToday = todayEntries
    .filter((e) => e.delta_seconds > 0)
    .reduce((a, e) => a + e.delta_seconds, 0);
  const spentToday = todayEntries
    .filter((e) => e.delta_seconds < 0)
    .reduce((a, e) => a + Math.abs(e.delta_seconds), 0);

  // Per-course lesson counts.
  const countByCourse = new Map<string, { total: number; done: number }>();
  for (const l of lessons) {
    const row = countByCourse.get(l.course_id) ?? { total: 0, done: 0 };
    row.total += 1;
    if (doneIds.has(l.id)) row.done += 1;
    countByCourse.set(l.course_id, row);
  }

  const courseRows = courses.map((c) => {
    const row = countByCourse.get(c.id) ?? { total: 0, done: 0 };
    return {
      id: c.id,
      title: c.title,
      topic: c.topic ?? '',
      icon: c.icon ?? '📚',
      total: row.total,
      done: row.done,
    };
  });

  return (
    <ProgressView
      balance={profile.jar_balance_cached}
      streak={profile.streak ?? 0}
      rate={profile.rate ?? 1.0}
      earnedToday={earnedToday}
      spentToday={spentToday}
      ledger={ledger.map((e) => ({
        id: e.id,
        label: e.label,
        delta: e.delta_seconds,
        createdAt: e.created_at,
      }))}
      courses={courseRows}
    />
  );
}
