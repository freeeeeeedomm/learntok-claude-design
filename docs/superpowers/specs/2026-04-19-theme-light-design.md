# Theme Light — Design Spec

**Date:** 2026-04-19
**Branch:** `theme-light` (off `main`, parallel to `lesson-page`)

Flips the app's color palette from the current "dark cozy" tokens
(warm dark brown bg + orange accent) to a Linear-style light theme
(near-white bg + cool indigo accent + emerald "good"). Touches only
design tokens — no component logic, no layout, no routing.

## Goal

Replace the global theme tokens so every page and component that
consumes them (`--bg`, `--ink`, `--accent`, etc., plus the Tailwind
`colors.*` map) picks up the new palette automatically. Zero component
edits — validated by grepping for hex literals in component files.

## Non-goals

- Dark mode toggle (deferred; no user-facing request for this)
- Nibs / Angel character recolors (user wants to revisit mascot design
  separately)
- Font-family changes (Fraunces serif + Inter sans stay)
- Component layout / spacing / copy changes
- Changes to `--bad` (currently unused — flagged but untouched)

## Palette

### `:root` CSS variables (in `app/globals.css`)

| Variable | Current | New | Role |
|---|---|---|---|
| `--bg` | `#13110e` | `#fafbfc` | page bg (near-white, subtle cool hint) |
| `--bg-2` | `#1c1814` | `#f4f5f7` | card / chip / sheet surface |
| `--bg-3` | `#251f19` | `#eaebef` | hover / deeper surface |
| `--ink` | `#f3ece0` | `#0e0f12` | primary text (near-black with cool tint) |
| `--ink-soft` | `#b8ad9a` | `#5a6068` | secondary text |
| `--ink-mute` | `#7a7062` | `#8b92a0` | tertiary / hint text |
| `--line` | `#2e2720` | `#e3e5e9` | borders, separators |
| `--accent` | `#e89a56` | `#5e6ad2` | primary button, active chip, highlights (Linear indigo) |
| `--accent-2` | `#d96f3d` | `#4c56c4` | accent hover / pressed |
| `--nibs` | `#d85a3e` | **unchanged** | Nibs mascot |
| `--angel` | `#f4c874` | **unchanged** | Angel mascot |
| `--good` | `#a8c080` | `#10b981` | "earning time" dot, success (emerald) |
| `--bad` | `#d96f3d` | **unchanged** | warning / error (currently unused) |

### `tailwind.config.ts` `colors` map

Mirrors the CSS variables so utility classes (`text-ink`, `bg-bg-2`,
`text-accent`, etc.) render the same values as `var(--ink)` does in
inline styles.

```ts
colors: {
  bg: { DEFAULT: '#fafbfc', 2: '#f4f5f7', 3: '#eaebef' },
  ink: { DEFAULT: '#0e0f12', soft: '#5a6068', mute: '#8b92a0' },
  line: '#e3e5e9',
  accent: { DEFAULT: '#5e6ad2', 2: '#4c56c4' },
  nibs: '#d85a3e',    // unchanged
  angel: '#f4c874',   // unchanged
  good: '#10b981',    // emerald
  bad: '#d96f3d',     // unchanged
},
```

## Component-class tweaks (in `app/globals.css`)

Three classes currently hard-code a text/bg color that was chosen for
contrast against the old orange accent. Each needs to flip to pair with
the new indigo accent:

### `.btn-primary`

```css
/* before */
.btn-primary { background: var(--accent); color: #1a1109; }
.btn-primary:hover { background: #efb26e; }

/* after */
.btn-primary { background: var(--accent); color: #ffffff; }
.btn-primary:hover { background: #7480dc; }
```

- Text flips from dark brown (`#1a1109`, read on orange) to white
  (read on indigo).
- Hover becomes a ~10% lighter indigo (`#7480dc`) instead of a lighter
  orange.

### `.chip.active`

```css
/* before */
.chip.active { background: var(--accent); color: #1a1109; border-color: var(--accent); }

/* after */
.chip.active { background: var(--accent); color: #ffffff; border-color: var(--accent); }
```

Same text-color flip as `.btn-primary`.

### `.card-hl` (highlight card)

```css
/* before */
.card-hl { border-color: var(--accent); background: rgba(232, 154, 86, 0.06); }

/* after */
.card-hl { border-color: var(--accent); background: rgba(94, 106, 210, 0.06); }
```

The `rgba(...)` tint is the old accent (`#e89a56`) at 6% alpha. Needs to
become the new accent (`#5e6ad2`) at 6% alpha.

## Component audit

