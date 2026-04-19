'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';

const STORAGE_KEY = 'nibs-ball-pos';
const TAP_MOVE_THRESHOLD = 6; // px
const TAP_TIME_THRESHOLD = 200; // ms
const BALL_SIZE = 56; // px
const MARGIN = 16; // px from edge
const BOTTOM_NAV_OFFSET = 88; // BottomNav + safe spacing

const HIDE_PATTERNS = [
  /^\/$/,
  /^\/login(\/|$)/,
  /^\/auth(\/|$)/,
  /^\/onboarding(\/|$)/,
  /^\/lesson\//,
  /^\/feed(\/|$)/,
];

type Pos = { x: number; y: number };

function loadStoredPos(): Pos | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
      return { x: parsed.x, y: parsed.y };
    }
    return null;
  } catch {
    return null;
  }
}

function defaultPos(): Pos {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  return {
    x: window.innerWidth - BALL_SIZE - MARGIN,
    y: window.innerHeight - BALL_SIZE - BOTTOM_NAV_OFFSET,
  };
}

function clampToViewport(p: Pos): Pos {
  if (typeof window === 'undefined') return p;
  return {
    x: Math.max(0, Math.min(window.innerWidth - BALL_SIZE, p.x)),
    y: Math.max(0, Math.min(window.innerHeight - BALL_SIZE, p.y)),
  };
}

export function NibsBall({ onSummon }: { onSummon?: () => void } = {}) {
  const pathname = usePathname() ?? '/';
  const hidden = HIDE_PATTERNS.some((r) => r.test(pathname));

  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    startedAt: number;
    moved: boolean;
  } | null>(null);

  // Initialize position on mount (client-only).
  useEffect(() => {
    const stored = loadStoredPos();
    setPos(clampToViewport(stored ?? defaultPos()));
  }, []);

  // Reclamp on viewport resize so the ball never ends up off-screen.
  useEffect(() => {
    const onResize = () => {
      setPos((p) => (p ? clampToViewport(p) : p));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!pos) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: pos.x,
        origY: pos.y,
        startedAt: performance.now(),
        moved: false,
      };
    },
    [pos]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const s = dragState.current;
      if (!s) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (!s.moved && Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) {
        s.moved = true;
        setDragging(true);
      }
      if (s.moved) {
        setPos(clampToViewport({ x: s.origX + dx, y: s.origY + dy }));
      }
    },
    []
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const s = dragState.current;
      if (!s) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      const duration = performance.now() - s.startedAt;
      const isTap = !s.moved && duration < TAP_TIME_THRESHOLD + 300; // loose on up
      dragState.current = null;
      setDragging(false);
      if (isTap) {
        onSummon?.();
      } else {
        // Persist new position.
        setPos((current) => {
          if (current) {
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
            } catch {
              // ignore quota / private-browsing errors
            }
          }
          return current;
        });
      }
    },
    [onSummon]
  );

  if (hidden || !pos) return null;

  return (
    <button
      type="button"
      className={`nibs-ball ${dragging ? 'dragging' : ''}`}
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { dragState.current = null; setDragging(false); }}
      aria-label="summon nibs"
      data-testid="nibs-ball"
    >
      <Image
        src="/characters/nibs.png"
        alt=""
        width={56}
        height={56}
        priority
        draggable={false}
      />
    </button>
  );
}
