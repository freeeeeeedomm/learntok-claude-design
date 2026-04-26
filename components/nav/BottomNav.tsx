'use client';

import { usePathname } from 'next/navigation';
import { Home, Coffee, TrendingUp } from 'lucide-react';

const HIDE_PATTERNS = [
  /^\/$/,
  /^\/login(\/|$)/,
  /^\/auth(\/|$)/,
  /^\/onboarding(\/|$)/,
  /^\/lesson\//,
  /^\/feed(\/|$)/,
  /^\/admin(\/|$)/,
];

const ICON_PROPS = { size: 22, strokeWidth: 1.8 } as const;

export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const hidden = HIDE_PATTERNS.some((r) => r.test(pathname));
  if (hidden) return null;

  // Exact-match OR "prefix + /" so /addresses wouldn't accidentally match /add.
  const isHome =
    pathname === '/home' ||
    pathname.startsWith('/topic/') ||
    pathname.startsWith('/course/') ||
    pathname === '/add' ||
    pathname.startsWith('/add/');
  const isRelax =
    pathname === '/budget' ||
    pathname.startsWith('/budget/') ||
    pathname === '/feed' ||
    pathname.startsWith('/feed/');
  const isProgress =
    pathname === '/progress' || pathname.startsWith('/progress/');

  return (
    <nav className="bottom-nav" data-testid="bottom-nav">
      <a
        href="/home"
        className={`bottom-nav-item ${isHome ? 'active' : ''}`}
        aria-current={isHome ? 'page' : undefined}
        data-testid="nav-home"
      >
        <span className="bottom-nav-icon" aria-hidden>
          <Home {...ICON_PROPS} />
        </span>
        <span className="bottom-nav-label">home</span>
      </a>
      <a
        href="/budget"
        className={`bottom-nav-item ${isRelax ? 'active' : ''}`}
        aria-current={isRelax ? 'page' : undefined}
        data-testid="nav-relax"
      >
        <span className="bottom-nav-icon" aria-hidden>
          <Coffee {...ICON_PROPS} />
        </span>
        <span className="bottom-nav-label">relax</span>
      </a>
      <a
        href="/progress"
        className={`bottom-nav-item ${isProgress ? 'active' : ''}`}
        aria-current={isProgress ? 'page' : undefined}
        data-testid="nav-progress"
      >
        <span className="bottom-nav-icon" aria-hidden>
          <TrendingUp {...ICON_PROPS} />
        </span>
        <span className="bottom-nav-label">progress</span>
      </a>
    </nav>
  );
}
