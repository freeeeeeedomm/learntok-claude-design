# Phase 3: Nibs Floating Ball + BreakSheet

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the edge-pinned `<NibsHandle />` with a draggable floating ball that users can tap to summon a two-stage bottom sheet — stage 1 asks "want a break?", stage 2 picks a budget time; confirming starts a feed session and navigates to `/feed`. Ball hides on immersive routes (`/lesson`, `/feed`), remembers its position across sessions, and serves as the sole entry point for the break/feed flow.

**Architecture:**
- `<NibsBall />` is a global client component mounted in root layout, using Pointer Events (Capacitor-ready) with a 6px / 200ms threshold to distinguish tap from drag. Position persisted in `localStorage` keyed `nibs-ball-pos`; clamped to viewport on resize.
- Tap opens `<BreakSheet />`, a bottom-sheet state machine with `ask` → `budget` stages. The `budget` stage reuses `<BudgetPicker />` extracted from the existing `app/budget/BudgetForm.tsx`, so the sheet and the `/budget` page share a single chip+slider+display primitive.
- Submitting the sheet hits the same `/api/sessions/start` endpoint `/budget` already uses, and navigates to `/feed?session=…&budget=…` — zero new server code.

**Tech Stack:** Next.js 14 client components, Pointer Events, CSS custom properties, Playwright.

**Spec:** `docs/superpowers/specs/2026-04-19-topic-hierarchy-and-nibs-ball-design.md` Phase 3 section.

**Branch:** `redesign-phase3` (base: `d4b5233` on `main`).

---

## File Structure

**New files:**
- `components/budget/BudgetPicker.tsx` — pure UI primitive (chips + slider + big-number display), takes `balance`, `value`, `onChange`; NO submit logic
- `components/characters/NibsBall.tsx` — the global draggable ball
- `components/characters/BreakSheet.tsx` — two-stage bottom sheet
- `tests/nibs-ball-smoke.spec.ts` — visibility + tap → sheet → feed flow

**Modified files:**
- `app/budget/BudgetForm.tsx` — thin wrapper around `<BudgetPicker />` + its own submit button + fetch
- `app/layout.tsx` — mount `<NibsBall />` next to `<BottomNav />`
- `app/globals.css` — `.nibs-ball`, `.break-backdrop`, `.break-sheet`, animations
- `app/home/page.tsx` — drop `<NibsHandle />` (replaced by global NibsBall)
- `app/course/[id]/page.tsx` — drop `<NibsHandle />`

**Left untouched:**
- `components/characters/NibsHandle.tsx` — keep the file for history; just unused now
- `/budget` route — still works via direct URL, still a fallback
- `/feed` and `/feed`'s iframe wrappers — Phase 4 territory

---

### Task 1: Extract `<BudgetPicker />` primitive

**Files:**
- Create: `components/budget/BudgetPicker.tsx`
- Modify: `app/budget/BudgetForm.tsx`

**Context:** The existing `BudgetForm` in `app/budget/BudgetForm.tsx` bundles UI (chips + slider + number display) with behavior (POST `/api/sessions/start` + navigate). To share the UI with `<BreakSheet />`, split them: `BudgetPicker` is a dumb UI, `BudgetForm` stays on the `/budget` page and adds the submit button + fetch on top.

- [ ] **Step 1.1: Create `components/budget/BudgetPicker.tsx`**

```tsx
'use client';

import { useMemo } from 'react';

function fmtBank(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s.toString().padStart(2, '0')}s` : `${m}m`;
}

export function BudgetPicker({
  balance,
  value,
  onChange,
  testIdPrefix = 'budget',
}: {
  balance: number;
  value: number;
  onChange: (next: number) => void;
  testIdPrefix?: string;
}) {
  const presets = useMemo(() => {
    const raw = [120, 300, 600, balance];
    const seen = new Set<number>();
    return raw.filter((v) => {
      if (v <= 0 || v > balance) return false;
      if (seen.has(v)) return false;
      seen.add(v);
      return true;
    });
  }, [balance]);

  const sliderMax = Math.max(60, Math.min(balance, 1800));
  const display = Math.min(value, balance);

  return (
    <>
      <div className="row wrap gap-8 mt-4" data-testid={`${testIdPrefix}-presets`}>
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            className={`chip ${display === p ? 'active' : ''}`}
            onClick={() => onChange(p)}
            data-testid={`${testIdPrefix}-preset-${p}`}
          >
            {p === balance ? 'all' : `${Math.floor(p / 60)}m`}
          </button>
        ))}
      </div>

      <div className="card mt-8 col gap-12">
        <div className="display tc" style={{ fontSize: 44 }}>
          {fmtBank(display)}
        </div>
        <input
          type="range"
          min={30}
          max={sliderMax}
          step={30}
          value={display}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
          data-testid={`${testIdPrefix}-slider`}
        />
        <div
          className="row between"
          style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-mute)' }}
        >
          <span>30s</span>
          <span>jar: {fmtBank(balance)}</span>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 1.2: Rewrite `app/budget/BudgetForm.tsx` to consume `BudgetPicker`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BudgetPicker } from '@/components/budget/BudgetPicker';

