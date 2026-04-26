'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Rename + delete actions for a single category. Lives at the top of
 * the category page. Only rendered when slug is non-null (i.e. not on
 * /admin/all).
 */
export function CategoryManageBar({
  slug,
  videoCount,
}: {
  slug: string;
  videoCount: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'rename'>('idle');
  const [newSlug, setNewSlug] = useState(slug);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitRename = async () => {
    const trimmed = newSlug.trim();
    if (!trimmed || trimmed === slug) {
      setMode('idle');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/categories/${encodeURIComponent(slug)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug: trimmed }),
        }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        const msg =
          body.error === 'duplicate'
            ? `「${trimmed}」已经存在`
            : body.error === 'reserved'
            ? '`all` 是保留字'
            : body.error === 'too_long'
            ? 'slug 太长 (最多 30 字)'
            : body.error === 'empty'
            ? 'slug 不能空'
            : '改名失败';
        setError(msg);
        return;
      }
      // Navigate to the new slug's page
      router.replace(`/admin/${encodeURIComponent(trimmed)}`);
    } catch {
      setError('网络出错');
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = async () => {
    const msg =
      videoCount > 0
        ? `删除「${slug}」分类？里面 ${videoCount} 条视频也会被硬删,不可恢复。`
        : `删除「${slug}」分类？`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/categories/${encodeURIComponent(slug)}?force=1`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        alert('删除失败,稍后再试');
        setBusy(false);
        return;
      }
      router.replace('/admin');
    } catch {
      alert('网络出错');
      setBusy(false);
    }
  };

  if (mode === 'rename') {
    return (
      <div
        className="card col gap-8"
        style={{ padding: 12 }}
        data-testid="admin-rename-form"
      >
        <input
          type="text"
          value={newSlug}
          onChange={(e) => setNewSlug(e.target.value)}
          autoFocus
          disabled={busy}
          style={{
            padding: 8,
            fontSize: 13,
            border: '1px solid #ddd',
            borderRadius: 4,
          }}
          data-testid="admin-rename-input"
        />
        {error && (
          <div
            style={{ fontSize: 11, color: 'var(--bad)' }}
            data-testid="admin-rename-error"
          >
            {error}
          </div>
        )}
        <div className="row gap-8">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => {
              setMode('idle');
              setNewSlug(slug);
              setError(null);
            }}
            style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
          >
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !newSlug.trim() || newSlug.trim() === slug}
            onClick={submitRename}
            data-testid="admin-rename-submit"
            style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
          >
            {busy ? '...' : '保存'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="row" style={{ gap: 8 }}>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          setMode('rename');
          setNewSlug(slug);
          setError(null);
        }}
        disabled={busy}
        data-testid="admin-rename-trigger"
        style={{ fontSize: 12, padding: '6px 12px' }}
      >
        ✏️ 改名
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={submitDelete}
        disabled={busy}
        data-testid="admin-delete-category"
        style={{ fontSize: 12, padding: '6px 12px', color: 'var(--bad)' }}
      >
        🗑 删类
      </button>
    </div>
  );
}
