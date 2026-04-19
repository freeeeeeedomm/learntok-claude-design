import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NibsHandle } from '@/components/characters/NibsHandle';

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

  const [courseRes, profileRes] = await Promise.all([
    supabase
      .from('courses')
      .select('id, title, topic, icon')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('jar_balance_cached')
      .eq('id', user.id)
      .single(),
  ]);

  // RLS hides non-visible courses → maybeSingle returns null.
  if (!courseRes.data) redirect('/home');
  const course = courseRes.data;

  const [lessonsRes, progressRes] = await Promise.all([
    supabase
      .from('lessons')
      .select('id, position, title, duration_seconds')
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

  // "Current" lesson: first undone lesson whose predecessors are all done.
  // Everything else is either `done` or "future".
  let firstUndoneIdx = -1;
  for (let i = 0; i < lessons.length; i++) {
    if (!doneIds.has(lessons[i].id)) {
      firstUndoneIdx = i;
      break;
    }
  }

  return (
    <main className="app">
      <div className="topbar">
        <a href="/home" className="back" data-testid="course-back">
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
        {course.topic && <div className="eyebrow">{course.topic}</div>}
        <div className="display mt-4" style={{ fontSize: 28 }}>
          {course.title}
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

        <div className="col gap-8 mt-24">
          {lessons.map((l, i) => {
            const isDone = doneIds.has(l.id);
            const isCurrent = i === firstUndoneIdx;
            const rowClass = [
              'lesson-row',
              isDone ? 'done' : '',
              isCurrent ? 'current' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <a
                key={l.id}
                href={`/lesson/${l.id}`}
                className={rowClass}
                style={{ textDecoration: 'none', color: 'inherit' }}
                data-testid={`course-lesson-${l.id}`}
              >
                <div
                  className={`check-circle ${isDone ? 'done' : isCurrent ? 'current' : ''}`}
                >
                  {isDone ? '✓' : isCurrent ? '▶' : ''}
                </div>
                <div className="grow col">
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{l.title}</div>
                  <div className="body" style={{ fontSize: 11 }}>
                    {l.duration_seconds > 0
                      ? `${Math.floor(l.duration_seconds / 60)} min`
                      : '—'}
                  </div>
                </div>
                <div className="thumb">YT</div>
              </a>
            );
          })}

          {lessons.length === 0 && (
            <div className="body" style={{ padding: 24, textAlign: 'center' }}>
              no lessons in this course yet.
            </div>
          )}
        </div>
      </div>

      <NibsHandle />
    </main>
  );
}
