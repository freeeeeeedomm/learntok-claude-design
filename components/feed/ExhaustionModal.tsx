'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function fmtMin(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function ExhaustionModal({
  sessionId,
  balance,
  onExtend,
}: {
  sessionId: string;
  balance: number;
  onExtend: (next: { newBudget: number; balanceAfter: number }) => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<null | 'insufficient' | 'other'>(null);

  const canExtend = balance >= 60 && error !== 'insufficient';

  const doExtend = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/sessions/extend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (res.ok) {
        const body = await res.json() as { newBudget: number; balanceAfter: number };
        onExtend(body);
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body?.error === 'insufficient_balance' ? 'insufficient' : 'other');
    } catch {
      setError('other');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="exhaustion-modal"
      data-testid="feed-exhaustion-modal"
      role="dialog"
      aria-labelledby="exhaustion-title"
    >
      <div className="exhaustion-card">
        <div
          id="exhaustion-title"
          className="display"
          style={{ fontSize: 32, fontFamily: 'var(--serif)' }}
        >
          time&apos;s up.
        </div>
        <div
          className="body mt-8"
          data-testid="feed-exhaustion-balance"
          style={{ color: '#d6d3cf' }}
        >
          jar: {fmtMin(balance)} left
        </div>
        {error === 'insufficient' && (
          <div className="body mt-8" style={{ color: 'var(--accent)' }}>
            Not enough time to extend.
          </div>
        )}

        <div className="col gap-8 mt-24" style={{ width: '100%' }}>
          <button
            type="button"
            className="btn-accent"
            onClick={() => router.push('/home')}
            data-testid="feed-exhaustion-back"
          >
            Back to learning
          </button>
          {canExtend && (
            <button
              type="button"
              className="btn-ghost"
              onClick={doExtend}
              disabled={submitting}
              data-testid="feed-exhaustion-extend"
            >
              {submitting ? 'extending…' : 'Watch 1 more minute (−60s)'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
