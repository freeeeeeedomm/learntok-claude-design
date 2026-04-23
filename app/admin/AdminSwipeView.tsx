'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VideoEmbed } from '@/components/feed/VideoEmbed';
import type { AdminVideo } from './VideoCard';

export function AdminSwipeView({
  vids,
  categoryLabel,
  onExit,
  onCommitDelete,
}: {
  vids: AdminVideo[];
  categoryLabel: string;
  onExit: () => void;
  onCommitDelete: (id: string) => void;
}) {
  // Fixed snapshot of the list at mount. Denominator of the progress label
  // never changes mid-session — even when we soft-delete, the total stays
  // the same so "N/3" → "N/3" visually, not "N/2".
  const [originalVids] = useState<AdminVideo[]>(vids);

  // ID-based navigation (not index). Using ids avoids off-by-one bugs when
  // we filter out deleted videos from the navigable list.
  const [currentId, setCurrentId] = useState<string | null>(vids[0]?.id ?? null);

  // Committed (3s timer fired) soft-deletes. We track them locally so the
  // deleted video doesn't reappear when the user swipes back — the parent's
  // `videos` prop shrinks asynchronously and we can't rely on it alone.
  // (Task 1 declares the state; Task 3 wires the setter into the commit timer.)
  const [committedIds, setCommittedIds] = useState<Set<string>>(new Set());

  // Pending soft-delete — at most one at a time.
  // (Task 1 declares the shape; the 🗑 button + timer land in Tasks 2-3.)
  const [pendingDelete, setPendingDelete] = useState<{
    video: AdminVideo;
    timerId: ReturnType<typeof setTimeout>;
  } | null>(null);

  const [slideDirection, setSlideDirection] = useState<'none' | 'up' | 'down'>('none');
  const [overlayHidden, setOverlayHidden] = useState(false);

  const lastSwipeRef = useRef(0);
  const pointerStart = useRef<{ y: number; t: number } | null>(null);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingId = pendingDelete?.video.id ?? null;

  // Navigable = originalVids minus pending (temporary) and committed (permanent).
  // Used for swipe navigation and for the current-video lookup.
  const navigable = useMemo(
    () =>
      originalVids.filter(
        (v) => v.id !== pendingId && !committedIds.has(v.id)
      ),
    [originalVids, pendingId, committedIds]
  );

  const current = useMemo<AdminVideo | null>(
    () => navigable.find((v) => v.id === currentId) ?? null,
    [navigable, currentId]
  );

  // End-of-list: currentId doesn't point to anything navigable (either
  // navigable is empty, or we passed the last navigable video).
  const isAtEnd = !current;

  // Progress label uses originalVids for a fixed denominator. When at end,
  // show N/N so the user sees "fully reviewed."
  const progressLabel = useMemo(() => {
    const len = originalVids.length;
    if (len === 0) return `${categoryLabel} · 0/0`;
    if (!current) return `${categoryLabel} · ${len}/${len}`;
    const pos = originalVids.findIndex((v) => v.id === currentId) + 1;
    return `${categoryLabel} · ${pos}/${len}`;
  }, [categoryLabel, originalVids, current, currentId]);

  // Navigation — wheel + pointer. Same throttle + slide pattern as FeedPlayer,
  // but operates on the `navigable` list (skips pending + committed).
  const commitSwipe = useCallback(
    (direction: 1 | -1) => {
      const now = performance.now();
      if (now - lastSwipeRef.current < 800) return; // throttle
      lastSwipeRef.current = now;
      setSlideDirection(direction > 0 ? 'up' : 'down');
      if (slideTimerRef.current) clearTimeout(slideTimerRef.current);
      slideTimerRef.current = setTimeout(() => {
        // Resolve the next currentId from the navigable list.
        if (currentId === null) {
          // At end. Swipe up = go back to last navigable. Swipe down = stay.
          if (direction < 0 && navigable.length > 0) {
            setCurrentId(navigable[navigable.length - 1].id);
          }
        } else {
          const visIdx = navigable.findIndex((v) => v.id === currentId);
          if (visIdx < 0) {
            // currentId no longer in navigable (e.g. someone deleted it
            // between render and this timer). Recover by landing on the
            // first remaining or at end.
            setCurrentId(navigable[0]?.id ?? null);
          } else {
            const next = navigable[visIdx + direction];
            if (next) {
              setCurrentId(next.id);
            } else if (direction > 0) {
              // Past end.
              setCurrentId(null);
            }
            // direction < 0 past start: stay put.
          }
        }
        setSlideDirection('none');
        slideTimerRef.current = null;
      }, 300);
    },
    [navigable, currentId]
  );

  const onOverlayWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (Math.abs(e.deltaY) < 30) return;
      commitSwipe(e.deltaY > 0 ? 1 : -1);
    },
    [commitSwipe]
  );

  const onOverlayPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    pointerStart.current = { y: e.clientY, t: performance.now() };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, []);

  const onOverlayPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = pointerStart.current;
      pointerStart.current = null;
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer may have been cancelled
      }
      if (!start) return;
      const dy = e.clientY - start.y;
      const dt = performance.now() - start.t;

      // Tap = hide overlay for 4 s so the user can tap TikTok's native UI.
      if (Math.abs(dy) < 6 && dt < 250) {
        setOverlayHidden(true);
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = setTimeout(() => setOverlayHidden(false), 4000);
        return;
      }

      // Swipe.
      if (Math.abs(dy) > 50 && dt > 50) {
        commitSwipe(dy < 0 ? 1 : -1);
      }
    },
    [commitSwipe]
  );

  // Unmount cleanup: ensure the tap-hide and slide timers don't fire after
  // the component is gone (avoids setState-on-unmounted warnings).
  useEffect(() => {
    return () => {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      if (slideTimerRef.current) clearTimeout(slideTimerRef.current);
    };
  }, []);

  // Exit with a pending-delete flush (Task 3 will wire commit;
  // in Task 1 pending is always null so this is effectively just onExit).
  const handleExit = () => {
    if (pendingDelete) {
      clearTimeout(pendingDelete.timerId);
      onCommitDelete(pendingDelete.video.id);
      setPendingDelete(null);
    }
    onExit();
  };

  return (
    <div className="feed" data-testid="admin-swipe-view">
      <div
        className={`feed-video ${slideDirection !== 'none' ? `feed-slide-${slideDirection}` : ''}`}
        data-testid="admin-swipe-current"
      >
        {current ? (
          <VideoEmbed source={current.source} videoId={current.video_id} fillHeight />
        ) : null}
      </div>

      {!overlayHidden && current && (
        <div
          className="feed-swipe-overlay"
          onWheel={onOverlayWheel}
          onPointerDown={onOverlayPointerDown}
          onPointerUp={onOverlayPointerUp}
          onPointerCancel={() => {
            pointerStart.current = null;
          }}
          data-testid="admin-swipe-overlay"
        />
      )}

      {/* Top bar: ✕ left / progress center / (🗑 right lands in Task 2) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: 'calc(env(safe-area-inset-top, 0px) + 12px) 12px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 25,
          pointerEvents: 'none',
        }}
      >
        <button
          type="button"
          onClick={handleExit}
          data-testid="admin-swipe-exit"
          aria-label="exit review mode"
          style={{
            pointerEvents: 'auto',
            width: 40,
            height: 40,
            borderRadius: 999,
            border: 'none',
            background: 'rgba(0,0,0,0.45)',
            color: '#fff',
            fontSize: 18,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
        <div
          data-testid="admin-swipe-progress"
          style={{
            pointerEvents: 'auto',
            background: 'rgba(0,0,0,0.45)',
            color: '#fff',
            padding: '6px 12px',
            borderRadius: 999,
            fontFamily: 'var(--mono)',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {progressLabel}
        </div>
        <div style={{ width: 40, height: 40 }} /> {/* placeholder — 🗑 in Task 2 */}
      </div>

      {/* End-of-list card (shown when isAtEnd) — wired in Task 3. Task 1 is a no-op path. */}
      {isAtEnd && (
        <div
          data-testid="admin-swipe-empty"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
            color: '#fff',
            textAlign: 'center',
            zIndex: 30,
          }}
        >
          <div>
            <div className="display" style={{ fontSize: 24, fontFamily: 'var(--serif)' }}>
              审完了 🎉
            </div>
            <div className="body mt-8" style={{ color: '#d6d3cf' }}>
              这个分类全看过一遍
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              onClick={handleExit}
            >
              回列表
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
