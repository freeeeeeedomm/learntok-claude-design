/**
 * TikTok video URL parsing + building.
 *
 * Used by:
 *  - app/api/admin/video-pool/route.ts (POST: parse user-pasted URL → ref)
 *  - scripts/scrape-tiktok.ts (build URL from scraped { id, author } → oembed)
 */

export interface TikTokVideoRef {
  videoId: string;
  author: string;
}

// Accepts:
//   https://www.tiktok.com/@khaby.lame/video/6950627842518568197
//   https://tiktok.com/@user/video/123456789
//   http variants, optional trailing slash, optional ?query
const VIDEO_URL_PATTERN = /^https?:\/\/(?:www\.)?tiktok\.com\/@([^/?#]+)\/video\/(\d{5,30})(?:[/?#].*)?$/;

export function extractVideoId(url: string): TikTokVideoRef | null {
  const trimmed = url.trim();
  const match = trimmed.match(VIDEO_URL_PATTERN);
  if (!match) return null;
  return { author: match[1], videoId: match[2] };
}

export function buildVideoUrl(ref: TikTokVideoRef): string {
  return `https://www.tiktok.com/@${ref.author}/video/${ref.videoId}`;
}
