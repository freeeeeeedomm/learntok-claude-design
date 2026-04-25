'use client';

import type { AdminVideo } from './VideoCard';

/**
 * Stub. Real implementation lands in Task 5. CategoryView imports
 * this so `slug && <NewVideoForm/>` doesn't dangle, and Task 2's test
 * asserts `admin-new-video-trigger` is visible on /admin/[slug].
 */
export function NewVideoForm({
  category: _category,
  onAdded: _onAdded,
}: {
  category: string;
  onAdded: (video: AdminVideo) => void;
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ alignSelf: 'flex-start', fontSize: 12, padding: '6px 12px' }}
      data-testid="admin-new-video-trigger"
      disabled
    >
      + 加视频 (todo)
    </button>
  );
}
