import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NibsHandle } from '@/components/characters/NibsHandle';

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

  const [coursesRes, lessonsRes, progressRes] = await Promise.all([
    supabase
      .from('courses')
      .select('id, title, topic, icon, is_preset, created_at')
      // presets first, then user's own in creation order
      .order('is_preset', { ascending: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('lessons')
      .select('id, course_id, position, title, duration_seconds')
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

  // Group lessons by course, preserving position order.
  const lessonsByCourse = new Map<
    string,
    Array<{ id: string; title: string; duration_seconds: number; done: boolean }>
  >();
  for (const l of lessons) {
    const arr = lessonsByCourse.get(l.course_id) ?? [];
    arr.push({
      id: l.id,
      title: l.title,
      duration_seconds: l.duration_seconds,
      done: doneIds.has(l.id),
    });
    lessonsByCourse.set(l.course_id, arr);
  }

  // "Continue" course: first (by listed order) that has an undone lesson.
  let continueCard: {
    courseId: string;
    courseTitle: string;
    total: number;
    done: number;
    nextId: string;
    nextTitle: string;
    nextDur: number;
  } | null = null;
  for (const c of courses) {
    const ls = lessonsByCourse.get(c.id) ?? [];
    if (ls.length === 0) continue;
    const next = ls.find((l) => !l.done);
    if (!next) continue;
    continueCard = {
      courseId: c.id,
      courseTitle: c.title,
      total: ls.length,
      done: ls.filter((l) => l.done).length,
      nextId: next.id,
      nextTitle: next.title,
      nextDur: next.duration_seconds,
    };
    break;
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
            className="card card-hl mt-16"
            style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
            data-testid="home-continue-card"
          >
            <div className="eyebrow">continue</div>
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
          {courses.map((c) => {
            const ls = lessonsByCourse.get(c.id) ?? [];
            const done = ls.filter((l) => l.done).length;
            return (
              <a
                key={c.id}
                href={`/course/${c.id}`}
                className="lesson-row"
                style={{ textDecoration: 'none', color: 'inherit' }}
                data-testid={`home-course-${c.id}`}
              >
                <div className="thumb">{c.icon ?? '📚'}</div>
                <div className="grow col">
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.title}</div>
                  <div className="body" style={{ fontSize: 11 }}>
                    {done}/{ls.length} lessons{c.topic ? ` · ${c.topic}` : ''}
                  </div>
                </div>
                <div style={{ color: 'var(--ink-mute)' }}>›</div>
              </a>
            );
          })}
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

      <NibsHandle />
    </main>
  );
}
