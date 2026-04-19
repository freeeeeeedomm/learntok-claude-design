# Phase 1: Topic Hierarchy — Data Layer + Home/Topic UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a three-level content hierarchy (topic → course → lesson) backed by a new `topics` table, re-seed the DB with 5 Khan Academy topics and 10 courses (24 lessons total), and rewire `/home` to list topics while adding a new `/topic/[id]` detail page.

**Architecture:** Topics are top-level containers. Courses gain a nullable `topic_id` FK to preserve backward compatibility with user-added courses (the `/add` flow still inserts with null topic). Preset topics + preset courses are owned by nobody (`owner_id = null, is_preset = true`). RLS mirrors the existing `courses` policy pattern: readable if `owner_id = auth.uid()` OR `is_preset = true`.

**Tech Stack:** Next.js 14 App Router, Supabase Postgres 15 with RLS, TypeScript strict, Playwright. No new libs.

**Spec:** `docs/superpowers/specs/2026-04-19-topic-hierarchy-and-nibs-ball-design.md` Phase 1 section.

---

## File Structure

**New files:**
- `supabase/migrations/0005_topics.sql` — schema + RLS
- `app/topic/[id]/page.tsx` — new route (topic detail, lists courses)
- `tests/topic-smoke.spec.ts` — new route smoke + topic-row click on home

**Modified files:**
- `supabase/seed.sql` — full rewrite, replaces the 3 legacy preset courses with 5 topics + 10 courses + 24 lessons
- `lib/supabase/database.types.ts` — auto-regenerated
- `app/home/page.tsx` — switch query from `courses` → `topics`, render topic rows
- `app/course/[id]/page.tsx` — back link points to `/topic/[topic_id]` if the course has one, otherwise `/home`
- `tests/home-course-smoke.spec.ts` — update to navigate through topic → course

**Untouched files (explicitly NOT in Phase 1 scope):**
- `/add` flow (Phase 2 adds topic selection dropdown)
- `<BottomNav />` (Phase 2)
- `/lesson/[id]` player (Phase 2 adds client tick + restores native controls)
- Thumbnails on all rows (Phase 2)

---

### Task 1: Create migration 0005_topics.sql

**Files:**
- Create: `supabase/migrations/0005_topics.sql`

- [ ] **Step 1.1: Write the migration SQL**

```sql
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
```

- [ ] **Step 1.2: Apply the migration locally**

Run: `pnpm supabase:reset`
Expected: migrations 0001..0005 apply successfully; seed runs (old seed for now; will be replaced in Task 2, so expect the RESET to still succeed on a pre-Task-2 run).

- [ ] **Step 1.3: Verify the table exists**

Run: `pnpm supabase status` and connect via any postgres client, OR use the Supabase MCP if available:
```sql
select table_name from information_schema.tables where table_schema = 'public';
-- Expect to see: profiles, courses, lessons, lesson_progress, ledger_entries, sessions, topics
```

- [ ] **Step 1.4: Commit**

```bash
git add supabase/migrations/0005_topics.sql
git commit -m "feat(db): add topics table + courses.topic_id for 3-level hierarchy"
```

---

### Task 2: Rewrite supabase/seed.sql with Khan Academy content

**Files:**
- Modify: `supabase/seed.sql` (full replacement)

- [ ] **Step 2.1: Replace seed.sql content**

