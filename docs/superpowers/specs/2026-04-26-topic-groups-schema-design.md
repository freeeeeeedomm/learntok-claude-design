# Topic Groups Schema Foundation — Design

**Status:** Approved (overnight autonomous execution)
**Author:** Claude (autonomous), all decisions ratified by user during the brainstorming session preceding this spec
**Sub-project:** PR1 of 4 in the catalog-expansion roadmap (see `2026-04-26-catalog-expansion-roadmap.md`)

## Goal

Lay schema foundation for the upcoming Khan Academy catalog expansion (PR2) and `/topics` plaza page (PR3) by adding a `topic_groups` table, linking it from `topics`, and dropping one clearly-dead column. **Pure schema work — no UI changes.**

## Non-goals

- Importing Khan Academy content (PR2)
- Refactoring onboarding to pick groups (PR2)
- Building `/topics` plaza page (PR3)
- Fixing `/add` to write `profile_courses` (PR4)
- Dropping `topics.color` (still actively used by `app/topic/[id]/page.tsx` chip background and `components/onboarding/Onboarding.tsx` selected-chip background — needs UI design judgment to remove; deferred)
- Fixing other schema redundancies (`profiles.interests text[]` → `uuid[]`; `ledger_entries.label` enum; `ledger_entries.ref_id` polymorphic FK; `recompute_jar_balance` incremental update — all deferred to separate cleanup PR)

## Why now

The next three PRs depend on `topic_groups` existing. Shipping schema first as its own PR:
- Lets the migration ride through CI and any production deploy in isolation
- Avoids a single mega-PR that mixes schema + content + UI
- Keeps blast radius of any migration mistake small (rollback affects only schema, not user-visible features)

## What changes

### New migration: `supabase/migrations/0009_topic_groups.sql`

```sql
-- 0009_topic_groups.sql
-- Foundation for the catalog expansion: 5 preset super-categories that
-- contain topics. Built with the same owner_id/is_preset pattern as topics
-- and courses so user-defined groups can be added later without further
-- schema work.

create table public.topic_groups (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references public.profiles(id) on delete cascade,  -- null = preset
  is_preset  boolean not null default false,
  key        text,           -- stable code-side identifier for preset rows; null for user groups
  title      text not null,
  position   integer not null default 0,
  icon       text,
  created_at timestamptz not null default now(),
  unique (owner_id, title)   -- one user can't have two groups with the same name
);

-- Preset groups are looked up by key in seed/import scripts; the partial
-- index makes that a fast O(1) lookup and forbids duplicate preset keys.
create unique index topic_groups_preset_key_uniq
  on public.topic_groups (key) where is_preset;

create index idx_topic_groups_owner_id on public.topic_groups (owner_id);
create index idx_topic_groups_is_preset on public.topic_groups (is_preset);

-- Link topics to a group. Nullable because user-created topics may live
-- ungrouped, and because dropping a group should leave its topics intact.
alter table public.topics
  add column group_id uuid references public.topic_groups(id) on delete set null;

create index idx_topics_group_id on public.topics (group_id);

-- Drop the legacy text `topic` column on courses. Replaced by `topic_id`
-- in migration 0005; kept for one release but no code reads or writes it
-- (verified via grep). seed.sql still inserts a value — that insert is
-- updated in this PR.
alter table public.courses drop column topic;

-- RLS: same shape as topics / courses.
alter table public.topic_groups enable row level security;

create policy topic_groups_read on public.topic_groups
  for select using (
    owner_id = auth.uid() or is_preset = true
  );

create policy topic_groups_insert_own on public.topic_groups
  for insert with check (
    owner_id = auth.uid() and is_preset = false
  );

create policy topic_groups_update_own on public.topic_groups
  for update using (
    owner_id = auth.uid() and is_preset = false
  );

create policy topic_groups_delete_own on public.topic_groups
  for delete using (
    owner_id = auth.uid() and is_preset = false
  );
```

### Seed updates: `supabase/seed.sql`

Two changes:

