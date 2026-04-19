'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Stage = 'email' | 'code';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    // Clear any lingering session so verifyOtp later can create a fresh one.
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithOtp({ email });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setStage('code');
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    // Supabase stores the signInWithOtp token as 'email' for new users
    // and 'recovery' for already-confirmed returning users. Try both.
    const trimmed = code.trim();
    let res = await supabase.auth.verifyOtp({ email, token: trimmed, type: 'email' });
    if (res.error) {
      res = await supabase.auth.verifyOtp({ email, token: trimmed, type: 'recovery' });
    }
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    router.push('/home');
    router.refresh();
  };

  const google = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };

  const devLogin = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    await supabase.auth.signOut();
    const res = await fetch('/api/dev/login', { method: 'POST' });
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: 'dev_login_failed' }));
      setError(msg ?? 'dev_login_failed');
      setBusy(false);
      return;
    }
    const { email: devEmail, password } = await res.json();
    const { error } = await supabase.auth.signInWithPassword({ email: devEmail, password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    router.push('/home'); // /home gates on onboarded; dev user was just reset, so redirects to /onboarding
    router.refresh();
  };

  const devPanelEnabled = process.env.NEXT_PUBLIC_DEV_PANEL === 'true';

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm space-y-5">
        <h1 className="font-serif text-3xl">sign in</h1>

        {stage === 'email' && (
          <form onSubmit={sendCode} className="space-y-3">
            <input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-bg-2 border border-line rounded-xl px-4 py-3 text-ink"
            />
            <button disabled={busy} className="w-full bg-accent text-[#1a1109] py-3 rounded-xl font-semibold disabled:opacity-50">
              {busy ? 'sending…' : 'send code'}
            </button>
          </form>
        )}

        {stage === 'code' && (
          <form onSubmit={verifyCode} className="space-y-3">
            <div className="text-ink-soft text-sm">
              we sent a code to <b className="text-ink">{email}</b>
            </div>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              // Supabase OTP length is 6–10 depending on project setting; accept up to 10.
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="••••••"
              className="w-full bg-bg-2 border border-line rounded-xl px-4 py-3 text-ink text-center font-mono tracking-[0.4em] text-xl"
            />
            <button disabled={busy || code.length < 6} className="w-full bg-accent text-[#1a1109] py-3 rounded-xl font-semibold disabled:opacity-50">
              {busy ? 'verifying…' : 'verify'}
            </button>
            <button
              type="button"
              onClick={() => { setStage('email'); setCode(''); setError(null); }}
              className="w-full text-sm text-ink-mute"
            >
              use a different email
            </button>
          </form>
        )}

        {error && <div className="text-sm text-bad">{error}</div>}

        <div className="text-center text-ink-mute text-sm">or</div>
        <button onClick={google} className="w-full bg-bg-2 border border-line py-3 rounded-xl">
          continue with Google
        </button>

        {devPanelEnabled && (
          <button
            onClick={devLogin}
            disabled={busy}
            className="w-full bg-bg-3 border border-dashed border-accent text-accent py-3 rounded-xl text-sm font-mono disabled:opacity-50"
          >
            dev · sign in &amp; restart onboarding
          </button>
        )}
      </div>
    </main>
  );
}
