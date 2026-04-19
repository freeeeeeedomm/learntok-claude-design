import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function fmtBank(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s.toString().padStart(2, '0')}s` : `${m}m`;
}

export default async function TopicPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('jar_balance_cached, onboarded')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarded) redirect('/onboarding');

  const { data: topic } = await supabase
    .from('topics')
    .select('id, title, icon, color')
    .eq('id', params.id)
    .single();
  if (!topic) notFound();

  const [coursesRes, lessonsRes, progressRes] = await Promise.all([
    supabase
      .from('courses')
      .select('id, title, icon, position')
      .eq('topic_id', params.id)
      .order('position', { ascending: true }),
    supabase
      .from('lessons')
      .select('id, course_id, yt_id, position')
      .order('position', { ascending: true }),
    supabase
      .from('lesson_progress')
      .select('lesson_id, completed_at')
      .eq('user_id', user.id),
  ]);

  const courses = coursesRes.data ?? [];
  const lessons = lessonsRes.data ?? [];
  const progress = progressRes.data ?? [];
  const doneIds = new Set(
    progress.filter((p) => p.completed_at).map((p) => p.lesson_id)
  );

  const lessonsByCourse = new Map<
    string,
    Array<{ id: string; yt_id: string; done: boolean }>
  >();
  for (const l of lessons) {
    const arr = lessonsByCourse.get(l.course_id) ?? [];
    arr.push({ id: l.id, yt_id: l.yt_id, done: doneIds.has(l.id) });
    lessonsByCourse.set(l.course_id, arr);
  }

  return (
    <main className="app">
      <div className="topbar">
        <a href="/home" className="back" data-testid="topic-back">
          ‹
        </a>
        <div className="eyebrow">
          {topic.icon} {topic.title}
        </div>
        <a
          href="/progress"
          className="jar-chip"
          data-testid="topic-jar-chip"
        >
          <span className="jar-dot" />
          {fmtBank(profile?.jar_balance_cached ?? 0)}
        </a>
      </div>

      <div className="pad pad-top" style={{ paddingTop: 80 }}>
        <div className="display" style={{ fontSize: 28 }}>
          {topic.title}
        </div>
        <div className="body mt-4" style={{ fontSize: 13 }}>
          {courses.length} course{courses.length === 1 ? '' : 's'}
        </div>

        <div className="col gap-8 mt-16">
          {courses.map((c) => {
            const ls = lessonsByCourse.get(c.id) ?? [];
            const done = ls.filter((l) => l.done).length;
            const firstYt = ls[0]?.yt_id;
            return (
              <a
                key={c.id}
                href={`/course/${c.id}`}
                className="lesson-row"
                style={{ textDecoration: 'none', color: 'inherit' }}
                data-testid={`topic-course-${c.id}`}
              >
                <div
                  className="thumb"
                  style={
                    firstYt
                      ? {
                          backgroundImage: `url(https://i.ytimg.com/vi/${firstYt}/mqdefault.jpg)`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }
                      : { background: topic.color ?? '#5e6ad2', color: '#fff' }
                  }
                >
                  {firstYt ? '' : c.icon ?? '📚'}
                </div>
                <div className="grow col">
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.title}</div>
                  <div className="body" style={{ fontSize: 11 }}>
                    {done}/{ls.length} lessons
                  </div>
                </div>
                <div style={{ color: 'var(--ink-mute)' }}>›</div>
              </a>
            );
          })}
          {courses.length === 0 && (
            <div className="card" data-testid="topic-empty">
              <div className="body">no courses yet under this topic.</div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
