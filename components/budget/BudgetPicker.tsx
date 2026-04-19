'use client';

import { useMemo } from 'react';

function fmtBank(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s.toString().padStart(2, '0')}s` : `${m}m`;
}

export function BudgetPicker({
  balance,
  value,
  onChange,
  testIdPrefix = 'budget',
}: {
  balance: number;
  value: number;
  onChange: (next: number) => void;
  testIdPrefix?: string;
}) {
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

  const sliderMax = Math.max(60, Math.min(balance, 1800));
  const display = Math.min(value, balance);

  return (
    <>
      <div className="row wrap gap-8 mt-4" data-testid={`${testIdPrefix}-presets`}>
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            className={`chip ${display === p ? 'active' : ''}`}
            onClick={() => onChange(p)}
            data-testid={`${testIdPrefix}-preset-${p}`}
          >
            {p === balance ? 'all' : `${Math.floor(p / 60)}m`}
          </button>
        ))}
      </div>

      <div className="card mt-8 col gap-12">
        <div className="display tc" style={{ fontSize: 44 }}>
          {fmtBank(display)}
        </div>
        <input
          type="range"
          min={30}
          max={sliderMax}
          step={30}
          value={display}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
          data-testid={`${testIdPrefix}-slider`}
        />
        <div
          className="row between"
          style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-mute)' }}
        >
          <span>30s</span>
          <span>jar: {fmtBank(balance)}</span>
        </div>
      </div>
    </>
  );
}
