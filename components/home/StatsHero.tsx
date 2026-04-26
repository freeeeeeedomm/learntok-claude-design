'use client';
import { useEffect, useRef, useState } from 'react';
import { fmtBank } from '@/lib/format';

type Scope = 'total' | 'week' | 'month';
const SCOPES: ReadonlyArray<Scope> = ['total', 'week', 'month'];
const STORAGE_KEY = 'home-stats-scope';

const SCOPE_LABEL: Record<Scope, string> = {
  total: 'TOTAL',
  week: 'THIS WEEK',
  month: 'THIS MONTH',
};
const SCOPE_LONG: Record<Scope, string> = {
  total: 'All time',
  week: 'This week',
  month: 'This month',
};

type Props = {
  balance: number;
  streak: number;
  earnedToday: number;
  spentToday: number;
  weekSeconds: number;
  monthSeconds: number;
  totalSeconds: number;
};

function isScope(v: unknown): v is Scope {
  return typeof v === 'string' && (SCOPES as ReadonlyArray<string>).includes(v);
}

export function StatsHero({
  balance,
  streak,
  earnedToday,
  spentToday,
  weekSeconds,
  monthSeconds,
  totalSeconds,
}: Props) {
  const [scope, setScope] = useState<Scope>('total');
  const [menuOpen, setMenuOpen] = useState(false);
  const heroRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isScope(stored)) setScope(stored);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, scope);
    } catch {}
  }, [scope]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: PointerEvent) => {
      if (heroRef.current && !heroRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [menuOpen]);

  const scopeSeconds =
    scope === 'week' ? weekSeconds : scope === 'month' ? monthSeconds : totalSeconds;

  return (
    <div ref={heroRef} className="stats-hero" data-testid="home-stats-hero">
      <div className="stats-hero-row" data-testid="hero-balance">
        <span className="stats-hero-label">Balance</span>
        <span className="stats-hero-value">{fmtBank(balance)}</span>
      </div>
      <div className="stats-hero-row" data-testid="hero-streak">
        <span className="stats-hero-label">Streak</span>
        <span className="stats-hero-value">🔥 {streak}</span>
      </div>
      <div className="stats-hero-row" data-testid="hero-earned-today">
        <span className="stats-hero-label">Earned today</span>
        <span className="stats-hero-value good">+{fmtBank(earnedToday)}</span>
      </div>
      <div className="stats-hero-row" data-testid="hero-spent-today">
        <span className="stats-hero-label">Spent today</span>
        <span className="stats-hero-value bad">−{fmtBank(spentToday)}</span>
      </div>
      <div
        className="stats-hero-row toggle"
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setMenuOpen((v) => !v);
          } else if (e.key === 'Escape') setMenuOpen(false);
        }}
        data-testid="hero-scope"
      >
        <span className="stats-hero-label">{SCOPE_LABEL[scope]}</span>
        <span className="stats-hero-value">{fmtBank(scopeSeconds)}</span>
      </div>

      {menuOpen && (
        <div className="stats-menu" role="menu" data-testid="hero-scope-menu">
          {SCOPES.map((s) => (
            <button
              key={s}
              role="menuitemradio"
              aria-checked={s === scope}
              onClick={() => {
                setScope(s);
                setMenuOpen(false);
              }}
            >
              {SCOPE_LONG[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
