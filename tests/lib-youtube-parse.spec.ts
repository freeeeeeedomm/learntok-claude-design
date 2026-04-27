import { test, expect } from '@playwright/test';
import { parseYouTubeUrl } from '../lib/youtube/parse';

// Pure-function tests; do not use the page fixture, no browser spun up.

test.describe('parseYouTubeUrl', () => {
  test('watch URL', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      kind: 'video',
      videoId: 'dQw4w9WgXcQ',
    });
  });

  test('youtu.be short URL', () => {
    expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      kind: 'video',
      videoId: 'dQw4w9WgXcQ',
    });
  });

  test('shorts URL', () => {
    expect(parseYouTubeUrl('https://youtube.com/shorts/dQw4w9WgXcQ')).toEqual({
      kind: 'video',
      videoId: 'dQw4w9WgXcQ',
    });
  });

  test('embed URL', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toEqual({
      kind: 'video',
      videoId: 'dQw4w9WgXcQ',
    });
  });

  test('playlist URL', () => {
    expect(
      parseYouTubeUrl('https://www.youtube.com/playlist?list=PLABCDEF1234'),
    ).toEqual({ kind: 'playlist', playlistId: 'PLABCDEF1234' });
  });

  test('watch URL with list= prefers video (single-lecture intent)', () => {
    expect(
      parseYouTubeUrl(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLABCDEF1234',
      ),
    ).toEqual({ kind: 'video', videoId: 'dQw4w9WgXcQ' });
  });

  test('garbage', () => {
    expect(parseYouTubeUrl('https://example.com')).toEqual({ kind: 'unknown' });
    expect(parseYouTubeUrl('')).toEqual({ kind: 'unknown' });
    expect(parseYouTubeUrl('   ')).toEqual({ kind: 'unknown' });
  });

  test('whitespace tolerated', () => {
    expect(
      parseYouTubeUrl('  https://www.youtube.com/watch?v=dQw4w9WgXcQ  '),
    ).toEqual({ kind: 'video', videoId: 'dQw4w9WgXcQ' });
  });
});
