import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const Body = z.object({ lessonId: z.string().uuid() });

// Uses the user-scoped Supabase client (not adminClient) so RLS does the
// work: the `lessons_read` policy filters out invisible rows on the
// select, and `progress_own` allows the upsert only when user_id matches
// auth.uid(). This differs from /api/sessions/start, which uses
// adminClient + an explicit join because it also needs to write sessions.
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad' }, { status: 400 });
  const { lessonId } = parsed.data;

  // RLS filters invisible lessons. No row => 403 (don't enumerate).
  const { data: lesson } = await supabase
    .from('lessons')
    .select('id')
    .eq('id', lessonId)
    .maybeSingle();
  if (!lesson) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Overwrite semantic: a second completion call updates completed_at to
  // "most recent completion." If "earliest completion" becomes product-
  // relevant (streaks, certificates), switch to ignoreDuplicates or track
  // both timestamps.
  const completedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('lesson_progress')
    .upsert(
      { user_id: user.id, lesson_id: lessonId, completed_at: completedAt },
      { onConflict: 'user_id,lesson_id' }
    )
    .select('completed_at')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: 'upsert_failed' }, { status: 500 });
  }

  return NextResponse.json({ completedAt: data.completed_at });
}
