// components/home/HomeTopicSection.tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { HomeTopicToolbar } from './HomeTopicToolbar';
import { TopicRail } from './TopicRail';
import { SortableList } from '@/components/library/SortableList';
import { ItemMenu } from '@/components/library/ItemMenu';
import { RenameModal } from '@/components/library/RenameModal';
import { DeleteConfirmDialog } from '@/components/library/DeleteConfirmDialog';
import {
  renameTopic,
  deleteTopic,
  reorderTopics,
  getTopicDeleteBlastRadius,
} from '@/app/library/actions/topic';

type Topic = { id: string; title: string };
type Course = { id: string; title: string };
type Lesson = { id: string; title: string; duration_seconds: number; yt_id: string; done: boolean };

type Props = {
  topics: Topic[];
  coursesByTopic: Map<string, Course[]>;
  lessonsByCourse: Map<string, Lesson[]>;
};

export function HomeTopicSection({ topics, coursesByTopic, lessonsByCourse }: Props) {
  const [organizing, setOrganizing] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Topic | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Topic | null>(null);
  const [blast, setBlast] = useState<{ courses: number; lectures: number } | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const onDeleteRequested = async (t: Topic) => {
    const r = await getTopicDeleteBlastRadius({ topicId: t.id });
    setBlast(r);
    setDeleteTarget(t);
  };

  return (
    <>
      <HomeTopicToolbar
        organizing={organizing}
        onOrganizeToggle={() => setOrganizing((v) => !v)}
      />

      {organizing ? (
        <SortableList
          items={topics}
          onReorder={(ids) =>
            startTransition(async () => {
              await reorderTopics({ orderedIds: ids });
            })
          }
          renderItem={(t, handleProps) => (
            <div className="sortable-row" data-testid={`organize-topic-${t.id}`}>
              <span className="drag-handle" {...handleProps}>⋮⋮</span>
              <span className="grow">{t.title}</span>
              <button
                className="btn-icon menu-item-danger"
                onClick={() => onDeleteRequested(t)}
                aria-label="Delete topic"
              >
                ✕
              </button>
            </div>
          )}
        />
      ) : (
        topics.map((t) => (
          <div
            key={t.id}
            className="row aic"
            data-testid={`home-topic-${t.id}`}
          >
            <div className="grow">
              <TopicRail
                topic={{ id: t.id, title: t.title }}
                courses={coursesByTopic.get(t.id) ?? []}
                lessonsByCourse={lessonsByCourse}
              />
            </div>
            <ItemMenu
              testId={`home-topic-${t.id}-menu`}
              items={[
                { label: 'Rename', onSelect: () => setRenameTarget(t) },
                {
                  label: 'Delete',
                  destructive: true,
                  onSelect: () => onDeleteRequested(t),
                },
              ]}
            />
          </div>
        ))
      )}

      <RenameModal
        open={!!renameTarget}
        initialValue={renameTarget?.title ?? ''}
        maxLength={40}
        label="Rename topic"
        onSubmit={async (v) => {
          await renameTopic({ topicId: renameTarget!.id, newTitle: v });
          router.refresh();
        }}
        onClose={() => setRenameTarget(null)}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.title}"?`}
        body={
          blast
            ? `This will also remove ${blast.courses} course${blast.courses === 1 ? '' : 's'}, ${blast.lectures} lecture${blast.lectures === 1 ? '' : 's'}, and your progress on them. This cannot be undone.`
            : '…'
        }
        onConfirm={async () => {
          await deleteTopic({ topicId: deleteTarget!.id });
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
