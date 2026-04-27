// components/library/ItemMenu.tsx
'use client';
import { useEffect, useRef, useState } from 'react';

type Item = { label: string; onSelect: () => void; destructive?: boolean };
type Props = { items: Item[]; testId?: string };

export function ItemMenu({ items, testId }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn-icon"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        aria-label="More actions"
        data-testid={testId}
      >
        ⋯
      </button>
      {open && (
        <div className="menu-popover" data-testid={testId ? `${testId}-popover` : undefined}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              className={`menu-item${it.destructive ? ' menu-item-danger' : ''}`}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