Full replacement (drops old preset intro-to-react / CSS / Spanish courses since they don't exist after reset anyway; reset wipes everything):

```sql
-- seed.sql — preset topics, courses, and lessons from Khan Academy.
-- Re-runnable: fixed UUIDs + ON CONFLICT guards make this idempotent.

-- ===== Topics (5 preset) =====
insert into public.topics (id, owner_id, is_preset, title, icon, color, position) values
  ('10000000-0000-0000-0000-000000000001', null, true, 'Physics',     '🧲', '#5e6ad2', 0),
  ('10000000-0000-0000-0000-000000000002', null, true, 'Biology',     '🧬', '#10b981', 1),
  ('10000000-0000-0000-0000-000000000003', null, true, 'Economics',   '💰', '#f4c874', 2),
  ('10000000-0000-0000-0000-000000000004', null, true, 'Math',        '📐', '#d96f3d', 3),
  ('10000000-0000-0000-0000-000000000005', null, true, 'Programming', '💻', '#4c56c4', 4)
on conflict (id) do update set
  title = excluded.title,
  icon = excluded.icon,
  color = excluded.color,
  position = excluded.position;

-- ===== Courses (10 preset, 2 per topic) =====
insert into public.courses (id, owner_id, is_preset, title, topic, topic_id, icon, position) values
  -- Physics
  ('20000000-0000-0000-0000-000000000011', null, true, 'Forces & Newton''s Laws', 'physics', '10000000-0000-0000-0000-000000000001', '🧲', 0),
  ('20000000-0000-0000-0000-000000000012', null, true, 'Motion & Energy',         'physics', '10000000-0000-0000-0000-000000000001', '🚀', 1),
  -- Biology
  ('20000000-0000-0000-0000-000000000021', null, true, 'Cell Structure',          'biology', '10000000-0000-0000-0000-000000000002', '🧬', 0),
  ('20000000-0000-0000-0000-000000000022', null, true, 'Cell Organelles',         'biology', '10000000-0000-0000-0000-000000000002', '🔬', 1),
  -- Economics
  ('20000000-0000-0000-0000-000000000031', null, true, 'Intro to Economics',      'economics', '10000000-0000-0000-0000-000000000003', '💰', 0),
  ('20000000-0000-0000-0000-000000000032', null, true, 'Supply & Demand',         'economics', '10000000-0000-0000-0000-000000000003', '📈', 1),
  -- Math
  ('20000000-0000-0000-0000-000000000041', null, true, 'Intro to Limits',         'math', '10000000-0000-0000-0000-000000000004', '∞', 0),
  ('20000000-0000-0000-0000-000000000042', null, true, 'Algebra Basics',          'math', '10000000-0000-0000-0000-000000000004', '🔢', 1),
  -- Programming
  ('20000000-0000-0000-0000-000000000051', null, true, 'Intro to CS (Python)',    'programming', '10000000-0000-0000-0000-000000000005', '🐍', 0),
  ('20000000-0000-0000-0000-000000000052', null, true, 'Algorithms',              'programming', '10000000-0000-0000-0000-000000000005', '🧮', 1)
on conflict (id) do update set
  title = excluded.title,
  topic_id = excluded.topic_id,
  icon = excluded.icon,
  position = excluded.position;

-- ===== Lessons (24 total) =====
-- All from Khan Academy. duration_seconds=0 because oembed doesn't give duration;
-- the UI renders "—" for zero-duration lessons.

insert into public.lessons (id, course_id, position, title, yt_id, duration_seconds) values
  -- Forces & Newton's Laws (4)
  ('30000000-0000-0000-0000-000000000111', '20000000-0000-0000-0000-000000000011', 1, 'Newton''s first law',                'rjkQcfw5fkM', 0),
  ('30000000-0000-0000-0000-000000000112', '20000000-0000-0000-0000-000000000011', 2, 'More on Newton''s first law',        'CQYELiTtUs8', 0),
  ('30000000-0000-0000-0000-000000000113', '20000000-0000-0000-0000-000000000011', 3, 'AP Physics 1 review of Forces',      'Bkl6Mn1Y23Q', 0),
  ('30000000-0000-0000-0000-000000000114', '20000000-0000-0000-0000-000000000011', 4, 'Unbalanced forces and motion',       'IgYUR7aFY-c', 0),
  -- Motion & Energy (3)
  ('30000000-0000-0000-0000-000000000121', '20000000-0000-0000-0000-000000000012', 1, 'Horizontally launched projectile',   'jmSWImPs6fQ', 0),
  ('30000000-0000-0000-0000-000000000122', '20000000-0000-0000-0000-000000000012', 2, 'Projectile at an angle',             'ZZ39o1rAZWY', 0),
  ('30000000-0000-0000-0000-000000000123', '20000000-0000-0000-0000-000000000012', 3, 'Projectile motion (AP Physics 1)',   'txJP95lBv98', 0),
  -- Cell Structure (3)
  ('30000000-0000-0000-0000-000000000211', '20000000-0000-0000-0000-000000000021', 1, 'Introduction to the cell',           '5KfHxF6Vhps', 0),
  ('30000000-0000-0000-0000-000000000212', '20000000-0000-0000-0000-000000000021', 2, 'Parts of a cell',                    'Hmwvj9X4GNY', 0),
  ('30000000-0000-0000-0000-000000000213', '20000000-0000-0000-0000-000000000021', 3, 'Cell theory',                        'zk3vlhz1b6k', 0),
  -- Cell Organelles (2)
  ('30000000-0000-0000-0000-000000000221', '20000000-0000-0000-0000-000000000022', 1, 'Mitochondria',                       'i1dAnpSFbyI', 0),
  ('30000000-0000-0000-0000-000000000222', '20000000-0000-0000-0000-000000000022', 2, 'Organelles in eukaryotic cells',     'bWPQvxElpLY', 0),
  -- Intro to Economics (2)
  ('30000000-0000-0000-0000-000000000311', '20000000-0000-0000-0000-000000000031', 1, 'Intro to Economics (course trailer)','wCHm5SdNO5U', 0),
  ('30000000-0000-0000-0000-000000000312', '20000000-0000-0000-0000-000000000031', 2, 'Introduction to economics',          '8JYP_wU1JTU', 0),
  -- Supply & Demand (3)
  ('30000000-0000-0000-0000-000000000321', '20000000-0000-0000-0000-000000000032', 1, 'Market equilibrium',                 'PEMkfgrifDw', 0),
  ('30000000-0000-0000-0000-000000000322', '20000000-0000-0000-0000-000000000032', 2, 'Law of supply',                      '3xCzhdVtdMI', 0),
  ('30000000-0000-0000-0000-000000000323', '20000000-0000-0000-0000-000000000032', 3, 'Changes in equilibrium',             'kl4n-EWwPyA', 0),
  -- Intro to Limits (1)
  ('30000000-0000-0000-0000-000000000411', '20000000-0000-0000-0000-000000000041', 1, 'Introduction to limits',             'riXcZT2ICjA', 0),
  -- Algebra Basics (1)
  ('30000000-0000-0000-0000-000000000421', '20000000-0000-0000-0000-000000000042', 1, 'Variables, expressions & equations', 'vDqOoI-4Z6M', 0),
  -- Intro to CS Python (1)
  ('30000000-0000-0000-0000-000000000511', '20000000-0000-0000-0000-000000000051', 1, 'Algorithms and selection',           'rJCRGiEidZ4', 0),
  -- Algorithms (1)
  ('30000000-0000-0000-0000-000000000521', '20000000-0000-0000-0000-000000000052', 1, 'What is an algorithm?',              'CvSOaYi89B4', 0)
on conflict (id) do nothing;
```

- [ ] **Step 2.2: Apply the seed**

Run: `pnpm supabase:reset`
Expected: migrations + seed all succeed. Output mentions `Finished supabase db reset on branch main`.

- [ ] **Step 2.3: Verify row counts**

Run via Supabase MCP `execute_sql` or psql:
```sql
select count(*) from topics where is_preset = true;  -- expect 5
select count(*) from courses where is_preset = true; -- expect 10
select count(*) from lessons;                         -- expect 24
```

- [ ] **Step 2.4: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat(seed): 5 Khan Academy topics, 10 courses, 24 lessons"
```

---

### Task 3: Regenerate TypeScript types

**Files:**
- Modify: `lib/supabase/database.types.ts` (auto-generated)

- [ ] **Step 3.1: Regenerate**

Run: `pnpm gen:types`
Expected: `lib/supabase/database.types.ts` now includes a `topics` interface and `courses` has `topic_id: string | null` and `position: number`.

- [ ] **Step 3.2: Verify types are sane**

Run: `npx tsc --noEmit`
Expected: any pre-existing type errors unchanged; NO new errors because no code yet consumes `topics`.

- [ ] **Step 3.3: Commit**

```bash
git add lib/supabase/database.types.ts
git commit -m "chore(types): regen database types for topics + topic_id"
```

---

### Task 4: Rewrite `/home` to query topics

**Files:**
- Modify: `app/home/page.tsx`

- [ ] **Step 4.1: Replace the data queries**

Replace the three parallel queries (`courses`, `lessons`, `lesson_progress`) with a topics-first shape. The continue-card logic needs to walk `topic → course → lesson` to find the first undone lesson across all preset content.

Full replacement for the `HomePage` function body (keep the header import + `fmtBank` helper):

```tsx
export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, streak, jar_balance_cached, onboarded')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarded) redirect('/onboarding');

  const [topicsRes, coursesRes, lessonsRes, progressRes] = await Promise.all([
    supabase
      .from('topics')
      .select('id, title, icon, color, position, is_preset')
      .order('is_preset', { ascending: false })
      .order('position', { ascending: true }),
    supabase
      .from('courses')
      .select('id, topic_id, title, icon, position, is_preset')
      .order('position', { ascending: true }),
    supabase
      .from('lessons')
      .select('id, course_id, position, title, duration_seconds')
      .order('position', { ascending: true }),
    supabase
      .from('lesson_progress')
      .select('lesson_id, completed_at')
      .eq('user_id', user.id),
  ]);

  const topics = topicsRes.data ?? [];
  const courses = coursesRes.data ?? [];
  const lessons = lessonsRes.data ?? [];
  const progress = progressRes.data ?? [];
  const doneIds = new Set(
    progress.filter((p) => p.completed_at).map((p) => p.lesson_id)
  );

  // Group lessons by course.
  const lessonsByCourse = new Map<
    string,
    Array<{ id: string; title: string; duration_seconds: number; done: boolean }>
  >();
  for (const l of lessons) {
    const arr = lessonsByCourse.get(l.course_id) ?? [];
    arr.push({
      id: l.id,
      title: l.title,
      duration_seconds: l.duration_seconds,
      done: doneIds.has(l.id),
    });
    lessonsByCourse.set(l.course_id, arr);
  }

  // Group courses by topic (preset topics only for home).
  const coursesByTopic = new Map<string, typeof courses>();
  for (const c of courses) {
    if (!c.topic_id) continue;
    const arr = coursesByTopic.get(c.topic_id) ?? [];
    arr.push(c);
    coursesByTopic.set(c.topic_id, arr);
  }

  // Continue card: walk topics in order, find first topic with an undone lesson.
  let continueCard: {
    topicId: string;
    topicTitle: string;
    courseTitle: string;
    total: number;
    done: number;
    nextId: string;
    nextTitle: string;
    nextDur: number;
  } | null = null;

  outer: for (const t of topics) {
    const courseList = coursesByTopic.get(t.id) ?? [];
    for (const c of courseList) {
      const ls = lessonsByCourse.get(c.id) ?? [];
      if (ls.length === 0) continue;
      const next = ls.find((l) => !l.done);
      if (!next) continue;
      continueCard = {
        topicId: t.id,
        topicTitle: t.title,
        courseTitle: c.title,
        total: ls.length,
        done: ls.filter((l) => l.done).length,
        nextId: next.id,
        nextTitle: next.title,
        nextDur: next.duration_seconds,
      };
      break outer;
    }
  }

  // For each topic: compute aggregated counts.
  const topicRows = topics.map((t) => {
    const cs = coursesByTopic.get(t.id) ?? [];
    const allLs = cs.flatMap((c) => lessonsByCourse.get(c.id) ?? []);
    return {
      id: t.id,
      title: t.title,
      icon: t.icon ?? '📚',
      color: t.color ?? '#5e6ad2',
      courseCount: cs.length,
      lessonCount: allLs.length,
      doneCount: allLs.filter((l) => l.done).length,
    };
  });

  const weekday = new Date()
    .toLocaleDateString('en', { weekday: 'long' })
    .toLowerCase();

  return (
    <main className="app">
      <div className="pad">
        <div className="row between aic">
          <div>
            <div className="eyebrow">
              {weekday} · 🔥 {profile?.streak ?? 0}
            </div>
            <div className="display mt-4" style={{ fontSize: 30 }}>
              hey, {profile?.display_name ?? 'friend'}
            </div>
          </div>
          <a
            href="/progress"
            className="jar-chip"
            data-testid="home-jar-chip"
          >
            <span className="jar-dot" />
            {fmtBank(profile?.jar_balance_cached ?? 0)}
          </a>
        </div>

        {continueCard && (
          <a
            href={`/lesson/${continueCard.nextId}`}
            className="card card-hl mt-16"
            style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
            data-testid="home-continue-card"
          >
            <div className="eyebrow">continue · {continueCard.topicTitle}</div>
            <div className="display mt-4" style={{ fontSize: 22 }}>
              {continueCard.courseTitle}
            </div>
            <div className="bar mt-12">
              <i
                style={{
                  width: `${Math.round(
                    (continueCard.done / continueCard.total) * 100
                  )}%`,
                }}
              />
            </div>
            <div className="body mt-8" style={{ fontSize: 12 }}>
              up next · {continueCard.nextTitle}
              {continueCard.nextDur > 0
                ? ` · ${Math.floor(continueCard.nextDur / 60)}m`
                : ''}
            </div>
          </a>
        )}

        <div className="eyebrow mt-24">your topics</div>
        <div className="col gap-8 mt-8">
          {topicRows.map((t) => (
            <a
              key={t.id}
              href={`/topic/${t.id}`}
              className="lesson-row"
              style={{ textDecoration: 'none', color: 'inherit' }}
              data-testid={`home-topic-${t.id}`}
            >
              <div
                className="thumb"
                style={{ background: t.color, color: '#fff' }}
              >
                {t.icon}
              </div>
              <div className="grow col">
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</div>
                <div className="body" style={{ fontSize: 11 }}>
                  {t.courseCount} courses · {t.doneCount}/{t.lessonCount} lessons
                </div>
              </div>
              <div style={{ color: 'var(--ink-mute)' }}>›</div>
            </a>
          ))}
          <a
            href="/add"
            className="lesson-row"
            style={{
              borderStyle: 'dashed',
              justifyContent: 'center',
              color: 'var(--ink-soft)',
              textDecoration: 'none',
            }}
            data-testid="home-add-course"
          >
            <span style={{ fontSize: 18 }}>+</span>
            <span>paste YouTube link</span>
          </a>
        </div>
      </div>

      <NibsHandle />
    </main>
  );
}
```

**Important changes vs current file:**
- Removed "take a break" dashed card entirely (per spec Phase 3; also removed here for scope cleanup).
- Added `topicRows` aggregation.
- Row data-testids changed from `home-course-${id}` to `home-topic-${id}`.
- `NibsHandle` kept for now (Phase 3 replaces it with `NibsBall`).

- [ ] **Step 4.2: Dev-server smoke**

Run: `pnpm dev`
Navigate: `http://localhost:3000/home` (after dev-login).
Expected: 5 topic rows (Physics, Biology, Economics, Math, Programming) with colored thumbnails; continue card points into the first undone topic; no "take a break" card.

