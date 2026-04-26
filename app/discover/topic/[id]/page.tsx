import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtBank } from '@/lib/format';
import { AddCourseButton } from '@/components/discover/AddCourseButton';
import { LucideIcon } from '@/components/discover/LucideIcon';

type Params = { params: { id: string } };

export default async function DiscoverTopicPage({ params }: Params) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [profileRes, topicRes, coursesRes, shelfRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('jar_balance_cached')
      .eq('id', user.id)
      .single(),
    supabase
      .from('topics')
      .select('id, title, icon, group_id')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('courses')
      .select('id, title, icon, position')
      .eq('topic_id', params.id)
      .eq('is_preset', true)
      .order('position', { ascending: true }),
    supabase
      .from('profile_courses')
      .select('course_id')
      .eq('user_id', user.id),
  ]);

  const topic = topicRes.data;
  if (!topic) redirect('/discover');
  const courses = coursesRes.data ?? [];
  const inShelf = new Set((shelfRes.data ?? []).map((s) => s.course_id));

  // Lesson counts per course (single round-trip — small N).
  const courseIds = courses.map((c) => c.id);
  const lessonsRes = courseIds.length > 0
    ? await supabase
        .from('lessons')
        .select('course_id, duration_seconds')
        .in('course_id', courseIds)
    : { data: [] as Array<{ course_id: string; duration_seconds: number }> };

  const lessonStatsByCourse = new Map<string, { count: number; durSec: number }>();
  for (const l of lessonsRes.data ?? []) {
    const cur = lessonStatsByCourse.get(l.course_id) ?? { count: 0, durSec: 0 };
    cur.count++;
    cur.durSec += l.duration_seconds;
    lessonStatsByCourse.set(l.course_id, cur);
  }

  return (
    <main className="app">
      <div className="topbar">
        <a
          href="/discover"
          className="back"
          data-testid="discover-topic-back"
        >‹</a>
        <a
          href="/progress"
          className="jar-chip"
          data-testid="discover-topic-jar-chip"
        >
          <span className="jar-dot" />
          {fmtBank(profileRes.data?.jar_balance_cached ?? 0)}
        </a>
      </div>

      <div className="pad pad-top" style={{ paddingTop: 80 }}>
        <div className="eyebrow row" style={{ alignItems: 'center', gap: 8 }}>
          <LucideIcon name={topic.icon} size={28} />
          <span>discover</span>
        </div>
        <div className="display mt-4" style={{ fontSize: 28 }}>
          {topic.title}
        </div>
        <div className="body mt-4" style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
          {courses.length} course{courses.length === 1 ? '' : 's'} · tap a card to view lessons
        </div>

        <div className="col gap-8 mt-24">
          {courses.map((c) => {
            const stats = lessonStatsByCourse.get(c.id) ?? { count: 0, durSec: 0 };
            const minutes = stats.durSec > 0 ? Math.round(stats.durSec / 60) : null;
            return (
              <div
                key={c.id}
                className="lesson-row"
                data-testid={`discover-course-${c.id}`}
                style={{ gap: 12 }}
              >
                <a
                  href={`/course/${c.id}`}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    color: 'inherit',
                    textDecoration: 'none',
                  }}
                  data-testid={`discover-course-${c.id}-link`}
                >
                  <span style={{ fontSize: 22 }}>{c.icon ?? '•'}</span>
                  <span className="grow col">
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{c.title}</span>
                    <span className="body" style={{ fontSize: 11 }}>
                      {stats.count} lesson{stats.count === 1 ? '' : 's'}
                      {minutes !== null ? ` · ~${minutes} min` : ''}
                    </span>
                  </span>
                </a>
                <AddCourseButton
                  courseId={c.id}
                  initialInShelf={inShelf.has(c.id)}
                  variant="pill"
                />
              </div>
            );
          })}

          {courses.length === 0 && (
            <div className="body" style={{ padding: 24, textAlign: 'center' }}>
              no preset courses for this topic yet.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
