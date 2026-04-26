# Overnight Handoff — 2026-04-26 → 2026-04-27 morning

You went to sleep, said "go", and gave me a clear set of guardrails. This is the report on what got done, what didn't, and what you need to look at first.

## TL;DR (read this first)

- **2 PRs are open** — both are small, low-risk, and ready to merge:
  - **PR #21** — Schema foundation (`topic_groups` table + drop legacy column)
  - **PR #22** — `/add` writes to shelf (PR #19's deferred bug)
- **3 specs are committed** in PR #21's branch (so they land in main when #21 merges):
  - PR1 spec (this PR's own design doc)
  - PR2 spec (Khan catalog + onboarding refactor)
  - PR3 spec (`/discover` plaza page)
- **PR4 spec lives in PR #22's branch**
- **The 4-PR roadmap** is at `docs/superpowers/specs/2026-04-26-catalog-expansion-roadmap.md`
- **Khan research data** (`docs/research/khan-academy-playlists.json`, 81 KB) is committed in PR #21 so PR2 can use it without re-scraping
- **0 PR2/PR3 implementation done** — these need your eyes on the specs first

## What I did

| Activity | Status |
|---|---|
| Explore main, find PR #19 already shipped the library schema | ✅ |
| Re-scope brainstorming around what PR #19 actually built | ✅ |
| Brainstorm 7 design questions with you to convergence | ✅ |
| Audit current schema for redundancies → 5 R-tickets identified | ✅ |
| Decide PR decomposition (4 PRs) | ✅ |
| Write 4 specs + 1 roadmap (5 docs total) | ✅ |
| Set up worktrees for all 4 PRs | ✅ |
| Implement PR1 (schema cleanup) | ✅ |
| Implement PR4 (/add shelf fix) | ✅ |
| Push both branches and open PRs (#21 + #22) | ✅ |
| Write this handoff | ✅ |

## What I deliberately did NOT do (per your guardrails)

| Skipped | Why |
|---|---|
| Run Khan import script | Out of scope for PR1 — needs PR2 implementation, which needs your spec review first |
| Implement PR2 (catalog + onboarding) | UI choices in onboarding refactor (chip layout, copy) need your eyes |
| Implement PR3 (plaza page) | Multiple UI design choices flagged in spec's "Open items" |
| `npx supabase db push` | Pushing migrations to your remote production DB without your explicit OK |
| Start local Supabase stack | A sibling project (`learntok-lesson`) has Supabase running on the default port; starting ours would conflict |
| Force-push or rewrite history | Would obscure what I actually did |
| Spawn the R-ticket cleanup tasks | Will ask you in the morning if you want them as separate sessions |

## What you need to do (in order)

### 1. Skim PR #21 (schema cleanup)
URL: https://github.com/freeeeeeedomm/learntok-claude-design/pull/21

Look for: anything weird in the migration, any objection to the `courses.topic` drop, any objection to the 5 group definitions (`finance`/`humanities`/`stem`/`math`/`cs` with the icons I picked).

If happy: merge it via squash. (Project convention.)

### 2. Apply migration 0008 to remote
Run `npx supabase db push` (or whatever your usual deploy step is) to apply the new migration to your remote Supabase. After PR #21 is merged.

### 3. Skim PR #22 (`/add` shelf fix)
URL: https://github.com/freeeeeeedomm/learntok-claude-design/pull/22

This is stacked on PR #21. After #21 merges, change PR #22's base from `claude/schema-cleanup` to `main` (single GitHub UI dropdown), then merge.

### 4. Apply migration 0009 to remote
Same as step 2, after PR #22 merges.

### 5. Read the PR2 spec
File: `docs/superpowers/specs/2026-04-26-khan-catalog-onboarding-design.md` (lives in main once PR #21 is merged; for now, view via PR #21's diff or pull the branch).

Open items at the bottom — please answer these before we start implementing PR2:
1. Lesson cap value (default 30, options 15 or 50)
2. Topic icons (24 hand-picked, swap any?)
3. Onboarding chip subtitle copy
4. Group icon for `cs` (currently 💻, same as Computer Programming topic)
5. OK to wipe other dev users' `profile_courses` during seed swap?

### 6. Read the PR3 spec
File: `docs/superpowers/specs/2026-04-26-topics-plaza-design.md`

Open items at the bottom — please answer these before we start implementing PR3:
1. Route name: `/discover` vs `/topics` vs `/browse` (recommend `/discover`)
2. BottomNav behavior when on `/discover` (hide vs keep)
3. Show "+ Add" only on topic-detail vs also on index (recommend detail-only)
4. Auto-add topic to interests when adding a course (recommend yes)
5. Where to remove a course from shelf (recommend toggle in plaza)
6. Course detail page also gets "+ Add" button (recommend yes)
7. Empty-state CTA copy

## Worktree state

For your reference / cleanup:

| Worktree | Branch | Status |
|---|---|---|
| `schema-cleanup` | `claude/schema-cleanup` | Open as PR #21 |
| `add-page-shelf-fix` | `claude/add-page-shelf-fix` | Open as PR #22 (stacks on #21) |
| `khan-catalog-onboarding` | `claude/khan-catalog-onboarding` | Empty branch, placeholder for PR2 implementation. Not pushed. Delete or use later. |
| `topics-plaza` | `claude/topics-plaza` | Empty branch, placeholder for PR3 implementation. Not pushed. Delete or use later. |
| `infallible-pascal-d16110` | `claude/infallible-pascal-d16110` | Stale (was the home-stats-hero PR #17 worktree). Safe to remove with `git worktree remove`. |

## Decisions I made on your behalf

These were small things I felt OK deciding without waking you. If any are wrong, easy to change:

1. **Skipped writing-plans skill for PR1 and PR4.** Both PRs are small (1 migration + 1 SQL file + 1 small code change each); ceremony would have outweighed value.
2. **Skipped subagent-driven-development.** My own context was fresh and the implementation was deterministic. Subagents add latency without benefit at this scale.
3. **Skipped the local supabase stack.** Sibling project conflict (see "What I didn't do"). Build verification done via `npx tsc --noEmit` + `npm run build`.
4. **Stacked PR #22 on PR #21.** Both touch `AddForm.tsx`. Stacking is cleaner than independent branches that would conflict.
5. **Group icons:** picked 💰 📜 🔬 ∑ 💻 — all easy emojis. The `cs` group icon collides with the future `Computer Programming` topic icon; flagged in PR2 spec for your call.
6. **Group titles in Chinese (经济金融 / 人文历史 / 理工 / 数学 / 编程):** matches your conversation style. Easy to localize later if needed.
7. **Migration order:** numbered 0008 (this PR's `topic_groups`) and 0009 (PR4's backfill). Sequential.

## R-ticket follow-ups I held back

These came up during brainstorming but explicitly deferred. I did NOT spawn tasks for them. Decide in the morning if you want me to spawn them, or batch into a single cleanup PR:

- **R2** — `profiles.interests` text[] → uuid[] (or normalize to join table)
- **R3** — Drop `topics.color` after B&W audit of remaining usages
- **R4** — `ledger_entries.label` add CHECK / enum
- **R5** — `ledger_entries.ref_id` polymorphic FK split
- **O1** — `recompute_jar_balance` incremental (vs full SUM today)

## Things I noticed but didn't act on

- PR #19's body mentioned "11 pre-existing test failures" — not investigated, not in scope tonight.
- Project package manager mismatch (CLAUDE.md says pnpm, lockfile is npm) — already a follow-up from earlier session.
- `.eslintrc.json` was added in PR #19 but `npm run lint` still enters interactive setup occasionally — didn't dig into.
- `topics.color` IS still actively used by onboarding chip + topic detail page — listed as R3 follow-up, not dropped in PR1 despite our brainstorming initially saying "drop." Adjusted the spec accordingly.

## If something blew up overnight

If you wake up to a broken state:

1. **PR #21 broke main**: revert `npx supabase db push` (run the down-migration manually or `drop table public.topic_groups; alter table public.courses add column topic text;`). Code rollback: revert PR #21.
2. **PR #22 broke main**: AddForm became inconsistent. Revert PR #22, then PR #21 if needed.
3. **Migration applied but git wasn't pushed**: shouldn't happen, both branches are pushed.
4. **You don't see PR #21**: refresh https://github.com/freeeeeeedomm/learntok-claude-design/pulls — it should be there as #21.

That's it. Sleep well; this should give you a clean morning.

— Claude
