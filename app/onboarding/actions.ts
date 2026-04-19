'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const Payload = z.object({
  interests: z.array(z.string().min(1).max(40)).min(1).max(24),
  rate: z.number().min(0.5).max(2),
});

export async function completeOnboarding(raw: { interests: string[]; rate: number }) {
  const parsed = Payload.safeParse(raw);
  if (!parsed.success) throw new Error('invalid_payload');

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('unauth');

  // RLS allows self-update on profiles; no need for the service-role client here.
  const { error } = await supabase
    .from('profiles')
    .update({
      interests: parsed.data.interests,
      rate: parsed.data.rate,
      onboarded: true,
    })
    .eq('id', user.id);
  if (error) throw new Error(error.message);

  redirect('/home');
}
