# Auth Signup / Login Redesign

**Date:** 2026-04-24
**Status:** Design approved, pending implementation plan

## Problem

The existing `/login` page packs sign-in, sign-up, Google OAuth, and a dev-login affordance onto a single screen with a small "sign in" title. It does not match the brand (mobile-first, Fraunces display type, warm light palette) and offers no differentiated signup experience. Password login is not supported at all — email auth is OTP-only, so users have no way to "just log in" on repeated visits.

## Goals

- Distinct **signup** and **login** pages, each designed around a single primary task.
- Email signup requires OTP verification (email ownership proof) and collects a password in the same flow so returning users can log in with just a password.
- Email login supports three paths: password, OTP code, or "forgot password" reset.
- Google auth works for both signup and login via one OAuth button.
- After signup success (email or Google), the user lands on `/onboarding`. After login success, on `/home`.
- Visual style inspired by the Speak app reference: white background, pill buttons, large friendly heading, minimal chrome.

## Non-goals

- No Apple / Facebook / phone / SSO providers.
- No magic-link (email link) flow — OTP only for email-based codes.
- No multi-device session management UI.
- No account deletion / data export from these screens.
- No localization — English copy only for this pass (Chinese conversation preference does not apply to UI strings, per global user preference).

## User flows

### Entry points

- Landing page (`/`) CTA → `/signup` (currently points to `/login`; update).
- Unauthenticated user hitting any protected route → `/login` (middleware default; unchanged).
- "Already have an account? Log in" link on `/signup` → `/login`.
- "New here? Sign up" link on `/login` → `/signup`.

### Signup — Google

1. User taps **Continue with Google** on `/signup`.
2. `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback' } })`.
3. `/auth/callback` exchanges the code for a session, then reads `profiles.onboarded`:
   - If `onboarded === false` (new user via `on_auth_user_created` trigger) → redirect to `/onboarding`.
   - If `onboarded === true` → redirect to `/home`.

### Signup — Email

Three stages, inline state on `/signup`:

1. **Stage `entry`** — heading "Let's sign you up to continue", Email button, Google button, legal footer, "Already have an account? Log in" link.
2. **Stage `credentials`** — back arrow returns to `entry`. Fields: email, password (min 6 chars, Supabase default). Submit → `supabase.auth.signUp({ email, password })`. On success, move to `verify`. Errors surface inline: invalid email and weak password are plain validation messages; already-registered email shows "This email already has an account. Log in instead?" with an inline `/login` link.
3. **Stage `verify`** — back arrow returns to `credentials`. Shows "We sent a code to {email}" + 6-digit input + Verify button + "Resend code" link. Submit → `supabase.auth.verifyOtp({ email, token, type: 'signup' })`. On success → `router.push('/onboarding')` + `router.refresh()`. "Resend code" calls `supabase.auth.resend({ type: 'signup', email })` — calling `signUp` again would fail because the user already exists.

The `signUp` call creates the user and triggers an OTP email; `verifyOtp` confirms the email and produces the session. The password is persisted on the user record during `signUp`, so future logins can use `signInWithPassword` without an extra step.

### Login — Google

Same as signup-Google: one button → OAuth → `/auth/callback`. For returning users, `onboarded === true` → `/home`.

### Login — Email

Five stages, inline state on `/login`:

1. **Stage `entry`** — heading "Welcome back", Email button, Google button, "New here? Sign up" link, optional dev-login button gated by `NEXT_PUBLIC_DEV_PANEL`.
2. **Stage `email`** — back to `entry`. Single email input → Continue. Advances to `password`.
3. **Stage `password`** — back to `email`. Password input + primary **Log in** button → `signInWithPassword({ email, password })`. Two secondary text links below:
   - **"Use a code instead"** → calls `signInWithOtp({ email, options: { shouldCreateUser: false } })` and advances to stage `code`.
   - **"Forgot password?"** → calls `resetPasswordForEmail(email, { redirectTo: '${origin}/auth/reset' })` and advances to stage `forgot`.
4. **Stage `code`** — back to `password`. 6-digit input → `verifyOtp({ email, token, type: 'email' })` → `/home`. "Resend" link re-calls `signInWithOtp`.
5. **Stage `forgot`** — back to `password`. Non-interactive confirmation: "Check your inbox for a reset link." Button: "Back to log in" returns to stage `password`.

`shouldCreateUser: false` on the login OTP call prevents the OTP path from silently creating an account for a typo'd email.

### Password reset — `/auth/reset`

Entered via the email link Supabase sends from `resetPasswordForEmail`. Supabase's SSR client exchanges the `code` query param for a recovery session automatically when the page loads. Stages:

1. **`entry`** — new-password field + confirm field. Submit → `supabase.auth.updateUser({ password })`. On success → `/home`.
2. **`expired`** — shown if `updateUser` errors with an invalid/expired session. Offers a "Request a new link" button that returns to `/login` stage `forgot`.

## Middleware changes

`middleware.ts` currently treats `/login` and `/auth/*` as auth routes. Two changes:

