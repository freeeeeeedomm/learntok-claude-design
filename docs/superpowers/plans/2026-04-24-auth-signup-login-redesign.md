# Auth Signup / Login Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `/login` page with a pair of Speak-inspired signup and login pages, add email-password login with OTP fallback and password reset, and route new signups into onboarding.

**Architecture:** Two page-level state machines (`/signup` with 3 stages, `/login` with 5 stages), a standalone `/auth/reset` page, shared UI primitives in `components/auth/`, and two plumbing updates (`middleware.ts` and `/auth/callback`). No new backend. All auth calls go through the existing browser `createClient` from `@/lib/supabase/client`.

**Tech Stack:** Next.js 14 App Router, React 18, `@supabase/ssr` (browser + server), Tailwind with project tokens (`bg`, `accent`, `ink`, etc.), Fraunces serif for headings.

**Spec:** [2026-04-24-auth-signup-login-redesign-design.md](../specs/2026-04-24-auth-signup-login-redesign-design.md)

---

## File Inventory

| Path | Action | Purpose |
|---|---|---|
| `components/auth/AuthShell.tsx` | Create | Shared page chrome (back arrow, centered column, footer slot) |
| `components/auth/AuthButton.tsx` | Create | Pill-button variants (`primary`, `outline`, `google`) + `MailIcon` + `GoogleIcon` |
| `app/signup/page.tsx` | Create | Three-stage signup state machine |
| `app/login/page.tsx` | Rewrite | Five-stage login state machine |
| `app/auth/reset/page.tsx` | Create | New-password form entered from reset email link |
| `app/auth/callback/route.ts` | Modify | Route to `/onboarding` vs `/home` based on `profiles.onboarded` |
| `middleware.ts` | Modify | Include `/signup` in `isAuthRoute`; exclude `/auth/reset` from auth-bounce |
| `app/components/landing/CtaEnd.tsx` | Modify | Change CTA href `/login` → `/signup` |

---

## Task 1: Shared auth UI primitives

**Files:**
- Create: `components/auth/AuthShell.tsx`
- Create: `components/auth/AuthButton.tsx`

### - [ ] Step 1.1: Create `components/auth/AuthShell.tsx`

```tsx
'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

type Props = {
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthShell({ onBack, children, footer }: Props) {
  const router = useRouter();
  const handleBack = onBack ?? (() => router.push('/'));

  return (
    <main className="min-h-screen bg-bg text-ink flex flex-col">
      <header className="px-5 pt-5">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Go back"
          className="-ml-2 p-2 text-ink"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </header>
      <div className="flex-1 flex flex-col items-center px-6 pt-10 sm:pt-16">
        <div className="w-full max-w-sm">{children}</div>
      </div>
      {footer && (
        <div className="px-6 pb-10 w-full max-w-sm mx-auto text-center">
          {footer}
        </div>
      )}
    </main>
  );
}
```

### - [ ] Step 1.2: Create `components/auth/AuthButton.tsx`

```tsx
'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'outline' | 'google';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant: Variant;
  icon?: ReactNode;
  children: ReactNode;
};

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-2',
  outline: 'bg-bg border border-line text-ink hover:bg-bg-2',
  google: 'bg-bg border border-line text-ink hover:bg-bg-2',
};

export function AuthButton({
  variant,
  icon,
  children,
  className = '',
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      className={`w-full rounded-full py-4 font-semibold text-base flex items-center justify-center gap-3 disabled:opacity-50 transition-colors ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {icon && (
        <span className="w-5 h-5 flex items-center justify-center">{icon}</span>
      )}
      <span>{children}</span>
    </button>
  );
}

export function MailIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </svg>
  );
}

export function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
```

### - [ ] Step 1.3: Typecheck

Run: `npx tsc --noEmit`
Expected: no errors related to the new files.

### - [ ] Step 1.4: Commit

```bash
git add components/auth/AuthShell.tsx components/auth/AuthButton.tsx
git commit -m "feat(auth): shared AuthShell and AuthButton primitives"
```

---

## Task 2: Signup page

**Files:**
- Create: `app/signup/page.tsx`

### - [ ] Step 2.1: Create `app/signup/page.tsx`

```tsx
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
```

### - [ ] Step 2.2: Typecheck

Run: `npx tsc --noEmit`
Expected: no new errors.

### - [ ] Step 2.3: Commit

```bash
git add app/signup/page.tsx
git commit -m "feat(auth): add /signup page with 3-stage email + google flow"
```

---

## Task 3: Rewrite login page

**Files:**
- Modify: `app/login/page.tsx` (full rewrite)

### - [ ] Step 3.1: Overwrite `app/login/page.tsx`

Replace the entire file contents with:

```tsx
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

