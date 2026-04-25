'use client';

/**
 * Preloads videos by mounting hidden <video preload="auto"> elements and
 * watching their `progress` / `loadeddata` events. We do NOT fetch + Blob
 * the videos ourselves — that path is fragile (Vercel CDN edge cases,
 * mobile Safari ReadableStream quirks, content-length missing) and was
 * causing the loader to flash 100% with no playback in incognito.
 *
 * Instead we let the browser do what it's good at, and use the resulting
 * HTTP cache for the visible <video> in <Chapter>. The handoff payload is
 * the same shape (`Record<src, url>`) but maps each src to itself.
 *
 * A 6s hard timeout guarantees we never block the user behind a stalled
 * preload (mobile data-saver mode often throttles preload="auto").
 */

import { useEffect, useRef, useState } from 'react';

type Props = {
  sources: string[];
  onReady: (urls: Record<string, string>) => void;
};

const HARD_TIMEOUT_MS = 6000;
const MIN_SHOW_MS = 500;
const FADE_MS = 650;

export default function Loader({ sources, onReady }: Props) {
  const [percent, setPercent] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);
  const firedRef = useRef(false);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    const ratios = new Array(sources.length).fill(0);
    const ready = new Array(sources.length).fill(false);
    const cleanups: Array<() => void> = [];

    const updatePercent = () => {
      if (firedRef.current) return;
      const avg = ratios.reduce((a, b) => a + b, 0) / sources.length;
      const pct = Math.min(98, Math.round(avg * 100));
      setPercent((cur) => (pct > cur ? pct : cur));
    };

    const finishUp = () => {
      if (firedRef.current || cancelled) return;
      firedRef.current = true;
      const map: Record<string, string> = {};
      sources.forEach((u) => {
        map[u] = u;
      });
      setPercent(100);
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, MIN_SHOW_MS - elapsed);
      setTimeout(() => {
        if (cancelled) return;
        setFadingOut(true);
        setTimeout(() => {
          if (!cancelled) onReady(map);
        }, FADE_MS);
      }, wait);
    };

    const checkAllReady = () => {
      if (ready.every(Boolean)) finishUp();
    };

    sources.forEach((_src, idx) => {
      const v = videoRefs.current[idx];
      if (!v) return;

      const onProgress = () => {
        try {
          if (v.duration > 0 && v.buffered.length > 0) {
            const end = v.buffered.end(v.buffered.length - 1);
            ratios[idx] = Math.min(1, end / v.duration);
            updatePercent();
          }
        } catch {
          /* noop */
        }
      };
      const markReady = () => {
        ratios[idx] = 1;
        ready[idx] = true;
        updatePercent();
        checkAllReady();
      };

      v.addEventListener('progress', onProgress);
      v.addEventListener('loadeddata', markReady);
      v.addEventListener('canplaythrough', markReady);
      v.addEventListener('error', markReady); // don't hang on error
      // Kick the load — preload="auto" attribute handles most cases, but
      // some browsers need .load() after src is set.
      try {
        v.load();
      } catch {
        /* noop */
      }

      cleanups.push(() => {
        v.removeEventListener('progress', onProgress);
        v.removeEventListener('loadeddata', markReady);
        v.removeEventListener('canplaythrough', markReady);
        v.removeEventListener('error', markReady);
      });
    });

    const timeout = setTimeout(() => {
      if (!firedRef.current) finishUp();
    }, HARD_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      cleanups.forEach((c) => c());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Off-screen preloaders. Must be in DOM for iOS Safari to honor preload. */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          width: 1,
          height: 1,
          left: -9999,
          top: -9999,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {sources.map((src, i) => (
          <video
            key={src}
            ref={(el) => {
              videoRefs.current[i] = el;
            }}
            src={src}
            preload="auto"
            muted
            playsInline
          />
        ))}
      </div>

      <div
        className={`loader${fadingOut ? ' loader-fadeout' : ''}`}
        role="status"
        aria-live="polite"
      >
        <h1 className="loader-mark">
          Learn<span className="dot">·</span>Tok
        </h1>
        <p className="loader-caption">Preparing the story&hellip;</p>
        <div className="loader-bar" aria-hidden>
          <div className="loader-bar-fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="loader-percent">
          {percent.toString().padStart(2, '0')}%
        </div>
        <span className="sr-only">{`Loading ${percent} percent`}</span>
      </div>
    </>
  );
}
