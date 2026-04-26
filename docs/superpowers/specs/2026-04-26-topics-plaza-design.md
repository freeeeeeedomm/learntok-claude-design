# Topics Plaza — Design

**Status:** Draft, awaiting user review
**Author:** Claude (autonomous, awaiting user approval — UI choices flagged for review)
**Sub-project:** PR3 of 4 in the catalog-expansion roadmap (see `2026-04-26-catalog-expansion-roadmap.md`)
**Depends on:** PR1 (schema) + PR2 (catalog content) merged first

## Goal

Give users a browse-and-add interface so they can grow their `profile_courses` shelf after onboarding. Without this page, users who picked 0 groups during onboarding (or want anything outside their picks) have no way to discover and add catalog content.

## Non-goals

- Editing onboarding picks post-hoc (settings page — separate future feature)
- User-defined topic groups (deferred far)
- Course detail / lesson list redesign (existing `/course/[id]/page.tsx` works)
- Admin tooling for catalog management (separate)

## User flow

```
Home (with shelf courses)
   │
   │ tap "+ Browse all topics" link near header (or empty-state CTA)
   ▼
/discover (group index)
   │
   │ tap a topic chip in any group section
   ▼
/discover/topic/[id]  (topic detail with course list)
   │
   │ tap "+ Add" button on a course card
   ▼
Course is in library; button changes to "✓ In library"
   │
   │ tap home in BottomNav
   ▼
Home now shows the new course in its topic rail
```

## Routing & file structure

```
app/discover/
  page.tsx                      ── group index, vertical sections
  topic/[id]/page.tsx           ── topic detail, course list with add buttons
  actions.ts                    ── addCourseToShelf / removeCourseFromShelf
```

**Decision:** route is `/discover` (not `/topics` — the latter would collide visually with the existing `/topic/[id]` singular route).

## Component 1: `/discover` index page (server component)

### Data fetching

```ts
// All preset groups, sorted by position.
const { data: groups } = await supabase
  .from('topic_groups')
  .select('id, key, title, icon, position')
  .eq('is_preset', true)
  .order('position', { ascending: true });

// All preset topics, grouped client-side by group_id.
const { data: topics } = await supabase
  .from('topics')
  .select('id, group_id, title, icon, position')
  .eq('is_preset', true)
  .order('position', { ascending: true });

// User's shelf course IDs, to compute "in library" badges per topic.
const { data: shelf } = await supabase
  .from('profile_courses')
  .select('course_id, courses!inner(topic_id)')
  .eq('user_id', user.id);
const shelfTopicCounts = /* aggregate count per topic_id */;
```

### Layout

```
┌─ Discover ─────────────────────────┐
│                                    │
│  💰 经济金融                        │  ← group header (eyebrow style)
│  ┌─────┐ ┌─────┐ ┌─────┐           │
│  │ 💸  │ │ 🌍  │ │ 💼  │           │  ← topic chips, horizontal scroll
│  │Micro│ │Macro│ │Fin. │           │     (or wrap on wider viewports)
│  │  3  │ │  2  │ │  0  │           │  ← shelf-count badge per topic
│  └─────┘ └─────┘ └─────┘           │
│                                    │
│  📜 人文历史                        │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐   │
│  │ 🌎  │ │ 🗽  │ │ 🎨  │ │ ⚖  │   │
│  └─────┘ └─────┘ └─────┘ └─────┘   │
│                                    │
│  🔬 理工                            │
│  ...                               │
│                                    │
└────────────────────────────────────┘
```

Each topic chip shows: emoji icon, title, and a small badge in the corner if the user has any courses from this topic in their shelf (e.g. "3" for 3 courses already in library).

Tap a chip → navigate to `/discover/topic/[id]`.

## Component 2: `/discover/topic/[id]` (server component)

### Data fetching

```ts
const { data: topic } = await supabase
  .from('topics')
  .select('id, title, icon, group_id')
  .eq('id', params.id)
  .single();

const { data: courses } = await supabase
  .from('courses')
  .select('id, title, icon, position, lessons:lessons(count)')
  .eq('topic_id', params.id)
  .eq('is_preset', true)
  .order('position', { ascending: true });

// Per-course lesson count + which courses are already in shelf.
const { data: shelfCourses } = await supabase
  .from('profile_courses')
  .select('course_id')
  .eq('user_id', user.id);
const inShelf = new Set(shelfCourses?.map(s => s.course_id) ?? []);
```

### Layout

```
┌─ ← back  Physics 🧲 ───────────────┐
│                                    │
│  Forces & Newton's Laws    + Add   │
│  10 lessons · ~15 min               │
│                                    │
│  Motion & Energy           ✓ Added │
│  8 lessons · ~12 min                │
│                                    │
│  Energy and Work           + Add   │
│  6 lessons · ~9 min                 │
│                                    │
│  ...                               │
└────────────────────────────────────┘
```

Each course row shows:
- Title
- Lesson count + estimated duration (sum of `lessons.duration_seconds`)
- Action button: `+ Add` (if not in shelf) → flips to `✓ Added` after adding

Tapping the title navigates to existing `/course/[id]/page.tsx` (the course detail page with lesson list).

## Component 3: Server actions (`actions.ts`)

