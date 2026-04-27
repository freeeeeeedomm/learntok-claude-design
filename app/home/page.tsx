import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StatsHero } from '@/components/home/StatsHero';
import { ContinueRow } from '@/components/home/ContinueRow';
import { HomeTopicSection } from '@/components/home/HomeTopicSection';

// UTC-day-start for "today". A user in UTC+8 will see "today" reset at 8 AM
// local — documented limitation in the spec; acceptable v1 trade-off.
function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function sumPositive(rows: { delta_seconds: number }[] | null): number {
  return (rows ?? []).filter((r) => r.delta_seconds > 0).reduce((s, r) => s + r.delta_seconds, 0);
}
function sumNegative(rows: { delta_seconds: number }[] | null): number {
  return (rows ?? []).filter((r) => r.delta_seconds < 0).reduce((s, r) => s + Math.abs(r.delta_seconds), 0);
}

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, streak, jar_balance_cached, onboarded')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarded) redirect('/onboarding');

  const todayISO = startOfTodayUTC().toISOString();

  // Hard-cutover: Home reads ONLY owner-owned topics + their owner-owned
  // courses. Every existing user's preset shelf has been deep-copied into
  // owner-owned rows by the library-personalize backfill, and that backfill
  // also drops legacy `profile_courses` rows pointing at preset courses —
  // there's no longer a profile_courses-driven shelf path here.
  const [topicsRes, progressRes, todayRes] = await Promise.all([
    supabase
      .from('topics')
      .select('id, title, icon, color, position, is_preset, owner_id')
      .eq('owner_id', user.id)
      .order('position', { ascending: true }),
    supabase
      .from('lesson_progress')
      .select('lesson_id, completed_at')
      .eq('user_id', user.id),
    supabase
      .from('ledger_entries')
      .select('delta_seconds')
      .eq('user_id', user.id)
      .gte('created_at', todayISO),
  ]);

  const topics = topicsRes.data ?? [];
  const topicIds = topics.map((t) => t.id);

  // Stage 2: courses under those topics. Owner_id check is redundant
  // (parent topic is already owner-scoped) but keeps RLS-style intent
  // explicit and protects against future schema drift.
  const coursesRes = topicIds.length > 0
    ? await supabase
        .from('courses')
        .select('id, topic_id, title, icon, position, is_preset')
        .in('topic_id', topicIds)
        .eq('owner_id', user.id)
        .order('position', { ascending: true })
    : { data: [] as Array<{
        id: string; topic_id: string | null; title: string;
        icon: string | null; position: number; is_preset: boolean;
      }>, error: null };

  const courses = coursesRes.data ?? [];

  const shelfCourseIds = courses.map((c) => c.id);

  // Stage 2: lessons — only fetched for courses on the user's shelf.
  const lessonsRes = shelfCourseIds.length > 0
    ? await supabase
        .from('lessons')
        .select('id, course_id, position, title, duration_seconds, yt_id')
        .in('course_id', shelfCourseIds)
        .order('position', { ascending: true })
    : { data: [] as Array<{
        id: string; course_id: string; position: number;
        title: string; duration_seconds: number; yt_id: string;
      }>, error: null };

  const lessons = lessonsRes.data ?? [];
  const progress = progressRes.data ?? [];
  const doneIds = new Set(
    progress.filter((p) => p.completed_at).map((p) => p.lesson_id)
  );

  const earnedToday = sumPositive(todayRes.data);
  const spentToday = sumNegative(todayRes.data);

  // Group lessons by course.
  const lessonsByCourse = new Map<
    string,
    Array<{ id: string; title: string; duration_seconds: number; yt_id: string; done: boolean }>
  >();
  for (const l of lessons) {
    const arr = lessonsByCourse.get(l.course_id) ?? [];
    arr.push({
      id: l.id,
      title: l.title,
      duration_seconds: l.duration_seconds,
      yt_id: l.yt_id,
      done: doneIds.has(l.id),
    });
    lessonsByCourse.set(l.course_id, arr);
  }

  // Group courses by topic. HomeTopicSection takes the lighter {id, title} shape.
  const coursesByTopic = new Map<string, Array<{ id: string; title: string }>>();
  for (const c of courses) {
    if (!c.topic_id) continue;
    const arr = coursesByTopic.get(c.topic_id) ?? [];
    arr.push({ id: c.id, title: c.title });
    coursesByTopic.set(c.topic_id, arr);
  }

  // Continue card: walk topics in order, find the first topic whose first
  // course has an undone lesson. Same logic as before — the result feeds
  // <ContinueRow> instead of being rendered inline.
  let continueCard: {
    topicTitle: string;
    courseTitle: string;
    nextLessonId: string;
    nextLessonDurSec: number;
    ytId: string | null;
    donePct: number;
  } | null = null;

  outer: for (const t of topics) {
    const courseList = coursesByTopic.get(t.id) ?? [];
    for (const c of courseList) {
      const ls = lessonsByCourse.get(c.id) ?? [];
      if (ls.length === 0) continue;
      const next = ls.find((l) => !l.done);
      if (!next) continue;
      const done = ls.filter((l) => l.done).length;
      continueCard = {
        topicTitle: t.title,
        courseTitle: c.title,
        nextLessonId: next.id,
        nextLessonDurSec: next.duration_seconds,
        ytId: next.yt_id || null,
        donePct: Math.round((done / ls.length) * 100),
      };
      break outer;
    }
  }

  return (
    <main className="app">
      <div className="pad">
        <StatsHero
          balance={profile?.jar_balance_cached ?? 0}
          streak={profile?.streak ?? 0}
          earnedToday={earnedToday}
          spentToday={spentToday}
        />

        {continueCard && (
          <>
            <div className="eyebrow mt-24" data-testid="home-continue-eyebrow">
              continue learning
            </div>
            <ContinueRow
              topicTitle={continueCard.topicTitle}
              courseTitle={continueCard.courseTitle}
              nextLessonId={continueCard.nextLessonId}
              nextLessonDurSec={continueCard.nextLessonDurSec}
              ytId={continueCard.ytId}
              donePct={continueCard.donePct}
            />
          </>
        )}

        <HomeTopicSection
          topics={topics.map((t) => ({ id: t.id, title: t.title }))}
          coursesByTopic={coursesByTopic}
          lessonsByCourse={lessonsByCourse}
        />
      </div>
    </main>
  );
}
