import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const intent = searchParams.get('intent');
  const supabase = createClient();
  if (code) await supabase.auth.exchangeCodeForSession(code);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarded')
    .eq('id', user.id)
    .single();

  // OAuth signup attempt for an account that already exists:
  // mirror the email-signup behavior — don't silently log them in,
  // sign out and bounce to /login with a notice so the UI can explain.
  if (intent === 'signup' && profile?.onboarded === true) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL('/login?notice=existing-account', req.url),
    );
  }

  const dest = profile?.onboarded ? '/home' : '/onboarding';
  return NextResponse.redirect(new URL(dest, req.url));
}
