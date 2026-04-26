'use client';

import { usePathname } from 'next/navigation';
import { Home, Compass, Coffee, User } from 'lucide-react';

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

  // Home covers /home + the user's owned things (/course, /add).
  // Discover covers browse surfaces (/discover, /topic).
  const isHome =
    pathname === '/home' ||
    pathname.startsWith('/course/') ||
    pathname === '/add' ||
    pathname.startsWith('/add/');
  const isDiscover =
    pathname === '/discover' ||
    pathname.startsWith('/discover/') ||
    pathname.startsWith('/topic/');
  const isRelax =
    pathname === '/budget' ||
    pathname.startsWith('/budget/') ||
    pathname === '/feed' ||
    pathname.startsWith('/feed/');
  const isProfile = pathname === '/profile' || pathname.startsWith('/profile/');

  return (
    <nav className="bottom-nav" data-testid="bottom-nav">
      <a
        href="/home"
        className={`bottom-nav-item ${isHome ? 'active' : ''}`}
        aria-current={isHome ? 'page' : undefined}
        data-testid="nav-home"
      >
        <span className="bottom-nav-icon" aria-hidden><Home {...ICON_PROPS} /></span>
        <span className="bottom-nav-label">home</span>
      </a>
      <a
        href="/discover"
        className={`bottom-nav-item ${isDiscover ? 'active' : ''}`}
        aria-current={isDiscover ? 'page' : undefined}
        data-testid="nav-discover"
      >
        <span className="bottom-nav-icon" aria-hidden><Compass {...ICON_PROPS} /></span>
        <span className="bottom-nav-label">discover</span>
      </a>
      <a
        href="/budget"
        className={`bottom-nav-item ${isRelax ? 'active' : ''}`}
        aria-current={isRelax ? 'page' : undefined}
        data-testid="nav-relax"
      >
        <span className="bottom-nav-icon" aria-hidden><Coffee {...ICON_PROPS} /></span>
        <span className="bottom-nav-label">relax</span>
      </a>
      <a
        href="/profile"
        className={`bottom-nav-item ${isProfile ? 'active' : ''}`}
        aria-current={isProfile ? 'page' : undefined}
        data-testid="nav-profile"
      >
        <span className="bottom-nav-icon" aria-hidden><User {...ICON_PROPS} /></span>
        <span className="bottom-nav-label">profile</span>
      </a>
    </nav>
  );
}
