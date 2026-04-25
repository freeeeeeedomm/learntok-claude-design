'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function NewCategoryForm() {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const submit = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: slug.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const msg =
          body.error === 'duplicate'
            ? `「${slug.trim()}」已经存在了`
            : body.error === 'reserved'
            ? '`all` 是保留字,换一个'
            : body.error === 'too_long'
            ? 'slug 太长(最多 30 字)'
            : body.error === 'empty'
            ? 'slug 不能空'
            : '出错了,稍后再试';
        setError(msg);
        return;
      }
      setSlug('');
      setOpen(false);
      router.refresh();
    } catch {
      setError('网络出错');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          borderStyle: 'dashed',
          minHeight: 120,
          color: 'var(--ink-mute)',
          background: 'transparent',
        }}
        onClick={() => setOpen(true)}
        data-testid="admin-new-category-tile"
      >
        + 新分类
      </button>
    );
  }

  return (
    <div
      className="card col gap-8"
      style={{ padding: 8 }}
      data-testid="admin-new-category-form"
    >
      <input
        type="text"
        placeholder="分类名"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        disabled={submitting}
        style={{
          padding: 6,
          fontSize: 13,
          border: '1px solid #ddd',
          borderRadius: 4,
        }}
        data-testid="admin-new-category-input"
      />
      {error && (
        <div
          style={{ fontSize: 11, color: 'var(--bad)' }}
          data-testid="admin-new-category-error"
        >
          {error}
        </div>
      )}
      <div className="row gap-8">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setOpen(false);
            setSlug('');
            setError(null);
          }}
          disabled={submitting}
          style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
        >
          取消
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={submitting || !slug.trim()}
          style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
          data-testid="admin-new-category-submit"
        >
          {submitting ? '...' : '添加'}
        </button>
      </div>
    </div>
  );
}
