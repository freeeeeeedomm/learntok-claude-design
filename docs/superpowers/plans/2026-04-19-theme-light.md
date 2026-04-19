# Theme Light Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the app's global color tokens from the dark-cozy palette (warm brown bg, orange accent) to a Linear-style light palette (near-white bg, indigo accent, emerald "good"). Touches only design tokens plus three button-text color fixes. No component logic changes.

**Architecture:** Single atomic token swap across `tailwind.config.ts` (utility-class map) and `app/globals.css` (CSS vars + three `@layer components` rules). Plus two tsx files (`app/page.tsx`, `app/login/page.tsx`) where the old accent's required dark text color was hardcoded as a Tailwind arbitrary value (`text-[#1a1109]`) — these flip to `text-white` to stay readable on the new indigo accent.

**Tech Stack:** Tailwind 3, CSS custom properties, Next.js App Router. Package manager: **npm** on this Windows box.

**Branch:** `theme-light` (already created off post-merge main at `93e2c36`, spec committed at `a6dc447`).

**Spec:** `docs/superpowers/specs/2026-04-19-theme-light-design.md`

---

## File plan

| File | Status | Purpose |
|---|---|---|
| `tailwind.config.ts` | Modify | Replace `colors` map with new palette |
| `app/globals.css` | Modify | Replace `:root` CSS vars + three `@layer components` class rules (`.btn-primary`, `.chip.active`, `.card-hl`) |
| `app/page.tsx` | Modify | Swap `text-[#1a1109]` → `text-white` on "get started" button |
| `app/login/page.tsx` | Modify | Swap `text-[#1a1109]` → `text-white` on "send code" + "verify" buttons (2 occurrences) |

**Not modified:**
- `components/characters/*` (mascot colors stay)
- `components/onboarding/*` and `app/onboarding/*` (reserved for parallel onboarding worktree — palette-dependent tints there will stay stale until their redesign lands)
- Anything under `hooks/`, `lib/`, `app/api/`, `tests/`, `supabase/`
- No new migration, no new tests, no new deps

**No tests added.** Playwright tests assert DOM structure and API contracts, not rendered colors. The existing suite (20 tests) is the regression check.

---

