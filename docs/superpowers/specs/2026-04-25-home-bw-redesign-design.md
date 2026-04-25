# Home page B&W redesign

**Date:** 2026-04-25
**Author:** Luyin (via brainstorming with Claude)

## Goal

Refresh the home page to a black-and-white minimalist look, fix the "monotone" feel of the current Continue card by adding the plushy Angel mascot, and turn the "your topics" list from a vertical click-to-drill list into Netflix-style horizontal rails so courses are visible inline. As part of this, swap the global accent color from purple to near-black, and replace emoji bottom-nav icons with Lucide line icons. No other pages get redesigned in this scope.

## Decisions (from brainstorming)

| # | Decision | Rationale |
|---|---|---|
| D1 | Global accent: `#5e6ad2` (purple) → `#0e0f12` (near-black) | "Whole project goes black-and-white minimalist." Avoids the AI-generic-purple cliché. |
| D2 | Hero stays a flat white card. **No** gradient. | User rejected all gradient hero variants. |
| D3 | Add plushy Angel PNG anchored to the Continue card, body overlapping the "Start now" button | Single point of warm color = visual focus, breaks the monotone feel without requiring chrome color. |
| D4 | "your topics" → Netflix-style rails: one horizontal scroll row per topic, each row contains course cards | User wants courses visible without an extra navigation hop. |
| D5 | Bottom-nav icons: swap emoji + nibs.png for Lucide `Home` / `Coffee` / `TrendingUp` (stroke-width 1.8) | "I like the line-icon style at the bottom." `relax` = `Coffee`. |
| D6 | Nibs character color (`--nibs: #d85a3e`) and Angel character color (`--angel: #f4c874`) **stay** | They're character/brand colors, not theme accents. Only show up where the character itself appears. |

## Out of scope (explicit)

- Onboarding, lesson player, feed, budget, progress, login, root pages — not redesigned, but they will inherit the accent color flip automatically (every place that uses `var(--accent)` will become black). That's acceptable for the B&W direction.
- The Angel SVG (`components/characters/Angel.tsx`) used in onboarding scenes stays untouched — it's a different asset for a different surface.
- The cartoon `public/characters/angel.png` referenced by the feed exit button stays untouched.
- No new database fields, no API changes, no migrations.

## Files affected

| File | Change |
|---|---|
| `app/globals.css` | `--accent: #0e0f12`, `--accent-2: #000`. All other tokens unchanged. Add `.hero-angel`, `.rail`, `.rail-card`, `.rail-thumb`, `.rail-bar`, `.rail-title` component classes. |
| `tailwind.config.ts` | `accent: { DEFAULT: '#0e0f12', 2: '#000' }`. |
| `app/home/page.tsx` | Restructure render: keep server-side data fetch + continue-card derivation. **Remove** the existing vertical `lesson-row` topic list (the one that links each topic to `/topic/{id}`). **Add** one `<TopicRail>` per topic (in the same spot, under the existing "your topics" eyebrow). **Keep** the existing bottom `paste YouTube link` dashed row as-is — don't add an inline "+ add". Drop the `card-hl` highlight on the Continue card (border stays neutral `var(--line)`). Add the hero-angel `<div>` to the Continue card. Use real YouTube thumbs (`https://i.ytimg.com/vi/{ytId}/mqdefault.jpg`) on rail cards. |
| `components/home/TopicRail.tsx` *(new)* | Server component. Props: `{ topic, courses, lessonsByCourse, doneIds }`. Renders the rail title (Fraunces 16px) + horizontal scroll of course cards. Each course card: thumbnail (YT image), title, "X lessons · Y done" meta, 3px progress bar. Tappable → links to `/course/{id}`. |
| `components/nav/BottomNav.tsx` | Replace emoji `🏠`, the `<Image src="/characters/nibs.png">`, and emoji `📊` with `<Home />`, `<Coffee />`, `<TrendingUp />` from `lucide-react`. Stroke width 1.8, size 22. Active state colors the icon + label `var(--ink)` (which now equals the accent because both are near-black). |
| `public/characters/angel-plush.png` *(new)* | Copied from `Kling/angle-removebg-preview.png`. ~221 KB. Referenced only by the home hero. The existing `public/characters/angel.png` is left in place. |
| `package.json` | Add `lucide-react` (latest) as a runtime dep. |

## New / changed CSS

