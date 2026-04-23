'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import Chapter from './components/landing/Chapter';
import CtaEnd from './components/landing/CtaEnd';
import Progress from './components/landing/Progress';
import Grain from './components/landing/Grain';
import Loader from './components/landing/Loader';
import './landing.css';

type ChapterCopy = {
  big: React.ReactNode;
  small: string;
  video: string;
  tint?: 'warm' | 'cold';
};

const CHAPTERS: ChapterCopy[] = [
  {
    big: <>You said five more minutes.</>,
    small: 'That was three hours ago.',
    video: '/videos/Scene1.mp4',
    tint: 'warm',
  },
  {
    big: <>You had a list, once.</>,
    small: 'A language. A skill. A course you saved and never opened.',
    video: '/videos/Scene2.mp4',
    tint: 'warm',
  },
  {
    big: <>You&rsquo;re not weak.</>,
    small: 'They pay billions to keep you scrolling.',
    video: '/videos/Scene3.mp4',
    tint: 'cold',
  },
  {
    big: (
      <>
        LearnTok finds the <em>balance point.</em>
      </>
    ),
    small: 'Learn a little, scroll a little.',
    video: '/videos/Scene4.mp4',
    tint: 'warm',
  },
];

const TOTAL = CHAPTERS.length + 1; // +1 for CTA end

export default function LandingPage() {
  const [idx, setIdx] = useState(0);
  const [blobUrls, setBlobUrls] = useState<Record<string, string> | null>(null);
  const lockRef = useRef(false);
  const touchY = useRef<number | null>(null);
  const reduce = useReducedMotion();

  // Body class toggle — scopes the body-level scroll lock to this page only.
  useEffect(() => {
    document.body.classList.add('landing-active');
    return () => {
      document.body.classList.remove('landing-active');
    };
  }, []);

  const go = useCallback((n: number) => {
    setIdx((cur) => {
      const next = Math.max(0, Math.min(TOTAL - 1, n));
      return next === cur ? cur : next;
    });
  }, []);

  const next = useCallback(() => go(idx + 1), [go, idx]);
  const prev = useCallback(() => go(idx - 1), [go, idx]);

  // Keyboard
  useEffect(() => {
    if (!blobUrls) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (['ArrowDown', 'ArrowRight', ' ', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        next();
      } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, blobUrls]);

  // Touch (swipe up = next, swipe down = prev)
  useEffect(() => {
    if (!blobUrls) return;
    const ts = (e: TouchEvent) => {
      touchY.current = e.touches[0].clientY;
    };
    const te = (e: TouchEvent) => {
      if (touchY.current == null) return;
      const dy = e.changedTouches[0].clientY - touchY.current;
      if (Math.abs(dy) > 50) (dy < 0 ? next : prev)();
      touchY.current = null;
    };
    window.addEventListener('touchstart', ts, { passive: true });
    window.addEventListener('touchend', te, { passive: true });
    return () => {
      window.removeEventListener('touchstart', ts);
      window.removeEventListener('touchend', te);
    };
  }, [next, prev, blobUrls]);

  // Wheel (debounced)
  useEffect(() => {
    if (!blobUrls) return;
    const onWheel = (e: WheelEvent) => {
      if (lockRef.current) return;
      if (Math.abs(e.deltaY) < 30) return;
      lockRef.current = true;
      (e.deltaY > 0 ? next : prev)();
      setTimeout(() => {
        lockRef.current = false;
      }, 900);
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, [next, prev, blobUrls]);

  const isCtaEnd = idx === CHAPTERS.length;
  const tint = CHAPTERS[idx]?.tint;
  const coldClass = tint === 'cold' ? ' cold' : '';

  return (
    <main className={`landing-root${coldClass}`} data-trans="crossfade">
      {!blobUrls ? (
        <Loader
          sources={CHAPTERS.map((c) => c.video)}
          onReady={setBlobUrls}
        />
      ) : (
        <div className="canvas">
          <header className="chrome-top">
            <div className="wordmark">
              Learn<span className="dot">·</span>Tok
            </div>
            <div className="chapter-num" aria-live="polite">
              {`Chapter ${toRoman(idx + 1)} of V`}
            </div>
          </header>

          <Progress total={TOTAL} current={idx} onGo={go} />

          <AnimatePresence mode="sync">
            {CHAPTERS.map((c, i) =>
              i === idx ? (
                <Chapter
                  key={i}
                  big={c.big}
                  small={c.small}
                  video={c.video}
                  videoBlobUrl={blobUrls[c.video]}
                  reduce={!!reduce}
                />
              ) : null,
            )}
            {isCtaEnd && <CtaEnd key="cta-end" reduce={!!reduce} />}
          </AnimatePresence>

          {!isCtaEnd && (
            <footer className="chrome-bottom">
              <span className="hint">Swipe up · press space</span>
              <button
                type="button"
                className="next-btn"
                onClick={next}
                aria-label="Next chapter"
              >
                Next
                <span className="arrow" aria-hidden />
              </button>
            </footer>
          )}
        </div>
      )}
      <Grain />
    </main>
  );
}

function toRoman(n: number) {
  return ['I', 'II', 'III', 'IV', 'V'][n - 1] ?? String(n);
}
