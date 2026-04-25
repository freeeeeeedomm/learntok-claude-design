'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function NewVideoFormPicker({ categories }: { categories: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState(categories[0] ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    if (!category) {
      setError('先建一个分类');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/video-pool', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), category }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          category?: string;
        };
        const msg =
          body.error === 'bad_url'
            ? 'URL 不对,得是 https://www.tiktok.com/@x/video/N 这种'
            : body.error === 'oembed_failed'
            ? '嵌入失败 — 视频可能被删了或设了隐私'
            : body.error === 'already_active'
            ? `这条已经在「${body.category ?? category}」里了`
            : body.error === 'network'
            ? 'TikTok 暂时不通,稍后再试'
            : '出错了,稍后再试';
        setError(msg);
        return;
      }
      setUrl('');
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
        className="btn btn-primary"
        onClick={() => setOpen(true)}
        style={{ alignSelf: 'flex-start', fontSize: 13, padding: '8px 14px' }}
        data-testid="admin-index-new-video-trigger"
      >
        + 加视频
      </button>
    );
  }

  return (
    <div
      className="card col gap-8"
      style={{ padding: 12 }}
      data-testid="admin-index-new-video-form"
    >
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        disabled={submitting || categories.length === 0}
        style={{
          padding: 8,
          fontSize: 13,
          border: '1px solid #ddd',
          borderRadius: 4,
        }}
        data-testid="admin-index-new-video-category"
      >
        {categories.length === 0 ? (
          <option value="">(没有分类)</option>
        ) : (
          categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))
        )}
      </select>
      <input
        type="text"
        placeholder="https://www.tiktok.com/@x/video/N"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={submitting}
        style={{
          padding: 8,
          fontSize: 13,
          border: '1px solid #ddd',
          borderRadius: 4,
        }}
        data-testid="admin-index-new-video-input"
      />
      {error && (
        <div
          style={{ fontSize: 11, color: 'var(--bad)' }}
          data-testid="admin-index-new-video-error"
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
            setUrl('');
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
          disabled={submitting || !url.trim() || !category}
          style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
          data-testid="admin-index-new-video-submit"
        >
          {submitting ? '正在添加...' : '添加'}
        </button>
      </div>
    </div>
  );
}
