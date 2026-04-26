import { fmtBank } from '@/lib/format';

type LedgerEntry = {
  id: number;
  label: string;
  delta: number;
  createdAt: string;
};

type Props = { ledger: LedgerEntry[] };

function relTime(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ageMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function RecentActivity({ ledger }: Props) {
  return (
    <section className="profile-section" data-testid="profile-activity">
      <div className="profile-section-title">recent activity</div>

      <div className="col gap-6">
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
            data-testid={`activity-row-${e.id}`}
          >
            <div className="col" style={{ gap: 2 }}>
              <div
                className="body"
                style={{ color: 'var(--ink)', textTransform: 'capitalize' }}
              >
                {e.label.replaceAll('_', ' ')}
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: 'var(--ink-mute)',
                }}
              >
                {relTime(e.createdAt)}
              </div>
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
    </section>
  );
}
