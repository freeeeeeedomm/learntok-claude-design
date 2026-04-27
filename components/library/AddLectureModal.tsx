// components/library/AddLectureModal.tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addLectures } from '@/app/library/actions/lecture';

type Props = { courseId: string; open: boolean; onClose: () => void };

export function AddLectureModal({ courseId, open, onClose }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!open) return null;

  const urls = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const submit = () => {
    setError(null);
    if (urls.length === 0) {
      setError('Paste at least one URL.');
      return;
    }
    if (urls.length > 50) {
      setError('Max 50 URLs per submission.');
      return;
    }
    startTransition(async () => {
      try {
        await addLectures({ courseId, urls });
        onClose();
        setText('');
        router.refresh();
      } catch (e: unknown) {
        setError((e as Error).message ?? 'failed');
      }
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="add-lecture-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 400 }}>
        <div className="eyebrow">Add lecture</div>
        <div className="body" style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
          Paste one or more YouTube video or playlist URLs, one per line. Max 50.
        </div>
        <textarea
          autoFocus
          rows={8}
          style={{ width: '100%', marginTop: 8, fontFamily: 'var(--mono)', fontSize: 12 }}
          placeholder={'https://www.youtube.com/watch?v=...\nhttps://youtu.be/...\nhttps://www.youtube.com/playlist?list=...'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid="add-lecture-textarea"
        />
        {error && <div className="body mt-8" style={{ color: 'var(--nibs)' }}>{error}</div>}
        <div className="row between aic mt-12">
          <div className="body" style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
            {urls.length} URL{urls.length === 1 ? '' : 's'} pasted
            {urls.length > 50 ? ' — exceeds max 50' : ''}
          </div>
          <div className="row gap-8">
            <button onClick={onClose} disabled={pending} className="btn btn-secondary">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={pending || urls.length === 0}
              className="btn btn-primary"
              data-testid="add-lecture-submit"
            >
              {pending ? '…' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
