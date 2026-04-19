import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => req.cookies.get(n)?.value,
        set: (n: string, v: string, o: CookieOptions) => res.cookies.set({ name: n, value: v, ...o }),
        remove: (n: string, o: CookieOptions) => res.cookies.set({ name: n, value: '', ...o }),
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isAuthRoute = path.startsWith('/login') || path.startsWith('/auth');
  // /api/dev/* is gated server-side by NEXT_PUBLIC_DEV_PANEL; let it through here
  // so the login page can call it before a session exists.
  // /admin/* is handled by the admin module's own gating (requireAdmin in the
  // page + checkAdminForApi in route handlers), so middleware lets the whole
  // /admin/* tree + its API mount through without the anon→/login redirect.
  const isPublic =
    path === '/' ||
    path.startsWith('/_next') ||
    path.startsWith('/api/public') ||
    path.startsWith('/api/dev') ||
    path === '/admin/unlock' ||
    path === '/api/admin/unlock' ||
    path.startsWith('/admin') ||
    path.startsWith('/api/admin');

  if (!user && !isAuthRoute && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL('/home', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
