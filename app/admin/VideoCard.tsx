'use client';

import { VideoEmbed } from '@/components/feed/VideoEmbed';

export interface AdminVideo {
  id: string;
  video_id: string;
  source: 'tiktok' | 'youtube';
  category: string;
  title: string | null;
  author: string | null;
  thumbnail_url: string | null;
}

export function VideoCard({
  video,
  expanded,
  onToggleExpand,
  onDelete,
  deleting,
}: {
  video: AdminVideo;
  expanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div
      className="card col gap-8"
      style={{
        padding: 8,
        position: 'relative',
        opacity: deleting ? 0.4 : 1,
        pointerEvents: deleting ? 'none' : 'auto',
      }}
      data-testid={`admin-video-card-${video.video_id}`}
    >
      <div
        style={{
          aspectRatio: '9 / 16',
          background: 'var(--bg-2)',
          borderRadius: 8,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {expanded ? (
          <VideoEmbed source={video.source} videoId={video.video_id} fillHeight />
        ) : video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail_url}
            alt={video.title ?? video.video_id}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            className="row aic jc"
            style={{
              width: '100%',
              height: '100%',
              color: 'var(--ink-mute)',
              fontSize: 11,
            }}
          >
            no thumbnail
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
        {video.title ?? video.video_id}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
        {video.author ? `@${video.author}` : video.category}
      </div>
      <div className="row gap-8">
        <button
          type="button"
          className="btn btn-ghost"
          style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
          onClick={onToggleExpand}
          data-testid={`admin-video-preview-${video.video_id}`}
        >
          {expanded ? 'close' : '👁 preview'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{
            fontSize: 12,
            padding: '6px 10px',
            color: 'var(--bad)',
          }}
          onClick={onDelete}
          disabled={deleting}
          data-testid={`admin-video-delete-${video.video_id}`}
          aria-label="delete video"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
