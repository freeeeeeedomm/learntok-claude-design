import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FeedPlayer } from './FeedPlayer';

export const dynamic = 'force-dynamic';

export default async function FeedPage({
  searchParams,
}: {
  searchParams: { session?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const sessionId = searchParams.session;
  if (!sessionId) redirect('/budget');

  const { data: sessionRow } = await supabase
    .from('sessions')
    .select('id, kind, ended_at, budget_seconds')
    .eq('id', sessionId)
    .maybeSingle();

  // RLS hides sessions that don't belong to this user.
  if (!sessionRow || sessionRow.kind !== 'feed' || sessionRow.ended_at) {
    redirect('/budget');
  }

  const budget = sessionRow.budget_seconds ?? 0;
  if (budget <= 0) redirect('/budget');

  const { data: vids } = await supabase
    .from('video_pool')
    .select('video_id, source, title, category')
    .eq('is_active', true);

  // Server-side shuffle so each session gets a different order.
  const shuffled = [...(vids ?? [])].sort(() => Math.random() - 0.5);

  return <FeedPlayer sessionId={sessionId} budgetSeconds={budget} vids={shuffled} />;
}
