'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VideoEmbed } from '@/components/feed/VideoEmbed';

// 18 hardcoded public TikTok IDs (from learntok-v2 seed_presets). Categories
// span comedy / music / pets / magic / art / cooking. The /add page can
// eventually let users curate their own feeds; this is v1 seed content.
const FEED_VIDS: Array<{ id: string; source: 'tiktok' | 'youtube'; caption: string }> = [
  { id: '6862153058223197445', source: 'tiktok', caption: 'Bella Poarch — M to the B' },
  { id: '6950627842518568197', source: 'tiktok', caption: 'Khaby Lame — peel a banana' },
  { id: '6979606181463526661', source: 'tiktok', caption: 'Khaby Lame — wing mirror hack' },
  { id: '6932635718615338246', source: 'tiktok', caption: 'Sugar Crash parody' },
  { id: '6973813778597055749', source: 'tiktok', caption: 'pick-up line comedy' },
  { id: '7332342275151760642', source: 'tiktok', caption: 'Leah Halton — inverted lip sync' },
  { id: '7071079551756979483', source: 'tiktok', caption: 'MONA — singing performance' },
  { id: '7058186727248235782', source: 'tiktok', caption: 'Say It Right' },
  { id: '7028775404173413678', source: 'tiktok', caption: 'dog interaction' },
  { id: '6839416095586159878', source: 'tiktok', caption: 'cat pawing' },
  { id: '6975140587196517638', source: 'tiktok', caption: 'chipmunks eating nuts' },
  { id: '6768504823336815877', source: 'tiktok', caption: 'Zach King — magic broomstick' },
  { id: '6749520869598481669', source: 'tiktok', caption: 'Zach King — glass + cake' },
  { id: '6766278000783658245', source: 'tiktok', caption: 'Zach King — hiding spots' },
  { id: '6911406868699073798', source: 'tiktok', caption: 'mouth drawing art' },
  { id: '7065370017944063278', source: 'tiktok', caption: 'UP-themed 3D animation' },
  { id: '7332187682480590112', source: 'tiktok', caption: 'chocolate covered strawberries' },
  { id: '6894081763379924229', source: 'tiktok', caption: 'Billie Eilish — TimeWarp' },
];

const HEARTBEAT_INTERVAL_MS = 15_000;

