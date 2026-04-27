// components/library/CreateTopicModal.tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTopic } from '@/app/library/actions/topic';

type Props = { open: boolean; onClose: () => void };

export function CreateTopicModal({ open, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState<string>('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!open) return null;

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    startTransition(async () => {
      await createTopic({
        title: trimmed,
        icon: icon || undefined,
      });
      onClose();
      setTitle('');
      router.refresh();
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="create-topic-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">New topic</div>
        <input
          autoFocus
          placeholder="topic title"
          maxLength={40}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          data-testid="create-topic-title"
        />
        {/* Icon picker is deferred — for v1 use a small emoji shortcuts row */}
        <div className="row gap-4 mt-8" style={{ flexWrap: 'wrap' }}>
          {['📚', '🧮', '🧪', '🎨', '🎵', '💻', '🌍', '🧠'].map((e) => (
            <button
              key={e}
              type="button"
              className={`btn-icon${icon === e ? ' btn-icon-active' : ''}`}
              onClick={() => setIcon(e)}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="row gap-8 mt-16" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={pending} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pending || !title.trim()}
            className="btn btn-primary"
            data-testid="create-topic-submit"
          >
            {pending ? '…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
