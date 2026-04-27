import Link from 'next/link';
import { LucideIcon } from './LucideIcon';
import { ImportButton } from './ImportButton';

/**
 * One preset-topic card on /discover. The wrapper still links into the
 * preset's course list (`/discover/topic/<presetId>`), but the corner
 * CTA flips between two states:
 *
 *  - Not yet imported → <ImportButton> ("+ add to home"), which deep-
 *    copies the topic onto the user's shelf and routes to /topic/<new>.
 *  - Already imported → an "Open" link to /topic/<ownerTopicId>, the
 *    user's owner-owned copy.
 *
 * `ownerTopicId` is non-null iff this preset has already been imported
 * by the current user. The Discover page computes that by querying
 * `topics where owner_id = me and source_topic_id is not null`.
 */
export function TopicTile({
  id,
  title,
  icon,
  courseCount,
  ownerTopicId,
}: {
  id: string;
  title: string;
  icon: string | null;
  courseCount: number;
  ownerTopicId: string | null;
}) {
  const imported = ownerTopicId !== null;

  return (
    <Link
      href={`/discover/topic/${id}`}
      className="topic-tile"
      data-testid={`discover-topic-${id}`}
    >
      <div className="topic-tile-icon"><LucideIcon name={icon} size={32} /></div>
      <div className="topic-tile-title">{title}</div>
      <div className="topic-tile-sub">{courseCount} {courseCount === 1 ? 'course' : 'courses'}</div>

      <div
        className="topic-tile-cta"
        style={{
          position: 'absolute',
          top: 8,
          right: 10,
        }}
      >
        {imported ? (
          <a
            href={`/topic/${ownerTopicId}`}
            data-testid={`discover-topic-${id}-open`}
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid var(--line)',
              background: 'var(--bg-2)',
              color: 'var(--ink)',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              textDecoration: 'none',
            }}
          >
            open
          </a>
        ) : (
          <ImportButton presetTopicId={id} />
        )}
      </div>
    </Link>
  );
}