export function BudgetForm({ balance }: { balance: number }) {
  const defaultBudget = Math.min(300, balance);
  const [budget, setBudget] = useState<number>(defaultBudget);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const displayBudget = Math.min(budget, balance);

  const start = async () => {
    if (submitting) return;
    if (displayBudget <= 0) {
      setError("jar is empty — earn some time first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'feed', budgetSeconds: displayBudget }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'could not start feed session');
        setSubmitting(false);
        return;
      }
      const { sessionId } = await res.json();
      router.push(`/feed?session=${sessionId}&budget=${displayBudget}`);
    } catch {
      setError('network hiccup — try again');
      setSubmitting(false);
    }
  };

  return (
    <>
      <BudgetPicker balance={balance} value={budget} onChange={setBudget} />

      {error && (
        <div
          className="card"
          style={{ background: 'rgba(217, 111, 61, 0.08)', borderColor: 'var(--bad)' }}
          data-testid="budget-error"
        >
          <div className="body" style={{ color: 'var(--bad)' }}>
            {error}
          </div>
        </div>
      )}

      <div className="mt-auto" style={{ marginTop: 24 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={start}
          disabled={submitting || balance <= 0}
          data-testid="budget-start"
        >
          {submitting ? 'starting…' : 'start scrolling →'}
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 1.3: Typecheck + run the /budget smoke test**

```bash
npx tsc --noEmit
npx playwright test tests/budget-feed-smoke.spec.ts
```
Expected: 3 passing. The extracted picker should be indistinguishable behaviorally from before.

- [ ] **Step 1.4: Commit**

```bash
git add components/budget/BudgetPicker.tsx app/budget/BudgetForm.tsx
git commit -m "refactor(budget): extract BudgetPicker primitive for reuse"
```

---

### Task 2: `<NibsBall />` component + global mount

**Files:**
- Create: `components/characters/NibsBall.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css` (append ball styles)
- Modify: `app/home/page.tsx` (drop `<NibsHandle />`)
- Modify: `app/course/[id]/page.tsx` (drop `<NibsHandle />`)

**Context:** Ball is fixed-position, draggable via Pointer Events (not mouse/touch — Pointer Events work identically across mouse, touch, and Capacitor-wrapped Webview). Hidden on `/lesson/*`, `/feed*`, `/login`, `/`, `/auth/*`, `/onboarding/*` via `usePathname()`. Tap and drag distinguished via a 6-pixel movement threshold OR 200ms time threshold. Tap opens the `<BreakSheet />`; drag moves the ball and writes final position to `localStorage`.

Keep `onSummon` as a prop so BreakSheet can be wired in Task 3 without touching this file again — Task 2 ships the ball with a placeholder handler.

- [ ] **Step 2.1: Create `components/characters/NibsBall.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const STORAGE_KEY = 'nibs-ball-pos';
const TAP_MOVE_THRESHOLD = 6; // px
const TAP_TIME_THRESHOLD = 200; // ms
const BALL_SIZE = 56; // px
const MARGIN = 16; // px from edge
const BOTTOM_NAV_OFFSET = 88; // BottomNav + safe spacing

const HIDE_PATTERNS = [
  /^\/$/,
  /^\/login(\/|$)/,
  /^\/auth(\/|$)/,
  /^\/onboarding(\/|$)/,
  /^\/lesson\//,
  /^\/feed(\/|$)/,
];

type Pos = { x: number; y: number };

function loadStoredPos(): Pos | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
      return { x: parsed.x, y: parsed.y };
    }
    return null;
  } catch {
    return null;
  }
}

function defaultPos(): Pos {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  return {
    x: window.innerWidth - BALL_SIZE - MARGIN,
    y: window.innerHeight - BALL_SIZE - BOTTOM_NAV_OFFSET,
  };
}

function clampToViewport(p: Pos): Pos {
  if (typeof window === 'undefined') return p;
  return {
    x: Math.max(0, Math.min(window.innerWidth - BALL_SIZE, p.x)),
    y: Math.max(0, Math.min(window.innerHeight - BALL_SIZE, p.y)),
  };
}

export function NibsBall({ onSummon }: { onSummon?: () => void } = {}) {
  const pathname = usePathname() ?? '/';
  const hidden = HIDE_PATTERNS.some((r) => r.test(pathname));

  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    startedAt: number;
    moved: boolean;
  } | null>(null);

  // Initialize position on mount (client-only).
  useEffect(() => {
    const stored = loadStoredPos();
    setPos(clampToViewport(stored ?? defaultPos()));
  }, []);

  // Reclamp on viewport resize so the ball never ends up off-screen.
  useEffect(() => {
    const onResize = () => {
      setPos((p) => (p ? clampToViewport(p) : p));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!pos) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: pos.x,
        origY: pos.y,
        startedAt: performance.now(),
        moved: false,
      };
    },
    [pos]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const s = dragState.current;
      if (!s) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (!s.moved && Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) {
        s.moved = true;
        setDragging(true);
      }
      if (s.moved) {
        setPos(clampToViewport({ x: s.origX + dx, y: s.origY + dy }));
      }
    },
    []
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const s = dragState.current;
      if (!s) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      const duration = performance.now() - s.startedAt;
      const isTap = !s.moved && duration < TAP_TIME_THRESHOLD + 300; // loose on up
      dragState.current = null;
      setDragging(false);
      if (isTap) {
        onSummon?.();
      } else {
        // Persist new position.
        setPos((current) => {
          if (current) {
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
            } catch {
              // ignore quota / private-browsing errors
            }
          }
          return current;
        });
      }
    },
    [onSummon]
  );

  if (hidden || !pos) return null;

  return (
    <button
      type="button"
      className={`nibs-ball ${dragging ? 'dragging' : ''}`}
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { dragState.current = null; setDragging(false); }}
      aria-label="summon nibs"
      data-testid="nibs-ball"
    >
      <span aria-hidden>😈</span>
    </button>
  );
}
```

- [ ] **Step 2.2: Append CSS to `app/globals.css`**

Add these rules at the end of the file:

```css
/* ===== Nibs floating ball ===== */
.nibs-ball {
  position: fixed;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--nibs);
  box-shadow: 0 4px 12px rgba(216, 90, 62, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  border: none;
  color: #fff;
  cursor: grab;
  z-index: 50;
  user-select: none;
  touch-action: none;
  transition: transform 120ms ease, box-shadow 120ms ease;
}

.nibs-ball:hover {
  transform: scale(1.05);
}

.nibs-ball.dragging {
  cursor: grabbing;
  transform: scale(1.1);
  box-shadow: 0 8px 24px rgba(216, 90, 62, 0.5);
}
```

- [ ] **Step 2.3: Mount in `app/layout.tsx`**

Read the existing file, then add the import and mount the ball right after `<BottomNav />`:

```tsx
import './globals.css';
import type { Metadata } from 'next';
import { BottomNav } from '@/components/nav/BottomNav';
import { NibsBall } from '@/components/characters/NibsBall';

export const metadata: Metadata = {
  title: 'LearnTok',
  description: 'Earn your scroll.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <BottomNav />
        <NibsBall />
      </body>
    </html>
  );
}
```

For Task 2 this is a placeholder — `onSummon` defaults to no-op. Task 3 will wire the actual BreakSheet.

- [ ] **Step 2.4: Drop `<NibsHandle />` from `app/home/page.tsx` and `app/course/[id]/page.tsx`**

In both files:
- Remove the `import { NibsHandle } from '@/components/characters/NibsHandle';` import line
- Remove the `<NibsHandle />` JSX usage (usually at end of the render tree)

The component file `components/characters/NibsHandle.tsx` stays in the repo but unused.

- [ ] **Step 2.5: Typecheck + manual smoke**

```bash
npx tsc --noEmit
npm run dev
```

Navigate to `/home`. Expected: a small red-orange circular ball appears at the bottom-right. You can drag it around; refreshing persists its position. Navigate to `/lesson/<preset>`; ball disappears. Navigate back to `/home`; ball reappears at its stored position. Tap the ball — nothing happens yet (Task 3 wires the sheet).

- [ ] **Step 2.6: Commit**

```bash
git add components/characters/NibsBall.tsx app/globals.css app/layout.tsx app/home/page.tsx "app/course/[id]/page.tsx"
git commit -m "feat(nibs): draggable floating ball with position memory"
```

---

### Task 3: `<BreakSheet />` + wire to `<NibsBall />`

**Files:**
- Create: `components/characters/BreakSheet.tsx`
- Modify: `components/characters/NibsBall.tsx` (pass `onSummon` that opens the sheet)
- Modify: `app/layout.tsx` (lift sheet state; or let NibsBall own both)
- Modify: `app/globals.css` (append sheet styles)

**Decision on state ownership:** BreakSheet and NibsBall need to coordinate — ball's tap opens the sheet. Simplest is to have ONE client component own both: a new `<NibsLayer />` that renders NibsBall + BreakSheet and manages the open/close state. The layout mounts `<NibsLayer />` instead of `<NibsBall />` directly.

- [ ] **Step 3.1: Create `components/characters/BreakSheet.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { BudgetPicker } from '@/components/budget/BudgetPicker';

type Stage = 'ask' | 'budget' | 'submitting';

export function BreakSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>('ask');
  const [balance, setBalance] = useState<number>(0);
  const [budget, setBudget] = useState<number>(300);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Fetch current balance when the sheet opens so the picker's presets +
  // slider bound are correct. Cheap — a single RLS'd profile row read.
  useEffect(() => {
    if (!open) return;
    setStage('ask');
    setError(null);
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('jar_balance_cached')
        .eq('id', user.id)
        .single();
      const b = data?.jar_balance_cached ?? 0;
      setBalance(b);
      setBudget(Math.min(300, b));
    })();
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const start = async () => {
    if (budget <= 0) {
      setError("jar is empty — earn some time first.");
      return;
    }
    setStage('submitting');
    setError(null);
    try {
      const res = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'feed', budgetSeconds: budget }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'could not start feed session');
        setStage('budget');
        return;
      }
      const { sessionId } = await res.json();
      router.push(`/feed?session=${sessionId}&budget=${budget}`);
    } catch {
      setError('network hiccup — try again');
      setStage('budget');
    }
  };

  return (
    <div
      className="break-backdrop"
      onClick={onClose}
      data-testid="break-backdrop"
    >
      <div
        className="break-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        data-testid="break-sheet"
      >
        <div className="break-sheet-handle" />

        {stage === 'ask' && (
          <div className="col gap-16 tc">
            <div style={{ fontSize: 64, lineHeight: 1 }} aria-hidden>😈</div>
            <div className="display" style={{ fontSize: 22 }}>
              想休息一下吗？
            </div>
            <div className="col gap-8">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStage('budget')}
                data-testid="break-yes"
              >
                好啊
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onClose}
                data-testid="break-no"
              >
                再学一下
              </button>
            </div>
          </div>
        )}

        {(stage === 'budget' || stage === 'submitting') && (
          <div className="col gap-12">
            <div className="eyebrow tc">pick a budget</div>
            <BudgetPicker
              balance={balance}
              value={budget}
              onChange={setBudget}
              testIdPrefix="break-budget"
            />

            {error && (
              <div
                className="card"
                style={{
                  background: 'rgba(217, 111, 61, 0.08)',
                  borderColor: 'var(--bad)',
                }}
                data-testid="break-error"
              >
                <div className="body" style={{ color: 'var(--bad)' }}>
                  {error}
                </div>
              </div>
            )}

            <div className="col gap-8">
              <button
                type="button"
                className="btn btn-primary"
                onClick={start}
                disabled={stage === 'submitting' || balance <= 0}
                data-testid="break-start"
              >
                {stage === 'submitting' ? 'starting…' : 'start scrolling →'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setStage('ask')}
                disabled={stage === 'submitting'}
              >
                back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3.2: Create `components/characters/NibsLayer.tsx` and update layout**

```tsx
// components/characters/NibsLayer.tsx
'use client';

import { useState } from 'react';
import { NibsBall } from './NibsBall';
import { BreakSheet } from './BreakSheet';

export function NibsLayer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <NibsBall onSummon={() => setOpen(true)} />
      <BreakSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

Then edit `app/layout.tsx`:

```tsx
import './globals.css';
import type { Metadata } from 'next';
import { BottomNav } from '@/components/nav/BottomNav';
import { NibsLayer } from '@/components/characters/NibsLayer';

export const metadata: Metadata = {
  title: 'LearnTok',
  description: 'Earn your scroll.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <BottomNav />
        <NibsLayer />
      </body>
    </html>
  );
}
```

- [ ] **Step 3.3: Append CSS to `app/globals.css`**

```css
/* ===== Break sheet (Nibs summon) ===== */
.break-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 60;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: break-fade-in 200ms ease;
}

.break-sheet {
  width: 100%;
  max-width: 480px;
  background: var(--bg);
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  border-top: 1px solid var(--line);
  padding: 24px 24px calc(24px + env(safe-area-inset-bottom, 0px));
  animation: break-slide-up 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
  max-height: 80vh;
  overflow-y: auto;
}

.break-sheet-handle {
  width: 40px;
  height: 4px;
  background: var(--line);
  border-radius: 2px;
  margin: 0 auto 16px;
}

@keyframes break-slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

@keyframes break-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

- [ ] **Step 3.4: Typecheck + manual smoke**

```bash
npx tsc --noEmit
```

Dev-server: navigate to `/home`, tap the Nibs ball. Expected:
- Backdrop fades in
- Sheet slides up from the bottom
- "想休息一下吗？" header + 😈 emoji + two buttons
- Tap **好啊** → stage flips to budget picker with chips + slider + big number
- Tap **再学一下** or backdrop or Escape → sheet closes
- From budget stage: pick a preset or drag slider, tap "start scrolling →" → navigates to `/feed?session=...&budget=...`

- [ ] **Step 3.5: Commit**

```bash
git add components/characters/BreakSheet.tsx components/characters/NibsLayer.tsx app/layout.tsx app/globals.css
git commit -m "feat(nibs): BreakSheet + NibsLayer to wire ball tap → /feed"
```

---

### Task 4: Playwright smoke tests for Nibs ball

**Files:**
- Create: `tests/nibs-ball-smoke.spec.ts`

- [ ] **Step 4.1: Write the spec**

```ts
import { test, expect } from '@playwright/test';

test('nibs ball visible on /home and hidden on /lesson', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/home');
  await expect(page.getByTestId('nibs-ball')).toBeVisible();

  // Navigate to a preset lesson — ball should hide.
  await page.goto('/lesson/30000000-0000-0000-0000-000000000111');
  await expect(page.getByTestId('mark-done')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('nibs-ball')).toHaveCount(0);
});

test('nibs ball tap opens BreakSheet → ask → budget → start → /feed', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/home');
  await page.getByTestId('nibs-ball').click();

  // Ask stage.
  await expect(page.getByTestId('break-sheet')).toBeVisible();
  await expect(page.getByTestId('break-yes')).toBeVisible();
  await expect(page.getByTestId('break-no')).toBeVisible();

  // Advance to budget stage.
  await page.getByTestId('break-yes').click();
  await expect(page.getByTestId('break-budget-presets')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('break-budget-preset-120').click();

  // Start.
  await page.getByTestId('break-start').click();
  await page.waitForURL(/\/feed\?session=/, { timeout: 10_000 });
  await expect(page.getByTestId('feed-root')).toBeVisible();

  // Clean up so session doesn't linger.
  try { await page.getByTestId('feed-done').click(); } catch {}
});

test('nibs ball tap → cancel (再学一下) closes sheet', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/home');
  await page.getByTestId('nibs-ball').click();
  await expect(page.getByTestId('break-sheet')).toBeVisible();
  await page.getByTestId('break-no').click();
  await expect(page.getByTestId('break-sheet')).toHaveCount(0);
});

test('nibs ball position persists across reloads', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/home');
  const ball = page.getByTestId('nibs-ball');
  await expect(ball).toBeVisible();

  // Capture initial position, drag 100px left + 100px up.
  const before = await ball.boundingBox();
  expect(before).not.toBeNull();
  const centerX = before!.x + before!.width / 2;
  const centerY = before!.y + before!.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX - 100, centerY - 100, { steps: 10 });
  await page.mouse.up();

  const afterDrag = await ball.boundingBox();
  expect(afterDrag).not.toBeNull();
  // Fuzzy check: ball moved at least 50px in the expected direction.
  expect(afterDrag!.x).toBeLessThan(before!.x - 40);
  expect(afterDrag!.y).toBeLessThan(before!.y - 40);

  // Reload → position should be restored from localStorage.
  await page.reload();
  const afterReload = await page.getByTestId('nibs-ball').boundingBox();
  expect(afterReload).not.toBeNull();
  expect(Math.abs(afterReload!.x - afterDrag!.x)).toBeLessThan(10);
  expect(Math.abs(afterReload!.y - afterDrag!.y)).toBeLessThan(10);
});
```

- [ ] **Step 4.2: Run the new tests**

```bash
npx playwright test tests/nibs-ball-smoke.spec.ts
```
Expected: 4 passing.

- [ ] **Step 4.3: Commit**

```bash
git add tests/nibs-ball-smoke.spec.ts
git commit -m "test(nibs): ball visibility + tap → sheet → /feed + drag persistence"
```

---

### Task 5: Full suite green + PR

- [ ] **Step 5.1: Full suite**

```bash
npx playwright test
```

Expected: 42 tests (38 from Phase 2 + 4 new). All passing.

Failure modes to watch for:
- `tests/budget-feed-smoke.spec.ts` — tests the `/budget` route directly. After the Task 1 refactor the button testids shouldn't have changed (`budget-preset-*`, `budget-slider`, `budget-start`, `budget-error`). If any fail, the extraction renamed something accidentally — fix and re-run.
- `tests/nav-smoke.spec.ts` — layout now contains `<NibsLayer />`. Shouldn't affect nav-hidden routes because NibsBall also hides on them. If the nav test misbehaves, double-check HIDE_PATTERNS parity.

- [ ] **Step 5.2: Push + PR**

```bash
git push -u origin redesign-phase3
gh pr create --title "Phase 3: Nibs floating ball + BreakSheet" --body "$(cat <<'EOF'
## Summary

