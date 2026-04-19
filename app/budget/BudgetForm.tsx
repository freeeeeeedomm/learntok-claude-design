'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

function fmtBank(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s.toString().padStart(2, '0')}s` : `${m}m`;
}

export function BudgetForm({ balance }: { balance: number }) {
  // Default budget: 5 min, clamped to available balance.
  const defaultBudget = Math.min(300, balance);
  const [budget, setBudget] = useState<number>(defaultBudget);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Unique, valid preset chips (skip over zero or balance-exceeding ones).
  const presets = useMemo(() => {
    const raw = [120, 300, 600, balance];
    const seen = new Set<number>();
    return raw.filter((v) => {
      if (v <= 0 || v > balance) return false;
      if (seen.has(v)) return false;
      seen.add(v);
      return true;
    });
  }, [balance]);

  const sliderMax = Math.max(60, Math.min(balance, 1800)); // cap at 30 min
  const displayBudget = Math.min(budget, balance);

  const start = async () => {
    if (submitting) return;
    if (displayBudget <= 0) {
      setError("jar is empty — earn some time first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'feed', budgetSeconds: displayBudget }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'could not start feed session');
        setSubmitting(false);
        return;
      }
      const { sessionId } = await res.json();
      router.push(`/feed?session=${sessionId}&budget=${displayBudget}`);
    } catch {
      setError('network hiccup — try again');
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="row wrap gap-8 mt-4" data-testid="budget-presets">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            className={`chip ${displayBudget === p ? 'active' : ''}`}
            onClick={() => setBudget(p)}
            data-testid={`budget-preset-${p}`}
          >
            {p === balance ? 'all' : `${Math.floor(p / 60)}m`}
          </button>
        ))}
      </div>

      <div className="card mt-8 col gap-12">
        <div className="display tc" style={{ fontSize: 44 }}>
          {fmtBank(displayBudget)}
        </div>
        <input
          type="range"
          min={30}
          max={sliderMax}
          step={30}
          value={displayBudget}
          onChange={(e) => setBudget(parseInt(e.target.value, 10))}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
          data-testid="budget-slider"
        />
        <div
          className="row between"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--ink-mute)',
          }}
        >
          <span>30s</span>
          <span>jar: {fmtBank(balance)}</span>
        </div>
      </div>

      {error && (
        <div
          className="card"
          style={{ background: 'rgba(217, 111, 61, 0.08)', borderColor: 'var(--bad)' }}
          data-testid="budget-error"
        >
          <div className="body" style={{ color: 'var(--bad)' }}>
            {error}
          </div>
        </div>
      )}

      <div className="mt-auto" style={{ marginTop: 24 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={start}
          disabled={submitting || balance <= 0}
          data-testid="budget-start"
        >
          {submitting ? 'starting…' : 'start scrolling →'}
        </button>
      </div>
    </>
  );
}
