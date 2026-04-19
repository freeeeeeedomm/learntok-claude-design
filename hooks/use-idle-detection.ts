'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type UseIdleDetectionOpts = {
  active: boolean;
  timeoutSec?: number;
};

export type UseIdleDetectionReturn = {
  idleFor: number;
  isIdle: boolean;
  acknowledge: () => void;
};

/**
 * Ticks `idleFor` (seconds) while `active` is true. Once idleFor reaches
 * timeoutSec, `isIdle` latches to true and stays there until `acknowledge()`
 * is called — even if `active` flips to false in the meantime. This is what
 * forces the lesson page to gate heartbeat credit until the user confirms
 * the "still studying?" sheet.
 *
 * Natural transition active: true -> false resets idleFor (back to 0) but
 * does NOT clear the latched isIdle.
 */
export function useIdleDetection({
  active,
  timeoutSec = 300,
}: UseIdleDetectionOpts): UseIdleDetectionReturn {
  const [idleFor, setIdleFor] = useState(0);
  const [isIdle, setIsIdle] = useState(false);
  const prevActive = useRef(active);

  // Reset counter on active transition true -> false (but leave isIdle latched).
  useEffect(() => {
    if (prevActive.current && !active) {
      setIdleFor(0);
    }
    prevActive.current = active;
  }, [active]);

  // Tick while active.
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setIdleFor((prev) => {
        const next = prev + 1;
        if (next >= timeoutSec) setIsIdle(true);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [active, timeoutSec]);

  const acknowledge = useCallback(() => {
    setIdleFor(0);
    setIsIdle(false);
  }, []);

  return { idleFor, isIdle, acknowledge };
}
