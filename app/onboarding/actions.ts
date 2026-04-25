'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

// Input contract:
// - rate: 5 / learnMinutes; learnMinutes ∈ [10, 60] → rate ∈ [~0.0833, 0.5].
//   Lower bound rounded down a hair to absorb float-arithmetic noise.
// - topicIds: 0-32 preset topic UUIDs (current preset count is 5; 32 is a
//   liberal upper bound that defends against malicious oversize payloads
//   without hard-coding the current count).
const Payload = z.object({
  rate: z.number().min(0.08).max(0.5),
  topicIds: z.array(z.string().uuid()).max(32),
});

export async function completeOnboarding(raw: { rate: number; topicIds: string[] }) {
  const parsed = Payload.safeParse(raw);
  if (!parsed.success) throw new Error('invalid_payload');
  const { rate, topicIds } = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('unauth');

  // Resolve only-preset topic rows. RLS already restricts reads to preset or
  // owned topics, but we additionally require is_preset = true here so a
  // malicious caller can't stuff their own topic UUIDs into interests.
  // The length-equality check below also rejects duplicate UUIDs in the
  // input: a duplicate would make the `in (...)` query return fewer rows
  // than requested, triggering invalid_topic. Deduplicate on the client.
  let presetIds: string[] = [];
  if (topicIds.length > 0) {
    const { data: topicsData, error: topicsErr } = await supabase
      .from('topics')
      .select('id')
      .eq('is_preset', true)
      .in('id', topicIds);
    if (topicsErr) throw new Error(topicsErr.message);
    presetIds = (topicsData ?? []).map((t) => t.id);
    if (presetIds.length !== topicIds.length) {
      throw new Error('invalid_topic');
    }
  }

  // Fetch the starter courses (top 2 per topic by `position`).
  // Pull all preset courses under the requested topics, then group + slice in JS.
  let starterCourseIds: string[] = [];
  if (presetIds.length > 0) {
    const { data: coursesData, error: coursesErr } = await supabase
      .from('courses')
      .select('id, topic_id, position')
      .eq('is_preset', true)
      .in('topic_id', presetIds)
      .order('position', { ascending: true });
    if (coursesErr) throw new Error(coursesErr.message);

    const byTopic = new Map<string, { id: string; position: number }[]>();
    for (const c of coursesData ?? []) {
      if (!c.topic_id) continue;
      const arr = byTopic.get(c.topic_id) ?? [];
      arr.push({ id: c.id, position: c.position });
      byTopic.set(c.topic_id, arr);
    }
    // Walk requested topics in user-pick order (the order in topicIds) so the
    // shelf positions reflect the user's selection sequence.
    for (const tid of topicIds) {
      const list = byTopic.get(tid) ?? [];
      for (const c of list.slice(0, 2)) starterCourseIds.push(c.id);
    }
  }

  // Two writes. We accept the small atomicity gap (see spec § "Implementation
  // note") because the second write is idempotent (PK conflict on retry).
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({
      rate,
      interests: topicIds, // store topic UUIDs as text
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
