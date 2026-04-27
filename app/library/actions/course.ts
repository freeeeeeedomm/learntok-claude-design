// app/library/actions/course.ts
// Server actions for the course layer of the library.
// Mirrors the topic.ts shape (PR-B): create / rename / delete / reorder
// + a small read-only blast-radius helper used by the delete dialog.

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireUserId } from './_shared';

const CreateCourseInput = z.object({
  topicId: z.string().uuid(),
  title: z.string().min(1).max(60),
});

export async function createCourse(input: z.infer<typeof CreateCourseInput>) {
  const { topicId, title } = CreateCourseInput.parse(input);
  const userId = await requireUserId();
  const supabase = createClient();

  // Defense-in-depth: assert the parent topic is owner-owned. RLS on
  // courses_insert_own permits only owner_id=auth.uid(), but we also
  // verify the topic itself is owned to prevent inserting a course
  // pointing at a preset topic_id (which would render strangely).
  const { data: topic } = await supabase
    .from('topics')
    .select('id, owner_id')
    .eq('id', topicId)
    .maybeSingle();
  if (!topic || topic.owner_id !== userId) throw new Error('not_owner');

  const { data: maxRow } = await supabase
    .from('courses')
    .select('position')
    .eq('topic_id', topicId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (maxRow?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from('courses')
    .insert({
      owner_id: userId,
      topic_id: topicId,
      is_preset: false,
      title,
      icon: null,
      position,
    })
    .select('id')
    .single();
  if (error) throw error;
  revalidatePath(`/topic/${topicId}`);
  revalidatePath('/home');
  return { id: data.id };
}

const RenameCourseInput = z.object({
  courseId: z.string().uuid(),
  newTitle: z.string().min(1).max(60),
});
export async function renameCourse(input: z.infer<typeof RenameCourseInput>) {
  const { courseId, newTitle } = RenameCourseInput.parse(input);
  await requireUserId();
  const supabase = createClient();
  const { error } = await supabase
    .from('courses')
    .update({ title: newTitle })
    .eq('id', courseId);
  if (error) throw error;
  revalidatePath(`/course/${courseId}`);
  revalidatePath('/home');
}

const DeleteCourseInput = z.object({ courseId: z.string().uuid() });
export async function deleteCourse(input: z.infer<typeof DeleteCourseInput>) {
  const { courseId } = DeleteCourseInput.parse(input);
  await requireUserId();
  const supabase = createClient();
  // Look up topic for revalidation before delete.
  const { data: course } = await supabase
    .from('courses')
    .select('topic_id')
    .eq('id', courseId)
    .maybeSingle();
  const { error } = await supabase.from('courses').delete().eq('id', courseId);
  if (error) throw error;
  if (course?.topic_id) revalidatePath(`/topic/${course.topic_id}`);
  revalidatePath('/home');
}

const ReorderCoursesInput = z.object({
  topicId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1),
});
export async function reorderCourses(
  input: z.infer<typeof ReorderCoursesInput>
) {
  const { topicId, orderedIds } = ReorderCoursesInput.parse(input);
  const userId = await requireUserId();
  const supabase = createClient();
  const updates = orderedIds.map((id, i) =>
    supabase
      .from('courses')
      .update({ position: i })
      .eq('id', id)
      .eq('owner_id', userId)
  );
  const results = await Promise.all(updates);
  for (const r of results) if (r.error) throw r.error;
  revalidatePath(`/topic/${topicId}`);
}

const CourseBlastInput = z.object({ courseId: z.string().uuid() });
export async function getCourseDeleteBlastRadius(
  input: z.infer<typeof CourseBlastInput>
) {
  const { courseId } = CourseBlastInput.parse(input);
  await requireUserId();
  const supabase = createClient();
  const { count } = await supabase
    .from('lessons')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId);
  return { lectures: count ?? 0 };
}
