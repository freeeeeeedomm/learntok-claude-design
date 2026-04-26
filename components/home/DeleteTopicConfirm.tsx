'use client';

type Props = {
  topicTitle: string;
  courseCount: number;
  completedLessonCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
};

export function DeleteTopicConfirm({
  topicTitle,
  courseCount,
  completedLessonCount,
  onCancel,
  onConfirm,
  pending,
}: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel} data-testid="delete-topic-modal">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="display" style={{ fontSize: 20 }}>
          Delete {topicTitle}?
        </div>
        <div className="body" style={{ marginTop: 12, color: 'var(--ink-mute)' }}>
          You have {courseCount} {courseCount === 1 ? 'course' : 'courses'} with{' '}
          {completedLessonCount} completed{' '}
          {completedLessonCount === 1 ? 'lesson' : 'lessons'}. This will remove
          all of them and your progress.
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={pending}
            data-testid="delete-topic-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={pending}
            data-testid="delete-topic-confirm"
            style={{ background: 'var(--bad)' }}
          >
            {pending ? 'deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
