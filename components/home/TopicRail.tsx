// Renders one Netflix-style horizontal rail for a single topic.
// Each course in the topic becomes a card; tapping the card navigates to
// /course/{id}. Pure presentational — all data is grouped server-side in
// app/home/page.tsx and passed in as props.
import Link from 'next/link';

type LessonLite = {
  id: string;
  title: string;
  duration_seconds: number;
  yt_id: string;
  done: boolean;
};

type CourseLite = {
  id: string;
  title: string;
};

type TopicLite = {
  id: string;
  title: string;
};

type Props = {
  topic: TopicLite;
  courses: CourseLite[];
  lessonsByCourse: Map<string, LessonLite[]>;
};

function fmtMin(totalSeconds: number): string {
  if (totalSeconds <= 0) return '';
  const m = Math.max(1, Math.round(totalSeconds / 60));
  return `${m} min`;
}

export function TopicRail({ topic, courses, lessonsByCourse }: Props) {
  // Aggregate counts across the topic's courses for the rail-title meta.
  const allLessons = courses.flatMap((c) => lessonsByCourse.get(c.id) ?? []);
  const totalLessons = allLessons.length;
  const doneLessons = allLessons.filter((l) => l.done).length;

  return (
    <section data-testid={`topic-rail-${topic.id}`}>
      <div className="rail-title">
        <span className="rt">{topic.title}</span>
        <span className="rm">
          {courses.length} {courses.length === 1 ? 'course' : 'courses'}
          {totalLessons > 0 ? ` · ${doneLessons}/${totalLessons} done` : ''}
        </span>
      </div>

      {courses.length === 0 ? (
        <div className="rail-empty">no courses yet — paste a YouTube link below</div>
      ) : (
        <div className="rail">
          {courses.map((c) => {
            const ls = lessonsByCourse.get(c.id) ?? [];
            const done = ls.filter((l) => l.done).length;
            const total = ls.length;
            const totalSeconds = ls.reduce((sum, l) => sum + (l.duration_seconds ?? 0), 0);
            const firstYt = ls.find((l) => l.yt_id)?.yt_id ?? null;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;

            return (
              <Link key={c.id} href={`/course/${c.id}`} className="rail-card">
                <div
                  className="rail-thumb"
                  style={
                    firstYt
                      ? { backgroundImage: `url(https://i.ytimg.com/vi/${firstYt}/mqdefault.jpg)` }
                      : undefined
                  }
                >
                  {totalSeconds > 0 && <span className="dur">{fmtMin(totalSeconds)}</span>}
                </div>
                <div className="rail-t">{c.title}</div>
                <div className="rail-meta">
                  {total === 0 ? '0 lessons' : `${total} lessons${done > 0 ? ` · ${done} done` : ''}`}
                </div>
                {total > 0 && (
                  <div className="rail-bar">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
