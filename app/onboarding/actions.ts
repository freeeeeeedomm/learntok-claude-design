'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

// Input contract:
// - rate: restMinutes / 60; restMinutes ∈ [5, 60] → rate ∈ [~0.0833, 1.0].
//   The slider on the deal card lets users pick how many minutes of "rest"
//   (feed time) they want for every hour of learning. Rate is stored as the
//   ratio so the heartbeat RPC can multiply raw study seconds by it directly.
//   Lower bound rounded down a hair to absorb float-arithmetic noise.
// - groupKeys: 0–5 preset group keys. Topics + starter courses are derived
//   server-side using the W4 rule (top-2 topics × top-3 courses per group).
const VALID_GROUP_KEYS = ['finance', 'humanities', 'stem', 'math', 'cs'] as const;
const Payload = z.object({
  rate: z.number().min(0.08).max(1.0),
  groupKeys: z.array(z.enum(VALID_GROUP_KEYS)).max(VALID_GROUP_KEYS.length),
});

const TOPICS_PER_GROUP = 2;
const COURSES_PER_TOPIC = 3;

export async function completeOnboarding(raw: { rate: number; groupKeys: string[] }) {
  const parsed = Payload.safeParse(raw);
  if (!parsed.success) throw new Error('invalid_payload');
  const { rate, groupKeys } = parsed.data;
  // Deduplicate while preserving user pick order.
  const uniqueGroupKeys = Array.from(new Set(groupKeys));

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('unauth');

  let pickedTopicIds: string[] = [];
  let starterCourseIds: string[] = [];

  if (uniqueGroupKeys.length > 0) {
    // Step 1: resolve group keys to UUIDs (preset only). Length-equality below
    // guards against unknown keys slipping past the enum (defense in depth).
    const { data: groupsData, error: groupsErr } = await supabase
      .from('topic_groups')
      .select('id, key')
      .eq('is_preset', true)
      .in('key', uniqueGroupKeys);
    if (groupsErr) throw new Error(groupsErr.message);
    if ((groupsData ?? []).length !== uniqueGroupKeys.length) {
      throw new Error('invalid_group');
    }
    // Walk groups in user-pick order so shelf positions reflect pick sequence.
    const groupIdByKey = new Map((groupsData ?? []).map((g) => [g.key!, g.id]));
    const orderedGroupIds = uniqueGroupKeys.map((k) => groupIdByKey.get(k)!).filter(Boolean);

    // Step 2: top-N topics per group, by ascending position.
    const { data: topicsData, error: topicsErr } = await supabase
      .from('topics')
      .select('id, group_id, position')
      .eq('is_preset', true)
      .in('group_id', orderedGroupIds)
      .order('position', { ascending: true });
    if (topicsErr) throw new Error(topicsErr.message);

    const topicsByGroup = new Map<string, { id: string; position: number }[]>();
    for (const t of topicsData ?? []) {
      if (!t.group_id) continue;
      const arr = topicsByGroup.get(t.group_id) ?? [];
      arr.push({ id: t.id, position: t.position });
      topicsByGroup.set(t.group_id, arr);
    }
    for (const gid of orderedGroupIds) {
      const list = topicsByGroup.get(gid) ?? [];
      for (const t of list.slice(0, TOPICS_PER_GROUP)) pickedTopicIds.push(t.id);
    }

    // Step 3: top-N courses per picked topic, by ascending position.
    if (pickedTopicIds.length > 0) {
      const { data: coursesData, error: coursesErr } = await supabase
        .from('courses')
        .select('id, topic_id, position')
        .eq('is_preset', true)
        .in('topic_id', pickedTopicIds)
        .order('position', { ascending: true });
      if (coursesErr) throw new Error(coursesErr.message);

      const coursesByTopic = new Map<string, { id: string; position: number }[]>();
      for (const c of coursesData ?? []) {
        if (!c.topic_id) continue;
        const arr = coursesByTopic.get(c.topic_id) ?? [];
        arr.push({ id: c.id, position: c.position });
        coursesByTopic.set(c.topic_id, arr);
      }
      for (const tid of pickedTopicIds) {
        const list = coursesByTopic.get(tid) ?? [];
        for (const c of list.slice(0, COURSES_PER_TOPIC)) starterCourseIds.push(c.id);
      }
    }
  }

  // Two writes. We accept the small atomicity gap because the second write is
  // idempotent (PK conflict on retry).
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({
      rate,
      // Topic UUIDs derived from picked groups. Home filters rails by these.
      interests: pickedTopicIds,
      onboarded: true,
    })
    .eq('id', user.id);
  if (profileErr) throw new Error(profileErr.message);

  if (starterCourseIds.length > 0) {
    const rows = starterCourseIds.map((course_id, position) => ({
      user_id: user.id,
      course_id,
      position,
    }));
    const { error: shelfErr } = await supabase
      .from('profile_courses')
      .upsert(rows, { onConflict: 'user_id,course_id' });
    if (shelfErr) throw new Error(shelfErr.message);
  }

  redirect('/home');
}
