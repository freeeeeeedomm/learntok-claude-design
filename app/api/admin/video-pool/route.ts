import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { checkAdminForApi } from '@/lib/admin-auth';
import { extractVideoId, buildVideoUrl } from '@/lib/tiktok-url';

const Body = z.object({ url: z.string(), category: z.string() });

export async function POST(req: Request) {
  const admin = await checkAdminForApi();
  if (!admin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let parsed: { url: string; category: string };
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }

  const ref = extractVideoId(parsed.url);
  if (!ref) {
    return NextResponse.json({ error: 'bad_url' }, { status: 400 });
  }

  const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(
    buildVideoUrl(ref)
  )}`;
  let oembedJson: {
    title?: string;
    thumbnail_url?: string;
    author_name?: string;
  };
  try {
    const r = await fetch(oembedUrl);
    if (!r.ok) {
      return NextResponse.json({ error: 'oembed_failed' }, { status: 422 });
    }
    oembedJson = await r.json();
  } catch {
    return NextResponse.json({ error: 'network' }, { status: 502 });
  }

  const sb = adminClient();

  const { data: existing } = await sb
    .from('video_pool')
    .select('id, is_active, category')
    .eq('video_id', ref.videoId)
    .maybeSingle();

  if (existing && existing.is_active) {
    return NextResponse.json(
      { error: 'already_active', category: existing.category },
      { status: 409 }
    );
  }

  const row = {
    video_id: ref.videoId,
    source: 'tiktok' as const,
    category: parsed.category,
    title: oembedJson.title ?? null,
    author: oembedJson.author_name ?? ref.author,
    thumbnail_url: oembedJson.thumbnail_url ?? null,
    is_active: true,
    scraped_at: new Date().toISOString(),
  };

  const { data: upserted, error } = await sb
    .from('video_pool')
    .upsert(row, { onConflict: 'video_id' })
    .select('id, video_id, source, category, title, author, thumbnail_url')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(upserted);
}
