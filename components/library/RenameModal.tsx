// components/library/RenameModal.tsx
'use client';
import { useState } from 'react';

type Props = {
  open: boolean;
  initialValue: string;
  maxLength: number;
  label: string; // e.g. "Rename topic"
  onSubmit: (value: string) => Promise<void> | void;
  onClose: () => void;
};

export function RenameModal({
  open,
  initialValue,
  maxLength,
  label,
  onSubmit,
  onClose,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [pending, setPending] = useState(false);
  if (!open) return null;

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > maxLength) return;
    setPending(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="rename-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">{label}</div>
        <input
          autoFocus
          value={value}
          maxLength={maxLength}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          data-testid="rename-input"
        />
        <div className="row gap-8 mt-12">
          <button onClick={onClose} disabled={pending} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pending || !value.trim()}
            className="btn btn-primary"
            data-testid="rename-submit"
          >
            {pending ? '…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
