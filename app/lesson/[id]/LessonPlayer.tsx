'use client';

export type LessonPlayerProps = {
  lesson: {
    id: string;
    title: string;
    ytId: string;
    position: number;
    courseTitle: string;
    courseLessonCount: number;
  };
  initialBalance: number;
  alreadyCompleted: boolean;
};

export function LessonPlayer(_props: LessonPlayerProps) {
  return <div>lesson player (scaffold)</div>;
}