1. Add `/signup` to `isAuthRoute` so unauthenticated users aren't bounced back to `/login` when navigating between signup and login.
2. Exclude `/auth/reset` from the "authenticated user on auth route → `/home`" redirect, because a password-reset click produces a temporary session and needs to land on `/auth/reset`, not `/home`.

```ts
const isAuthRoute =
  path.startsWith('/login') ||
  path.startsWith('/signup') ||
  path.startsWith('/auth');
// ...
if (user && isAuthRoute && path !== '/auth/reset') {
  return NextResponse.redirect(new URL('/home', req.url));
}
```

## `/auth/callback` changes

Currently always redirects to `/home`. Update to check `profiles.onboarded` and redirect to `/onboarding` when false. This handles Google signups — email signups already `router.push('/onboarding')` from the client after `verifyOtp`, but the callback route is the source of truth for OAuth.

## Landing CTA change

`app/components/landing/CtaEnd.tsx` currently links to `/login`. Change the href to `/signup`. The landing is a pre-signup funnel for new users; returning users who already have a session will be bounced by middleware from `/signup` to `/home` anyway.

## File inventory

**New files**

- `app/signup/page.tsx` — signup page with three inline stages.
- `app/auth/reset/page.tsx` — password reset form.
- `components/auth/AuthShell.tsx` — shared layout: back arrow, centered content, legal footer slot.
- `components/auth/AuthButton.tsx` — shared pill button variants (primary accent, google, apple-style black, outline). Only `primary` and `google` used for now, but the variant enum leaves headroom.

**Modified files**

- `app/login/page.tsx` — rewrite as five-stage state machine following the same visual language as signup.
- `app/auth/callback/route.ts` — add `onboarded` check.
- `app/components/landing/CtaEnd.tsx` — link `/login` → `/signup`.
- `middleware.ts` — include `/signup` in `isAuthRoute`; exclude `/auth/reset` from the authenticated-redirect branch.

**Removed**

- The existing `/login` OTP flow is replaced by the five-stage login; no separate file deletions.

## Visual design

**Palette** — use existing tokens only (`tailwind.config.ts`):

- Background: `bg` (#fafbfc).
- Primary text: `ink` (#0e0f12). Muted: `ink-soft`, `ink-mute`.
- Primary CTA: `bg-accent` (#5e6ad2) with white text.
- Borders: `line` (#e3e5e9).

**Typography**

- Heading: `font-serif` (Fraunces), `text-3xl` or `text-4xl`, weight 500–600, line-height tight. Keep brand voice even though the Speak reference uses sans.
- Body / buttons: default `font-sans` (Inter).
- Code input: `font-mono`, letter-spaced.

**Layout**

- Mobile-first, centered column, `max-w-sm` padding, back arrow at top-left.
- Buttons: full-width, `rounded-full`, `py-4`, icon on the left and label centered via explicit grid (icon 24px slot + text).
- 12–16px vertical rhythm between stacked buttons.

**Primary screens**

- `/signup` entry: heading "Let's sign you up to continue", 2 buttons (Email = accent, Google = outline with G mark), legal footer ("By continuing, you agree to LearnTok's Terms and Privacy Policy"), "Already have an account? **Log in**".
- `/login` entry: heading "Welcome back", 2 buttons (Email, Google), "New here? **Sign up**". Dev-login button appears above the main buttons only when the env flag is set. No legal footer — login is for users who already accepted terms at signup.

**Dark mode** — out of scope; the project is light-only today.

## Error handling

- Inline error strings under the offending form control, colored `text-bad`.
- Loading states: buttons disabled with label swap ("Continue" → "Sending…"). Prevents double-submit.
- Rate-limit errors from Supabase (e.g. OTP resend too soon): surface the message verbatim and add a "Try again in a moment" note.
- Session hygiene: before `signUp` / `signInWithPassword` / `signInWithOtp`, call `supabase.auth.signOut()` to clear any stale anonymous session (matches the current `/login` behavior).
- Back arrow on stage 0 of signup/login: `router.push('/')`.
- Back arrow on any other stage: decrement stage in component state.

## Testing

Manual test plan — no Playwright specs exist yet, and this task does not add them. Each flow should be verified end-to-end in `pnpm dev`:

1. Signup via email → receive code → verify → land on `/onboarding`.
2. Signup via Google → land on `/onboarding` (if profile new).
3. Login via email + password → `/home`.
4. Login via email + code → `/home`.
5. Forgot password → receive email link → click → land on `/auth/reset` → set new password → `/home`.
6. Login via Google (returning user) → `/home`.
7. Back arrow at each stage.
8. Refreshing mid-flow resets to stage 0 (acceptable — inline state is not persisted).
9. Middleware: unauthenticated user hitting `/signup` stays on `/signup`; authenticated user hitting `/signup` or `/login` bounces to `/home`; authenticated user (recovery session) hitting `/auth/reset` stays.

## Open questions

None — all design decisions are captured above.
