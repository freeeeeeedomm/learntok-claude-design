'use client';

import { useMemo, useState } from 'react';
import { VideoCard, type AdminVideo } from './VideoCard';

const ALL = '__all__';

export function AdminPoolView({
  categories,
  videos: initialVideos,
}: {
  categories: Array<{ slug: string; display_order: number }>;
  videos: AdminVideo[];
}) {
  const [videos, setVideos] = useState<AdminVideo[]>(initialVideos);
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () => (activeCat === ALL ? videos : videos.filter((v) => v.category === activeCat)),
    [videos, activeCat]
  );

  const countByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of videos) m.set(v.category, (m.get(v.category) ?? 0) + 1);
    return m;
  }, [videos]);

  const onDelete = async (id: string) => {
    if (deletingIds.has(id)) return;
    const removed = videos.find((v) => v.id === id);
    if (!removed) return;
    setDeletingIds((s) => new Set(s).add(id));

    setVideos((vs) => vs.filter((v) => v.id !== id));

    const reinsert = () =>
      setVideos((cur) => (cur.some((v) => v.id === id) ? cur : [...cur, removed]));

    try {
      const res = await fetch(`/api/admin/video-pool/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });
      if (!res.ok) {
        reinsert();
        // eslint-disable-next-line no-console
        console.error('delete failed', await res.text());
      }
    } catch (e) {
      reinsert();
      // eslint-disable-next-line no-console
      console.error('delete network error', e);
    } finally {
      setDeletingIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  };

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
              onDelete={() => onDelete(v.id)}
              deleting={deletingIds.has(v.id)}
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
