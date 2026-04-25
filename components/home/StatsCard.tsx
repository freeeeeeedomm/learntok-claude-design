'use client';

// 3-column stats card. The third column is tappable: tapping it opens a small
// popover anchored under the card with three time-scope choices. The selected
// scope is persisted to localStorage so the user's choice survives reloads.
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
  streak: number;
  todaySeconds: number;
  weekSeconds: number;
  monthSeconds: number;
  totalSeconds: number;
};

function isScope(v: unknown): v is Scope {
  return typeof v === 'string' && (SCOPES as ReadonlyArray<string>).includes(v);
}

export function StatsCard({
  streak,
  todaySeconds,
  weekSeconds,
  monthSeconds,
  totalSeconds,
}: Props) {
  const [scope, setScope] = useState<Scope>('total');
  const [menuOpen, setMenuOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Hydrate from localStorage on mount. Defensive against SSR + incognito.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isScope(stored)) setScope(stored);
    } catch {
      /* localStorage unavailable; keep default */
    }
  }, []);

  // Persist on every change.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, scope);
    } catch {
      /* swallow */
    }
  }, [scope]);

  // Close menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [menuOpen]);

  const col3Seconds =
    scope === 'week' ? weekSeconds : scope === 'month' ? monthSeconds : totalSeconds;

  const onPick = (next: Scope) => {
    setScope(next);
    setMenuOpen(false);
  };

  return (
    <div ref={cardRef} className="stats-card mt-16" data-testid="home-stats-card">
      <div className="stats-col" data-testid="stats-col-streak">
        <div className="stats-num">{streak}</div>
        <div className="stats-label">🔥 STREAK</div>
      </div>
      <div className="stats-col" data-testid="stats-col-today">
        <div className="stats-num">{fmtBank(todaySeconds)}</div>
        <div className="stats-label">TODAY</div>
      </div>
      <div
        className="stats-col toggle"
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setMenuOpen((v) => !v);
          } else if (e.key === 'Escape') {
            setMenuOpen(false);
          }
        }}
        data-testid="stats-col-scope"
      >
        <div className="stats-num">{fmtBank(col3Seconds)}</div>
        <div className="stats-label">{SCOPE_LABEL[scope]}</div>
      </div>

      {menuOpen && (
        <div className="stats-menu" role="menu" data-testid="stats-menu">
          {SCOPES.map((s) => (
            <button
              key={s}
              role="menuitemradio"
              aria-checked={s === scope}
              onClick={() => onPick(s)}
            >
              {SCOPE_LONG[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
