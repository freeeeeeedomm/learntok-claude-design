import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, adminClient } from '@/lib/supabase/server';

const Body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('learn'), lessonId: z.string().uuid() }),
  z.object({ kind: z.literal('feed'), budgetSeconds: z.number().int().positive() }),
]);

export async function POST(req: Request) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad' }, { status: 400 });
  const body = parsed.data;

  const admin = adminClient();

  if (body.kind === 'learn') {
    // Verify the lesson is visible to this user (owned course OR preset).
    const { data: lesson } = await admin
      .from('lessons')
      .select('id, courses!inner(owner_id, is_preset)')
      .eq('id', body.lessonId)
      .single();
    const course = (lesson as any)?.courses;
    const visible = !!lesson && (course?.is_preset === true || course?.owner_id === user.id);
    if (!visible) return NextResponse.json({ error: 'lesson_not_visible' }, { status: 403 });
  }

  // Auto-close any open sessions for this user so at most one is active.
  await admin
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('ended_at', null);

  const insertRow = {
    user_id: user.id,
    kind: body.kind,
    lesson_id: body.kind === 'learn' ? body.lessonId : null,
    budget_seconds: body.kind === 'feed' ? body.budgetSeconds : null,
  };
  const { data: created, error } = await admin
    .from('sessions')
    .insert(insertRow)
    .select('id')
    .single();
  if (error || !created) {
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ sessionId: created.id });
}
