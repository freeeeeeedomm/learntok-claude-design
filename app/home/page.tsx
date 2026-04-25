import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TopicRail } from '@/components/home/TopicRail';

function fmtBank(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s.toString().padStart(2, '0')}s` : `${m}m`;
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

  // Stage 1: topics (filtered by interests) and shelf (with courses joined).
  const [topicsRes, shelfRes] = await Promise.all([
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
  ]);

  const topics = topicsRes.data ?? [];

  // Flatten the shelf join into the same shape the rest of this function expects.
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

  // Stage 2: lessons (only for shelf courses) + progress.
  const [lessonsRes, progressRes] = await Promise.all([
    shelfCourseIds.length > 0
      ? supabase
          .from('lessons')
          .select('id, course_id, position, title, duration_seconds, yt_id')
          .in('course_id', shelfCourseIds)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [] as Array<{
          id: string; course_id: string; position: number;
          title: string; duration_seconds: number; yt_id: string;
        }>, error: null }),
    supabase
      .from('lesson_progress')
      .select('lesson_id, completed_at')
      .eq('user_id', user.id),
  ]);

  const lessons = lessonsRes.data ?? [];
  const progress = progressRes.data ?? [];
  const doneIds = new Set(
    progress.filter((p) => p.completed_at).map((p) => p.lesson_id)
  );

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
  // course has an undone lesson. Deep enough: one level of topic, one course.
  let continueCard: {
    topicId: string;
    topicTitle: string;
    courseTitle: string;
    total: number;
    done: number;
    nextId: string;
    nextTitle: string;
    nextDur: number;
  } | null = null;

  outer: for (const t of topics) {
    const courseList = coursesByTopic.get(t.id) ?? [];
    for (const c of courseList) {
      const ls = lessonsByCourse.get(c.id) ?? [];
      if (ls.length === 0) continue;
      const next = ls.find((l) => !l.done);
      if (!next) continue;
      continueCard = {
        topicId: t.id,
        topicTitle: t.title,
        courseTitle: c.title,
        total: ls.length,
        done: ls.filter((l) => l.done).length,
        nextId: next.id,
        nextTitle: next.title,
        nextDur: next.duration_seconds,
      };
      break outer;
    }
  }

  const weekday = new Date()
    .toLocaleDateString('en', { weekday: 'long' })
    .toLowerCase();

  return (
    <main className="app">
      <div className="pad">
        <div className="row between aic">
          <div>
            <div className="eyebrow">
              {weekday} · 🔥 {profile?.streak ?? 0}
            </div>
            <div className="display mt-4" style={{ fontSize: 30 }}>
              hey, {profile?.display_name ?? 'friend'}
            </div>
          </div>
          <a
            href="/progress"
            className="jar-chip"
            data-testid="home-jar-chip"
          >
            <span className="jar-dot" />
            {fmtBank(profile?.jar_balance_cached ?? 0)}
          </a>
        </div>

        {continueCard && (
          <a
            href={`/lesson/${continueCard.nextId}`}
            className="card hero-card mt-16"
            style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
            data-testid="home-continue-card"
          >
            <div className="hero-angel" aria-hidden />
            <div className="eyebrow" style={{ color: 'var(--ink)', fontWeight: 600 }}>
              continue · {continueCard.topicTitle}
            </div>
            <div className="display mt-4" style={{ fontSize: 22 }}>
              {continueCard.courseTitle}
            </div>
            <div className="bar mt-12">
              <i
                style={{
                  width: `${Math.round(
                    (continueCard.done / continueCard.total) * 100
                  )}%`,
                }}
              />
            </div>
            <div className="body mt-8" style={{ fontSize: 12 }}>
              up next · {continueCard.nextTitle}
              {continueCard.nextDur > 0
                ? ` · ${Math.floor(continueCard.nextDur / 60)}m`
                : ''}
            </div>
          </a>
        )}

        <div className="eyebrow mt-24">your topics</div>
        <div className="col mt-8">
          {topics.map((t) => (
            <TopicRail
              key={t.id}
              topic={{ id: t.id, title: t.title }}
              courses={(coursesByTopic.get(t.id) ?? []).map((c) => ({
                id: c.id,
                title: c.title,
              }))}
              lessonsByCourse={lessonsByCourse}
            />
          ))}
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
