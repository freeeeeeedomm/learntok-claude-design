'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { BudgetPicker } from '@/components/budget/BudgetPicker';

type Stage = 'ask' | 'budget' | 'submitting';

export function BreakSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>('ask');
  const [balance, setBalance] = useState<number>(0);
  const [budget, setBudget] = useState<number>(300);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Fetch current balance when the sheet opens so the picker's presets +
  // slider bound are correct. Cheap — a single RLS'd profile row read.
  useEffect(() => {
    if (!open) return;
    setStage('ask');
    setError(null);
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('jar_balance_cached')
        .eq('id', user.id)
        .single();
      const b = data?.jar_balance_cached ?? 0;
      setBalance(b);
      setBudget(Math.min(300, b));
    })();
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const start = async () => {
    if (budget <= 0) {
      setError("jar is empty — earn some time first.");
      return;
    }
    setStage('submitting');
    setError(null);
    try {
      const res = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'feed', budgetSeconds: budget }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'could not start feed session');
        setStage('budget');
        return;
      }
      const { sessionId } = await res.json();
      router.push(`/feed?session=${sessionId}&budget=${budget}`);
    } catch {
      setError('network hiccup — try again');
      setStage('budget');
    }
  };

  return (
    <div
      className="break-backdrop"
      onClick={onClose}
      data-testid="break-backdrop"
    >
      <div
        className="break-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        data-testid="break-sheet"
      >
        <div className="break-sheet-handle" />

        {stage === 'ask' && (
          <div className="col gap-16 tc">
            <div style={{ display: 'flex', justifyContent: 'center' }} aria-hidden>
              <Image
                src="/characters/nibs.png"
                alt=""
                width={112}
                height={112}
                draggable={false}
              />
            </div>
            <div className="display" style={{ fontSize: 22 }}>
              想休息一下吗？
            </div>
            <div className="col gap-8">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStage('budget')}
                data-testid="break-yes"
              >
                好啊
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onClose}
                data-testid="break-no"
              >
                再学一下
              </button>
            </div>
          </div>
        )}

        {(stage === 'budget' || stage === 'submitting') && (
          <div className="col gap-12">
            <div className="eyebrow tc">pick a budget</div>
            <BudgetPicker
              balance={balance}
              value={budget}
              onChange={setBudget}
              testIdPrefix="break-budget"
            />

            {error && (
              <div
                className="card"
                style={{
                  background: 'rgba(217, 111, 61, 0.08)',
                  borderColor: 'var(--bad)',
                }}
                data-testid="break-error"
              >
                <div className="body" style={{ color: 'var(--bad)' }}>
                  {error}
                </div>
              </div>
            )}

            <div className="col gap-8">
              <button
                type="button"
                className="btn btn-primary"
                onClick={start}
                disabled={stage === 'submitting' || balance <= 0}
                data-testid="break-start"
              >
                {stage === 'submitting' ? 'starting…' : 'start scrolling →'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setStage('ask')}
                disabled={stage === 'submitting'}
              >
                back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
