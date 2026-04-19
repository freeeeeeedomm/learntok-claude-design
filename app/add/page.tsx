import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AddForm } from './AddForm';

export default async function AddPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarded')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarded) redirect('/onboarding');

  return (
    <main className="app">
      <div className="topbar">
        <a href="/home" className="back" data-testid="add-back">
          ‹
        </a>
        <div className="eyebrow">add</div>
        <div style={{ width: 36 }} />
      </div>
      <div className="pad pad-top col gap-12" style={{ paddingTop: 80 }}>
        <div className="display" style={{ fontSize: 28 }}>
          paste a link
        </div>
        <AddForm />
      </div>
    </main>
  );
}
