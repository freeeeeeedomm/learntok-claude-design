import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
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

  const dest = profile?.onboarded ? '/home' : '/onboarding';
  const res = NextResponse.redirect(new URL(dest, req.url));
  // Mark this browser as a returning visitor. The landing page at `/` uses
  // this cookie to skip itself for anyone who's completed at least one
  // login — new visitors still see the story, returning visitors go
  // straight to /login (or /home if their session is still alive). Set
  // here regardless of onboarding status: both /home and /onboarding mean
  // they've authenticated at least once.
  res.cookies.set('lt_seen', '1', {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
    path: '/',
  });
  return res;
}
