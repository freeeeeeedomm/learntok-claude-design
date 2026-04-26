'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { removeCourse, confirmRemoveCourse } from '@/app/home/actions';
import { DeleteCourseConfirm } from './DeleteCourseConfirm';

type LessonLite = {
  id: string;
  title: string;
  duration_seconds: number;
  yt_id: string;
  done: boolean;
};

type Props = {
  course: { id: string; title: string };
  lessons: LessonLite[];
};

function fmtMin(totalSeconds: number): string {
  if (totalSeconds <= 0) return '';
  const m = Math.max(1, Math.round(totalSeconds / 60));
  return `${m} min`;
}

export function RailCourseCard({ course, lessons }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<
    null | { completedLessonCount: number }
  >(null);
  const [pending, startTransition] = useTransition();

  const done = lessons.filter((l) => l.done).length;
  const total = lessons.length;
  const totalSeconds = lessons.reduce(
    (sum, l) => sum + (l.duration_seconds ?? 0),
    0,
  );
  const firstYt = lessons.find((l) => l.yt_id)?.yt_id ?? null;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const onRemoveClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      const res = await removeCourse(course.id);
      if ('requiresConfirm' in res) {
        setConfirming({ completedLessonCount: res.completedLessonCount });
      } else {
        router.refresh();
      }
    });
  };

  const onConfirm = () => {
    startTransition(async () => {
      await confirmRemoveCourse(course.id);
      setConfirming(null);
      router.refresh();
    });
  };

  return (
    <>
      <Link
        href={`/course/${course.id}`}
        className="rail-card"
        data-testid={`rail-card-${course.id}`}
      >
        <button
          type="button"
          className="rail-x"
          onClick={onRemoveClick}
          disabled={pending}
          aria-label={`Remove ${course.title}`}
          data-testid={`rail-x-${course.id}`}
        >
          ×
        </button>
        <div
          className="rail-thumb"
          style={
            firstYt
              ? { backgroundImage: `url(https://i.ytimg.com/vi/${firstYt}/mqdefault.jpg)` }
              : undefined
          }
        >
          {totalSeconds > 0 && <span className="dur">{fmtMin(totalSeconds)}</span>}
        </div>
        <div className="rail-t">{course.title}</div>
        <div className="rail-meta">
          {total === 0 ? '0 lessons' : `${total} lessons${done > 0 ? ` · ${done} done` : ''}`}
        </div>
        {total > 0 && (
          <div className="rail-bar">
            <i style={{ width: `${pct}%` }} />
          </div>
        )}
      </Link>
      {confirming && (
        <DeleteCourseConfirm
          courseTitle={course.title}
          completedLessonCount={confirming.completedLessonCount}
          onCancel={() => setConfirming(null)}
          onConfirm={onConfirm}
          pending={pending}
        />
      )}
    </>
  );
}
