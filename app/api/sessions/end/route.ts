import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, adminClient } from '@/lib/supabase/server';

const Body = z.object({ sessionId: z.string().uuid() });

export async function POST(req: Request) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad' }, { status: 400 });

  const admin = adminClient();
  const { data: session } = await admin
    .from('sessions')
    .select('user_id, ended_at, earned_or_spent_seconds')
    .eq('id', parsed.data.sessionId)
    .single();
  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (session.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (session.ended_at) {
    return NextResponse.json({ ok: true, earnedOrSpent: session.earned_or_spent_seconds });
  }

  const { data: updated } = await admin
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', parsed.data.sessionId)
    .select('earned_or_spent_seconds')
    .single();

  return NextResponse.json({ ok: true, earnedOrSpent: updated?.earned_or_spent_seconds ?? 0 });
}