```ts
'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const AddPayload = z.object({ courseId: z.string().uuid() });

export async function addCourseToShelf(raw: { courseId: string }) {
  const { courseId } = AddPayload.parse(raw);
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('unauth');

  // Get next position (max + 1, or 0 if empty).
  const { data: existing } = await supabase
    .from('profile_courses')
    .select('position')
    .eq('user_id', user.id)
    .order('position', { ascending: false })
    .limit(1);
  const nextPos = (existing?.[0]?.position ?? -1) + 1;

  const { error } = await supabase
    .from('profile_courses')
    .upsert(
      { user_id: user.id, course_id: courseId, position: nextPos },
      { onConflict: 'user_id,course_id' }
    );
  if (error) throw new Error(error.message);

  // Also ensure the course's topic is in the user's interests so home renders the rail.
  const { data: course } = await supabase
    .from('courses')
    .select('topic_id')
    .eq('id', courseId)
    .single();
  if (course?.topic_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('interests')
      .eq('id', user.id)
      .single();
    const interests = (profile?.interests ?? []) as string[];
    if (!interests.includes(course.topic_id)) {
      await supabase
        .from('profiles')
        .update({ interests: [...interests, course.topic_id] })
        .eq('id', user.id);
    }
  }

  revalidatePath('/home');
  revalidatePath(`/discover/topic/${course?.topic_id ?? ''}`);
}

export async function removeCourseFromShelf(raw: { courseId: string }) {
  // Mirror of add. Decision: don't auto-remove the topic from interests
  // (user might still want the rail visible for future adds). Settings page
  // will let users prune interests later.
  ...
}
```

### Notable implementation detail

When a user adds a course in plaza, the home page must show its topic rail. Home filters topics by `profile.interests`, so the action **also adds the course's topic_id to interests** if not already present.

This is the data-model equivalent of "auto-subscribing the user to the topic when they pick a course from it." It's slightly opinionated; the alternative (require user to manually add topics first) would feel friction-y in plaza.

## Home page integration

Add an entrypoint to plaza on `/home`:

1. **Empty state** (when shelf is empty): replace the dashed "+ paste YouTube link" row with a more prominent CTA: "Browse all topics →" linking to `/discover`. Keep the paste-link row below as a secondary option.
2. **Header link** (always visible): add a small "+ Browse" link next to the "your topics" eyebrow.

```diff
- <div className="eyebrow mt-24">your topics</div>
+ <div className="row between aic mt-24">
+   <div className="eyebrow">your topics</div>
+   <a href="/discover" className="text-sm text-accent">+ Browse</a>
+ </div>
```

## Component 4: BottomNav

**Decision:** Don't add a fourth nav item. Plaza is a transient browsing surface accessed from home; users don't return to it daily. Adding a 4th item dilutes the existing 3-item nav (home / relax / progress).

The `/discover` route is added to `HIDE_PATTERNS` in `BottomNav.tsx` so the bottom nav hides while browsing (matches `/lesson` and `/onboarding` behavior). Or alternatively, keep the bottom nav visible and have `home` highlight as active when on `/discover`. Open item below.

## Schema changes

**None.** Uses existing `topic_groups`, `topics`, `courses`, `profile_courses` tables (all created in PR1 + PR2).

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Discover page slow with 24 topics × ~7 courses | Low | All preset queries indexable; total payload < 50 KB JSON |
| Race condition on `profile_courses.position` if user adds two courses fast | Low | UPSERT on conflict handles duplicates; position collision is harmless (UI sorts by `added_at` as secondary key) |
| User accidentally adds a course they don't want | Low | Easy to remove via library page (or course detail page — see Open items) |
| Adding too many courses confuses home with too many rails | Medium | UX copy on plaza could nudge "you have 12 courses — focus on a few"; deferred unless user feedback flags it |

## Test plan

- [ ] **Manual: navigate from home → discover**: empty-state CTA works; header link works
- [ ] **Manual: add a course from plaza**: course appears on home in correct topic rail
- [ ] **Manual: add a course in a topic NOT in interests**: topic rail appears on home (confirms auto-add to interests)
- [ ] **Manual: adding same course twice**: second add is no-op (upsert), no error
- [ ] **Manual: remove a course**: course disappears from home; topic rail stays (confirms interests not auto-pruned)
- [ ] **Build passes**: `npm run build`

## Open items (need user input before implementation)

1. **Route name**: `/discover` vs `/topics` vs `/browse` vs `/library/add` — recommend `/discover`
2. **BottomNav behavior on `/discover`**: hide it (like `/lesson`) or keep visible (with `home` highlighted)? Recommend keep visible, highlight `home`.
3. **Where to show "+ Add" button**: only on the topic-detail course list (current spec) or also inline on the discover index? Recommend course-list-only — index is for browsing, detail is for action.
4. **Auto-add topic to interests when adding a course**: yes (current spec) or no (require explicit topic-add step). Recommend yes — friction-free.
5. **Course removal UI**: where do users remove a course from shelf? Options: (a) in plaza topic detail, "✓ Added" button toggles back to "+ Add"; (b) on home, swipe-to-remove; (c) only via a dedicated `/library` page. Recommend (a) for v1.
6. **Course detail page (`/course/[id]/page.tsx`)**: should it also show "+ Add to library" button when accessed from plaza? Recommend yes — symmetric.
7. **Empty-state CTA copy**: "Browse all topics" vs "Discover courses" vs "Find something to learn" — recommend "Browse all topics".

## Estimated implementation effort

- Components (3 pages + actions): 4–5 hours
- Home integration (CTA + header link): 1 hour
- Tests + verification: 2 hours

Total: ~1 day.
