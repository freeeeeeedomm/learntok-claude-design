// components/course/CourseLectureSection.tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AddLectureModal } from '@/components/library/AddLectureModal';
import { ItemMenu } from '@/components/library/ItemMenu';
import { RenameModal } from '@/components/library/RenameModal';
import { DeleteConfirmDialog } from '@/components/library/DeleteConfirmDialog';
import { SortableList } from '@/components/library/SortableList';
import {
  renameLecture,
  deleteLecture,
  reorderLectures,
} from '@/app/library/actions/lecture';

type Lecture = { id: string; title: string; yt_id: string; duration_seconds: number };
type Props = { courseId: string; ownsCourse: boolean; lectures: Lecture[] };

export function CourseLectureSection({ courseId, ownsCourse, lectures }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Lecture | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Lecture | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  return (
    <>
      {ownsCourse && (
        <div className="row gap-8 mt-16">
          <button
            type="button"
            className="link-btn"
            onClick={() => setAddOpen(true)}
            data-testid="course-add-lecture"
          >
            + Add lecture
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => setOrganizing((v) => !v)}
            data-testid="course-organize"
          >
            {organizing ? 'Done' : 'Organize'}
          </button>
        </div>
      )}

      {organizing ? (
        <SortableList
          items={lectures}
          onReorder={(ids) =>
            startTransition(async () => {
              await reorderLectures({ courseId, orderedIds: ids });
            })
          }
          renderItem={(l, h) => (
            <div className="sortable-row" data-testid={`organize-lecture-${l.id}`}>
              <span className="drag-handle" {...h}>⋮⋮</span>
              <span className="grow">{l.title}</span>
              <button
                className="btn-icon menu-item-danger"
                onClick={() => setDeleteTarget(l)}
                aria-label="Delete lecture"
              >
                ✕
              </button>
            </div>
          )}
        />
      ) : (
        <div className="col mt-16">
          {lectures.map((l) => (
            <div key={l.id} className="row aic" data-testid={`course-lecture-${l.id}`}>
              <a
                href={`/lesson/${l.id}`}
                className="grow"
                style={{ color: 'var(--accent)', textDecoration: 'none' }}
              >
                {l.title}
              </a>
              {ownsCourse && (
                <ItemMenu
                  testId={`course-lecture-${l.id}-menu`}
                  items={[
                    { label: 'Rename', onSelect: () => setRenameTarget(l) },
                    {
                      label: 'Delete',
                      destructive: true,
                      onSelect: () => setDeleteTarget(l),
                    },
                  ]}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <AddLectureModal
        courseId={courseId}
        open={addOpen}
        onClose={() => setAddOpen(false)}
      />

      <RenameModal
        open={!!renameTarget}
        initialValue={renameTarget?.title ?? ''}
        maxLength={120}
        label="Rename lecture"
        onSubmit={async (v) => {
          await renameLecture({ lectureId: renameTarget!.id, newTitle: v });
          router.refresh();
        }}
        onClose={() => setRenameTarget(null)}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.title}"?`}
        body="This will remove this lecture and your progress on it. This cannot be undone."
        onConfirm={async () => {
          await deleteLecture({ lectureId: deleteTarget!.id });
          router.refresh();
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
