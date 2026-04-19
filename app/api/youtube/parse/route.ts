import { NextResponse } from 'next/server';
import { z } from 'zod';

const Q = z.object({ url: z.string().url() });

// Extract YT video ID from various URL forms
function extractYtId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:.*[?&]v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = Q.safeParse({ url: searchParams.get('url') });
  if (!parsed.success) return NextResponse.json({ error: 'bad_url' }, { status: 400 });

  const id = extractYtId(parsed.data.url);
  if (!id) return NextResponse.json({ error: 'not_youtube' }, { status: 400 });

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return NextResponse.json({ error: 'no_api_key' }, { status: 500 });

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${id}&key=${key}`
  );
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // ISO 8601 PT#M#S → seconds
  const iso = item.contentDetails.duration as string;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const seconds = (parseInt(m?.[1] || '0') * 3600) + (parseInt(m?.[2] || '0') * 60) + parseInt(m?.[3] || '0');

  return NextResponse.json({
    ytId: id,
    title: item.snippet.title as string,
    channel: item.snippet.channelTitle as string,
    thumbnail: item.snippet.thumbnails?.medium?.url,
    durationSeconds: seconds,
  });
}
