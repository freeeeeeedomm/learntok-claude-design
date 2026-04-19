import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function HomeStub() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarded')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarded) redirect('/onboarding');

  return (
    <main className="min-h-screen p-6 text-ink">
      <h1 className="font-serif text-3xl mb-4">home</h1>
      <p className="text-ink-soft">TODO(Claude Code): port Home from v3/screens.jsx — course list, jar chip, streak, NibsHandle at bottom.</p>
      <ul className="mt-6 space-y-2 text-sm text-ink-mute list-disc pl-6">
        <li>Server component: fetch courses + profile from Supabase</li>
        <li>Client component for jar chip (subscribes to profile changes)</li>
        <li>Link rows to /course/[id]</li>
        <li>NibsHandle from components/characters</li>
      </ul>
    </main>
  );
}
