'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useYouTubePlayer } from '@/hooks/use-youtube-player';
import { useIdleDetection } from '@/hooks/use-idle-detection';

// Client heartbeat cadence. Coupled to server invariants:
//   - MAX_CREDIT_PER_HEARTBEAT = 20s in /api/sessions/heartbeat
//   - the orphan-close gap tolerance in /api/sessions/start
// Changing this without updating those constants will break the credit
// model. Grep for the constant name before touching.
const HEARTBEAT_INTERVAL_MS = 15_000;

export type LessonPlayerProps = {
  lesson: {
    id: string;
    title: string;
    ytId: string;
    position: number;
    courseTitle: string;
    courseLessonCount: number;
  };
  initialBalance: number;
  alreadyCompleted: boolean;
};

type StartState =
  | { phase: 'starting' }
  | { phase: 'ready'; sessionId: string }
  | { phase: 'failed' };

function fmtBalance(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function LessonPlayer({ lesson, initialBalance, alreadyCompleted }: LessonPlayerProps) {
  const [state, setState] = useState<StartState>({ phase: 'starting' });
  const [balance, setBalance] = useState(initialBalance);
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const { playing, iframeProps } = useYouTubePlayer();

  // We need a stable reference to the session id even after the component re-renders
  // or unmounts — used by cleanup code in later tasks.
  const sessionIdRef = useRef<string | null>(null);
  const endedRef = useRef(false);

  const retryStart = () => setState({ phase: 'starting' });

  // Runs on mount (state starts as 'starting') and again whenever retryStart
  // flips state back to 'starting'.
  useEffect(() => {
    if (state.phase !== 'starting') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/sessions/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'learn', lessonId: lesson.id }),
        });
        if (!res.ok) throw new Error(`start ${res.status}`);
        const { sessionId } = await res.json();
        if (cancelled) return;
        sessionIdRef.current = sessionId;
        setState({ phase: 'ready', sessionId });
      } catch {
        if (!cancelled) setState({ phase: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.phase, lesson.id]);

  // Only tick the idle counter once the session is ready — otherwise a
  // slow /api/sessions/start could let isIdle latch before the first
  // heartbeat even fires.
  const { isIdle, acknowledge } = useIdleDetection({
    active: !playing && state.phase === 'ready',
  });

  const markDone = async () => {
    if (submitting || state.phase !== 'ready') return;
    setSubmitting(true);
    try {
      // 1. Mark progress.
      const completeRes = await fetch('/api/lessons/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson.id }),
      });
      if (!completeRes.ok) {
        setSubmitting(false);
        // TODO(toast): show "couldn't save — try again" non-blocking; for now log.
        console.error('complete failed', completeRes.status);
        return;
      }
      // 2. End session (failure is non-blocking — orphan cleanup will handle it).
      try {
        await fetch('/api/sessions/end', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: state.sessionId }),
        });
      } catch {
        // ignore
      }
      endedRef.current = true;
      // 3. Navigate home.
      router.push('/home');
    } catch {
      setSubmitting(false);
    }
  };

  const doneForNow = async () => {
    if (submitting || state.phase !== 'ready') return;
    setSubmitting(true);
    try {
      await fetch('/api/sessions/end', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: state.sessionId }),
      });
    } catch {
      // ignore — orphan cleanup handles it
    }
    endedRef.current = true;
    router.push('/home');
  };

  const endSessionBestEffort = () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || endedRef.current) return;
    endedRef.current = true;
    try {
      navigator.sendBeacon(
        '/api/sessions/end',
        new Blob([JSON.stringify({ sessionId })], { type: 'application/json' })
      );
    } catch {
      // some browsers/environments reject Blob bodies; fall back to fetch keepalive
      try {
        fetch('/api/sessions/end', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId }),
          keepalive: true,
        });
      } catch {}
    }
  };

  useEffect(() => {
    if (state.phase !== 'ready') return;
    const sessionId = state.sessionId;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch('/api/sessions/heartbeat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, playing: playing && !isIdle }),
        });
        if (cancelled || !res.ok) return;
        const body: { balance?: number; ended?: boolean } = await res.json();
        if (typeof body.balance === 'number') setBalance(body.balance);
        // Defensive: a learn session never force-ends today (only feed
        // sessions hit the budget-exhausted path), but if that ever
        // changes, bail to home so the user isn't staring at a frozen
        // balance while the interval keeps polling a closed session.
        if (body.ended) {
          endedRef.current = true;
          router.push('/home');
        }
      } catch {
        // single blip — next tick retries
      }
    };

    tick(); // establish anchor immediately
    const id = setInterval(tick, HEARTBEAT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [state, playing, isIdle, router]);

  // Client-side 1s tick: while the video is playing (and session is ready),
  // increment the displayed balance by 1 every second. The heartbeat effect
  // above overwrites balance with the server-authoritative value every 15s,
  // so local drift is bounded to one heartbeat window.
  useEffect(() => {
    if (state.phase !== 'ready') return;
    if (!playing || isIdle) return;
    const id = setInterval(() => {
      setBalance((b) => b + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [state.phase, playing, isIdle]);

  useEffect(() => {
    const onHide = () => endSessionBestEffort();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  useEffect(() => {
    return () => {
      endSessionBestEffort();
    };
  }, []);

  if (state.phase === 'failed') {
    return (
      <main className="app pad center col gap-16" style={{ minHeight: '100vh' }}>
        <div className="display" style={{ fontSize: 24 }}>couldn't start this lesson.</div>
        <div className="col gap-8" style={{ width: '100%', maxWidth: 320 }}>
          <button className="btn btn-primary" onClick={retryStart}>retry</button>
          <a className="btn btn-ghost" href="/home">back to home</a>
        </div>
      </main>
    );
  }

  if (state.phase === 'starting') {
    return (
      <main className="app pad center col" style={{ minHeight: '100vh' }}>
        <div className="body">starting session…</div>
      </main>
    );
  }

  return (
    <main className="app">
      <div className="row between aic" style={{ position: 'fixed', top: 0, left: 0, right: 0, padding: 16, zIndex: 10 }}>
        {/* Plain <a> (not next/link) so the back button triggers a full
            navigation, which fires `pagehide` and lets
            endSessionBestEffort close the session. Swapping to <Link>
            would silently leak open sessions. */}
        <a href="/home" style={{ fontSize: 24, color: 'var(--ink-soft)' }}>‹</a>
        <div className="chip" data-testid="jar-chip">{fmtBalance(balance)}</div>
      </div>

      <div className="pad pad-top col gap-16">
        <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#000', borderRadius: 12, overflow: 'hidden' }}>
          <iframe
            {...iframeProps}
            src={`https://www.youtube.com/embed/${lesson.ytId}?enablejsapi=1&rel=0&modestbranding=1`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            title={lesson.title}
          />
        </div>

        <div>
          <div className="eyebrow">{lesson.courseTitle} · {lesson.position}/{lesson.courseLessonCount}</div>
          <div className="display mt-4" style={{ fontSize: 20 }}>{lesson.title}</div>
          <div className="body mt-4" style={{ fontSize: 12 }}>
            {playing
              ? <span style={{ color: 'var(--good)' }}>● earning time</span>
              : <span style={{ color: 'var(--ink-mute)' }}>paused · timer stopped</span>}
          </div>
          {alreadyCompleted && (
            <div className="eyebrow mt-8" data-testid="already-completed">✓ completed before</div>
          )}
        </div>

        <button
          className="btn btn-primary"
          data-testid="mark-done"
          onClick={markDone}
          disabled={submitting || state.phase !== 'ready'}
        >
          {submitting ? 'saving…' : 'mark done & next'}
        </button>
      </div>

      {isIdle && (
        <div
          data-testid="idle-sheet"
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            zIndex: 20,
          }}
        >
          <div
            className="col gap-16"
            style={{
              width: '100%', maxWidth: 480,
              background: 'var(--bg-2)',
              borderTopLeftRadius: 20, borderTopRightRadius: 20,
              borderTop: '1px solid var(--line)',
              padding: 24,
            }}
          >
            <div style={{ width: 40, height: 4, background: 'var(--line)', borderRadius: 2, alignSelf: 'center' }} />
            <div className="display" style={{ fontSize: 24 }}>still studying?</div>
            <div className="body">
              video's been paused 5 min. we paused the earn clock too — no cheating by accident 😊
            </div>
            <div className="col gap-8">
              <button className="btn btn-primary" onClick={acknowledge}>yep, resume</button>
              <button className="btn btn-ghost" onClick={doneForNow} disabled={submitting}>
                done for now
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
