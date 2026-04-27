// components/topic/TopicCourseSection.tsx
// Client-side wrapper around the course list inside /topic/[id].
// Owns the Add-course modal, Organize toggle, per-row rename / delete
// menus and the destructive-confirm dialog. The parent server page
// passes `ownsTopic` so we hide all owner-only affordances on preset
// topics while still rendering the read-only list (e.g. when a user
// reaches a preset topic page from a deep link before importing).

'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CreateCourseModal } from '@/components/library/CreateCourseModal';
import { ItemMenu } from '@/components/library/ItemMenu';
import { RenameModal } from '@/components/library/RenameModal';
import { DeleteConfirmDialog } from '@/components/library/DeleteConfirmDialog';
import { SortableList } from '@/components/library/SortableList';
import { EmptyCourseTile } from '@/components/library/EmptyCourseTile';
import {
  renameCourse,
  deleteCourse,
  reorderCourses,
  getCourseDeleteBlastRadius,
} from '@/app/library/actions/course';

type Course = { id: string; title: string; icon: string | null };
type Props = { topicId: string; ownsTopic: boolean; courses: Course[] };

export function TopicCourseSection({ topicId, ownsTopic, courses }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Course | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [blast, setBlast] = useState<{ lectures: number } | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const onDeleteRequested = async (c: Course) => {
    const r = await getCourseDeleteBlastRadius({ courseId: c.id });
    setBlast(r);
    setDeleteTarget(c);
  };

  return (
    <>
      {ownsTopic && (
        <div className="row gap-8 mt-16">
          <button
            type="button"
            className="link-btn"
            onClick={() => setCreateOpen(true)}
            data-testid="topic-add-course"
          >
            + Add course
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => setOrganizing((v) => !v)}
            data-testid="topic-organize"
          >
            {organizing ? 'Done' : 'Organize'}
          </button>
        </div>
      )}

      {organizing ? (
        <SortableList
          items={courses}
          onReorder={(ids) =>
            startTransition(async () => {
              await reorderCourses({ topicId, orderedIds: ids });
            })
          }
          renderItem={(c, h) => (
            <div className="sortable-row" data-testid={`organize-course-${c.id}`}>
              <span className="drag-handle" {...h}>⋮⋮</span>
              <EmptyCourseTile title={c.title} size={32} />
              <span className="grow">{c.title}</span>
              <button
                className="btn-icon menu-item-danger"
                onClick={() => onDeleteRequested(c)}
                aria-label="Delete course"
              >
                ✕
              </button>
            </div>
          )}
        />
      ) : (
        <div className="col mt-16">
          {courses.map((c) => (
            <div
              key={c.id}
              className="row aic"
              data-testid={`topic-course-${c.id}`}
            >
              <a
                href={`/course/${c.id}`}
                className="row aic grow"
                style={{ gap: 12, textDecoration: 'none' }}
              >
                <EmptyCourseTile title={c.title} size={48} />
                <span style={{ color: 'var(--accent)' }}>{c.title}</span>
              </a>
              {ownsTopic && (
                <ItemMenu
                  testId={`topic-course-${c.id}-menu`}
                  items={[
                    { label: 'Rename', onSelect: () => setRenameTarget(c) },
                    {
                      label: 'Delete',
                      destructive: true,
                      onSelect: () => onDeleteRequested(c),
                    },
                  ]}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <CreateCourseModal
        topicId={topicId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      <RenameModal
        open={!!renameTarget}
        initialValue={renameTarget?.title ?? ''}
        maxLength={60}
        label="Rename course"
        onSubmit={async (v) => {
          await renameCourse({ courseId: renameTarget!.id, newTitle: v });
          router.refresh();
        }}
        onClose={() => setRenameTarget(null)}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.title}"?`}
        body={
          blast
            ? `This will also remove ${blast.lectures} lecture${
                blast.lectures === 1 ? '' : 's'
              } and your progress on them. This cannot be undone.`
            : '…'
        }
        onConfirm={async () => {
          await deleteCourse({ courseId: deleteTarget!.id });
          router.refresh();
        }}
        onClose={() => {
          setDeleteTarget(null);
          setBlast(null);
        }}
      />
    </>
  );
}
