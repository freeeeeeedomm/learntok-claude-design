// Renders one Netflix-style horizontal rail for a single topic.
// Each course in the topic becomes a card; tapping the card navigates to
// /course/{id}. Pure presentational — all data is grouped server-side in
// app/home/page.tsx and passed in as props.
//
// The rail title links into /topic/<id> so the user can reach the
// CRUD-enabled topic detail page (Add course, Organize, ⋯ rename/delete)
// directly from home. The empty-state copy also points there so a topic
// with zero courses still has a discoverable add affordance.
import Link from 'next/link';
import { RailCourseCard } from './RailCourseCard';

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

export function TopicRail({ topic, courses, lessonsByCourse }: Props) {
  // Aggregate counts across the topic's courses for the rail-title meta.
  const allLessons = courses.flatMap((c) => lessonsByCourse.get(c.id) ?? []);
  const totalLessons = allLessons.length;
  const doneLessons = allLessons.filter((l) => l.done).length;

  return (
    <section data-testid={`topic-rail-${topic.id}`}>
      <div className="rail-title">
        <Link
          href={`/topic/${topic.id}`}
          className="rt"
          data-testid={`rail-title-${topic.id}`}
          style={{ textDecoration: 'none' }}
        >
          {topic.title}
        </Link>
        <span className="rm">
          {courses.length} {courses.length === 1 ? 'course' : 'courses'}
          {totalLessons > 0 ? ` · ${doneLessons}/${totalLessons} done` : ''}
        </span>
      </div>

      {courses.length === 0 ? (
        <Link
          href={`/topic/${topic.id}`}
          className="rail-empty"
          data-testid={`rail-empty-${topic.id}`}
          style={{ textDecoration: 'none', display: 'block' }}
        >
          no courses yet — tap to add one
        </Link>
      ) : (
        <div className="rail">
          {courses.map((c) => (
            <RailCourseCard
              key={c.id}
              course={{ id: c.id, title: c.title }}
              lessons={lessonsByCourse.get(c.id) ?? []}
            />
          ))}
        </div>
      )}
    </section>
  );
}
