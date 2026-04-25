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
  const isAuthRoute =
    path.startsWith('/login') ||
    path.startsWith('/signup') ||
    path.startsWith('/auth');
  //
  // ┌─────────────────────────────────────────────────────────────────────┐
  // │ READ BEFORE EDITING `isPublic`                                      │
  // │                                                                     │
  // │ Every entry below is load-bearing for some unauthenticated flow.    │
  // │ When you ADD an entry (e.g. for a new admin or static path), DO     │
  // │ NOT rewrite the list — APPEND. Removing an entry will silently      │
  // │ break the flow it gated and the regression usually only shows up    │
  // │ in incognito / on first-time visitors (cached HTTP responses on     │
  // │ existing devices mask it).                                          │
  // │                                                                     │
  // │ History: phase5-admin-pool merge dropped /videos/, /scenes/,        │
  // │ /characters/ when adding /admin/* — landing page videos 307'd to    │
  // │ /login for two days before anyone noticed.                          │
  // └─────────────────────────────────────────────────────────────────────┘
  //
  // /api/dev/* is gated server-side by NEXT_PUBLIC_DEV_PANEL; let it through
  // here so the login page can call it before a session exists.
  //
  // /admin/* and /api/admin/* are exempt from the base auth gate so the cookie
  // backdoor can work without a Supabase session. Every page/route under those
  // paths MUST call requireAdmin() or checkAdminForApi() — otherwise it's
  // silently public.
  //
  // /videos/, /scenes/, /characters/ are static assets used by the
  // unauthenticated landing page at `/`. They MUST stay public.
  const isPublic =
    path === '/' ||
    path.startsWith('/_next') ||
    path.startsWith('/api/public') ||
    path.startsWith('/api/dev') ||
    path === '/admin' ||
    path.startsWith('/admin/') ||
    path === '/api/admin' ||
    path.startsWith('/api/admin/') ||
    // Static assets used by the public landing page (/) — must stay open
    // so unauthenticated visitors can load the chapter videos and PNGs.
    path.startsWith('/videos/') ||
    path.startsWith('/scenes/') ||
    path.startsWith('/characters/');

  // Root-path branching: only brand-new visitors see the landing story.
  // - logged-in user        → /home (skip the marketing page entirely)
  // - returning logged-out  → /login (cookie set on first /auth/callback)
  // - genuinely new visitor → fall through to the landing page
  // This runs before the generic auth gate so the gate never gets a chance
  // to redirect `/` itself.
  if (path === '/') {
    if (user) {
      return NextResponse.redirect(new URL('/home', req.url));
    }
    if (req.cookies.get('lt_seen')?.value === '1') {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }

  if (!user && !isAuthRoute && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (user && isAuthRoute && path !== '/auth/reset') {
    return NextResponse.redirect(new URL('/home', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
