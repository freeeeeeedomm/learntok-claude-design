import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Onboarding } from '@/components/onboarding/Onboarding';
import { completeOnboarding } from './actions';

// Map an existing profiles.rate (= 5/learnMinutes for users from this flow,
// or anything in [0.5, 2.0] for legacy users) back to a slider position in
// our 10–60 range. For values outside the new range we snap to the default.
function rateToLearnMinutes(rate: number | null | undefined): number {
  if (!rate || rate <= 0) return 20;
  const m = Math.round(5 / rate / 5) * 5; // snap to step of 5
  if (m < 10 || m > 60) return 20;
  return m;
}

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('interests, rate, onboarded')
    .eq('id', user.id)
    .single();

  if (profile?.onboarded) redirect('/home');

  // Fetch the 5 preset groups in display order.
  const { data: groupsData } = await supabase
    .from('topic_groups')
    .select('id, key, title, icon, position')
    .eq('is_preset', true)
    .order('position', { ascending: true });

  // Fetch topic counts per group for the chip subtitle ("group · N 学科").
  // Single round-trip; aggregate in JS to keep the query simple.
  const { data: topicCountsData } = await supabase
    .from('topics')
    .select('group_id')
    .eq('is_preset', true)
    .not('group_id', 'is', null);

  const countByGroup = new Map<string, number>();
  for (const t of topicCountsData ?? []) {
    if (!t.group_id) continue;
    countByGroup.set(t.group_id, (countByGroup.get(t.group_id) ?? 0) + 1);
  }

  const groups = (groupsData ?? []).map((g) => ({
    key: g.key ?? '',
    title: g.title,
    icon: g.icon,
    topicCount: countByGroup.get(g.id) ?? 0,
  }));

  return (
    <Onboarding
      groups={groups}
      initialLearnMinutes={rateToLearnMinutes(profile?.rate)}
      onFinish={completeOnboarding}
    />
  );
}