```css
/* Continue hero — angel hangs off the top-right */
.hero-card  { /* extends .card, drops .card-hl */ position: relative; overflow: visible; }
.hero-angel {
  position: absolute; right: -4px; top: -58px;
  width: 86px; height: 86px;
  background: url('/characters/angel-plush.png') no-repeat center/contain;
  pointer-events: none;
}

/* Topic rail */
.rail-title  { display: flex; align-items: baseline; justify-content: space-between;
               padding: 14px 0 6px; }
.rail-title .rt { font-family: var(--serif); font-weight: 500; font-size: 16px;
                  letter-spacing: -0.02em; }
.rail-title .rm { font-size: 11px; color: var(--ink-mute); }

.rail        { display: flex; gap: 10px; overflow-x: auto;
               padding: 4px 0 16px; scrollbar-width: none;
               margin: 0 -20px; padding-left: 20px; padding-right: 20px; }
.rail::-webkit-scrollbar { display: none; }

.rail-card   { flex: 0 0 148px; background: var(--bg); border: 1px solid var(--line);
               border-radius: 12px; padding: 10px; display: flex; flex-direction: column;
               gap: 8px; text-decoration: none; color: inherit; }
.rail-thumb  { width: 100%; height: 80px; border-radius: 8px;
               background: var(--bg-3) center/cover no-repeat; position: relative; }
.rail-thumb .dur { position: absolute; bottom: 4px; right: 4px;
                   background: rgba(0,0,0,0.65); color: #fff;
                   font-size: 9px; padding: 1px 6px; border-radius: 4px;
                   font-family: var(--mono); }
.rail-t      { font-weight: 600; font-size: 13px; color: var(--ink); }
.rail-meta   { font-size: 10px; color: var(--ink-mute); }
.rail-bar    { height: 3px; border-radius: 2px; background: var(--bg-3); overflow: hidden; }
.rail-bar > i { display: block; height: 100%; background: var(--ink); }
```

The horizontal `margin: 0 -20px; padding-left/right: 20px` trick lets the rail bleed to the screen edges so the last visible card peeks past the page padding (a key Netflix-rail signal that "you can scroll").

## Data flow (unchanged)

The existing `/home` server component already fetches `topics`, `courses`, `lessons`, and `lesson_progress` in parallel and groups them. The redesign only changes how this data is rendered, not what's fetched. The Continue card derivation logic (walk topics → first course with an undone lesson) stays as-is.

## Edge cases to handle

- Topic with zero courses → render the rail-title with `0 courses` and a small empty-state pill ("no courses yet — paste a YouTube link"). Don't render an empty rail.
- Course with zero lessons → still render the course card, show `0 lessons`, no progress bar.
- Lesson with no `yt_id` → fall back to `var(--bg-3)` solid block thumbnail (no broken image).
- Continue card when all lessons done → keep the existing logic that hides the card. (Today's behavior; not changing.)

## Testing

- Manual smoke: load `/home` as the seeded user with three preset courses (React / CSS / Spanish). Verify: Continue card renders with angel overlapping the Start button; three rails render; horizontal scroll works on touch and mouse; bottom nav shows three Lucide icons; tapping each tab navigates correctly.
- Visual check on small phone widths (360 / 390 / 430 px) — rail card width 148 means ~2.3 cards visible at 360, ~2.5 at 390, ~2.8 at 430. All show the partial peek.
- Confirm no `text-accent`, `bg-accent`, or `border-accent` classes are now displaying as black in places that expect a colored cue (a quick visual pass on `/login`, `/onboarding`, `/budget`, `/feed` is enough — no automated test required).
- No Playwright tests required for this change (the project has no test suite yet).

## Risks

- **Accent flip side effects.** 13 files reference `var(--accent)` or accent classes. Most are intentional ("active state", "primary button") and look fine in black. The `nibs-pulse` keyframe uses `var(--nibs)` (not accent), so it's unaffected. Spot-check `app/login/page.tsx`, `components/onboarding/Onboarding.tsx`, `components/budget/BudgetPicker.tsx` after the change.
- **Angel PNG is 221 KB.** Not catastrophic for a landing surface but worth knowing. If it becomes a perf issue, we re-export at smaller dimensions later — not in scope now.
- **Real YouTube thumbnails will reintroduce color.** Intentional ("mono UI + colorful content"). If the contrast feels wrong post-launch, we can layer a subtle desaturate filter on `.rail-thumb` — not in scope now.

## Acceptance

The `/home` page renders as shown in `home-mockup-v2.html` (preview pushed during brainstorming). The whole app's accent color is now near-black instead of purple. Bottom nav shows three Lucide line icons. No other functional behavior changes.
