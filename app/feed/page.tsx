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

  // Fisher-Yates shuffle. The earlier .sort(() => Math.random() - 0.5)
  // is biased — V8's TimSort revisits pairs and the comparator isn't a
  // proper ordering, so earlier elements cluster near the front. With
  // 357 videos we'd see the same ~5 up top on repeat entries. F-Y
  // gives uniformly random permutations so each session truly differs.
  const shuffled = [...(vids ?? [])];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return <FeedPlayer sessionId={sessionId} budgetSeconds={budget} vids={shuffled} />;
}
