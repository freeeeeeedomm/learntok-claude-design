import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, adminClient } from '@/lib/supabase/server';

// Client sends a heartbeat every ~15s while in a lesson or feed.
// Server computes a trusted delta and inserts a ledger entry via the
// apply_heartbeat_delta RPC so the session counter update is atomic.

const Body = z.object({
  sessionId: z.string().uuid(),
  playing: z.boolean(),
});

const MAX_CREDIT_PER_HEARTBEAT = 20; // seconds — caps accidental over-crediting

export async function POST(req: Request) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad' }, { status: 400 });
  const body = parsed.data;

  const admin = adminClient();
  const { data: session } = await admin.from('sessions').select('*').eq('id', body.sessionId).single();
  if (!session || session.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (session.ended_at) {
    return NextResponse.json({ error: 'session_closed' }, { status: 400 });
  }

  const lastBeat = new Date(session.last_heartbeat_at).getTime();
  const nowMs = Date.now();
  const gapSec = Math.max(0, Math.floor((nowMs - lastBeat) / 1000));

  // Anti-cheat is the per-heartbeat cap; idle detection lives on the client.
  const delta = body.playing ? Math.min(gapSec, MAX_CREDIT_PER_HEARTBEAT) : 0;
  const nowIso = new Date(nowMs).toISOString();

  let credited = 0;
  let ended = false;
  let reason: 'budget_exhausted' | undefined;

  if (delta > 0) {
    const signedDelta = session.kind === 'feed' ? -delta : delta;
    const { data: rpcResult, error: rpcError } = await admin.rpc('apply_heartbeat_delta', {
      p_session_id: session.id,
      p_user_id: user.id,
      p_delta: signedDelta,
      p_label: session.kind === 'feed' ? 'feed' : 'lesson',
      p_ref_id: session.kind === 'feed' ? session.id : session.lesson_id,
      p_now: nowIso,
    });
    if (rpcError || !rpcResult) {
      return NextResponse.json({ error: 'heartbeat_failed' }, { status: 500 });
    }
    const result = rpcResult as { new_earned_or_spent: number; credited: number; ended: boolean; reason: string | null };
    credited = result.credited;
    if (result.ended) {
      ended = true;
      reason = (result.reason ?? 'budget_exhausted') as 'budget_exhausted';
    }
  } else {
    // Idle / paused heartbeat — only bump the timestamp.
    const { error: updateError } = await admin
      .from('sessions')
      .update({ last_heartbeat_at: nowIso })
      .eq('id', session.id);
    if (updateError) {
      return NextResponse.json({ error: 'session_update_failed' }, { status: 500 });
    }
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('jar_balance_cached')
    .eq('id', user.id)
    .single();

  const res: { balance: number; credited: number; ended?: true; reason?: 'budget_exhausted' } = {
    balance: profile?.jar_balance_cached ?? 0,
    credited,
  };
  if (ended) { res.ended = true; res.reason = reason; }
  return NextResponse.json(res);
}
