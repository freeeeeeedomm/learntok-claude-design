import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { checkAdminForApi } from '@/lib/admin-auth';

// Hard delete (DELETE FROM) — different from the per-row PATCH soft delete.
// Bulk multi-select implies the user has reviewed and meant it; a soft-delete
// recovery path doesn't exist for batches anyway.
const Body = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

export async function POST(req: Request) {
  const admin = await checkAdminForApi();
  if (!admin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let parsed: { ids: string[] };
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }

  const sb = adminClient();
  const { data, error } = await sb
    .from('video_pool')
    .delete()
    .in('id', parsed.ids)
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: data?.length ?? 0 });
}