1. **Remove the `topic` text column from `courses` insert** (the column no longer exists):

   ```diff
   - insert into public.courses (id, owner_id, is_preset, title, topic, topic_id, icon, position) values
   + insert into public.courses (id, owner_id, is_preset, title, topic_id, icon, position) values
   ```

   Removes the third value (e.g. `'physics'`) from each row.

2. **Add 5 preset `topic_groups` and assign existing 5 `topics` to them** (placed at top of seed.sql, before topics insert). Existing topic→group mapping is the most-natural fit; this is **transitional** because PR2 will drop these 5 topics entirely and replace with 24 Khan topics:

   ```sql
   -- ===== Topic groups (5 preset super-categories) =====
   insert into public.topic_groups (id, owner_id, is_preset, key, title, position, icon) values
     ('00000000-0000-0000-0000-0000000000a1', null, true, 'finance',    '经济金融', 0, '💰'),
     ('00000000-0000-0000-0000-0000000000a2', null, true, 'humanities', '人文历史', 1, '📜'),
     ('00000000-0000-0000-0000-0000000000a3', null, true, 'stem',       '理工',     2, '🔬'),
     ('00000000-0000-0000-0000-0000000000a4', null, true, 'math',       '数学',     3, '∑'),
     ('00000000-0000-0000-0000-0000000000a5', null, true, 'cs',         '编程',     4, '💻')
   on conflict (id) do update set
     key = excluded.key,
     title = excluded.title,
     position = excluded.position,
     icon = excluded.icon;
   ```

   Update the existing 5 topics insert to add `group_id`:

   ```sql
   insert into public.topics (id, owner_id, is_preset, title, icon, color, position, group_id) values
     ('10000000-0000-0000-0000-000000000001', null, true, 'Physics',     '🧲', '#5e6ad2', 0, '00000000-0000-0000-0000-0000000000a3'),  -- stem
     ('10000000-0000-0000-0000-000000000002', null, true, 'Biology',     '🧬', '#10b981', 1, '00000000-0000-0000-0000-0000000000a3'),  -- stem
     ('10000000-0000-0000-0000-000000000003', null, true, 'Economics',   '💰', '#f4c874', 2, '00000000-0000-0000-0000-0000000000a1'),  -- finance
     ('10000000-0000-0000-0000-000000000004', null, true, 'Math',        '📐', '#d96f3d', 3, '00000000-0000-0000-0000-0000000000a4'),  -- math
     ('10000000-0000-0000-0000-000000000005', null, true, 'Programming', '💻', '#4c56c4', 4, '00000000-0000-0000-0000-0000000000a5')   -- cs
   on conflict (id) do update set
     title = excluded.title,
     icon = excluded.icon,
     color = excluded.color,
     position = excluded.position,
     group_id = excluded.group_id;
   ```

### Type regeneration

Run `npm run gen:types` against the local Supabase instance to update `lib/supabase/database.types.ts`. This adds the `topic_groups` table type and a `group_id` field on `topics`, removes the `topic` field on `courses`.

### Code changes (one consequence of dropping `courses.topic`)