- **`<NibsBall />`** — draggable floating ball, 56px red-orange with 😈, hidden on /lesson/*, /feed, /, /login, /auth, /onboarding. Pointer Events (Capacitor-ready) with 6px/200ms tap-vs-drag threshold. Position persisted in localStorage + clamped to viewport on resize.
- **`<BreakSheet />`** — two-stage bottom sheet: 'want a break?' → budget picker → POST /api/sessions/start → /feed. Closes on backdrop tap / Escape / '再学一下'.
- **`<NibsLayer />`** — tiny wrapper that owns the open/close state for the ball + sheet pair, mounted once in root layout.
- **`<BudgetPicker />` extracted** from BudgetForm so the sheet and /budget page share the chip+slider+display UI.

No backend changes — /api/sessions/start is hit exactly the same way /budget already does.

## Test plan

- [x] \`npx playwright test\` — 42/42 passing (4 new in nibs-ball-smoke.spec)
- [x] \`npx tsc --noEmit\` — no errors
- [x] Manual: ball renders on /home, drag persists across reload, tap → sheet → budget → /feed, sheet closes on cancel / backdrop / Escape
- [x] Manual: ball hides on /lesson and /feed (no visual clash with immersive player)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

1. **Spec coverage.** Phase 3 spec: draggable ball ✓, position memory ✓, hidden on /lesson + /feed ✓, tap → BreakSheet (ask → budget → feed) ✓.
2. **Placeholder scan.** No TBD / TODO / vague "handle properly" language. Every code block is pastable.
3. **Type consistency.** `Pos = { x: number; y: number }` consistent across storage, state, props. `Stage = 'ask' | 'budget' | 'submitting'` explicit in BreakSheet.
4. **File-path accuracy.** Follows existing conventions (`components/characters/*`, `components/budget/*`, `app/layout.tsx`).
5. **SSR safety.** NibsBall guards `window`/`localStorage` via `typeof window === 'undefined'` and lazy-initializes pos inside a mount effect — no SSR hydration mismatch.
6. **Pointer Events sanity.** `setPointerCapture` on down, `releasePointerCapture` on up, cancel handler resets drag state — standard pattern. `touch-action: none` CSS prevents browser-level scroll interference on touch.
7. **BottomNav overlap.** Ball default y = `window.innerHeight - 56 - 88` = 88px above the viewport bottom, which clears the 72px BottomNav with 16px breathing room.
