import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BudgetForm } from './BudgetForm';

function fmtBank(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s.toString().padStart(2, '0')}s` : `${m}m`;
}

export default async function BudgetPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('jar_balance_cached, onboarded')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarded) redirect('/onboarding');

  const balance = profile.jar_balance_cached;

  return (
    <main className="app">
      <div className="topbar">
        <a href="/home" className="back" data-testid="budget-back">
          ×
        </a>
        <div className="jar-chip" data-testid="budget-jar-chip">
          <span className="jar-dot" />
          {fmtBank(balance)}
        </div>
      </div>

      <div className="pad pad-top col gap-12" style={{ paddingTop: 80 }}>
        <div className="eyebrow">budget</div>
        <div className="display" style={{ fontSize: 28 }}>
          how long?
        </div>

        <BudgetForm balance={balance} />
      </div>
    </main>
  );
}
