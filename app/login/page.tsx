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
    // /api/dev/login sets onboarded=true, so /home renders directly (no /onboarding detour).
    router.push('/home');
    router.refresh();
  };

  const devPanelEnabled = process.env.NEXT_PUBLIC_DEV_PANEL === 'true';

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm space-y-5">
        <h1 className="font-serif text-3xl">sign in</h1>

        {devPanelEnabled && (
          <div className="space-y-2">
            <button
              onClick={devLogin}
              disabled={busy}
              data-testid="dev-login"
              className="w-full bg-accent text-white py-4 rounded-xl font-semibold disabled:opacity-50 text-base"
            >
              {busy ? 'logging in…' : '🛠  dev login — tap to test'}
            </button>
            <div className="text-xs text-ink-mute text-center">
              no email needed · preset content loaded · 5 min jar
            </div>
          </div>
        )}

        {devPanelEnabled && (
          <div className="flex items-center gap-3 text-xs text-ink-mute">
            <div className="h-px bg-line flex-1" />
            <span>or sign in normally</span>
            <div className="h-px bg-line flex-1" />
          </div>
        )}

        {stage === 'email' && (
          <form onSubmit={sendCode} className="space-y-3">
            <input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-bg-2 border border-line rounded-xl px-4 py-3 text-ink"
            />
            <button disabled={busy} className="w-full bg-accent text-white py-3 rounded-xl font-semibold disabled:opacity-50">
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
            <button disabled={busy || code.length < 6} className="w-full bg-accent text-white py-3 rounded-xl font-semibold disabled:opacity-50">
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
      </div>
    </main>
  );
}
