'use client';
import React from 'react';
import { addCourseToShelf, removeCourseFromShelf } from '@/app/discover/actions';

type Props = {
  courseId: string;
  initialInShelf: boolean;
  // Visual variant: "pill" for the topic-list page, "inline" for the course detail header.
  variant?: 'pill' | 'inline';
};

export function AddCourseButton({ courseId, initialInShelf, variant = 'pill' }: Props) {
  const [inShelf, setInShelf] = React.useState(initialInShelf);
  const [pending, setPending] = React.useState(false);

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    // Optimistic flip — server actions revalidate the page after success.
    const next = !inShelf;
    setInShelf(next);
    setPending(true);
    try {
      if (next) {
        await addCourseToShelf({ courseId });
      } else {
        await removeCourseFromShelf({ courseId });
      }
    } catch (err: any) {
      // Roll back on error.
      setInShelf(!next);
      alert(err?.message ?? 'shelf_update_failed');
    } finally {
      setPending(false);
    }
  };

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: variant === 'inline' ? '8px 14px' : '6px 12px',
    borderRadius: 999,
    border: `1px solid ${inShelf ? 'var(--line)' : 'var(--accent)'}`,
    background: inShelf ? 'var(--bg-2)' : 'var(--accent)',
    color: inShelf ? 'var(--ink-mute)' : 'var(--bg)',
    fontFamily: 'var(--mono)',
    fontSize: variant === 'inline' ? 13 : 11,
    cursor: pending ? 'wait' : 'pointer',
    opacity: pending ? 0.6 : 1,
    transition: 'all 0.15s ease',
    flexShrink: 0,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      data-testid={`shelf-toggle-${courseId}`}
      data-in-shelf={inShelf ? 'true' : 'false'}
      aria-pressed={inShelf}
      style={baseStyle}
    >
      {inShelf ? '✓ in library' : '+ add'}
    </button>
  );
}
