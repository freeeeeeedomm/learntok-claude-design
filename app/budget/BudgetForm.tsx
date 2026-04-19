'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BudgetPicker } from '@/components/budget/BudgetPicker';

export function BudgetForm({ balance }: { balance: number }) {
  const defaultBudget = Math.min(300, balance);
  const [budget, setBudget] = useState<number>(defaultBudget);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
      <BudgetPicker balance={balance} value={budget} onChange={setBudget} />

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
