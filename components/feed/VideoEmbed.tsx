'use client';

import { useCallback, useEffect, useRef } from 'react';

interface VideoEmbedProps {
  source: 'tiktok' | 'youtube';
  videoId: string;
  /** true = absolute-fill parent; false = aspect-ratio container that sizes from width. */
  fillHeight?: boolean;
  /** External ref to the underlying iframe (forwarded for YouTube only — TikTok uses an internal ref for postMessage). */
  iframeRef?: React.Ref<HTMLIFrameElement>;
}

/**
 * Dual-source video iframe.
 *
 * TikTok: uses the /player/v1/ endpoint (not in public docs but works in practice,
 * per the learntok-v2 project). Supports autoplay via ?autoplay=1 but browsers
 * force-mute autoplay without user gesture, so we postMessage 'unMute' after
 * iframe load with staggered fallback timers. Once the player has started
 * playback, the command takes effect.
 *
 * YouTube: standard /embed/ endpoint. Consumers control play/pause via the
 * YT iframe API (outside this component's scope).
 */
export function VideoEmbed({ source, videoId, fillHeight = false, iframeRef: externalIframeRef }: VideoEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sendTikTokCommand = useCallback((type: string, value?: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(
      { 'x-tiktok-player': true, type, ...(value !== undefined ? { value } : {}) },
      '*'
    );
  }, []);

  // Auto-unmute TikTok once player is ready. Browsers force-mute autoplay
  // without a user gesture; we send unMute after load + staggered retries.
  useEffect(() => {
    if (source !== 'tiktok') return;

    const onMessage = (e: MessageEvent) => {
      // Any message that looks like it came from the TikTok player = player is alive.
      if (
        e.data?.['x-tiktok-player'] ||
        (typeof e.data === 'string' && e.data.includes('tiktok'))
      ) {
        sendTikTokCommand('unMute');
      }
    };
    window.addEventListener('message', onMessage);

    const t1 = setTimeout(() => sendTikTokCommand('unMute'), 1000);
    const t2 = setTimeout(() => sendTikTokCommand('unMute'), 2500);
    const t3 = setTimeout(() => sendTikTokCommand('unMute'), 5000);

    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [source, videoId, sendTikTokCommand]);

  const containerStyle: React.CSSProperties = fillHeight
    ? { position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#000' }
    : {
        position: 'relative',
        width: '100%',
        paddingBottom: source === 'tiktok' ? '177.78%' : '56.25%', // 9:16 TT / 16:9 YT
        overflow: 'hidden',
        background: '#000',
      };

  const iframeSrc =
    source === 'tiktok'
      ? `https://www.tiktok.com/player/v1/${videoId}?autoplay=1&mute=0&controls=1&loop=0&music_info=0&description=0&rel=0`
      : `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0&rel=0`;

  const allowAttr =
    source === 'tiktok'
      ? 'autoplay; fullscreen'
      : 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

  return (
    <div style={containerStyle} data-testid="video-embed">
      <iframe
        ref={source === 'youtube' ? externalIframeRef ?? iframeRef : iframeRef}
        key={`${source}-${videoId}`}
        src={iframeSrc}
        title={`${source} video`}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
        allow={allowAttr}
        allowFullScreen
        onLoad={() => {
          if (source === 'tiktok') {
            // Eager first attempt — after iframe's initial JS has a chance to wire up listeners.
            setTimeout(() => sendTikTokCommand('unMute'), 500);
          }
        }}
      />
    </div>
  );
}
