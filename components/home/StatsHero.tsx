import { fmtBank } from '@/lib/format';

type Props = {
  balance: number;
  streak: number;
  earnedToday: number;
  spentToday: number;
};

// Two-row hero, lifted from the old /progress summary card the user liked:
//   row 1: balance (big serif) + streak (🔥 N, right-aligned)
//   row 2: earned today | spent today (mono labels + colored values)
// No scope toggle (lived elsewhere on the old card; intentionally dropped).
export function StatsHero({ balance, streak, earnedToday, spentToday }: Props) {
  return (
    <div className="stats-hero" data-testid="home-stats-hero">
      <div className="stats-hero-top">
        <div className="stats-hero-cell" data-testid="hero-balance">
          <span className="stats-hero-label">balance</span>
          <span className="stats-hero-balance-value">{fmtBank(balance)}</span>
        </div>
        <div className="stats-hero-cell streak" data-testid="hero-streak">
          <span className="stats-hero-label">streak</span>
          <span className="stats-hero-streak-value">🔥 {streak}</span>
        </div>
      </div>
      <div className="stats-hero-bottom">
        <div className="stats-hero-cell" data-testid="hero-earned-today">
          <span className="stats-hero-label">earned today</span>
          <span className="stats-hero-mini good">+{fmtBank(earnedToday)}</span>
        </div>
        <div className="stats-hero-cell" data-testid="hero-spent-today">
          <span className="stats-hero-label">spent today</span>
          <span className="stats-hero-mini bad">−{fmtBank(spentToday)}</span>
        </div>
      </div>
    </div>
  );
}
