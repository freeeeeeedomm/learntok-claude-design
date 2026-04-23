'use client';

/**
 * Preloads all videos with real byte-level progress, reports aggregate
 * percentage, and resolves a Blob URL per video once fully downloaded.
 * Once every video has finished, calls onReady with the url map.
 *
 * We fetch with ReadableStream so the progress bar reflects actual bytes,
 * not just "file N of M" — important for a perceived-fast loading screen
 * when the longest video dominates total size.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  sources: string[];
  onReady: (blobUrls: Record<string, string>) => void;
};

export default function Loader({ sources, onReady }: Props) {
  const [percent, setPercent] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);
  const firedRef = useRef(false);

  const list = useMemo(() => sources, [sources]);

  useEffect(() => {
    let cancelled = false;

    // Byte totals for each source index.
    const totals: number[] = new Array(list.length).fill(0);
    const loaded: number[] = new Array(list.length).fill(0);

    const updatePercent = () => {
      const totalBytes = totals.reduce((a, b) => a + b, 0);
      const loadedBytes = loaded.reduce((a, b) => a + b, 0);
      if (totalBytes === 0) {
        // Fallback: we don't know the total yet. Use file-count progress.
        const finishedCount = loaded.filter((n, i) => totals[i] === 0 ? false : n >= totals[i]).length;
        setPercent(Math.round((finishedCount / list.length) * 100));
        return;
      }
      const pct = Math.min(100, Math.round((loadedBytes / totalBytes) * 100));
      setPercent(pct);
    };

    async function fetchOne(url: string, idx: number): Promise<string | null> {
      try {
        const res = await fetch(url);
        if (!res.ok || !res.body) return null;

        const lenHeader = res.headers.get('content-length');
        totals[idx] = lenHeader ? parseInt(lenHeader, 10) : 0;
        updatePercent();

        const reader = res.body.getReader();
        const chunks: BlobPart[] = [];
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            loaded[idx] += value.length;
            // If we didn't have a content-length, keep totals growing so the
            // bar at least moves.
            if (totals[idx] === 0) totals[idx] = loaded[idx];
            updatePercent();
          }
          if (cancelled) {
            reader.cancel().catch(() => {});
            return null;
          }
        }
        const blob = new Blob(chunks, { type: res.headers.get('content-type') || 'video/mp4' });
        return URL.createObjectURL(blob);
      } catch {
        return null;
      }
    }

    (async () => {
      const results = await Promise.all(list.map((u, i) => fetchOne(u, i)));
      if (cancelled || firedRef.current) return;

      const map: Record<string, string> = {};
      results.forEach((blobUrl, i) => {
        if (blobUrl) map[list[i]] = blobUrl;
      });

      // Snap to 100%, hold a beat, fade out, then hand off.
      setPercent(100);
      firedRef.current = true;
      setTimeout(() => {
        setFadingOut(true);
        setTimeout(() => {
          if (!cancelled) onReady(map);
        }, 650);
      }, 300);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`loader${fadingOut ? ' loader-fadeout' : ''}`} role="status" aria-live="polite">
      <h1 className="loader-mark">
        Learn<span className="dot">·</span>Tok
      </h1>
      <p className="loader-caption">Preparing the story&hellip;</p>
      <div className="loader-bar" aria-hidden>
        <div className="loader-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="loader-percent">{percent.toString().padStart(2, '0')}%</div>
      <span className="sr-only">{`Loading ${percent} percent`}</span>
    </div>
  );
}
