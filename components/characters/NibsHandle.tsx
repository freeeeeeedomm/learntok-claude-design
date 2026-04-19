'use client';

import { useRef } from 'react';

/**
 * Bottom-edge handle that summons Nibs. Mimics the v3 prototype:
 *   - tap to summon
 *   - hold + drag up (~20px) to summon mid-drag
 *
 * Uses Pointer Events so Capacitor can proxy it cleanly when the app
 * is wrapped for native.
 */
export function NibsHandle({
  onSummon,
  pulse = true,
}: {
  onSummon: () => void;
  pulse?: boolean;
}) {
  // Guard so a single interaction only summons once even if both the
  // drag-threshold and the pointerup fire.
  const summonedRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    summonedRef.current = false;
    const startY = e.clientY;

    const onMove = (ev: PointerEvent) => {
      if (summonedRef.current) return;
      if (startY - ev.clientY > 20) {
        summonedRef.current = true;
        onSummon();
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!summonedRef.current) {
        summonedRef.current = true;
        onSummon();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      className={`nibs-handle ${pulse ? 'nibs-pulse' : ''}`}
      onPointerDown={handlePointerDown}
      title="hold & pull up"
      data-testid="nibs-handle"
    >
      <svg width="96" height="26" viewBox="0 0 96 26">
        <path
          d="M18 26 C 12 10, 16 2, 22 0 C 24 10, 28 18, 32 26 Z"
          fill="#5a1a12"
          stroke="#1a0e08"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path
          d="M78 26 C 84 10, 80 2, 74 0 C 72 10, 68 18, 64 26 Z"
          fill="#5a1a12"
          stroke="#1a0e08"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <circle cx="48" cy="22" r="3" fill="#d85a3e" opacity="0.7" />
      </svg>
    </div>
  );
}
