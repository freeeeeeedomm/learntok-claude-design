import { NextResponse } from 'next/server';
import { createClient, adminClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });
  const { seconds } = await req.json();
  await adminClient().from('ledger_entries').insert({
    user_id: user.id,
    delta_seconds: Number(seconds),
    label: 'test_seed',
  });
  return NextResponse.json({ ok: true });
}
