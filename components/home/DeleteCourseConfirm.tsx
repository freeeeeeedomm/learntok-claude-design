'use client';

type Props = {
  courseTitle: string;
  completedLessonCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
};

export function DeleteCourseConfirm({
  courseTitle,
  completedLessonCount,
  onCancel,
  onConfirm,
  pending,
}: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel} data-testid="delete-course-modal">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="display" style={{ fontSize: 20 }}>
          Remove {courseTitle}?
        </div>
        <div className="body" style={{ marginTop: 12, color: 'var(--ink-mute)' }}>
          You&apos;ve completed {completedLessonCount}{' '}
          {completedLessonCount === 1 ? 'lesson' : 'lessons'}. This deletes the
          course and your progress.
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={pending}
            data-testid="delete-course-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={pending}
            data-testid="delete-course-confirm"
            style={{ background: 'var(--bad)' }}
          >
            {pending ? 'deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
