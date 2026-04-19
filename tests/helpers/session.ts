import { APIRequestContext, expect, request as pwRequest } from '@playwright/test';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const admin = () =>
  createAdminClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

/**
 * Returns an APIRequestContext that is already authenticated as the dev user,
 * plus that user's id. A single POST to /api/dev/login both provisions the
 * user (resetting their ledger back to the 300s welcome gift) and sets the
 * Supabase auth cookie on the response; Playwright's request context then
 * persists that cookie across subsequent calls automatically.
 */
export async function devAuthedContext(): Promise<{
  ctx: APIRequestContext;
  userId: string;
}> {
  const ctx = await pwRequest.newContext({
    baseURL: 'http://localhost:3000',
    extraHTTPHeaders: { 'content-type': 'application/json' },
  });
  const res = await ctx.post('/api/dev/login');
  expect(res.ok(), 'dev login route must succeed').toBeTruthy();
  const { email } = await res.json();

  const a = admin();
  const { data } = await a.auth.admin.listUsers();
  const userId = data.users.find((u) => u.email === email)!.id;

  return { ctx, userId };
}

/** Pick the first preset lesson — deterministic across test runs via seed. */
export async function anyPresetLessonId(): Promise<string> {
  const a = admin();
  const { data } = await a
    .from('lessons')
    .select('id, courses!inner(is_preset)')
    .eq('courses.is_preset', true)
    .limit(1)
    .single();
  expect(data?.id, 'seed must contain at least one preset lesson').toBeTruthy();
  return data!.id as string;
}

/** Directly backdate a session's last_heartbeat_at for gap-based tests. */
export async function backdateHeartbeat(sessionId: string, secondsAgo: number) {
  const a = admin();
  const when = new Date(Date.now() - secondsAgo * 1000).toISOString();
  await a.from('sessions').update({ last_heartbeat_at: when }).eq('id', sessionId);
}
