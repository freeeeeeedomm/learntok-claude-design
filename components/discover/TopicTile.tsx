import Link from 'next/link';
import { LucideIcon } from './LucideIcon';

export function TopicTile({
  id,
  title,
  icon,
  courseCount,
  inLibrary,
}: {
  id: string;
  title: string;
  icon: string | null;
  courseCount: number;
  inLibrary: boolean;
}) {
  return (
    <Link
      href={`/discover/topic/${id}`}
      className="topic-tile"
      data-testid={`discover-topic-${id}`}
    >
      <div className="topic-tile-icon"><LucideIcon name={icon} size={32} /></div>
      <div className="topic-tile-title">{title}</div>
      <div className="topic-tile-sub">{courseCount} {courseCount === 1 ? 'course' : 'courses'}</div>
      {inLibrary && (
        <span
          className="topic-tile-badge"
          data-testid={`discover-topic-${id}-in-library`}
          aria-label="in your library"
        >
          ✓
        </span>
      )}
    </Link>
  );
}
