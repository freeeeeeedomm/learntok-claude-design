-- 0005_topics.sql
-- Add `topics` table and link `courses.topic_id` for a three-level hierarchy.

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  is_preset boolean not null default false,
  title text not null,
  icon text,
  color text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_topics_owner_id on public.topics(owner_id);
create index if not exists idx_topics_is_preset on public.topics(is_preset);

-- Attach topic to courses. Nullable so user-added courses can still exist
-- without a topic (they'll show up under "Your library" in a future phase).
alter table public.courses
  add column if not exists topic_id uuid references public.topics(id) on delete set null,
  add column if not exists position integer not null default 0;

create index if not exists idx_courses_topic_id on public.courses(topic_id);

alter table public.topics enable row level security;

-- Read: owner or preset (identical shape to courses_read).
create policy topics_read on public.topics
  for select using (
    owner_id = auth.uid() or is_preset = true
  );

-- Insert: only own non-preset rows.
create policy topics_insert_own on public.topics
  for insert with check (
    owner_id = auth.uid() and is_preset = false
  );

-- Update / delete: only your own non-preset rows.
create policy topics_update_own on public.topics
  for update using (
    owner_id = auth.uid() and is_preset = false
  );
create policy topics_delete_own on public.topics
  for delete using (
    owner_id = auth.uid() and is_preset = false
  );
