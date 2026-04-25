import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, expectedAdminToken } from '@/lib/admin-auth';
import { z } from 'zod';

const Body = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  let parsed: { password: string };
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: 'admin_not_configured' }, { status: 500 });
  }
  if (parsed.password !== expected) {
    return NextResponse.json({ error: 'wrong_password' }, { status: 401 });
  }

  cookies().set(ADMIN_COOKIE_NAME, expectedAdminToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 400, // 400 days — browser-imposed cap
    path: '/',
  });

  return NextResponse.json({ ok: true });
}
