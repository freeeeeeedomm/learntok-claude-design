import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { checkAdminForApi } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

/**
 * Admin thumbnail proxy.
 *
 * Why this exists: the raw `thumbnail_url` stored on `video_pool` is a
 * TikTok CDN signed URL with an `x-expires` timestamp. Those URLs stop
 * serving bytes after ~24h, so any admin session looking at a scrape
 * that's a day old would see broken thumbnails. Instead of storing the
 * expiring URL, we proxy: re-fetch fresh oembed, follow to the current
 * signed URL, stream the image bytes back. CDN caches our response for
 * an hour so we don't hammer TikTok on every grid render.
 */
export async function GET(
  _req: Request,
  { params }: { params: { videoId: string } }
) {
  const admin = await checkAdminForApi();
  if (!admin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const videoId = params.videoId;
  if (!/^[0-9a-zA-Z_-]{3,64}$/.test(videoId)) {
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  }

  const sb = adminClient();
  const { data: v } = await sb
    .from('video_pool')
    .select('author, source')
    .eq('video_id', videoId)
    .maybeSingle();

  if (!v || v.source !== 'tiktok' || !v.author) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const tiktokUrl = `https://www.tiktok.com/@${v.author}/video/${videoId}`;
  const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(tiktokUrl)}`;

  let thumbUrl: string | null = null;
  try {
    const oembedRes = await fetch(oembedUrl, {
      // Revalidate at most every hour to cap TikTok oembed hits.
      next: { revalidate: 3600 },
    });
    if (!oembedRes.ok) {
      return NextResponse.json({ error: 'oembed_failed' }, { status: 502 });
    }
    const json: { thumbnail_url?: string } = await oembedRes.json();
    thumbUrl = json.thumbnail_url ?? null;
  } catch {
    return NextResponse.json({ error: 'oembed_error' }, { status: 502 });
  }

  if (!thumbUrl) {
    return NextResponse.json({ error: 'no_thumbnail' }, { status: 404 });
  }

  let imgRes: Response;
  try {
    imgRes = await fetch(thumbUrl);
  } catch {
    return NextResponse.json({ error: 'image_fetch_error' }, { status: 502 });
  }
  if (!imgRes.ok || !imgRes.body) {
    return NextResponse.json({ error: 'image_fetch_failed' }, { status: 502 });
  }

  const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
  const buf = await imgRes.arrayBuffer();

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'content-type': contentType,
      // Cache at CDN + browser for 1h. Thumbnails are stable enough.
      'cache-control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
