'use client';

import { useState } from 'react';
import { VideoCard, type AdminVideo } from './VideoCard';
import { AdminSwipeView } from './AdminSwipeView';
import { NewVideoForm } from './NewVideoForm';
import { CategoryManageBar } from './CategoryManageBar';

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

  // Multi-select (bulk hard-delete) state. Per-row delete below stays soft.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

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

  const enterSelectMode = () => {
    setSelectMode(true);
    setSelectedIds(new Set());
    setExpandedId(null);
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(videos.map((v) => v.id)));
  };

  const bulkDelete = async () => {
    if (bulkDeleting || selectedIds.size === 0) return;
    if (
      !confirm(`要硬删 ${selectedIds.size} 条?这是不可恢复的。`)
    ) {
      return;
    }
    setBulkDeleting(true);
    const ids = [...selectedIds];
    const snapshot = videos;
    setVideos((vs) => vs.filter((v) => !selectedIds.has(v.id)));
    try {
      const res = await fetch('/api/admin/video-pool/bulk-delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        // Surface the actual error so we can debug instead of silently
        // swallowing it. Restore the optimistic UI removal too.
        const text = await res.text().catch(() => '');
        // eslint-disable-next-line no-console
        console.error('bulk-delete failed', res.status, text);
        setVideos(snapshot);
        alert(`批量删除失败 (${res.status}): ${text || '未知错误'}`);
        return;
      }
      exitSelectMode();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('bulk-delete network error', e);
      setVideos(snapshot);
      alert('网络出错');
    } finally {
      setBulkDeleting(false);
    }
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
    <div className="col gap-16 mt-16" style={{ paddingBottom: selectMode ? 80 : 0 }}>
      {slug && !selectMode && (
        <CategoryManageBar slug={slug} videoCount={videos.length} />
      )}
      {slug && !selectMode && <NewVideoForm category={slug} onAdded={onAddVideo} />}

      <div
        className="row"
        style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
      >
        <div className="body" style={{ color: 'var(--ink-mute)', fontSize: 12 }}>
          {selectMode
            ? `已选 ${selectedIds.size} / ${videos.length}`
            : `${categoryLabel} · ${videos.length} 条`}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {selectMode ? (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={selectAll}
                disabled={videos.length === 0}
                data-testid="admin-select-all"
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                全选
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={exitSelectMode}
                data-testid="admin-select-cancel"
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                取消
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={enterSelectMode}
                disabled={videos.length === 0}
                data-testid="admin-select-enter"
                style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
              >
                ☑ 选择
              </button>
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
            </>
          )}
        </div>
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
              selectMode={selectMode}
              selected={selectedIds.has(v.id)}
              onToggleSelect={() => toggleSelect(v.id)}
            />
          ))}
        </div>
      )}

      {selectMode && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            padding: 12,
            background: 'var(--bg)',
            borderTop: '1px solid var(--bg-2)',
            display: 'flex',
            gap: 12,
            justifyContent: 'space-between',
            alignItems: 'center',
            // Above BottomNav (z-index 40) and any other fixed admin chrome
            zIndex: 50,
          }}
          data-testid="admin-bulk-delete-bar"
        >
          <div style={{ fontSize: 13 }}>
            已选 <strong>{selectedIds.size}</strong> 条
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={bulkDelete}
            disabled={bulkDeleting || selectedIds.size === 0}
            data-testid="admin-bulk-delete-submit"
            style={{
              fontSize: 13,
              padding: '8px 16px',
              background: 'var(--bad)',
              color: '#fff',
            }}
          >
            {bulkDeleting ? '正在删除...' : `🗑 删除 ${selectedIds.size} 条`}
          </button>
        </div>
      )}
    </div>
  );
}
