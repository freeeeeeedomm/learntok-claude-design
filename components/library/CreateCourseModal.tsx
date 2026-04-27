// components/library/CreateCourseModal.tsx
// Single-input modal for creating an empty course inside a topic.
// Course title is the only field; lectures are added separately via
// PR-D's AddLectureModal.

'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCourse } from '@/app/library/actions/course';

type Props = { topicId: string; open: boolean; onClose: () => void };

export function CreateCourseModal({ topicId, open, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!open) return null;

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    startTransition(async () => {
      await createCourse({ topicId, title: trimmed });
      onClose();
      setTitle('');
      router.refresh();
    });
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      data-testid="create-course-modal"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">New course</div>
        <input
          autoFocus
          placeholder="course title"
          maxLength={60}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          data-testid="create-course-title"
        />
        <div className="row gap-8 mt-16" style={{ justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={pending}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pending || !title.trim()}
            className="btn btn-primary"
            data-testid="create-course-submit"
          >
            {pending ? '…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
