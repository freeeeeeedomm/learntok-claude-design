'use client';
import { useEffect, useMemo, useState } from 'react';

type Session = {
  id: string;
  kind: 'learn' | 'feed';
  startedAt: string; // ISO
  durationSec: number;
};

type Props = { sessions: Session[] };

type Window = 'week' | 'month';

function fmtDur(sec: number): string {
  if (sec <= 0) return '0m';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

// Date-only key in the user's local tz: YYYY-MM-DD.
function dayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayLabel(iso: string, todayKey: string, yesterdayKey: string): string {
  const k = dayKey(iso);
  if (k === todayKey) return 'Today';
  if (k === yesterdayKey) return 'Yesterday';
  const d = new Date(iso);
  const ageDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (ageDays < 7) {
    return d.toLocaleDateString('en', { weekday: 'short' });
  }
  return d.toLocaleDateString('en', { month: '2-digit', day: '2-digit' });
}

export function LearningRhythm({ sessions }: Props) {
  const [window, setWindow] = useState<Window>('week');

  // `new Date()` returns the *server* clock during SSR and the *client*
  // clock at hydration. They run in different timezones, so dayKey() drifts
  // and "Today"/"Yesterday" labels disagree — that mismatch crashes the
  // hydration of this entire subtree. We defer all time-dependent state
  // until after mount so the SSR pass renders an empty shell and the
  // first client render is the only one that touches the clock.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);

  const view = useMemo(() => {
    if (!now) return { rows: [], maxTotal: 0 };
    const dayCount = window === 'week' ? 7 : 30;

    // Build the list of date-keys to render, newest first.
    const days: { key: string; iso: string }[] = [];
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      days.push({ key: dayKey(d.toISOString()), iso: d.toISOString() });
    }

    // Bucket sessions by day-key.
    const byDay = new Map<string, Session[]>();
    for (const s of sessions) {
      if (s.durationSec <= 0) continue;
      const k = dayKey(s.startedAt);
      const arr = byDay.get(k) ?? [];
      arr.push(s);
      byDay.set(k, arr);
    }

    // Per-day totals + a global max for relative bar scaling.
    let maxTotal = 0;
    const rows = days.map(({ key, iso }) => {
      const items = (byDay.get(key) ?? []).slice().sort((a, b) =>
        a.startedAt.localeCompare(b.startedAt),
      );
      const learnSec = items
        .filter((s) => s.kind === 'learn')
        .reduce((sum, s) => sum + s.durationSec, 0);
      const feedSec = items
        .filter((s) => s.kind === 'feed')
        .reduce((sum, s) => sum + s.durationSec, 0);
      const total = learnSec + feedSec;
      if (total > maxTotal) maxTotal = total;
      return { key, iso, items, learnSec, feedSec, total };
    });

    return { rows, maxTotal };
  }, [sessions, window, now]);

  const todayKey = now ? dayKey(now.toISOString()) : '';
  const yesterdayKey = now
    ? (() => {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        return dayKey(d.toISOString());
      })()
    : '';

  return (
    <section className="profile-section" data-testid="profile-rhythm">
      <div className="row between aic" style={{ marginBottom: 8 }}>
        <div className="profile-section-title" style={{ marginBottom: 0 }}>
          learning rhythm
        </div>
        <div className="rhythm-window-toggle" data-testid="rhythm-window">
          <button
            type="button"
            className={window === 'week' ? 'active' : ''}
            onClick={() => setWindow('week')}
            data-testid="rhythm-window-week"
          >
            Week
          </button>
          <button
            type="button"
            className={window === 'month' ? 'active' : ''}
            onClick={() => setWindow('month')}
            data-testid="rhythm-window-month"
          >
            Month
          </button>
        </div>
      </div>

      <div className="card">
        {view.rows.map((row) => {
          const widthPct =
            view.maxTotal > 0 ? (row.total / view.maxTotal) * 100 : 0;
          return (
            <div
              key={row.key}
              className="rhythm-row"
              data-testid={`rhythm-day-${row.key}`}
            >
              <div className="rhythm-day">
                {dayLabel(row.iso, todayKey, yesterdayKey)}
              </div>

              {row.total === 0 ? (
                <div className="rhythm-empty">— no activity —</div>
              ) : (
                <div className="rhythm-bar" style={{ width: `${widthPct}%` }}>
                  {row.items.map((s) => {
                    const blockPct = (s.durationSec / row.total) * 100;
                    return (
                      <div
                        key={s.id}
                        className={`rhythm-block ${s.kind}`}
                        style={{ width: `${blockPct}%` }}
                        title={`${s.kind} · ${fmtDur(s.durationSec)} · ${new Date(
                          s.startedAt,
                        ).toLocaleTimeString('en', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}`}
                      />
                    );
                  })}
                </div>
              )}

              <div className="rhythm-totals">
                {row.total === 0
                  ? ''
                  : `${fmtDur(row.learnSec)} learn${
                      row.feedSec > 0 ? ` · ${fmtDur(row.feedSec)} relax` : ''
                    }`}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
