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

  const { data: topicsData } = await supabase
    .from('topics')
    .select('id, title, icon, color, position')
    .eq('is_preset', true)
    .order('position', { ascending: true });

  const topics = (topicsData ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    icon: t.icon,
    color: t.color,
  }));

  // profile.interests was previously free-text; only keep entries that match
  // a current preset topic UUID so legacy strings don't pre-select anything.
  const validIds = new Set(topics.map((t) => t.id));
  const initialTopicIds = (profile?.interests ?? []).filter((s: string) =>
    validIds.has(s),
  );

  return (
    <Onboarding
      topics={topics}
      initialLearnMinutes={rateToLearnMinutes(profile?.rate)}
      initialTopicIds={initialTopicIds}
      onFinish={completeOnboarding}
    />
  );
}