Most components reference colors through either:
1. Tailwind utility classes (`text-ink`, `bg-bg-2`, etc.) → automatically
   pick up the new `colors` map.
2. CSS variables (`var(--ink-soft)`, `var(--accent)`, etc.) → pick up the
   new `:root` values.

**Exceptions — components with hard-coded palette-dependent hex (must
be updated as part of this spec):**

- `app/page.tsx:7` — `text-[#1a1109]` on "get started" button. Replace
  with `text-white` (readable on new indigo accent). The full class
  list becomes:
  `"inline-block bg-accent text-white px-5 py-3 rounded-xl font-semibold"`
- `app/login/page.tsx:85` — `text-[#1a1109]` on "send code" button.
  Replace with `text-white`.
- `app/login/page.tsx:106` — `text-[#1a1109]` on "verify" button.
  Replace with `text-white`.

These three were the same dark-brown text color chosen to read on the
old warm-orange accent. They flip to white to read on the new indigo
accent, matching the `.btn-primary` change in `app/globals.css`.

**Out-of-scope reference (not modified by this spec):**

`components/onboarding/Onboarding.tsx` contains three palette-dependent
rgba / hex values (lines 86, 92, 152) — tints of the old Nibs, Angel,
and accent colors, plus two dark warm border hexes (`#7a2218`,
`#6a5530`). This file is owned by the parallel onboarding-redesign
worktree; touching it here would create a merge conflict. Consequence:
until the onboarding worktree's own work lands, the onboarding pages
will display these tints unchanged against the new white background —
the warm tints will look faint but are not broken. The onboarding
worktree's redesign will replace these hexes naturally.

**Hex literals that do NOT need changing (verified):**
- Mascot SVG strokes / gradients in `components/characters/Nibs.tsx` and
  `Angel.tsx` — intentional mascot artwork, unchanged per spec.
- `#000` (iframe bg — deliberate player backdrop).
- `#fff` / `#ffffff` (pure white — stays white in both themes).
- `rgba(0,0,0,0.6)` (idle sheet scrim — readable on any bg).

**In `app/globals.css`:** three class-level hex values (`#1a1109`,
`#efb26e`, `rgba(232,154,86,0.06)`) that this spec replaces explicitly,
covered in "Component-class tweaks" above.

## File changes

**Modified**
- `tailwind.config.ts` — `colors` map replaced per §"`tailwind.config.ts`"
- `app/globals.css` — `:root` vars + three `@layer components` rules per
  §"Component-class tweaks"
- `app/page.tsx` — swap `text-[#1a1109]` → `text-white` on the "get
  started" button (one occurrence)
- `app/login/page.tsx` — swap `text-[#1a1109]` → `text-white` on both
  "send code" and "verify" buttons (two occurrences)

**Not modified**
- `components/characters/Nibs.tsx`, `components/characters/Angel.tsx`
  (mascot colors unchanged)
- Everything under `app/`, `components/`, `hooks/`, `lib/` except the
  two files above
- `middleware.ts`, supabase clients, tests, migrations
- Anything under `app/onboarding/` or `components/onboarding/` (reserved
  for the parallel onboarding worktree — they'll inherit the new tokens
  automatically when this merges)

## Testing

- `npx tsc --noEmit` — tokens are string values; should stay clean.
- `npx playwright test` — tests assert DOM structure and API contracts,
  not rendered colors. All 20 tests from Track F+G + lesson-page PR
  should remain green.
- Manual smoke via `npm run dev` + browser:
  - `/login` — check bg is near-white, primary button is indigo with
    white text.
  - `/home` (stub) — verify readable on white, jar chip styled.
  - `/lesson/<preset>` (requires merged lesson-page PR OR manual test
    from that branch) — validate iframe bg stays `#000`, "earning time"
    dot is emerald, jar chip active looks right.

## Out of scope

- **Dark mode preference toggle.** Would require `html[data-theme="dark"]`
  alternate token set. Not planned; mention as a follow-up if someone
  asks.
- **Nibs / Angel character color tweaks.** User has follow-up design
  intent; this spec explicitly keeps `--nibs` and `--angel` at current
  values.
- **Typography changes.** Fraunces serif display + Inter sans stay.
- **Accessibility audit** against WCAG contrast (the new tokens should
  pass but formal verification is a separate task).

## Coordination with parallel work

- `lesson-page` branch (PR #2): orthogonal to this. No file conflicts.
  Either PR can merge first; the theme change will apply to the lesson
  page automatically after both land.
- `onboarding` parallel worktree: uses the same `:root` vars and
  Tailwind tokens. Will visually change when this merges. That's
  expected — they're consuming design tokens, not defining them.
