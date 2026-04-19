import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

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
    .select('display_name, streak, jar_balance_cached, onboarded')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarded) redirect('/onboarding');

  const [topicsRes, coursesRes, lessonsRes, progressRes] = await Promise.all([
    supabase
      .from('topics')
      .select('id, title, icon, color, position, is_preset')
      .order('is_preset', { ascending: false })
      .order('position', { ascending: true }),
    supabase
      .from('courses')
      .select('id, topic_id, title, icon, position, is_preset')
      .order('position', { ascending: true }),
    supabase
      .from('lessons')
      .select('id, course_id, position, title, duration_seconds, yt_id')
      .order('position', { ascending: true }),
    supabase
      .from('lesson_progress')
      .select('lesson_id, completed_at')
      .eq('user_id', user.id),
  ]);

  const topics = topicsRes.data ?? [];
  const courses = coursesRes.data ?? [];
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

  // For each topic: aggregate counts across its courses.
  const topicRows = topics.map((t) => {
    const cs = coursesByTopic.get(t.id) ?? [];
    const allLs = cs.flatMap((c) => lessonsByCourse.get(c.id) ?? []);
    const firstCourse = cs[0];
    const firstYtId = firstCourse
      ? (lessonsByCourse.get(firstCourse.id) ?? [])[0]?.yt_id ?? null
      : null;
    return {
      id: t.id,
      title: t.title,
      icon: t.icon ?? '📚',
      color: t.color ?? '#5e6ad2',
      courseCount: cs.length,
      lessonCount: allLs.length,
      doneCount: allLs.filter((l) => l.done).length,
      firstYtId,
    };
  });

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
            className="card card-hl mt-16"
            style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
            data-testid="home-continue-card"
          >
            <div className="eyebrow">continue · {continueCard.topicTitle}</div>
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
        <div className="col gap-8 mt-8">
          {topicRows.map((t) => (
            <a
              key={t.id}
              href={`/topic/${t.id}`}
              className="lesson-row"
              style={{ textDecoration: 'none', color: 'inherit' }}
              data-testid={`home-topic-${t.id}`}
            >
              <div
                className="thumb"
                style={
                  t.firstYtId
                    ? {
                        backgroundImage: `url(https://i.ytimg.com/vi/${t.firstYtId}/default.jpg)`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                    : { background: t.color, color: '#fff' }
                }
              >
                {t.firstYtId ? '' : t.icon}
              </div>
              <div className="grow col">
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</div>
                <div className="body" style={{ fontSize: 11 }}>
                  {t.courseCount} courses · {t.doneCount}/{t.lessonCount} lessons
                </div>
              </div>
              <div style={{ color: 'var(--ink-mute)' }}>›</div>
            </a>
          ))}
          <a
            href="/add"
            className="lesson-row"
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
