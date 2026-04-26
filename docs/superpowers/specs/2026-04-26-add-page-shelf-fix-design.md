# `/add` Writes to Shelf — Design

**Status:** Approved (overnight autonomous execution)
**Sub-project:** PR4 of 4 in the catalog-expansion roadmap (see `2026-04-26-catalog-expansion-roadmap.md`)
**Stacks on:** PR1 (`claude/schema-cleanup`) — same `AddForm.tsx` is touched

## Goal

Fix the bug where pasting a YouTube link via `/add` creates a course + lesson but never adds the new course to the user's `profile_courses` shelf — so the course never appears on `/home` despite the user having "saved" it.

## Bug detail

`app/add/AddForm.tsx:save()` today:
1. ✅ Inserts a row into `courses` (`owner_id = user.id`, `is_preset = false`)
2. ✅ Inserts a row into `lessons` (linked to the new course)
3. ❌ **Does not insert into `profile_courses`**
4. Redirects to `/course/[id]`

PR #19's spec explicitly listed this as deferred: "/add (paste YouTube URL) writing to `profile_courses`". This PR closes that deferral.

## Non-goals

- UI redesign of `/add` (current flow stays)
- Allowing playlist URLs (deferred — single-video only)
- Showing user-created courses in `/discover` (PR3) — they're not preset
- Visual rendering of "ungrouped" user-created courses on `/home` — separate concern (see "Known limitation" below)

## Implementation

Add one upsert into `profile_courses` after the lesson insert succeeds.

```diff
  // Insert single lesson.
  const { error: lessonErr } = await supabase.from('lessons').insert({...});
  if (lessonErr) { ... }

+ // Add the new course to the user's shelf so it shows on /home.
+ const { data: shelfTop } = await supabase
+   .from('profile_courses')
+   .select('position')
+   .eq('user_id', user.id)
+   .order('position', { ascending: false })
+   .limit(1);
+ const nextPos = (shelfTop?.[0]?.position ?? -1) + 1;
+
+ const { error: shelfErr } = await supabase
+   .from('profile_courses')
+   .insert({
+     user_id: user.id,
+     course_id: courseRow.id,
+     position: nextPos,
+   });
+ if (shelfErr) {
+   setError(`saved course but couldn't add to shelf: ${shelfErr.message}`);
+   setSaving(false);
+   return;
+ }
+
  router.push(`/course/${courseRow.id}`);
```

## RLS check

`profile_courses` has `for insert with check (user_id = auth.uid())` (from migration 0007). Client-side insert with `user_id = user.id` matches.

## Backfill (one-time)

Migration `0010_backfill_addform_shelf.sql` — fully idempotent:

```sql
-- For every owner who has user-created courses but no shelf entry, add one.
insert into public.profile_courses (user_id, course_id, position)
select c.owner_id, c.id, 0
from public.courses c
where c.owner_id is not null
  and c.is_preset = false
  and not exists (
    select 1 from public.profile_courses pc
    where pc.user_id = c.owner_id and pc.course_id = c.id
  )
on conflict do nothing;
```

## Known limitation (out of scope here)

A user-created course has `topic_id = null` (AddForm doesn't set a topic). After this fix, the course will be in the shelf but `/home` (which renders rails per topic in interests) won't show it under any rail. Two paths forward, both **deferred to a future PR**:

- "Library" rail on home for shelf courses with `topic_id = null`
- UI for assigning a topic to a user-created course

The user will be able to access the course via `/course/[id]` (the redirect destination) and via the database, but won't see it on home until the rendering gap is closed.

## Test plan

- [ ] **Manual**: paste a YouTube link, click "save to library"; verify Supabase has new `profile_courses` row
- [ ] **Idempotency**: running the backfill migration twice is a no-op
- [ ] **Build**: `npm run build` passes

## Open items

None.
