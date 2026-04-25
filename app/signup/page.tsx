'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AuthShell } from '@/components/auth/AuthShell';
import {
  AuthButton,
  MailIcon,
  GoogleIcon,
} from '@/components/auth/AuthButton';

type Stage = 'entry' | 'credentials' | 'verify';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [stage, setStage] = useState<Stage>('entry');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const google = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStage('verify');
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'signup',
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/onboarding');
    router.refresh();
  };

  const resend = async () => {
    setBusy(true);
    setError(null);
    await supabase.auth.signOut();
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setBusy(false);
    if (error) setError(error.message);
  };

  const onBack =
    stage === 'entry'
      ? undefined
      : stage === 'credentials'
      ? () => {
          setStage('entry');
          setError(null);
        }
      : () => {
          setStage('credentials');
          setError(null);
        };

  const footer =
    stage === 'entry' ? (
      <p className="text-ink-mute text-sm leading-relaxed">
        By continuing, you agree to LearnTok&rsquo;s{' '}
        <a href="#" className="text-accent underline">
          Terms
        </a>{' '}
        and{' '}
        <a href="#" className="text-accent underline">
          Privacy Policy
        </a>
        .
      </p>
    ) : null;

  return (
    <AuthShell onBack={onBack} footer={footer}>
      {stage === 'entry' && (
        <>
          <h1 className="font-serif text-4xl leading-tight text-center mb-10">
            Let&rsquo;s sign you up
            <br />
            to continue
          </h1>
          <div className="space-y-3">
            <AuthButton
              variant="primary"
              icon={<MailIcon />}
              onClick={() => setStage('credentials')}
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
            Already have an account?{' '}
            <Link href="/login" className="text-accent font-semibold">
              Log in
            </Link>
          </p>
        </>
      )}

      {stage === 'credentials' && (
        <form onSubmit={submitCredentials} className="space-y-4">
          <h1 className="font-serif text-3xl text-center mb-8">
            Create your account
          </h1>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full bg-bg-2 border border-line rounded-xl px-4 py-3 text-ink"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 6 characters)"
            className="w-full bg-bg-2 border border-line rounded-xl px-4 py-3 text-ink"
          />
          <AuthButton variant="primary" type="submit" disabled={busy}>
            {busy ? 'Sending code…' : 'Continue'}
          </AuthButton>
          {error && <p className="text-sm text-bad text-center">{error}</p>}
        </form>
      )}

      {stage === 'verify' && (
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
            onClick={resend}
            disabled={busy}
            className="w-full text-sm text-ink-mute disabled:opacity-50"
          >
            Resend code
          </button>
          {error && <p className="text-sm text-bad text-center">{error}</p>}
        </form>
      )}
    </AuthShell>
  );
}
