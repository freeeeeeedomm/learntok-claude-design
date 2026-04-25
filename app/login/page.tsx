'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AuthShell } from '@/components/auth/AuthShell';
import {
  AuthButton,
  MailIcon,
  GoogleIcon,
} from '@/components/auth/AuthButton';

type Stage = 'entry' | 'email' | 'password' | 'code' | 'forgot';

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const notice = searchParams.get('notice');
  const supabase = createClient();
  const [stage, setStage] = useState<Stage>('entry');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const devPanelEnabled = process.env.NEXT_PUBLIC_DEV_PANEL === 'true';

  const google = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStage('password');
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/home');
    router.refresh();
  };

  const useCodeInstead = async () => {
    setBusy(true);
    setError(null);
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStage('code');
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/home');
    router.refresh();
  };

  const forgotPassword = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/reset`,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStage('forgot');
  };

  const devLogin = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    await supabase.auth.signOut();
    const res = await fetch('/api/dev/login', { method: 'POST' });
    if (!res.ok) {
      const { error: msg } = await res
        .json()
        .catch(() => ({ error: 'dev_login_failed' }));
      setError(msg ?? 'dev_login_failed');
      setBusy(false);
      return;
    }
    const { email: devEmail, password: devPassword } = await res.json();
    const { error } = await supabase.auth.signInWithPassword({
      email: devEmail,
      password: devPassword,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/home');
    router.refresh();
  };

  const onBack =
    stage === 'entry'
      ? undefined
      : stage === 'email'
      ? () => {
          setStage('entry');
          setError(null);
        }
      : stage === 'password'
      ? () => {
          setStage('email');
          setError(null);
          setPassword('');
        }
      : stage === 'code'
      ? () => {
          setStage('password');
          setError(null);
          setCode('');
        }
      : () => {
          setStage('password');
          setError(null);
        };

  return (
    <AuthShell onBack={onBack}>
      {stage === 'entry' && (
        <>
          <h1 className="font-serif text-4xl leading-tight text-center mb-6">
            Welcome back
          </h1>
          {notice === 'existing-account' && (
            <div
              role="status"
              className="bg-bg-2 border border-line rounded-xl px-4 py-3 mb-6 text-sm text-ink-soft text-center"
            >
              This account already exists. Log in to continue.
            </div>
          )}
          {devPanelEnabled && (
            <>
              <button
                onClick={devLogin}
                disabled={busy}
                data-testid="dev-login"
                className="w-full bg-accent text-white py-4 rounded-full font-semibold disabled:opacity-50 text-base mb-3"
              >
                {busy ? 'logging in…' : '🛠  dev login — tap to test'}
              </button>
              <div className="flex items-center gap-3 text-xs text-ink-mute mb-3">
                <div className="h-px bg-line flex-1" />
                <span>or sign in normally</span>
                <div className="h-px bg-line flex-1" />
              </div>
            </>
          )}
          <div className="space-y-3">
            <AuthButton
              variant="primary"
              icon={<MailIcon />}
              onClick={() => setStage('email')}
            >
              Continue with Email
            </AuthButton>
            <AuthButton
              variant="google"
              icon={<GoogleIcon />}
              onClick={google}
            >
              Continue with Google
            </AuthButton>
          </div>
          <p className="text-ink-mute text-sm text-center mt-8">
            New here?{' '}
            <Link href="/signup" className="text-accent font-semibold">
              Sign up
            </Link>
          </p>
        </>
      )}

      {stage === 'email' && (
        <form onSubmit={submitEmail} className="space-y-4">
          <h1 className="font-serif text-3xl text-center mb-8">
            What&rsquo;s your email?
          </h1>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
            className="w-full bg-bg-2 border border-line rounded-xl px-4 py-3 text-ink"
          />
          <AuthButton variant="primary" type="submit">
            Continue
          </AuthButton>
        </form>
      )}

      {stage === 'password' && (
        <form onSubmit={submitPassword} className="space-y-4">
          <h1 className="font-serif text-3xl text-center mb-2">
            Enter your password
          </h1>
          <p className="text-ink-soft text-sm text-center mb-6">{email}</p>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full bg-bg-2 border border-line rounded-xl px-4 py-3 text-ink"
          />
          <AuthButton variant="primary" type="submit" disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </AuthButton>
          {error && <p className="text-sm text-bad text-center">{error}</p>}
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={useCodeInstead}
              disabled={busy}
              className="text-sm text-accent disabled:opacity-50"
            >
              Use a code instead
            </button>
            <button
              type="button"
              onClick={forgotPassword}
              disabled={busy || !email}
              className="text-sm text-ink-mute disabled:opacity-50"
            >
              Forgot password?
            </button>
          </div>
        </form>
      )}

      {stage === 'code' && (
        <form onSubmit={submitCode} className="space-y-4">
          <h1 className="font-serif text-3xl text-center mb-4">
            Check your email
          </h1>
          <p className="text-ink-soft text-sm text-center mb-6">
            We sent a code to <b className="text-ink">{email}</b>
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, '').slice(0, 10))
            }
            placeholder="••••••"
            className="w-full bg-bg-2 border border-line rounded-xl px-4 py-3 text-ink text-center font-mono tracking-[0.4em] text-xl"
          />
          <AuthButton
            variant="primary"
            type="submit"
            disabled={busy || code.length < 6}
          >
            {busy ? 'Verifying…' : 'Verify'}
          </AuthButton>
          <button
            type="button"
            onClick={useCodeInstead}
            disabled={busy}
            className="w-full text-sm text-ink-mute disabled:opacity-50"
          >
            Resend code
          </button>
          {error && <p className="text-sm text-bad text-center">{error}</p>}
        </form>
      )}

      {stage === 'forgot' && (
        <div className="text-center space-y-6">
          <h1 className="font-serif text-3xl">Check your inbox</h1>
          <p className="text-ink-soft text-sm">
            We sent a password reset link to <b className="text-ink">{email}</b>.
          </p>
          <AuthButton variant="outline" onClick={() => setStage('password')}>
            Back to log in
          </AuthButton>
        </div>
      )}
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