## Task 1: Atomic token swap

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`
- Modify: `app/page.tsx`
- Modify: `app/login/page.tsx`

Tokens in `tailwind.config.ts` and `:root` vars in `app/globals.css` must change together — a partial edit would leave some utility classes on the old palette while inline `var(--foo)` references show the new one, producing a broken-looking page mid-edit. All four files ship in one commit.

- [ ] **Step 1: Replace `tailwind.config.ts` colors map**

In `tailwind.config.ts`, replace the `colors` object inside `theme.extend` with:

```ts
colors: {
  bg: { DEFAULT: '#fafbfc', 2: '#f4f5f7', 3: '#eaebef' },
  ink: { DEFAULT: '#0e0f12', soft: '#5a6068', mute: '#8b92a0' },
  line: '#e3e5e9',
  accent: { DEFAULT: '#5e6ad2', 2: '#4c56c4' },
  nibs: '#d85a3e',
  angel: '#f4c874',
  good: '#10b981',
  bad: '#d96f3d',
},
```

Leave the rest of the file (`fontFamily`, `content`, `plugins`) untouched.

- [ ] **Step 2: Replace `:root` block in `app/globals.css`**

Replace lines 9–26 of `app/globals.css` (the `:root { ... }` block, between the comment "Prototype tokens…" and the `html, body` rule):

```css
:root {
  --bg: #fafbfc;
  --bg-2: #f4f5f7;
  --bg-3: #eaebef;
  --ink: #0e0f12;
  --ink-soft: #5a6068;
  --ink-mute: #8b92a0;
  --line: #e3e5e9;
  --accent: #5e6ad2;
  --accent-2: #4c56c4;
  --nibs: #d85a3e;
  --angel: #f4c874;
  --good: #10b981;
  --bad: #d96f3d;
  --serif: 'Fraunces', Georgia, serif;
  --sans: 'Inter', system-ui, sans-serif;
  --mono: 'JetBrains Mono', monospace;
}
```

The font-family variables (`--serif`, `--sans`, `--mono`) must stay exactly as they were.

- [ ] **Step 3: Update the three component-class rules in `app/globals.css`**

Find and replace three specific rules inside the `@layer components` block:

`.btn-primary`:
```css
/* before */
.btn-primary { background: var(--accent); color: #1a1109; }
.btn-primary:hover { background: #efb26e; }

/* after */
.btn-primary { background: var(--accent); color: #ffffff; }
.btn-primary:hover { background: #7480dc; }
```

`.chip.active`:
```css
/* before */
.chip.active { background: var(--accent); color: #1a1109; border-color: var(--accent); }

/* after */
.chip.active { background: var(--accent); color: #ffffff; border-color: var(--accent); }
```

`.card-hl`:
```css
/* before */
.card-hl { border-color: var(--accent); background: rgba(232, 154, 86, 0.06); }

/* after */
.card-hl { border-color: var(--accent); background: rgba(94, 106, 210, 0.06); }
```

Do not touch `.btn`, `.btn-ghost`, `.btn-sm`, `.chip` (default non-active state), `.card`, or any layout utility (`.row`, `.col`, `.gap-*`, `.mt-*`).

- [ ] **Step 4: Fix `app/page.tsx` button text color**

In `app/page.tsx` line 7, replace:

```tsx
<a href="/login" className="inline-block bg-accent text-[#1a1109] px-5 py-3 rounded-xl font-semibold">get started</a>
```

with:

```tsx
<a href="/login" className="inline-block bg-accent text-white px-5 py-3 rounded-xl font-semibold">get started</a>
```

Only the one token changes: `text-[#1a1109]` → `text-white`. Everything else on the line stays.

- [ ] **Step 5: Fix `app/login/page.tsx` button text colors (two occurrences)**

In `app/login/page.tsx`, replace BOTH occurrences of:

```
text-[#1a1109]
```

with:

```
text-white
```

The two lines affected are 85 (the "send code" button) and 106 (the "verify" button). Use an editor's global find/replace scoped to this file, or two individual edits. Do not touch anything else in the file.

- [ ] **Step 6: Typecheck**

```
npx tsc --noEmit
```

Expected: no errors. (Token swaps are pure string edits — TS has nothing to complain about, but this is a sanity check.)

- [ ] **Step 7: Verify no stray `#1a1109` / `#e89a56` / `#a8c080` / `#d96f3d` references survived outside the mascot files and the unchanged `--nibs` / `--angel` / `--bad` values**

Run (PowerShell or bash, whichever works on your Windows shell):

```
rg "#1a1109|#e89a56|#efb26e|#a8c080|rgba\\(232, 154, 86" -n
```

**Expected matches:**
- ZERO hits. All palette-dependent references should be gone.

**Allowed matches that may still appear (do NOT change):**
- Nothing expected. If anything shows up in `components/onboarding/` or anywhere else, flag it in the commit message; do NOT edit files under `components/onboarding/` or `app/onboarding/` as they are owned by the parallel onboarding worktree.

- [ ] **Step 8: Commit**

```
git add tailwind.config.ts app/globals.css app/page.tsx app/login/page.tsx
git commit -m "feat(theme): flip global palette to Linear-style light

- bg: #fafbfc (near-white with cool tint) from #13110e
- ink: #0e0f12 from #f3ece0
- accent: #5e6ad2 (indigo) from #e89a56 (warm orange)
- good: #10b981 (emerald) from #a8c080

Nibs (#d85a3e), Angel (#f4c874), and --bad unchanged per spec.
Button text color flips dark→white to stay readable on indigo."
```

---

## Task 2: Regression — full Playwright suite

**Files:** none new.

The theme change doesn't touch API routes, DOM structure, data-testids, or business logic. All 20 existing tests should pass without modification. If any fails, that's a real issue — diagnose before proceeding.

**Prerequisite:** Supabase local stack running (`npx supabase status` should show API URL at `http://127.0.0.1:54321`). If not, `npx supabase start`.

- [ ] **Step 1: Run the full suite**

```
npx playwright test
```

Expected: `20 passed` (14 from `tests/sessions.spec.ts` + 5 from `tests/lessons-complete.spec.ts` + 1 from `tests/lesson-page.spec.ts`).

**Wait — `tests/lessons-complete.spec.ts` and `tests/lesson-page.spec.ts` only exist on the `lesson-page` branch.** This branch (`theme-light`) is based on pre-PR-#2 main, so those tests are NOT present here. Expected count on `theme-light` is `14 passed` (sessions.spec.ts only).

Update the expected count accordingly. If the suite reports fewer than 14 passing, something regressed; if more, the branch has been rebased onto merged PR #2 and the expected count grows back to 20.

- [ ] **Step 2: Fix any regression**

If any test fails: copy the failure snippet, diagnose whether it's actually a theme-related regression or an environmental flake. Theme changes shouldn't affect any assertion in the existing suite — the most likely cause of a failure here is a broken dev server reload after editing `tailwind.config.ts`, which can be fixed by killing and restarting any running `npm run dev` process.

---

## Task 3: Manual visual verification

**Files:** none new.

Playwright doesn't assert colors, so this is the real check that the theme looks right.

- [ ] **Step 1: Start dev server**

If a dev server is already running from earlier ad-hoc work on this branch, kill it first so it picks up the updated `tailwind.config.ts`. Next's fast-refresh handles `globals.css` but config files need a full restart.

```
npm run dev
```

Wait for `ready - started server on 0.0.0.0:3000`.

- [ ] **Step 2: Open `http://localhost:3000/` (the root marketing splash)**

Verify:
- Page background is near-white (not dark brown).
- "LearnTok" headline is near-black.
- "earn your scroll." subtitle is a soft gray.
- "get started" button is indigo (`#5e6ad2`) with white text.

- [ ] **Step 3: Open `http://localhost:3000/login`**

Verify:
- Form inputs have light-gray backgrounds (`--bg-2`) with subtle borders.
- "send code" / "verify" buttons are indigo with white text, readable.
- No lingering orange/brown anywhere.

- [ ] **Step 4: If comfortable, spot-check other pages**

- `/home` (stub page — should show "home" header + "TODO" text, all readable on white).
- Because `app/lesson/[id]/*` doesn't exist on this branch (it's on the `lesson-page` branch), skip lesson testing here. After both branches merge, re-verify.

- [ ] **Step 5: Kill dev server**

`Ctrl+C` in the dev-server terminal, or `kill` the background process.

---

## Task 4: Push + open PR

**Files:** none new.

- [ ] **Step 1: Verify branch status**

```
git log --oneline origin/main..HEAD
```

Expected output: two commits — `a6dc447` (spec) and the Task 1 commit (theme flip).

```
git status
```

Expected: `nothing to commit, working tree clean` (tsconfig.tsbuildinfo may appear; it's in `.gitignore` — ignore).

- [ ] **Step 2: Push**

```
git push -u origin theme-light
```

- [ ] **Step 3: Open the PR**

```
gh pr create --title "feat(theme): flip global palette to Linear-style light" --body "$(cat <<'EOF'
## Summary
Swaps the app's global color tokens from dark-cozy (warm brown bg + orange accent) to Linear-style light (near-white bg + indigo accent + emerald success).

- \`--bg: #fafbfc\`, \`--ink: #0e0f12\`, \`--accent: #5e6ad2\`, \`--good: #10b981\`
- Nibs (\`#d85a3e\`) and Angel (\`#f4c874\`) mascot colors unchanged — product intent is to keep mascots warm against a cool UI.
- \`--bad\` unchanged (currently unused).
- Three button-text hardcodes flip dark→white to stay readable on indigo.

Spec: \`docs/superpowers/specs/2026-04-19-theme-light-design.md\`
Plan: \`docs/superpowers/plans/2026-04-19-theme-light.md\`

## Changes
- \`tailwind.config.ts\`: \`colors\` map replaced
- \`app/globals.css\`: \`:root\` vars + three \`@layer components\` rules (\`.btn-primary\`, \`.chip.active\`, \`.card-hl\`)
- \`app/page.tsx\`, \`app/login/page.tsx\`: three \`text-[#1a1109]\` → \`text-white\` swaps

No logic, routing, API, test, or migration changes. No component layout changes.

## Coordination
- Orthogonal to PR #2 (\`lesson-page\`). Either can merge first; the theme applies to the lesson page automatically once both land.
- \`components/onboarding/\` has stale palette refs that were intentionally left out of scope (reserved for the parallel onboarding-redesign worktree). Those pages will temporarily display faint warm tints on the new white bg until that worktree's redesign lands.

## Test plan
- [x] \`npx tsc --noEmit\` clean
- [x] Full Playwright suite green on this branch (14 tests — lesson-page's 6 tests not yet on main)
- [x] Manual visual smoke: \`/\`, \`/login\`, \`/home\` stub — indigo buttons readable, near-white bg, no stray warm colors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Post PR URL to the user**

Print the URL `gh pr create` returned.

---

## Self-review notes

**Spec coverage:** Every section of `docs/superpowers/specs/2026-04-19-theme-light-design.md` maps to a task:
- `:root` CSS vars → Task 1 Step 2
- `tailwind.config.ts` colors → Task 1 Step 1
- Component-class tweaks (`.btn-primary`, `.chip.active`, `.card-hl`) → Task 1 Step 3
- `text-[#1a1109]` swaps in `app/page.tsx` + `app/login/page.tsx` → Task 1 Steps 4 + 5
- Out-of-scope onboarding note → Task 1 Step 7 guardrail (don't touch `components/onboarding/`)
- Testing → Tasks 2 (Playwright regression) + 3 (manual visual)

**Placeholder scan:** none. All steps have concrete code and commands.

**Type consistency:** all hex values match between the spec table and the plan's code blocks. `HEARTBEAT_INTERVAL_MS` and other identifiers are not relevant here — no symbols are introduced.

**Task dependencies:** Task 1 must complete (commit) before Task 2 (tests rely on the dev server picking up the new config). Task 3 is independent of Task 2. Task 4 depends on all of the above.
