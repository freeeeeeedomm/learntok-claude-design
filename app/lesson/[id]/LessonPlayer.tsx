'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useYouTubePlayer } from '@/hooks/use-youtube-player';

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

  // Placeholder until Task 6 wires useIdleDetection.
  const isIdle = false;

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
      // 3. Navigate home.
      router.push('/home');
    } catch {
      setSubmitting(false);
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
        const body: { balance?: number } = await res.json();
        if (typeof body.balance === 'number') setBalance(body.balance);
      } catch {
        // single blip — next tick retries
      }
    };

    tick(); // establish anchor immediately
    const id = setInterval(tick, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [state, playing, isIdle]);

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
        <a href="/home" style={{ fontSize: 24, color: 'var(--ink-soft)' }}>‹</a>
        <div className="chip" data-testid="jar-chip">{fmtBalance(balance)}</div>
      </div>

      <div className="pad pad-top col gap-16">
        <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#000', borderRadius: 12, overflow: 'hidden' }}>
          <iframe
            {...iframeProps}
            src={`https://www.youtube.com/embed/${lesson.ytId}?enablejsapi=1&rel=0&modestbranding=1`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            allow="autoplay; encrypted-media"
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
    </main>
  );
}