type Stage = 'entry' | 'email' | 'password' | 'code' | 'forgot';

export default function LoginPage() {
  const router = useRouter();
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
          <h1 className="font-serif text-4xl leading-tight text-center mb-10">
            Welcome back
          </h1>
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
```

### - [ ] Step 3.2: Typecheck

Run: `npx tsc --noEmit`
Expected: no errors.

### - [ ] Step 3.3: Commit

```bash
git add app/login/page.tsx
git commit -m "feat(auth): rewrite /login as 5-stage state machine with password, OTP, forgot-password"
```

---

## Task 4: Password reset page

**Files:**
- Create: `app/auth/reset/page.tsx`

### - [ ] Step 4.1: Create `app/auth/reset/page.tsx`

```tsx
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
```

### - [ ] Step 4.2: Typecheck

Run: `npx tsc --noEmit`
Expected: no errors.

### - [ ] Step 4.3: Commit

```bash
git add app/auth/reset/page.tsx
git commit -m "feat(auth): add /auth/reset page for password-reset email link"
```

---

## Task 5: Update `/auth/callback`

**Files:**
- Modify: `app/auth/callback/route.ts`

### - [ ] Step 5.1: Replace `app/auth/callback/route.ts` with:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const supabase = createClient();
  if (code) await supabase.auth.exchangeCodeForSession(code);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarded')
    .eq('id', user.id)
    .single();

  const dest = profile?.onboarded ? '/home' : '/onboarding';
  return NextResponse.redirect(new URL(dest, req.url));
}
```

### - [ ] Step 5.2: Typecheck

Run: `npx tsc --noEmit`
Expected: no errors.

### - [ ] Step 5.3: Commit

```bash
git add app/auth/callback/route.ts
git commit -m "feat(auth): route OAuth callback to /onboarding for new users"
```

---

## Task 6: Update middleware

**Files:**
- Modify: `middleware.ts`

### - [ ] Step 6.1: Replace `middleware.ts` with:

```ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => req.cookies.get(n)?.value,
        set: (n: string, v: string, o: CookieOptions) =>
          res.cookies.set({ name: n, value: v, ...o }),
        remove: (n: string, o: CookieOptions) =>
          res.cookies.set({ name: n, value: '', ...o }),
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isAuthRoute =
    path.startsWith('/login') ||
    path.startsWith('/signup') ||
    path.startsWith('/auth');
  const isPublic =
    path === '/' ||
    path.startsWith('/_next') ||
    path.startsWith('/api/public') ||
    path.startsWith('/api/dev') ||
    path.startsWith('/videos/') ||
    path.startsWith('/scenes/') ||
    path.startsWith('/characters/');

  if (!user && !isAuthRoute && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (user && isAuthRoute && path !== '/auth/reset') {
    return NextResponse.redirect(new URL('/home', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### - [ ] Step 6.2: Typecheck

Run: `npx tsc --noEmit`
Expected: no errors.

### - [ ] Step 6.3: Commit

```bash
git add middleware.ts
git commit -m "feat(auth): include /signup in isAuthRoute; exempt /auth/reset from auth-bounce"
```

---

## Task 7: Update landing CTA link

**Files:**
- Modify: `app/components/landing/CtaEnd.tsx`

### - [ ] Step 7.1: Change the CTA href in `app/components/landing/CtaEnd.tsx`

Change line 19 from:

```tsx
<a className="cta-btn" href="/login" aria-label="Open LearnTok">
```

to:

```tsx
<a className="cta-btn" href="/signup" aria-label="Open LearnTok">
```

### - [ ] Step 7.2: Typecheck

Run: `npx tsc --noEmit`
Expected: no errors.

### - [ ] Step 7.3: Commit

```bash
git add app/components/landing/CtaEnd.tsx
git commit -m "feat(landing): point CTA to /signup"
```

---

## Task 8: Manual QA pass

No automated tests — verify each flow in `pnpm dev`.

### - [ ] Step 8.1: Start dev server

Run: `pnpm dev`
Expected: server starts on :3000, no console errors.

### - [ ] Step 8.2: Verify `/signup` entry stage

1. Navigate to `http://localhost:3000/signup` while logged out (use an incognito window, or sign out first).
2. Expected: heading "Let's sign you up to continue", two pill buttons, legal footer, "Already have an account? Log in" link.
3. Click "Log in" → lands on `/login`.
4. Back arrow top-left → lands on `/`.

### - [ ] Step 8.3: Verify signup email flow end-to-end

1. `/signup` → Continue with Email → enter a fresh email + password (≥6 chars) → Continue.
2. Expected: stage changes to `verify`, toast/email arrives with a 6-digit code.
3. Enter the code → Verify.
4. Expected: redirect to `/onboarding`.

### - [ ] Step 8.4: Verify signup error states

1. On credentials stage, enter `foo` as password → Continue.
2. Expected: inline error "Password must be at least 6 characters."
3. Enter an already-registered email → Continue.
4. Expected: Supabase error message surfaces inline.

### - [ ] Step 8.5: Verify login entry + email + password flow

1. Log out (or open incognito). Navigate to `/login`.
2. Expected: "Welcome back", two buttons, "New here? Sign up".
3. Continue with Email → enter the email from Step 8.3 → Continue.
4. Enter the password from Step 8.3 → Log in.
5. Expected: redirect to `/home`.

### - [ ] Step 8.6: Verify login OTP fallback

1. Log out. `/login` → Continue with Email → enter the email → Continue.
2. On password stage, click "Use a code instead".
3. Expected: stage changes to `code`, email arrives with OTP.
4. Enter code → Verify → `/home`.

### - [ ] Step 8.7: Verify forgot-password flow

1. Log out. `/login` → Continue with Email → enter the email → Continue.
2. On password stage, click "Forgot password?".
3. Expected: stage changes to `forgot` showing "Check your inbox".
4. Open the reset email, click the link.
5. Expected: lands on `/auth/reset`.
6. Enter new password + confirm → Save new password.
7. Expected: redirect to `/home`.
8. Log out, log back in with the new password — verify it works.

### - [ ] Step 8.8: Verify Google OAuth routing

Requires a Google OAuth app configured on the Supabase project. If not configured locally, skip and note for staging QA.

1. Log out. `/signup` → Continue with Google → complete Google flow.
2. Expected: redirect to `/onboarding` (first-time user).
3. Complete onboarding, then log out and repeat via `/login` → Continue with Google.
4. Expected: redirect to `/home` (returning user).

### - [ ] Step 8.9: Verify middleware behavior

1. Logged out, navigate to `/home` → redirects to `/login`.
2. Logged out, navigate to `/signup` → stays on `/signup`.
3. Logged in, navigate to `/login` → redirects to `/home`.
4. Logged in, navigate to `/signup` → redirects to `/home`.

### - [ ] Step 8.10: Verify landing CTA

1. Log out, open `/`, scroll/keyboard through chapters to CTA.
2. Click "Open LearnTok".
3. Expected: lands on `/signup`.

### - [ ] Step 8.11: Verify dev-login still works

Only applicable if `NEXT_PUBLIC_DEV_PANEL=true` in `.env.local`.

1. `/login` → dev-login button is visible above the main buttons.
2. Click it → redirects to `/home`.

### - [ ] Step 8.12: Final commit (if any tweaks were needed during QA)

If QA surfaced any issues, fix them inline and commit with a descriptive message. Otherwise this step is a no-op.

---

## Notes for the executing engineer

- **Don't** add `shouldCreateUser: false` on the signup OTP path — it's only on the login OTP path. Signup uses `signUp` (which always creates) + `verifyOtp({type:'signup'})`.
- **Don't** change `app/api/dev/login/route.ts` or the global CLAUDE.md. Dev login is preserved as-is.
- `signOut()` before every new auth call matches the existing project pattern — keeps stale sessions from poisoning `verifyOtp`.
- The recovery-session flow on `/auth/reset`: `@supabase/ssr` sets a session cookie when Supabase redirects back with the recovery `code` query parameter. The middleware exemption is required because that session would otherwise bounce the user to `/home`.
- Keep all user-visible strings in English per the global preference in `~/.claude/CLAUDE.md`.
