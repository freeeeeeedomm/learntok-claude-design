'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { importPresetTopic } from '@/app/library/actions/import';

/**
 * "Add to home" CTA on Discover preset topic tiles. On click, deep-copies
 * the preset topic onto the user's shelf and navigates to the new owner-
 * owned topic page. The router push triggers a re-render of Discover (via
 * revalidatePath in the action), which switches this card's CTA to "Open".
 */
export function ImportButton({ presetTopicId }: { presetTopicId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onClick = (e: React.MouseEvent) => {
    // The tile itself is a Link; stop the parent <a> from navigating.
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    startTransition(async () => {
      try {
        const { topicId } = await importPresetTopic({ presetTopicId });
        router.push(`/topic/${topicId}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'import_failed';
        alert(msg);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      data-testid={`discover-topic-${presetTopicId}-add`}
      aria-label="Add to home"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 999,
        border: '1px solid var(--accent)',
        background: 'var(--accent)',
        color: 'var(--bg)',
        fontFamily: 'var(--mono)',
        fontSize: 11,
        cursor: pending ? 'wait' : 'pointer',
        opacity: pending ? 0.6 : 1,
        transition: 'all 0.15s ease',
        flexShrink: 0,
      }}
    >
      {pending ? '…' : '+ add to home'}
    </button>
  );
}
