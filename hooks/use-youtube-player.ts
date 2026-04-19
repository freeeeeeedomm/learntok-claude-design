'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type UseYouTubePlayerReturn = {
  playing: boolean;
  ended: boolean;
  iframeProps: {
    ref: React.RefObject<HTMLIFrameElement>;
    onLoad: () => void;
  };
};

/**
 * Bridge to the YouTube iframe postMessage API (no external SDK).
 * Consumer renders <iframe src={`https://www.youtube.com/embed/${ytId}?enablejsapi=1`} {...iframeProps} />.
 *
 * playing  — playerState === 1
 * ended    — playerState === 0 (latched; does not flip back)
 */
export function useYouTubePlayer(): UseYouTubePlayerReturn {
  const ref = useRef<HTMLIFrameElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);

  const onLoad = useCallback(() => {
    try {
      ref.current?.contentWindow?.postMessage(
        '{"event":"listening","id":1}',
        '*'
      );
    } catch {
      // iframe unmounted between load and handshake — safe to ignore
    }
  }, []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== 'https://www.youtube.com') return;
      if (typeof e.data !== 'string') return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(e.data);
      } catch {
        return;
      }
      const d = parsed as { event?: string; info?: { playerState?: number } };
      if (d.event !== 'infoDelivery' || d.info?.playerState === undefined) return;
      const state = d.info.playerState;
      setPlaying(state === 1);
      if (state === 0) setEnded(true);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return {
    playing,
    ended,
    iframeProps: { ref, onLoad },
  };
}
