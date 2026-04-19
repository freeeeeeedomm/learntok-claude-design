'use client';

import { useMemo, useState } from 'react';
import { VideoCard, type AdminVideo } from './VideoCard';

const ALL = '__all__';

export function AdminPoolView({
  categories,
  videos,
}: {
  categories: Array<{ slug: string; display_order: number }>;
  videos: AdminVideo[];
}) {
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(
    () => (activeCat === ALL ? videos : videos.filter((v) => v.category === activeCat)),
    [videos, activeCat]
  );

  const countByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of videos) m.set(v.category, (m.get(v.category) ?? 0) + 1);
    return m;
  }, [videos]);

  return (
    <div className="col gap-16 mt-16">
      <div
        className="row gap-8"
        style={{ overflowX: 'auto', paddingBottom: 4 }}
        data-testid="admin-category-tabs"
      >
        <CategoryTab
          slug={ALL}
          label={`全部 ${videos.length}`}
          active={activeCat === ALL}
          onClick={() => setActiveCat(ALL)}
        />
        {categories.map((c) => (
          <CategoryTab
            key={c.slug}
            slug={c.slug}
            label={`${c.slug} ${countByCat.get(c.slug) ?? 0}`}
            active={activeCat === c.slug}
            onClick={() => setActiveCat(c.slug)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div
          className="card body"
          style={{ color: 'var(--ink-mute)', textAlign: 'center' }}
          data-testid="admin-empty"
        >
          no videos in this category yet. run{' '}
          <code>npm run scrape:tiktok</code> to populate.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 12,
          }}
          data-testid="admin-video-grid"
        >
          {filtered.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              expanded={expandedId === v.id}
              onToggleExpand={() => setExpandedId(expandedId === v.id ? null : v.id)}
            />
          ))}
        </div>
      )}

      <div
        className="body"
        style={{ fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center' }}
      >
        💡 池子腻了？本地跑 <code>npm run scrape:tiktok</code> 补货。
      </div>
    </div>
  );
}

function CategoryTab({
  slug,
  label,
  active,
  onClick,
}: {
  slug: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn ${active ? 'btn-primary' : 'btn-ghost'}`}
      style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap', flexShrink: 0 }}
      data-testid={`admin-tab-${slug}`}
    >
      {label}
    </button>
  );
}
