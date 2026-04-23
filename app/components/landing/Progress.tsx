'use client';

const ROMANS = ['I', 'II', 'III', 'IV', 'V'];

export default function Progress({
  total,
  current,
  onGo,
}: {
  total: number;
  current: number;
  onGo: (i: number) => void;
}) {
  return (
    <nav className="progress" aria-label="Chapter progress">
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onGo(i)}
          aria-current={i === current ? 'true' : 'false'}
          aria-label={`Chapter ${i + 1}`}
        >
          <span>{ROMANS[i] ?? String(i + 1)}</span>
        </button>
      ))}
    </nav>
  );
}
