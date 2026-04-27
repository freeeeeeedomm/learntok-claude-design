// components/library/DeleteConfirmDialog.tsx
'use client';
import { useState } from 'react';

type Props = {
  open: boolean;
  title: string;
  body: string; // pre-formatted blast-radius sentence
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
};

export function DeleteConfirmDialog({ open, title, body, onConfirm, onClose }: Props) {
  const [pending, setPending] = useState(false);
  if (!open) return null;

  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="delete-dialog">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="display" style={{ fontSize: 18 }}>{title}</div>
        <div className="body mt-8">{body}</div>
        <div className="row gap-8 mt-16" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={pending} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={pending}
            className="btn btn-danger"
            data-testid="delete-confirm"
          >
            {pending ? '…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
