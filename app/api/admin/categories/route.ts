import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { checkAdminForApi } from '@/lib/admin-auth';

const Body = z.object({ slug: z.string() });

export async function POST(req: Request) {
  const admin = await checkAdminForApi();
  if (!admin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let parsed: { slug: string };
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }

  const slug = parsed.slug.trim();
  if (slug.length === 0) {
    return NextResponse.json({ error: 'empty' }, { status: 400 });
  }
  if (slug.length > 30) {
    return NextResponse.json({ error: 'too_long' }, { status: 400 });
  }
  if (slug === 'all') {
    return NextResponse.json({ error: 'reserved' }, { status: 400 });
  }

  const sb = adminClient();

  const { data: existing } = await sb
    .from('categories')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'duplicate' }, { status: 409 });
  }

  const { data: maxRow } = await sb
    .from('categories')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const display_order = (maxRow?.display_order ?? 0) + 1;

  const { data: inserted, error } = await sb
    .from('categories')
    .insert({ slug, display_order })
    .select('slug, display_order')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(inserted);
}
