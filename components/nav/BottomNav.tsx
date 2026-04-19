'use client';

import { usePathname } from 'next/navigation';

const HIDE_PATTERNS = [
  /^\/$/,
  /^\/login(\/|$)/,
  /^\/auth(\/|$)/,
  /^\/onboarding(\/|$)/,
  /^\/lesson\//,
  /^\/feed(\/|$)/,
];

export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const hidden = HIDE_PATTERNS.some((r) => r.test(pathname));
  if (hidden) return null;

  const isHome = pathname === '/home' || pathname.startsWith('/topic/') || pathname.startsWith('/course/') || pathname.startsWith('/add') || pathname.startsWith('/budget');
  const isProgress = pathname.startsWith('/progress');

  return (
    <nav className="bottom-nav" data-testid="bottom-nav">
      <a
        href="/home"
        className={`bottom-nav-item ${isHome ? 'active' : ''}`}
        data-testid="nav-home"
      >
        <span className="bottom-nav-icon" aria-hidden>🏠</span>
        <span className="bottom-nav-label">home</span>
      </a>
      <a
        href="/progress"
        className={`bottom-nav-item ${isProgress ? 'active' : ''}`}
        data-testid="nav-progress"
      >
        <span className="bottom-nav-icon" aria-hidden>📊</span>
        <span className="bottom-nav-label">progress</span>
      </a>
    </nav>
  );
}
