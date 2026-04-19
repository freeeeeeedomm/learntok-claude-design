import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export const ADMIN_COOKIE_NAME = 'admin_unlock';
const COOKIE_VALUE_INPUT = 'admin-unlock-v1';

export function expectedAdminToken(): string {
  const pwd = process.env.ADMIN_PASSWORD;
  if (!pwd) throw new Error('ADMIN_PASSWORD env var not set');
  return crypto.createHmac('sha256', pwd).update(COOKIE_VALUE_INPUT).digest('hex');
}

async function checkAdmin(): Promise<{ mode: 'role' | 'cookie' } | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();
    if (data?.is_admin) return { mode: 'role' };
  }
  const token = cookies().get(ADMIN_COOKIE_NAME)?.value;
  if (token && process.env.ADMIN_PASSWORD) {
    try {
      const expected = expectedAdminToken();
      if (
        token.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
      ) {
        return { mode: 'cookie' };
      }
    } catch {
      // env var missing or HMAC failure — treat as not admin
    }
  }
  return null;
}

/** For server components / page.tsx — redirects to /admin/unlock on failure. */
export async function requireAdmin(): Promise<{ mode: 'role' | 'cookie' }> {
  const result = await checkAdmin();
  if (!result) redirect('/admin/unlock');
  return result;
}

/** For route handlers — caller returns 401 on null. */
export async function checkAdminForApi(): Promise<{ mode: 'role' | 'cookie' } | null> {
  return checkAdmin();
}
