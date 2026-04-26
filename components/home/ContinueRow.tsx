// Compact continue-learning row. Replaces the big Continue+angel card.
// The whole row is an <a> that navigates to the next undone lesson.
import Link from 'next/link';

type Props = {
  topicTitle: string;
  courseTitle: string;
  nextLessonId: string;
  nextLessonDurSec: number; // 0 if unknown
  ytId: string | null;
  donePct: number; // 0-100
};

export function ContinueRow({
  topicTitle,
  courseTitle,
  nextLessonId,
  nextLessonDurSec,
  ytId,
  donePct,
}: Props) {
  const nextMin = nextLessonDurSec > 0 ? Math.floor(nextLessonDurSec / 60) : 0;

  return (
    <Link
      href={`/lesson/${nextLessonId}`}
      className="continue-row"
      data-testid="home-continue-row"
    >
      <div
        className="continue-thumb"
        style={
          ytId
            ? { backgroundImage: `url(https://i.ytimg.com/vi/${ytId}/mqdefault.jpg)` }
            : undefined
        }
        aria-hidden
      />
      <div className="continue-meta">
        <div className="continue-eyebrow">{topicTitle}</div>
        <div className="continue-title">{courseTitle}</div>
        <div className="continue-progress">
          <div className="bar">
            <i style={{ width: `${donePct}%` }} />
          </div>
          <span>
            {donePct}%{nextMin > 0 ? ` · next ${nextMin}m` : ''}
          </span>
        </div>
      </div>
      <span className="chev" aria-hidden>›</span>
    </Link>
  );
}
