'use client';

import { useState } from 'react';

function fmtBank(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r.toString().padStart(2, '0')}s` : `${m}m`;
}

type LedgerEntry = {
  id: number;
  label: string;
  delta: number;
  createdAt: string;
};

type CourseRow = {
  id: string;
  title: string;
  topic: string;
  icon: string;
  total: number;
  done: number;
};

export function ProgressView({
  balance,
  streak,
  rate,
  earnedToday,
  spentToday,
  ledger,
  courses,
}: {
  balance: number;
  streak: number;
  rate: number;
  earnedToday: number;
  spentToday: number;
  ledger: LedgerEntry[];
  courses: CourseRow[];
}) {
  const [tab, setTab] = useState<'ledger' | 'courses'>('ledger');

  return (
    <main className="app">
      <div className="topbar">
        <a href="/home" className="back" data-testid="progress-back">
          ‹
        </a>
        <div className="eyebrow">you</div>
        <div style={{ width: 36 }} />
      </div>

      <div className="pad pad-top" style={{ paddingTop: 80 }}>
        <div className="display" style={{ fontSize: 28 }}>
          your progress
        </div>

        <div className="row gap-6 mt-12" data-testid="progress-tabs">
          <button
            type="button"
            className={`chip ${tab === 'ledger' ? 'active' : ''}`}
            onClick={() => setTab('ledger')}
            data-testid="tab-ledger"
          >
            ledger
          </button>
          <button
            type="button"
            className={`chip ${tab === 'courses' ? 'active' : ''}`}
            onClick={() => setTab('courses')}
            data-testid="tab-courses"
          >
            courses
          </button>
        </div>

        {tab === 'ledger' && (
          <>
            <div
              className="card mt-16"
              style={{ background: 'var(--bg-3)' }}
              data-testid="progress-summary"
            >
              <div className="row between aic">
                <div className="col">
                  <div className="eyebrow">balance</div>
                  <div className="display mt-4" style={{ fontSize: 28 }}>
                    {fmtBank(balance)}
                  </div>
                </div>
                <div className="col tc">
                  <div className="eyebrow">streak</div>
                  <div className="display mt-4" style={{ fontSize: 20 }}>
                    🔥 {streak}
                  </div>
                </div>
              </div>
              <div className="row gap-12 mt-12">
                <div className="col">
                  <div className="eyebrow">earned today</div>
                  <div style={{ color: 'var(--good)', fontWeight: 600 }}>
                    +{fmtBank(earnedToday)}
                  </div>
                </div>
                <div className="col">
                  <div className="eyebrow">spent today</div>
                  <div style={{ color: 'var(--bad)', fontWeight: 600 }}>
                    −{fmtBank(spentToday)}
                  </div>
                </div>
                <div className="col">
                  <div className="eyebrow">rate</div>
                  <div style={{ fontWeight: 600 }}>1:{rate}</div>
                </div>
              </div>
            </div>

            <div className="eyebrow mt-24">recent</div>
            <div className="col gap-6 mt-8" data-testid="progress-ledger">
              {ledger.length === 0 && (
                <div className="body" style={{ textAlign: 'center', padding: 16 }}>
                  no activity yet.
                </div>
              )}
              {ledger.map((e) => (
                <div
                  key={e.id}
                  className="card row between aic"
                  style={{ padding: 12 }}
                >
                  <div
                    className="body"
                    style={{ color: 'var(--ink)', textTransform: 'capitalize' }}
                  >
                    {e.label.replaceAll('_', ' ')}
                  </div>
                  <div
                    style={{
                      color: e.delta > 0 ? 'var(--good)' : 'var(--bad)',
                      fontWeight: 600,
                      fontFamily: 'var(--mono)',
                      fontSize: 13,
                    }}
                  >
                    {e.delta > 0 ? '+' : '−'}
                    {fmtBank(Math.abs(e.delta))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'courses' && (
          <div className="col gap-8 mt-16" data-testid="progress-courses">
            {courses.length === 0 && (
              <div className="body" style={{ textAlign: 'center', padding: 16 }}>
                no courses yet.
              </div>
            )}
            {courses.map((c) => {
              const pct =
                c.total === 0 ? 0 : Math.round((c.done / c.total) * 100);
              return (
                <a
                  key={c.id}
                  href={`/course/${c.id}`}
                  className="card"
                  style={{
                    display: 'block',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                  data-testid={`progress-course-${c.id}`}
                >
                  <div className="row between aic">
                    <div style={{ fontWeight: 600 }}>{c.title}</div>
                    <div className="body" style={{ fontSize: 12 }}>
                      {c.done}/{c.total}
                    </div>
                  </div>
                  <div className="bar mt-8">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