Verified via `Grep`:
- `courses.topic` (legacy text) is read by zero code paths but **written** in one place: `app/add/AddForm.tsx:82` inserts `topic: parsed.channel || null`. After the column is dropped, this insert errors. Fix: drop that one key from the insert object (it's already meaningless — `topic_id` is the source of truth and AddForm doesn't set it).

  ```diff
  - .insert({
  -   owner_id: user.id,
  -   is_preset: false,
  -   title,
  -   topic: parsed.channel || null,
  -   icon: '🎥',
  - })
  + .insert({
  +   owner_id: user.id,
  +   is_preset: false,
  +   title,
  +   icon: '🎥',
  + })
  ```

  This is a 1-line code change driven by the schema migration; including it in the schema PR keeps `git bisect` clean (the schema commit doesn't break the build by itself).

Verified no other code reads or writes:
- `topic_groups` (doesn't exist yet)
- `topics.group_id` (doesn't exist yet; PR2 adds references)

`courses.topic_id` (the kept column) is referenced from many query sites; those continue to work unchanged.

## Architecture notes

### Why a separate `topic_groups` table instead of an enum

Rejected `create type topic_group as enum ('finance', 'humanities', 'stem', 'math', 'cs')` because it cannot accommodate user-defined groups later. The user explicitly stated future plans to allow custom topic / lesson lists; the same owner/preset pattern used by `topics` and `courses` extends naturally.

### Why preserve `key` as a separate column on `topic_groups`

`key` is a stable string identifier (`'finance'`, `'stem'`, …) that import scripts and seeded data reference. Without it, code would have to look up groups by `title` (locale-dependent) or by UUID (opaque, breaks if seed regenerates). The partial unique index `where is_preset` keeps the namespace clean for preset rows while leaving user groups free to set `key = null`.

### Why drop `courses.topic` now

It's the most-overlapping with the upcoming changes (the seed.sql block being touched anyway) and verifying-zero-callers is trivial. Postponing means the seed.sql diff in PR2 has to keep inserting a useless column, then we have to come back and drop it later — strictly more work.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Migration fails on remote because some old environment still references `courses.topic` | Low — verified via grep that no code reads it | Migration is idempotent only if seed.sql re-runs; for non-seed environments dropping a column with no callers is safe. If it does fail, rollback is `alter table courses add column topic text;` |
| Existing `database.types.ts` consumers break because `topic` is removed from `courses` row type | Very low — no code uses the field | TypeScript build catches it; failing build would surface in CI |
| User-side data migration: `profile_courses` and `profiles.interests` reference topic UUIDs that still exist (we're not dropping topics in this PR), so no orphans created | N/A — non-event | Verified: PR1 only ADDS to topics (column) and ADDS topic_groups; nothing user-data-shaped is destroyed |
| Order conflict with R2/R4/R5/O1 follow-up cleanup | Low | Those cleanups are independent file/column changes; no overlap |

## Test plan

This PR's behavior is invisible to users; tests verify the schema is sound and existing flows still pass.

- [ ] **Migration applies cleanly**: `npm run supabase:reset` succeeds (resets local DB, applies all migrations including 0009, runs new seed)
- [ ] **Type regeneration succeeds**: `npm run gen:types` updates `lib/supabase/database.types.ts` without manual edits
- [ ] **TypeScript build passes**: `npx tsc --noEmit` shows zero new errors (existing pre-PR errors, if any, are unchanged)
- [ ] **Existing onboarding still works**: `npm test tests/onboarding.spec.ts` passes (PR #19's tests)
- [ ] **Manual smoke**: log in, walk through onboarding picking 2 of the 5 existing topics, verify home renders 2 rails as before
- [ ] **DB sanity**: `select count(*) from topic_groups where is_preset` returns 5; `select count(*) from topics where group_id is null` returns 0 (after seed re-run)

## Deferred to follow-up cleanup PR (R-tickets)

The following were identified during the brainstorming review but explicitly deferred from this PR to keep scope tight. To be picked up after PR2/3/4 ship:

- **R2** — `profiles.interests` column type is `text[]` but stores UUIDs since PR #19. Either change to `uuid[]` or normalize to a `profile_interests(user_id, topic_id)` join table. Latter is cleaner.
- **R3** — Drop `topics.color` (deferred from this PR because B&W redesign hasn't audited the onboarding chip + topic-detail chip for visual replacement)
- **R4** — `ledger_entries.label` is an unconstrained `text`; should be a Postgres `enum` or `CHECK` constraint over `'lesson' / 'feed' / 'welcome_gift' / 'manual'`.
- **R5** — `ledger_entries.ref_id` is a polymorphic UUID with no FK; either split into `ref_lesson_id` + `ref_session_id` with mutual-exclusion check, or add a validating trigger.
- **O1** — `recompute_jar_balance` trigger does a full `SUM(delta_seconds)` per row insert; convert to incremental update (`SET jar_balance_cached = jar_balance_cached + NEW.delta_seconds`).

These will be tracked as separate tickets / spawned tasks once the catalog expansion lands.

## Open items

None. All decisions made during brainstorming.
