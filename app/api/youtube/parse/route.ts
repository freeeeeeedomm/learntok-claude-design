import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseYouTubeUrl } from '@/lib/youtube/parse';

const Q = z.object({ url: z.string().url() });

type ParseResult = {
  ytId: string;
  title: string;
  channel: string;
  thumbnail: string;
  durationSeconds: number;
  source: 'data-api' | 'oembed';
};

// This route keeps its own DataAPI / oembed handlers because it returns
// richer fields (channel, thumbnail) than lib/youtube/api.ts — those
// helpers are scoped to the bulk-import path which only needs title +
// duration. Only the URL → ID extraction is shared with lib.

async function parseViaDataApi(
  id: string,
  key: string,
): Promise<ParseResult | { error: string; status: number }> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${id}&key=${key}`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) return { error: 'data_api_failed', status: 502 };
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return { error: 'not_found', status: 404 };

  // ISO 8601 PT#H#M#S → seconds
  const iso = item.contentDetails.duration as string;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const seconds =
    parseInt(m?.[1] || '0') * 3600 +
    parseInt(m?.[2] || '0') * 60 +
    parseInt(m?.[3] || '0');

  return {
    ytId: id,
    title: item.snippet.title as string,
    channel: item.snippet.channelTitle as string,
    thumbnail: item.snippet.thumbnails?.medium?.url ?? '',
    durationSeconds: seconds,
    source: 'data-api',
  };
}

async function parseViaOembed(
  id: string,
): Promise<ParseResult | { error: string; status: number }> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${id}`,
  )}&format=json`;
  try {
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { error: 'oembed_failed', status: 502 };
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    return {
      ytId: id,
      title: data.title ?? id,
      channel: data.author_name ?? '',
      thumbnail: data.thumbnail_url ?? '',
      // oembed doesn't return duration; caller treats 0 as "unknown" and the
      // UI shows "—" instead of a time string.
      durationSeconds: 0,
      source: 'oembed',
    };
  } catch {
    return { error: 'network_error', status: 502 };
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = Q.safeParse({ url: searchParams.get('url') });
  if (!parsed.success)
    return NextResponse.json({ error: 'bad_url' }, { status: 400 });

  // Use the shared parser. This route only handles single-video URLs;
  // playlist URLs are rejected because the response shape is
  // single-video-only and adapting it would break existing callers.
  const parsedUrl = parseYouTubeUrl(parsed.data.url);
  if (parsedUrl.kind !== 'video') {
    return NextResponse.json(
      { error: parsedUrl.kind === 'playlist' ? 'not_a_single_video' : 'not_youtube' },
      { status: 400 },
    );
  }
  const id = parsedUrl.videoId;

  const key = process.env.YOUTUBE_API_KEY;
  // Use the Data API if we have a key (richer: duration), otherwise fall
  // back to oembed (no duration, but no key needed).
  const result = key ? await parseViaDataApi(id, key) : await parseViaOembed(id);

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
