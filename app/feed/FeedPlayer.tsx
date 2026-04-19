'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Five hardcoded public YouTube IDs for the feed demo. Seed content is
// out of scope; the /add page (Track D) will let users build real
// feeds later.
const FEED_VIDS: Array<{ id: string; user: string; caption: string }> = [
  { id: 'dQw4w9WgXcQ', user: '@neverendingref', caption: 'a classic never dies' },
  { id: 'jNQXAC9IVRw', user: '@me_at_zoo', caption: 'the first ever YouTube video' },
  { id: '9bZkp7q19f0', user: '@kpopclassics', caption: 'throwback vibes' },
  { id: 'kJQP7kiw5Fk', user: '@musicafuego', caption: 'the most watched music video' },
  { id: 'M7lc1UVf-VE', user: '@google', caption: 'developer clip from google io' },
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
  const router = useRouter();
  const endedRef = useRef(false);

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

  // pagehide + unmount cleanup (mirror lesson-page pattern).
  useEffect(() => {
    const onHide = () => endSessionBestEffort();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      endSessionBestEffort();
    };
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

  const nextVid = () => setVidIdx((i) => i + 1);

  const vid = FEED_VIDS[vidIdx % FEED_VIDS.length];
  const pct = Math.max(0, Math.min(100, (remain / budgetSeconds) * 100));

  return (
    <div className="feed" data-testid="feed-root">
      <div className="feed-video">
        <iframe
          key={vid.id}
          src={`https://www.youtube.com/embed/${vid.id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${vid.id}&rel=0&modestbranding=1&playsinline=1`}
          allow="autoplay; encrypted-media; picture-in-picture"
          title={vid.caption}
        />
      </div>

      <div className="feed-top-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="feed-top-chip" data-testid="feed-remaining">
        {fmtMMSS(remain)}
      </div>

      <div className="feed-overlay-info">
        <div
          style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 600 }}
        >
          {vid.user}
        </div>
        <div style={{ fontSize: 13, marginTop: 4, opacity: 0.9 }}>
          {vid.caption}
        </div>
      </div>

      <div className="feed-side">
        <button
          type="button"
          className="icon-btn"
          onClick={nextVid}
          aria-label="next video"
          data-testid="feed-next"
        >
          ↓
        </button>
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
