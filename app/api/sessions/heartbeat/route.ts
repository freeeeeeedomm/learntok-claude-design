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

  const body = Body.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: 'bad' }, { status: 400 });

  const admin = adminClient();
  const { data: session } = await admin.from('sessions').select('*').eq('id', body.data.sessionId).single();
  if (!session || session.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (session.ended_at) return NextResponse.json({ error: 'session_closed' }, { status: 400 });

  const lastBeat = new Date(session.last_heartbeat_at).getTime();
  const now = Date.now();
  const gapSec = Math.max(0, Math.floor((now - lastBeat) / 1000));

  // Anti-cheat is the per-heartbeat cap; idle detection lives on the client.
  const delta = body.data.playing ? Math.min(gapSec, MAX_CREDIT_PER_HEARTBEAT) : 0;

  if (session.kind === 'learn' && delta > 0) {
    await admin.from('ledger_entries').insert({
      user_id: user.id,
      delta_seconds: delta,
      label: 'lesson',
      ref_id: session.lesson_id,
    });
    await admin.from('sessions').update({
      last_heartbeat_at: new Date().toISOString(),
      earned_or_spent_seconds: session.earned_or_spent_seconds + delta,
    }).eq('id', session.id);
  } else {
    await admin.from('sessions').update({ last_heartbeat_at: new Date().toISOString() }).eq('id', session.id);
  }

  // Return fresh balance for optimistic UI correction
  const { data: profile } = await admin.from('profiles').select('jar_balance_cached').eq('id', user.id).single();
  return NextResponse.json({ balance: profile?.jar_balance_cached ?? 0, credited: delta });
}
