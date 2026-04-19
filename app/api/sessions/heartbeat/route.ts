import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, adminClient } from '@/lib/supabase/server';

// Client sends a heartbeat every ~15s while in a lesson or feed.
// Server computes a trusted delta and inserts a ledger entry.

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

  if (delta > 0 && session.kind === 'learn') {
    credited = delta;
    await admin.from('ledger_entries').insert({
      user_id: user.id,
      delta_seconds: delta,
      label: 'lesson',
      ref_id: session.lesson_id,
    });
    await admin.from('sessions').update({
      last_heartbeat_at: nowIso,
      earned_or_spent_seconds: session.earned_or_spent_seconds + delta,
    }).eq('id', session.id);
  } else if (delta > 0 && session.kind === 'feed') {
    credited = -delta;
    await admin.from('ledger_entries').insert({
      user_id: user.id,
      delta_seconds: -delta,
      label: 'feed',
      ref_id: session.id,
    });
    const newEarnedOrSpent = session.earned_or_spent_seconds - delta;
    const spent = -newEarnedOrSpent;
    const budget = session.budget_seconds ?? 0;

    if (spent > budget) {
      // One heartbeat of overdraft consumed → force-close.
      await admin.from('sessions').update({
        last_heartbeat_at: nowIso,
        earned_or_spent_seconds: newEarnedOrSpent,
        ended_at: nowIso,
      }).eq('id', session.id);
      ended = true;
      reason = 'budget_exhausted';
    } else {
      await admin.from('sessions').update({
        last_heartbeat_at: nowIso,
        earned_or_spent_seconds: newEarnedOrSpent,
      }).eq('id', session.id);
    }
  } else {
    await admin.from('sessions').update({ last_heartbeat_at: nowIso }).eq('id', session.id);
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('jar_balance_cached')
    .eq('id', user.id)
    .single();

  const res: { balance: number; credited: number; ended?: true; reason?: string } = {
    balance: profile?.jar_balance_cached ?? 0,
    credited,
  };
  if (ended) { res.ended = true; res.reason = reason; }
  return NextResponse.json(res);
}
