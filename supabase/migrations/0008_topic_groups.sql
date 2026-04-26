-- 0008_topic_groups.sql
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
-- in migration 0005; kept for one release but no code reads it (verified
-- via grep). The single writer (`app/add/AddForm.tsx`) is updated in this
-- same PR so the build doesn't break.
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