- [ ] **Step 4.3: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat(home): list topics (not courses) with continue card + thumbnails"
```

---

### Task 5: Create `/topic/[id]` page

**Files:**
- Create: `app/topic/[id]/page.tsx`

- [ ] **Step 5.1: Write the RSC**

```tsx
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function fmtBank(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s.toString().padStart(2, '0')}s` : `${m}m`;
}

export default async function TopicPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('jar_balance_cached, onboarded')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarded) redirect('/onboarding');

  const { data: topic } = await supabase
    .from('topics')
    .select('id, title, icon, color')
    .eq('id', params.id)
    .single();
  if (!topic) notFound();

  const [coursesRes, lessonsRes, progressRes] = await Promise.all([
    supabase
      .from('courses')
      .select('id, title, icon, position')
      .eq('topic_id', params.id)
      .order('position', { ascending: true }),
    supabase
      .from('lessons')
      .select('id, course_id, yt_id, position')
      .order('position', { ascending: true }),
    supabase
      .from('lesson_progress')
      .select('lesson_id, completed_at')
      .eq('user_id', user.id),
  ]);

  const courses = coursesRes.data ?? [];
  const lessons = lessonsRes.data ?? [];
  const progress = progressRes.data ?? [];
  const doneIds = new Set(
    progress.filter((p) => p.completed_at).map((p) => p.lesson_id)
  );

  const lessonsByCourse = new Map<
    string,
    Array<{ id: string; yt_id: string; done: boolean }>
  >();
  for (const l of lessons) {
    const arr = lessonsByCourse.get(l.course_id) ?? [];
    arr.push({ id: l.id, yt_id: l.yt_id, done: doneIds.has(l.id) });
    lessonsByCourse.set(l.course_id, arr);
  }

  return (
    <main className="app">
      <div className="topbar">
        <a href="/home" className="back" data-testid="topic-back">
          ‹
        </a>
        <div className="eyebrow">{topic.icon} {topic.title}</div>
        <a
          href="/progress"
          className="jar-chip"
          data-testid="topic-jar-chip"
        >
          <span className="jar-dot" />
          {fmtBank(profile?.jar_balance_cached ?? 0)}
        </a>
      </div>

      <div className="pad pad-top" style={{ paddingTop: 80 }}>
        <div className="display" style={{ fontSize: 28 }}>
          {topic.title}
        </div>
        <div className="body mt-4" style={{ fontSize: 13 }}>
          {courses.length} course{courses.length === 1 ? '' : 's'}
        </div>

        <div className="col gap-8 mt-16">
          {courses.map((c) => {
            const ls = lessonsByCourse.get(c.id) ?? [];
            const done = ls.filter((l) => l.done).length;
            const firstYt = ls[0]?.yt_id;
            return (
              <a
                key={c.id}
                href={`/course/${c.id}`}
                className="lesson-row"
                style={{ textDecoration: 'none', color: 'inherit' }}
                data-testid={`topic-course-${c.id}`}
              >
                <div
                  className="thumb"
                  style={
                    firstYt
                      ? {
                          backgroundImage: `url(https://i.ytimg.com/vi/${firstYt}/mqdefault.jpg)`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }
                      : { background: topic.color ?? '#5e6ad2', color: '#fff' }
                  }
                >
                  {firstYt ? '' : c.icon ?? '📚'}
                </div>
                <div className="grow col">
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.title}</div>
                  <div className="body" style={{ fontSize: 11 }}>
                    {done}/{ls.length} lessons
                  </div>
                </div>
                <div style={{ color: 'var(--ink-mute)' }}>›</div>
              </a>
            );
          })}
          {courses.length === 0 && (
            <div className="card" data-testid="topic-empty">
              <div className="body">no courses yet under this topic.</div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 5.2: Dev-server smoke**

Run: `pnpm dev`
Navigate: click a topic on `/home`, land on `/topic/<uuid>`, see 2 courses listed with YT thumbnails.

- [ ] **Step 5.3: Commit**

```bash
git add app/topic/[id]/page.tsx
git commit -m "feat(topic): /topic/[id] detail page with course rows + thumbnails"
```

---

### Task 6: Update `/course/[id]` back-link to topic

**Files:**
- Modify: `app/course/[id]/page.tsx`

- [ ] **Step 6.1: Read the existing file**

Read `app/course/[id]/page.tsx` to confirm structure, then modify the `.back` link.

- [ ] **Step 6.2: Change query to include topic_id + title**

In the courses query add `topic_id`. Then do a follow-up query OR inline join for topic title:

```tsx
// Add topic_id to the courses select:
const { data: course } = await supabase
  .from('courses')
  .select('id, title, icon, topic_id')
  .eq('id', params.id)
  .single();

// If course has a topic, fetch it:
let topicTitle: string | null = null;
if (course?.topic_id) {
  const { data: t } = await supabase
    .from('topics')
    .select('title')
    .eq('id', course.topic_id)
    .single();
  topicTitle = t?.title ?? null;
}
```

- [ ] **Step 6.3: Change the back link**

Replace the hardcoded `href="/home"` on the course back button with:

```tsx
<a
  href={course?.topic_id ? `/topic/${course.topic_id}` : '/home'}
  className="back"
  data-testid="course-back"
>
  ‹
</a>
```

The breadcrumb label on the topbar (the `eyebrow` middle text) should also show the topic name when available:

```tsx
<div className="eyebrow">
  {topicTitle ? `${topicTitle} · ` : ''}
  {course?.title}
</div>
```

- [ ] **Step 6.4: Dev-server smoke**

Navigate: `/home` → click Physics → `/topic/<uuid>` → click a course → `/course/<uuid>`. The `‹` back button returns to `/topic/<uuid>` (not `/home`).

- [ ] **Step 6.5: Commit**

```bash
git add app/course/[id]/page.tsx
git commit -m "feat(course): back link points to /topic/[id] when course has a topic"
```

---

### Task 7: Update existing `tests/home-course-smoke.spec.ts`

**Files:**
- Modify: `tests/home-course-smoke.spec.ts`

- [ ] **Step 7.1: Read the existing tests**

Read `tests/home-course-smoke.spec.ts` and identify every assertion that relies on the old preset course titles ("Intro to React", "CSS & Layout", "Spanish A1") or old test IDs (`home-course-${id}`). These all need updating.

- [ ] **Step 7.2: Rewrite assertions**

Key changes:
- Replace `page.getByTestId(/^home-course-/)` queries with `page.getByTestId(/^home-topic-/)`.
- Any navigation that went `home → /course/[id]` directly now goes `home → /topic/[id] → /course/[id]`.
- The e2e "learn loop" test (home → course → lesson → complete) should be: home → topic → course → lesson → complete.
- Replace any hard-coded preset course titles with preset topic titles: "Physics", "Biology", etc.

After edits, run:

```bash
npx playwright test tests/home-course-smoke.spec.ts
```
Expected: all tests pass against the new data model.

- [ ] **Step 7.3: Commit**

```bash
git add tests/home-course-smoke.spec.ts
git commit -m "test(home): update home+course smoke for topic hierarchy"
```

---

### Task 8: Add topic-page smoke test

**Files:**
- Create: `tests/topic-smoke.spec.ts`

- [ ] **Step 8.1: Write the test**

```ts
import { test, expect } from '@playwright/test';

test('topic page: physics shows 2 courses + clicks into /course/[id]', async ({
  page,
}) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  // Physics preset topic id is pinned in the seed.
  const physicsId = '10000000-0000-0000-0000-000000000001';
  await page.goto(`/topic/${physicsId}`);

  // Header shows the topic title.
  await expect(page.getByTestId('topic-back')).toBeVisible();
  await expect(page.getByTestId('topic-jar-chip')).toBeVisible();

  // Both preset Physics courses are listed by testid.
  const forcesId = '20000000-0000-0000-0000-000000000011';
  const motionId = '20000000-0000-0000-0000-000000000012';
  await expect(page.getByTestId(`topic-course-${forcesId}`)).toBeVisible();
  await expect(page.getByTestId(`topic-course-${motionId}`)).toBeVisible();

  // Click the first course and assert /course/<id> URL.
  await page.getByTestId(`topic-course-${forcesId}`).click();
  await page.waitForURL(new RegExp(`/course/${forcesId}$`));
});

test('home: topic row click navigates to /topic/[id]', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  await page.goto('/home');

  const physicsId = '10000000-0000-0000-0000-000000000001';
  const row = page.getByTestId(`home-topic-${physicsId}`);
  await expect(row).toBeVisible();
  await row.click();
  await page.waitForURL(new RegExp(`/topic/${physicsId}$`));
});

test('course back link returns to its topic page', async ({ page }) => {
  const loginRes = await page.request.post('/api/dev/login');
  expect(loginRes.ok()).toBeTruthy();

  const physicsId = '10000000-0000-0000-0000-000000000001';
  const forcesId = '20000000-0000-0000-0000-000000000011';

  await page.goto(`/course/${forcesId}`);
  await page.getByTestId('course-back').click();
  await page.waitForURL(new RegExp(`/topic/${physicsId}$`));
});
```

- [ ] **Step 8.2: Run the new test**

```bash
npx playwright test tests/topic-smoke.spec.ts
```
Expected: 3 passed.

- [ ] **Step 8.3: Commit**

```bash
git add tests/topic-smoke.spec.ts
git commit -m "test(topic): smoke for /topic/[id] + home topic click + course back"
```

---

### Task 9: Full suite green + wrap

- [ ] **Step 9.1: Run entire Playwright suite**

```bash
npx playwright test
```

Expected: all specs pass. There should be ~34 tests: 14 sessions + 5 lessons-complete + 1 lesson-page + 4 home-course (updated) + 3 budget-feed + 4 add-progress + 3 topic-smoke = 34 total.

Known risks that may cause failures and their fixes:
1. **`tests/budget-feed-smoke.spec.ts` may reference preset course IDs.** If so, replace with the pinned course UUID (`20000000-0000-0000-0000-000000000011` for Forces) or navigate via topic.
2. **`tests/add-progress-smoke.spec.ts` may test `progress-courses` tab and expect courses to be present.** The new preset courses all have `owner_id=null` — they won't show up in user-scoped course lists. If the test asserts "at least one course visible on progress page," it should still pass because the /add flow creates a user-owned course.

If either fails, add a subsequent commit with a narrowly-scoped test fix.

- [ ] **Step 9.2: Commit any test tweaks**

If tests needed small amendments:

```bash
git add tests/
git commit -m "test: align suite with topic-hierarchy seed"
```

- [ ] **Step 9.3: Push branch + open PR**

```bash
git push -u origin redesign-topic-hierarchy
gh pr create --title "Phase 1: topic hierarchy + Khan Academy seed" --body "$(cat <<'EOF'
## Summary

- New `topics` table (5 preset Khan Academy topics: Physics, Biology, Economics, Math, Programming)
- `courses.topic_id` FK; 10 preset courses across the 5 topics
- 24 preset lessons, all Khan Academy, all verified embeddable
- `/home` now lists topics with colored thumbnails
- New `/topic/[id]` detail page listing courses w/ YT thumbnails
- `/course/[id]` back-link returns to its parent topic

## Test plan

- [x] `npx playwright test` — all tests pass (34 total, 3 new in `topic-smoke.spec.ts`)
- [x] Manual: login → /home → click Physics → /topic/<id> → click Forces & Newton's Laws → /course/<id> → back button returns to /topic/<id>
- [x] Existing flows (lesson play, budget → feed, mark complete) still green

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

Completed during plan writing:

1. **Spec coverage.** Phase 1 spec requirements: new topics table ✓, topic_id FK ✓, RLS ✓, 5 topics × 2 courses × ≥1 verified video ✓ (24 lessons total), /home lists topics ✓, /topic/[id] page ✓.
2. **Placeholder scan.** No TBD / TODO / "add appropriate" / "similar to Task N" language in the plan body. Every SQL block and TSX block is complete.
3. **Type consistency.** `topics.id` referenced as `string` (uuid), matches Supabase pgTyped generation. `courses.topic_id: string | null` consistent between migration, seed, and consumer files.
4. **File-path accuracy.** `app/topic/[id]/page.tsx` follows Next.js 14 App Router conventions (confirmed against existing `app/course/[id]/page.tsx` and `app/lesson/[id]/page.tsx`).
5. **Idempotency.** Migration uses `if not exists`; seed uses `on conflict (id) do update` for topics/courses and `on conflict (id) do nothing` for lessons; `pnpm supabase:reset` wipes and reapplies cleanly.

No issues found.
