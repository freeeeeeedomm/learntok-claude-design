'use client';

import { useState } from 'react';
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
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  video: AdminVideo;
  expanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  deleting: boolean;
  /** When true, the whole card is a selection target; expand/delete buttons hide */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  // Try the proxy first (always fresh), fall back to the stored signed
  // URL (may be expired), then give up and show a neutral placeholder.
  const proxyUrl =
    video.source === 'tiktok'
      ? `/api/admin/video-pool/thumbnail/${video.video_id}`
      : null;
  const [imgSrc, setImgSrc] = useState<string | null>(
    proxyUrl ?? video.thumbnail_url
  );
  const [fellBack, setFellBack] = useState(false);

  const handleImgError = () => {
    if (!fellBack && proxyUrl && video.thumbnail_url) {
      setImgSrc(video.thumbnail_url);
      setFellBack(true);
      return;
    }
    setImgSrc(null);
  };

  return (
    <div
      className="card col gap-8"
      onClick={selectMode ? onToggleSelect : undefined}
      style={{
        padding: 8,
        position: 'relative',
        opacity: deleting ? 0.4 : 1,
        pointerEvents: deleting ? 'none' : 'auto',
        cursor: selectMode ? 'pointer' : 'default',
        outline: selectMode && selected ? '2px solid var(--accent)' : 'none',
        outlineOffset: -2,
      }}
      data-testid={`admin-video-card-${video.video_id}`}
      data-selected={selectMode && selected ? 'true' : undefined}
    >
      {selectMode && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            width: 24,
            height: 24,
            borderRadius: 4,
            background: selected ? 'var(--accent)' : 'rgba(255,255,255,0.85)',
            border: '2px solid var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#000',
            fontSize: 14,
            fontWeight: 700,
            zIndex: 2,
            pointerEvents: 'none',
          }}
        >
          {selected ? '✓' : ''}
        </div>
      )}
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
        ) : imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt={video.author ? `@${video.author}` : video.video_id}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={handleImgError}
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
      <div
        style={{
          fontSize: 12,
          color: 'var(--ink)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {video.author ? `@${video.author}` : '—'}
      </div>
      {!selectMode && (
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
      )}
    </div>
  );
}
