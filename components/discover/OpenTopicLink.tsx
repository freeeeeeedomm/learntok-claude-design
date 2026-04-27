'use client';

/**
 * Tiny client wrapper for the "open" CTA on imported Discover tiles.
 *
 * Why this exists: TopicTile is a Server Component that wraps the whole
 * card in a `<Link>` to `/discover/topic/<id>`. The CTA must NOT navigate
 * the parent — it points at the user's owner-owned copy at `/topic/<id>`
 * — so it needs `onClick={(e) => e.stopPropagation()}`. Putting an
 * `onClick` on a host element directly inside a Server Component throws
 * "Event handlers cannot be passed to Client Component props" at SSR
 * time, which is what crashed `/discover` in production. Lifting just
 * this `<a>` into its own client component keeps TopicTile a Server
 * Component and unbreaks the page.
 */
export function OpenTopicLink({
  ownerTopicId,
  presetTopicId,
}: {
  ownerTopicId: string;
  presetTopicId: string;
}) {
  return (
    <a
      href={`/topic/${ownerTopicId}`}
      data-testid={`discover-topic-${presetTopicId}-open`}
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
  );
}
