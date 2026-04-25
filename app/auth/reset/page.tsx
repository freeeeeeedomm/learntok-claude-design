'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthButton } from '@/components/auth/AuthButton';

type Stage = 'entry' | 'expired';

export default function ResetPage() {
  const router = useRouter();
  const supabase = createClient();
  const [stage, setStage] = useState<Stage>('entry');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      // Treat any updateUser error on this page as an expired / missing
      // recovery session — Supabase returns generic messages for both cases.
      setStage('expired');
      return;
    }
    router.push('/home');
    router.refresh();
  };

  return (
    <AuthShell onBack={() => router.push('/login')}>
      {stage === 'entry' && (
        <form onSubmit={submit} className="space-y-4">
          <h1 className="font-serif text-3xl text-center mb-8">
            Set a new password
          </h1>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="w-full bg-bg-2 border border-line rounded-xl px-4 py-3 text-ink"
          />
          <input
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            className="w-full bg-bg-2 border border-line rounded-xl px-4 py-3 text-ink"
          />
          <AuthButton variant="primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save new password'}
          </AuthButton>
          {error && <p className="text-sm text-bad text-center">{error}</p>}
        </form>
      )}

      {stage === 'expired' && (
        <div className="text-center space-y-6">
          <h1 className="font-serif text-3xl">Link expired</h1>
          <p className="text-ink-soft text-sm">
            This password reset link is no longer valid. Request a new one from
            the login screen.
          </p>
          <AuthButton
            variant="primary"
            onClick={() => router.push('/login')}
          >
            Back to log in
          </AuthButton>
        </div>
      )}
    </AuthShell>
  );
}
