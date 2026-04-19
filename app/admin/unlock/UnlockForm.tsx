'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function UnlockForm() {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? 'wrong password' : 'something went wrong');
        setSubmitting(false);
        return;
      }
      router.push('/admin');
      router.refresh();
    } catch {
      setError('network error');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="col gap-12" data-testid="admin-unlock-form">
      <input
        type="password"
        autoFocus
        placeholder="admin password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full bg-bg-2 border border-line rounded-xl px-4 py-3 text-ink"
        data-testid="admin-unlock-input"
        disabled={submitting}
      />
      <button
        type="submit"
        className="btn btn-primary"
        disabled={submitting || !password}
        data-testid="admin-unlock-submit"
      >
        {submitting ? 'checking…' : 'unlock'}
      </button>
      {error && (
        <div
          className="body"
          style={{ color: 'var(--bad)' }}
          data-testid="admin-unlock-error"
        >
          {error}
        </div>
      )}
    </form>
  );
}
