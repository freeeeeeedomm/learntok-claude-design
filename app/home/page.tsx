import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TopicRail } from '@/components/home/TopicRail';
import { StatsHero } from '@/components/home/StatsHero';
import { ContinueRow } from '@/components/home/ContinueRow';

// UTC-day-start for "today". A user in UTC+8 will see "today" reset at 8 AM
// local — documented limitation in the spec; acceptable v1 trade-off.
function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// ISO week: Monday-start. JS getUTCDay returns 0=Sun..6=Sat; map to 0=Mon..6=Sun.
function startOfWeekUTC(): Date {
  const t = startOfTodayUTC();
  const dayOffsetFromMonday = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayOffsetFromMonday);
  return t;
}

function startOfMonthUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
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
    .select('display_name, streak, jar_balance_cached, onboarded, interests')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarded) redirect('/onboarding');

  const interestIds: string[] = profile?.interests ?? [];
  const todayISO = startOfTodayUTC().toISOString();
  const weekISO = startOfWeekUTC().toISOString();
  const monthISO = startOfMonthUTC().toISOString();

  // Stage 1: everything that doesn't depend on the user's shelf course IDs.
  const [topicsRes, shelfRes, progressRes, todayRes, weekRes, monthRes, totalRes] = await Promise.all([
    interestIds.length > 0
      ? supabase
          .from('topics')
          .select('id, title, icon, color, position, is_preset')
          .in('id', interestIds)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [] as Array<{
          id: string; title: string; icon: string | null;
          color: string | null; position: number; is_preset: boolean;
        }>, error: null }),
    supabase
      .from('profile_courses')
      .select('course_id, position, courses!inner(id, topic_id, title, icon, position, is_preset)')
      .eq('user_id', user.id)
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
    supabase
      .from('ledger_entries')
      .select('delta_seconds')
      .eq('user_id', user.id)
      .gte('created_at', weekISO),
    supabase
      .from('ledger_entries')
      .select('delta_seconds')
      .eq('user_id', user.id)
      .gte('created_at', monthISO),
    supabase
      .from('ledger_entries')
      .select('delta_seconds')
      .eq('user_id', user.id),
  ]);

  const topics = topicsRes.data ?? [];

  // Flatten the shelf join into the shape the rest of this function expects.
  type ShelfRow = {
    course_id: string;
    position: number;
    courses: {
      id: string;
      topic_id: string | null;
      title: string;
      icon: string | null;
      position: number;
      is_preset: boolean;
    };
  };
  const courses = ((shelfRes.data ?? []) as unknown as ShelfRow[]).map((row) => ({
    id: row.courses.id,
    topic_id: row.courses.topic_id,
    title: row.courses.title,
    icon: row.courses.icon,
    position: row.position, // shelf-position, not course.position
    is_preset: row.courses.is_preset,
  }));

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
  const weekSeconds = sumPositive(weekRes.data);
  const monthSeconds = sumPositive(monthRes.data);
  const totalSeconds = sumPositive(totalRes.data);

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

  // Group courses by topic.
  const coursesByTopic = new Map<string, typeof courses>();
  for (const c of courses) {
    if (!c.topic_id) continue;
    const arr = coursesByTopic.get(c.topic_id) ?? [];
    arr.push(c);
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
          weekSeconds={weekSeconds}
          monthSeconds={monthSeconds}
          totalSeconds={totalSeconds}
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

        <div className="row between aic mt-24">
          <div className="eyebrow">your topics</div>
          <a
            href="/discover"
            data-testid="home-browse-link"
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--accent)',
              textDecoration: 'none',
            }}
          >
            + browse
          </a>
        </div>
        <div className="col mt-8">
          {topics.length === 0 ? (
            <a
              href="/discover"
              className="lesson-row mt-12"
              style={{
                borderStyle: 'dashed',
                justifyContent: 'center',
                color: 'var(--accent)',
                textDecoration: 'none',
                gap: 8,
              }}
              data-testid="home-empty-cta"
            >
              <span style={{ fontSize: 16 }}>→</span>
              <span>browse all topics</span>
            </a>
          ) : (
            topics.map((t) => (
              <TopicRail
                key={t.id}
                topic={{ id: t.id, title: t.title }}
                courses={(coursesByTopic.get(t.id) ?? []).map((c) => ({
                  id: c.id,
                  title: c.title,
                }))}
                lessonsByCourse={lessonsByCourse}
              />
            ))
          )}
          <a
            href="/add"
            className="lesson-row mt-12"
            style={{
              borderStyle: 'dashed',
              justifyContent: 'center',
              color: 'var(--ink-soft)',
              textDecoration: 'none',
            }}
            data-testid="home-add-course"
          >
            <span style={{ fontSize: 18 }}>+</span>
            <span>paste YouTube link</span>
          </a>
        </div>
      </div>
    </main>
  );
}
