# Catalog Expansion Roadmap

**Owner:** brainstormed by user (luyin.hu) + Claude on 2026-04-26 night
**Status:** PR1 in execution; PR2/3/4 specs ready for review

## Why

Today the app has 5 placeholder topics, 10 courses, 21 zero-duration lessons. We want to scale to 24 topics drawn from Khan Academy (171 playlists, ~1,700 real videos with durations) so that:

- New users have meaningful content to engage with on day 1
- The "刷视频学知识" core loop has enough material for at least weeks of daily use
- The shelf model from PR #19 finally has scale to justify itself

The brainstorming explicitly rejected an earlier "dump 24 topics on home" approach in favor of a **library + plaza** model:
- Home shows only courses on the user's shelf
- Onboarding picks 5 group-level super-categories, derives starter shelf
- Plaza (`/discover`) lets users browse the catalog and grow their shelf later

## How (4-PR sequence)

| # | PR | What | Risk | Visible to users |
|---|---|---|---|---|
| 1 | `claude/schema-cleanup` | `topic_groups` table + `topics.group_id` FK + drop `courses.topic` legacy column | Low | No |
| 2 | `claude/khan-catalog-onboarding` | Khan import script + new seed (24 topics, ~1700 lessons) + onboarding refactor (5 groups instead of 5 topics) | Medium-High (data wipe + UI change) | Yes — replaces all preset content |
| 3 | `claude/topics-plaza` | New `/discover` page; "+ Add to library" actions; home empty-state CTA | Medium (new surface area) | Yes — new browse-and-add flow |
| 4 | `claude/add-page-shelf-fix` | Fix `/add` so paste-YouTube-link writes `profile_courses` (PR #19 deferred item) | Low | Subtly — bug fix |

**Sequencing rationale:**
- PR1 must merge first (PR2/3 depend on the new tables)
- PR2 + PR3 are tightly coupled in user-facing terms (catalog without plaza = unreachable; plaza without catalog = empty) but split anyway because PR2 is data-heavy and PR3 is UI-heavy. PR3 can land days after PR2.
- PR4 is independent — can ship anytime, including before PR1

## Settled design decisions (do not relitigate without surfacing)

These came out of a long brainstorming session. Summary so the next session has full context.

| Decision | Outcome | Reason |
|---|---|---|
| Hierarchy mapping | Khan subject = LearnTok topic (option A from Q1) | Most-faithful structure, library model defangs the "too many rails" objection |
| Library granularity | Course (whole playlist gets added) | Simplest mental model; users want to commit to a chapter, not cherry-pick lessons |
| Onboarding handling | Z: 5 group chips instead of 24 topic chips | 24 chips would crowd the picker; 5 stays calm |
| Existing 5 preset topics | Drop entirely (option P in Q4) | Overlap with Khan structure; legacy seed is placeholder anyway |
| `lesson_progress` orphaning | Accepted | Real progress data is minimal (dev user only) |
| Group schema | Separate `topic_groups` table with `owner_id`/`is_preset` pattern (S1 in Q5) | Allows future user-defined groups; cleanly extends existing pattern |
| Onboarding `interests` semantic | T1: keep as derived topic UUIDs, don't add `interest_groups` column | PR #19 contract preserved; group is a UI affordance, not a data dimension |
| Starter shelf rule | W4: top-2 topics × top-3 courses per picked group = 6 starter courses per group | More courses than the prior "2 per topic" rule; richer initial home |
| Group order on home | finance → humanities → stem → math → cs | User explicit preference: "more engineering people use this app, but I want economics and humanities first" |
| `topics.color` | Keep for now (was tagged for drop, but actively used by onboarding chip + topic detail chip) | Removal needs B&W audit; deferred to follow-up |
| Lesson duration | Fetch real durations from YouTube Data API in PR2 | StatsCard "today learned" only meaningful with real durations |
| Lesson cap per course | 30 (truncates long Khan playlists) | Balances readability + seed file size |
| User-content support | Existing schema already covers (`topics.owner_id` + `courses.owner_id` + `topic_groups.owner_id` after PR1) | No additional schema work needed for future user-created content |

## Schema cleanup deferred to a follow-up PR (R-tickets)

Identified during brainstorming review; explicitly held back so they don't bloat PR1 scope:

- **R2** — `profiles.interests` is `text[]` storing UUIDs. Convert to `uuid[]` or normalize to `profile_interests(user_id, topic_id)` join table.
- **R3** — Drop `topics.color` (after B&W audit of remaining usages)
- **R4** — `ledger_entries.label` should have a CHECK / enum constraint
- **R5** — `ledger_entries.ref_id` should split into typed FK columns
- **O1** — `recompute_jar_balance` trigger should be incremental, not full SUM

These will be tracked as separate tickets after the catalog expansion lands.

## Catalog research artifact

`docs/research/khan-academy-playlists.json` — the curated subset of 24 Khan subjects fetched during the brainstorming session. PR2's import script reads this to know which playlists to crawl.

Source: scraped from `https://www.youtube.com/@khanacademy/playlists` via Chrome MCP + YouTube internal browse continuation API (no quota cost).

## Curated subset (24 Khan subjects → 5 LearnTok groups)

| Group | Topics | Playlists | ~Videos |
|---|---|---:|---:|
| 经济金融 (`finance`) | Microeconomics, Macroeconomics, Finance and Capital Markets | 23 | ~419 |
| 人文历史 (`humanities`) | World History, US History, Art History, US government and civics | 33 | ~1,219 |
| 理工 (`stem`) | Physics, Chemistry, Biology, Cosmology & Astronomy, Electrical Engineering, Computer Animation | 37 | ~338 |
| 数学 (`math`) | Algebra Basics, Pre-Algebra, Geometry, Trigonometry, AP Calculus AB, AP Calculus BC, Linear Algebra, Multivariable Calculus, Differential Equations | 70 | ~2,080 |
| 编程 (`cs`) | Computer Programming, Computer Science | 8 | ~172 |
| **Total** | **24 topics** | **171 playlists** | **~4,228 raw / ~1,700 after 30-cap** |
