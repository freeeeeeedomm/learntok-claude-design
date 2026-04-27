// app/library/actions/topic.ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireUserId } from './_shared';

const CreateTopicInput = z.object({
  title: z.string().min(1).max(40),
  icon: z.string().max(40).optional(),
  color: z.string().max(20).optional(),
});

export async function createTopic(input: z.infer<typeof CreateTopicInput>) {
  const { title, icon, color } = CreateTopicInput.parse(input);
  const userId = await requireUserId();
  const supabase = createClient();

  const { data: maxRow } = await supabase
    .from('topics')
    .select('position')
    .eq('owner_id', userId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (maxRow?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from('topics')
    .insert({
      owner_id: userId,
      is_preset: false,
      title,
      icon: icon ?? null,
      color: color ?? null,
      position,
    })
    .select('id')
    .single();
  if (error) throw error;
  revalidatePath('/home');
  return { id: data.id };
}

const RenameTopicInput = z.object({
  topicId: z.string().uuid(),
  newTitle: z.string().min(1).max(40),
});

export async function renameTopic(input: z.infer<typeof RenameTopicInput>) {
  const { topicId, newTitle } = RenameTopicInput.parse(input);
  await requireUserId();
  const supabase = createClient();
  // RLS update policy already enforces owner-only writes.
  const { error } = await supabase
    .from('topics')
    .update({ title: newTitle })
    .eq('id', topicId);
  if (error) throw error;
  revalidatePath('/home');
  revalidatePath(`/topic/${topicId}`);
}

const DeleteTopicInput = z.object({ topicId: z.string().uuid() });

export async function deleteTopic(input: z.infer<typeof DeleteTopicInput>) {
  const { topicId } = DeleteTopicInput.parse(input);
  await requireUserId();
  const supabase = createClient();
  // Cascades to courses, lessons, lesson_progress via FK ON DELETE CASCADE.
  const { error } = await supabase.from('topics').delete().eq('id', topicId);
  if (error) throw error;
  revalidatePath('/home');
}

const ReorderTopicsInput = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

export async function reorderTopics(input: z.infer<typeof ReorderTopicsInput>) {
  const { orderedIds } = ReorderTopicsInput.parse(input);
  const userId = await requireUserId();
  const supabase = createClient();
  // For ≤50 items this is fine. We guard by owner_id to defend against
  // client tampering (RLS would also block, but we want clean errors).
  const updates = orderedIds.map((id, i) =>
    supabase.from('topics').update({ position: i }).eq('id', id).eq('owner_id', userId)
  );
  const results = await Promise.all(updates);
  for (const r of results) if (r.error) throw r.error;
  revalidatePath('/home');
}

const TopicBlastInput = z.object({ topicId: z.string().uuid() });

export async function getTopicDeleteBlastRadius(
  input: z.infer<typeof TopicBlastInput>
) {
  const { topicId } = TopicBlastInput.parse(input);
  await requireUserId();
  const supabase = createClient();
  const { data: courses } = await supabase
    .from('courses')
    .select('id')
    .eq('topic_id', topicId);
  const courseIds = (courses ?? []).map((c) => c.id);
  let lectureCount = 0;
  if (courseIds.length > 0) {
    const { count } = await supabase
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .in('course_id', courseIds);
    lectureCount = count ?? 0;
  }
  return { courses: courseIds.length, lectures: lectureCount };
}
