'use client';

import { useState } from 'react';
import { VideoCard, type AdminVideo } from './VideoCard';
import { AdminSwipeView } from './AdminSwipeView';
import { NewVideoForm } from './NewVideoForm';

export function CategoryView({
  initialVideos,
  categoryLabel,
  slug,
}: {
  initialVideos: AdminVideo[];
  categoryLabel: string;
  /** Single-category page passes the slug; /admin/all passes null */
  slug: string | null;
}) {
  const [videos, setVideos] = useState<AdminVideo[]>(initialVideos);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [swipeMode, setSwipeMode] = useState(false);

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
      if (!res.ok) reinsert();
    } catch {
      reinsert();
    } finally {
      setDeletingIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  };

  const onAddVideo = (newVideo: AdminVideo) => {
    setVideos((vs) => [newVideo, ...vs]);
  };

  if (swipeMode) {
    return (
      <AdminSwipeView
        vids={videos}
        categoryLabel={categoryLabel}
        onExit={() => setSwipeMode(false)}
        onCommitDelete={onDelete}
      />
    );
  }

  return (
    <div className="col gap-16 mt-16">
      {slug && <NewVideoForm category={slug} onAdded={onAddVideo} />}

      <div
        className="row"
        style={{ justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div className="body" style={{ color: 'var(--ink-mute)', fontSize: 12 }}>
          {categoryLabel} · {videos.length} 条
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setSwipeMode(true)}
          disabled={videos.length === 0}
          data-testid="admin-review-enter"
          style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
        >
          🎬 审一遍
        </button>
      </div>

      {videos.length === 0 ? (
        <div
          className="card body"
          style={{ color: 'var(--ink-mute)', textAlign: 'center' }}
          data-testid="admin-empty"
        >
          {slug
            ? '这个分类还没视频,贴 URL 加几条'
            : '池子是空的,跑 npm run scrape:tiktok 补货'}
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
          {videos.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              expanded={expandedId === v.id}
              onToggleExpand={() =>
                setExpandedId(expandedId === v.id ? null : v.id)
              }
              onDelete={() => onDelete(v.id)}
              deleting={deletingIds.has(v.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
