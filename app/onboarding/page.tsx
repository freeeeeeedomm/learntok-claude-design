import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Onboarding } from '@/components/onboarding/Onboarding';
import { completeOnboarding } from './actions';

export default async function OnboardingPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login'); // middleware also guards this

  const { data: profile } = await supabase
    .from('profiles')
    .select('interests, rate, onboarded')
    .eq('id', user.id)
    .single();

  if (profile?.onboarded) redirect('/home');

  return (
    <Onboarding
      initialInterests={profile?.interests ?? []}
      initialRate={profile?.rate ?? 1.0}
      onFinish={completeOnboarding}
    />
  );
}