function fmtMMSS(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function FeedPlayer({
  sessionId,
  budgetSeconds,
}: {
  sessionId: string;
  budgetSeconds: number;
}) {
  const [remain, setRemain] = useState<number>(budgetSeconds);
  const [vidIdx, setVidIdx] = useState(0);
  const [endedBySystem, setEndedBySystem] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'none' | 'up' | 'down'>('none');
  const [overlayHidden, setOverlayHidden] = useState(false);
  const router = useRouter();
  const endedRef = useRef(false);
  const lastSwipeRef = useRef(0);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStart = useRef<{ y: number; t: number } | null>(null);

  const endSessionBestEffort = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    try {
      navigator.sendBeacon(
        '/api/sessions/end',
        new Blob([JSON.stringify({ sessionId })], { type: 'application/json' })
      );
    } catch {
      try {
        fetch('/api/sessions/end', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId }),
          keepalive: true,
        });
      } catch {}
    }
  }, [sessionId]);

  // Local 1s countdown (approximation; server is truth via heartbeat).
  useEffect(() => {
    if (endedBySystem || remain <= 0) return;
    const t = setInterval(() => {
      setRemain((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [endedBySystem, remain]);

  // Server heartbeat every 15s. Debits server-side; signals ended on budget exhaustion.
  useEffect(() => {
    if (endedBySystem) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch('/api/sessions/heartbeat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, playing: true }),
        });
        if (cancelled || !res.ok) return;
        const body: { balance?: number; ended?: boolean } = await res.json();
        if (cancelled) return;
        if (body.ended) {
          endedRef.current = true;
          setEndedBySystem(true);
          setRemain(0);
          setTimeout(() => router.push('/home'), 1200);
        }
      } catch {
        // single blip — next tick retries
      }
    };

    tick(); // anchor
    const id = setInterval(tick, HEARTBEAT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionId, endedBySystem, router]);

  // pagehide only. We intentionally do NOT fire endSessionBestEffort on
  // unmount: in dev, React strict mode double-fires cleanup, which would
  // flip endedRef before the user ever clicks. Live closing on SPA nav
  // is handled by the orphan-close step in /api/sessions/start on the
  // user's next session. /lesson/[id] gets away with the unmount path
  // because its sessionId is null during the strict-mode double-fire.
  useEffect(() => {
    const onHide = () => endSessionBestEffort();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [endSessionBestEffort]);

  const doneNow = async () => {
    if (submitting || endedRef.current) return;
    setSubmitting(true);
    endedRef.current = true;
    try {
      await fetch('/api/sessions/end', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
    } catch {
      // orphan cleanup backstop
    }
    router.push('/home');
  };

  // ---- Swipe gesture: wheel (desktop) + pointer (mobile) ----
  const commitSwipe = useCallback((direction: 1 | -1) => {
    const now = performance.now();
    if (now - lastSwipeRef.current < 800) return; // throttle
    lastSwipeRef.current = now;
    setSlideDirection(direction > 0 ? 'up' : 'down');
    setTimeout(() => {
      setVidIdx((i) => (direction < 0 ? Math.max(0, i - 1) : i + 1));
      setSlideDirection('none');
    }, 300);
  }, []);

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

      // Tap (minimal movement + quick): hide overlay for 4s so user can
      // reach TikTok's own UI (like / share / mute toggle).
      if (Math.abs(dy) < 6 && dt < 250) {
        setOverlayHidden(true);
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = setTimeout(() => setOverlayHidden(false), 4000);
        return;
      }

      // Swipe: |dy| > 50 AND duration > 50ms. Finger UP = dy negative = next.
      if (Math.abs(dy) > 50 && dt > 50) {
        commitSwipe(dy < 0 ? 1 : -1);
      }
    },
    [commitSwipe]
  );

  // Clear overlay-hide timer on unmount so it doesn't fire after cleanup.
  useEffect(() => () => {
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
  }, []);

  const vid = FEED_VIDS[vidIdx % FEED_VIDS.length];
  const pct = Math.max(0, Math.min(100, (remain / budgetSeconds) * 100));

  return (
    <div className="feed" data-testid="feed-root">
      <div
        className={`feed-video ${slideDirection !== 'none' ? `feed-slide-${slideDirection}` : ''}`}
      >
        <VideoEmbed source={vid.source} videoId={vid.id} fillHeight />
      </div>
      {!overlayHidden && !endedBySystem && (
        <div
          className="feed-swipe-overlay"
          onWheel={onOverlayWheel}
          onPointerDown={onOverlayPointerDown}
          onPointerUp={onOverlayPointerUp}
          onPointerCancel={() => { pointerStart.current = null; }}
          data-testid="feed-swipe-overlay"
        />
      )}

      <div className="feed-top-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="feed-top-chip" data-testid="feed-remaining">
        {fmtMMSS(remain)}
      </div>

      <div className="feed-overlay-info">
        <div style={{ fontSize: 13, marginTop: 4, opacity: 0.9 }}>
          {vid.caption}
        </div>
      </div>

      <div className="feed-done-bar">
        <button
          type="button"
          className="btn btn-primary"
          onClick={doneNow}
          disabled={submitting}
          data-testid="feed-done"
        >
          {submitting ? 'saving…' : 'done now'}
        </button>
      </div>

      {endedBySystem && (
        <div
          data-testid="feed-time-up"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.88)',
            zIndex: 50,
            color: '#fff',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              className="display"
              style={{ fontSize: 36, fontFamily: 'var(--serif)' }}
            >
              time's up.
            </div>
            <div className="body mt-8" style={{ color: '#d6d3cf' }}>
              ready to refill?
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
