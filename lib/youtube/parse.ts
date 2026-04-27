// lib/youtube/parse.ts
// Pure URL parsing — no network, no env. Cheap, easy to test.

export type ParsedYouTubeUrl =
  | { kind: 'video'; videoId: string }
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'unknown' };

const VIDEO_RE =
  /(?:youtube\.com\/(?:.*[?&]v=|embed\/|shorts\/|v\/)|youtu\.be\/)([\w-]{11})/;
const PLAYLIST_RE = /[?&]list=([\w-]+)/;

/**
 * Extract the YouTube resource ID from a URL.
 *
 * - watch URLs (youtube.com/watch?v=ID) → video
 * - youtu.be short URLs → video
 * - shorts / embed / /v/ URLs → video
 * - youtube.com/playlist?list=ID → playlist
 * - watch URL with both v= and list= → video (we open the single video; the
 *   playlist context is preserved by YouTube's player but we treat it as
 *   the user wanting one lecture, not the whole list)
 */
export function parseYouTubeUrl(raw: string): ParsedYouTubeUrl {
  const url = raw.trim();
  if (!url) return { kind: 'unknown' };

  const playlistMatch = url.match(PLAYLIST_RE);
  const isPlaylistPage = /youtube\.com\/playlist/.test(url);
  const videoMatch = url.match(VIDEO_RE);

  if (playlistMatch && (isPlaylistPage || !videoMatch)) {
    return { kind: 'playlist', playlistId: playlistMatch[1] };
  }
  if (videoMatch) {
    return { kind: 'video', videoId: videoMatch[1] };
  }
  return { kind: 'unknown' };
}
