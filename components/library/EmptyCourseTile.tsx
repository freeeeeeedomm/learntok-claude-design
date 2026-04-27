// components/library/EmptyCourseTile.tsx
// Placeholder thumb for user-created courses (no icon yet). Renders a
// gray square with the uppercase first letter of the title centered.
// Used wherever a course tile would normally show an icon/thumbnail.

type Props = { title: string; size?: number };

export function EmptyCourseTile({ title, size = 64 }: Props) {
  const letter = (title.trim()[0] ?? '?').toUpperCase();
  return (
    <div
      className="empty-course-tile"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      aria-hidden
    >
      {letter}
    </div>
  );
}
