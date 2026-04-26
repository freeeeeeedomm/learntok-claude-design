'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { removeTopic, confirmRemoveTopic } from '@/app/home/actions';
import { DeleteTopicConfirm } from './DeleteTopicConfirm';

type Props = {
  topicId: string;
  topicTitle: string;
};

export function TopicRailEdit({ topicId, topicTitle }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<
    null | { courseCount: number; completedLessonCount: number }
  >(null);
  const [pending, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  const onDeleteClick = () => {
    setOpen(false);
    startTransition(async () => {
      const res = await removeTopic(topicId);
      if ('requiresConfirm' in res) {
        setConfirming({
          courseCount: res.courseCount,
          completedLessonCount: res.completedLessonCount,
        });
      } else {
        router.refresh();
      }
    });
  };

  const onConfirm = () => {
    if (!confirming) return;
    startTransition(async () => {
      await confirmRemoveTopic(topicId);
      setConfirming(null);
      router.refresh();
    });
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', marginLeft: 'auto' }}>
      <button
        type="button"
        className="rail-edit-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid={`rail-edit-${topicId}`}
      >
        ⋯
      </button>
      {open && (
        <div className="rail-edit-popover" role="menu">
          <Link
            href={`/discover/topic/${topicId}`}
            data-testid={`rail-edit-add-${topicId}`}
          >
            + add course
          </Link>
          <button
            type="button"
            className="danger"
            onClick={onDeleteClick}
            disabled={pending}
            data-testid={`rail-edit-delete-${topicId}`}
          >
            delete topic
          </button>
        </div>
      )}
      {confirming && (
        <DeleteTopicConfirm
          topicTitle={topicTitle}
          courseCount={confirming.courseCount}
          completedLessonCount={confirming.completedLessonCount}
          onCancel={() => setConfirming(null)}
          onConfirm={onConfirm}
          pending={pending}
        />
      )}
    </div>
  );
}
