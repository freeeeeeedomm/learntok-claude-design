// lib/youtube/api.ts
// Server-only wrappers around the YouTube Data API v3.
// Reads YOUTUBE_API_KEY at call time (not module-load) so a missing key
// surfaces as a typed error rather than a silent boot break.

const ABORT_TIMEOUT_MS = 8000;

export type VideoMeta = {
  videoId: string;
  title: string;
  durationSeconds: number;
};

// ISO 8601 PT#H#M#S → total seconds. Returns 0 if iso is malformed.
function isoToSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return (
    parseInt(m?.[1] || '0') * 3600 +
    parseInt(m?.[2] || '0') * 60 +
    parseInt(m?.[3] || '0')
  );
}

/**
 * Per-video oembed fallback used when YOUTUBE_API_KEY isn't configured.
 * oembed needs no auth but returns no duration — caller stores 0 and the
 * UI shows "—" until a real heartbeat overrides it. Mirrors the legacy
 * /api/youtube/parse fallback so single-video adds keep working without
 * admin config.
 */
async function fetchVideoMetaOneViaOembed(
  videoId: string,
): Promise<VideoMeta | null> {
  const oembedUrl =
    `https://www.youtube.com/oembed?url=` +
    encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`) +
    `&format=json`;
  try {
    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(ABORT_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return {
      videoId,
      title: data.title ?? videoId,
      durationSeconds: 0,
    };
  } catch {
    return null;
  }
}

/**
 * Batch-fetch metadata for up to 50 video IDs.
 *
 * Prefers the Data API (snippet + contentDetails in one call → real
 * duration). When YOUTUBE_API_KEY isn't set, falls back to per-video
 * oembed in parallel — title-only, duration treated as 0. Playlist
 * expansion still requires the key (oembed has no playlist-items
 * endpoint), so paste-a-playlist won't work without it.
 *
 * The returned array may be shorter than the input if YouTube hides any
 * of the IDs (private / deleted / region-blocked); the caller should
 * detect that by indexing on `videoId`.
 */
export async function fetchVideoMeta(videoIds: string[]): Promise<VideoMeta[]> {
  if (videoIds.length === 0) return [];
  if (videoIds.length > 50) {
    throw new Error(`fetchVideoMeta supports <=50 IDs; got ${videoIds.length}`);
  }
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    // Graceful degradation: oembed every ID in parallel, drop unresolved.
    const results = await Promise.all(videoIds.map(fetchVideoMetaOneViaOembed));
    return results.filter((m): m is VideoMeta => m !== null);
  }

  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet,contentDetails&id=${videoIds.join(',')}&key=${key}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(ABORT_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`youtube videos.list ${res.status}`);
  const data = (await res.json()) as {
    items: Array<{
      id: string;
      snippet: { title: string };
      contentDetails: { duration: string };
    }>;
  };
  return data.items.map((it) => ({
    videoId: it.id,
    title: it.snippet.title,
    durationSeconds: isoToSeconds(it.contentDetails.duration),
  }));
}

/**
 * Expand a playlist into its videoIds, in playlist order.
 * Pages through playlistItems.list until either `cap` items are collected
 * or no more pages exist. Default cap matches the lecture-import limit.
 */
export async function expandPlaylist(
  playlistId: string,
  cap = 50,
): Promise<string[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY is not configured');

  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < cap) {
    const params = new URLSearchParams({
      part: 'contentDetails',
      playlistId,
      maxResults: String(Math.min(50, cap - ids.length)),
      key,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?${params}`,
      { signal: AbortSignal.timeout(ABORT_TIMEOUT_MS) },
    );
    if (!res.ok) throw new Error(`youtube playlistItems.list ${res.status}`);
    const data = (await res.json()) as {
      items: Array<{ contentDetails: { videoId: string } }>;
      nextPageToken?: string;
    };
    for (const it of data.items) ids.push(it.contentDetails.videoId);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return ids.slice(0, cap);
}
