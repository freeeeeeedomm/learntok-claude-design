import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const Body = z.object({ sessionId: z.string().uuid() });

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('extend_feed_session', {
    p_session_id: parsed.data.sessionId,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('insufficient_balance')) {
      return NextResponse.json({ error: 'insufficient_balance' }, { status: 400 });
    }
    if (msg.includes('forbidden')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    if (msg.includes('invalid_session') || msg.includes('session_already_ended')) {
      return NextResponse.json({ error: 'invalid_session' }, { status: 400 });
    }
    return NextResponse.json({ error: 'extend_failed' }, { status: 500 });
  }

  // RPC returns jsonb { newBudget, balanceAfter }
  return NextResponse.json(data);
}
