import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AddCourseButton } from '@/components/discover/AddCourseButton';
import { CourseLectureSection } from '@/components/course/CourseLectureSection';

function fmtBank(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s.toString().padStart(2, '0')}s` : `${m}m`;
}

type Params = { params: { id: string } };

export default async function CoursePage({ params }: Params) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [courseRes, profileRes, shelfRes] = await Promise.all([
    supabase
      .from('courses')
      .select('id, title, topic_id, icon, owner_id')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('jar_balance_cached')
      .eq('id', user.id)
      .single(),
    supabase
      .from('profile_courses')
      .select('course_id')
      .eq('user_id', user.id)
      .eq('course_id', params.id)
      .maybeSingle(),
  ]);

  // RLS hides non-visible courses → maybeSingle returns null.
  if (!courseRes.data) redirect('/home');
  const course = courseRes.data;
  const inShelf = !!shelfRes.data;
  const ownsCourse = course.owner_id === user.id;

  // If this course belongs to a topic, fetch the topic metadata for the
  // breadcrumb + back-link destination.
  let topicMeta: { id: string; title: string; icon: string | null } | null = null;
  if (course.topic_id) {
    const { data: t } = await supabase
      .from('topics')
      .select('id, title, icon')
      .eq('id', course.topic_id)
      .maybeSingle();
    if (t) topicMeta = { id: t.id, title: t.title, icon: t.icon };
  }

  const [lessonsRes, progressRes] = await Promise.all([
    supabase
      .from('lessons')
      .select('id, position, title, duration_seconds, yt_id')
      .eq('course_id', course.id)
      .order('position', { ascending: true }),
    supabase
      .from('lesson_progress')
      .select('lesson_id, completed_at')
      .eq('user_id', user.id),
  ]);

  const lessons = lessonsRes.data ?? [];
  const doneIds = new Set(
    (progressRes.data ?? [])
      .filter((p) => p.completed_at)
      .map((p) => p.lesson_id)
  );

  const totalDone = lessons.filter((l) => doneIds.has(l.id)).length;

  return (
    <main className="app">
      <div className="topbar">
        <a
          href={topicMeta ? `/topic/${topicMeta.id}` : '/home'}
          className="back"
          data-testid="course-back"
        >
          ‹
        </a>
        <a
          href="/progress"
          className="jar-chip"
          data-testid="course-jar-chip"
        >
          <span className="jar-dot" />
          {fmtBank(profileRes.data?.jar_balance_cached ?? 0)}
        </a>
      </div>

      <div className="pad pad-top" style={{ paddingTop: 80 }}>
        {topicMeta && (
          <div className="eyebrow">
            {topicMeta.icon ?? ''} {topicMeta.title}
          </div>
        )}
        <div
          className="row between aic mt-4"
          style={{ gap: 12 }}
        >
          <div className="display" style={{ fontSize: 28 }}>
            {course.title}
          </div>
          <AddCourseButton
            courseId={course.id}
            initialInShelf={inShelf}
            variant="inline"
          />
        </div>
        <div className="body mt-4" style={{ fontSize: 12 }}>
          {lessons.length} lesson{lessons.length === 1 ? '' : 's'} · {totalDone}/
          {lessons.length} done
        </div>
        <div className="bar mt-12">
          <i
            style={{
              width: `${
                lessons.length === 0
                  ? 0
                  : Math.round((totalDone / lessons.length) * 100)
              }%`,
            }}
          />
        </div>

        <CourseLectureSection
          courseId={course.id}
          ownsCourse={ownsCourse}
          lectures={lessons.map((l) => ({
            id: l.id,
            title: l.title,
            yt_id: l.yt_id,
            duration_seconds: l.duration_seconds,
          }))}
        />

        {lessons.length === 0 && (
          <div className="body" style={{ padding: 24, textAlign: 'center' }}>
            no lessons in this course yet.
          </div>
        )}
      </div>
    </main>
  );
}
