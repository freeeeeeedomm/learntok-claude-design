import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { checkAdminForApi } from '@/lib/admin-auth';

// Same rules as the POST in ../route.ts. Kept in sync manually since
// only two callers exist; if a third shows up extract to a helper.
function validateNewSlug(raw: string):
  | { ok: true; slug: string }
  | { ok: false; error: string; status: number } {
  const slug = raw.trim();
  if (slug.length === 0) return { ok: false, error: 'empty', status: 400 };
  if (slug.length > 30) return { ok: false, error: 'too_long', status: 400 };
  if (slug === 'all') return { ok: false, error: 'reserved', status: 400 };
  return { ok: true, slug };
}

const PatchBody = z.object({ slug: z.string() });

/**
 * Rename a category. Relies on the FK ON UPDATE CASCADE from migration
 * 0008 — updating categories.slug propagates to every video_pool.category
 * pointing at the old slug.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const admin = await checkAdminForApi();
  if (!admin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const oldSlug = decodeURIComponent(params.slug);
  if (oldSlug === 'all') {
    return NextResponse.json({ error: 'reserved' }, { status: 400 });
  }

  let parsed: { slug: string };
  try {
    parsed = PatchBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }

  const validation = validateNewSlug(parsed.slug);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status }
    );
  }
  const newSlug = validation.slug;

  if (newSlug === oldSlug) {
    return NextResponse.json({ slug: oldSlug });
  }

  const sb = adminClient();

  const { data: existing } = await sb
    .from('categories')
    .select('slug')
    .eq('slug', oldSlug)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: clash } = await sb
    .from('categories')
    .select('slug')
    .eq('slug', newSlug)
    .maybeSingle();
  if (clash) {
    return NextResponse.json({ error: 'duplicate' }, { status: 409 });
  }

  const { error } = await sb
    .from('categories')
    .update({ slug: newSlug })
    .eq('slug', oldSlug);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ slug: newSlug });
}

/**
 * Delete a category. By default, refuses if the category has any rows
 * in video_pool (matches the FK's on-delete-restrict). Pass ?force=1 to
 * also hard-delete every video in this category first.
 */
export async function DELETE(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const admin = await checkAdminForApi();
  if (!admin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const slug = decodeURIComponent(params.slug);
  if (slug === 'all') {
    return NextResponse.json({ error: 'reserved' }, { status: 400 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';

  const sb = adminClient();

  const { data: existing } = await sb
    .from('categories')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Count videos in this category (active + inactive — both block the FK).
  const { count } = await sb
    .from('video_pool')
    .select('id', { count: 'exact', head: true })
    .eq('category', slug);
  const videoCount = count ?? 0;

  if (videoCount > 0 && !force) {
    return NextResponse.json(
      { error: 'has_videos', videoCount },
      { status: 409 }
    );
  }

  if (videoCount > 0) {
    // Hard-delete videos first so the FK doesn't reject the category delete.
    const { error: vErr } = await sb
      .from('video_pool')
      .delete()
      .eq('category', slug);
    if (vErr) {
      return NextResponse.json({ error: vErr.message }, { status: 500 });
    }
  }

  const { error: cErr } = await sb
    .from('categories')
    .delete()
    .eq('slug', slug);
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: { slug, videos: videoCount } });
}
