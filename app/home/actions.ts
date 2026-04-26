'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const Id = z.string().uuid();

type ConfirmableTopic =
  | { ok: true; cascaded: { courses: number; lessons: number } }
  | { requiresConfirm: true; courseCount: number; completedLessonCount: number };

type ConfirmableCourse =
  | { ok: true }
  | { requiresConfirm: true; completedLessonCount: number };

async function authedClient() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('unauth');
  return { supabase, userId: user.id };
}

/**
 * Tries to remove a topic from the user's interests, cascading to all courses
 * for that topic on the user's shelf and any lesson_progress for those courses.
 *
 * If any lesson_progress row exists, this is reported back as
 * `{ requiresConfirm: true, ... }` so the client can show a destructive-action
 * modal. Call `confirmRemoveTopic(topicId)` to commit after user confirms.
 *
 * If there's no progress, the cascade happens immediately and the result is
 * `{ ok: true, cascaded: {...} }`.
 */
export async function removeTopic(rawTopicId: string): Promise<ConfirmableTopic> {
  const topicId = Id.parse(rawTopicId);
  const { supabase, userId } = await authedClient();

  // Find courses on this user's shelf for this topic.
  const { data: shelfRows } = await supabase
    .from('profile_courses')
    .select('course_id, courses!inner(topic_id)')
    .eq('user_id', userId);
  const shelfCourseIds = ((shelfRows ?? []) as unknown as Array<{
    course_id: string;
    courses: { topic_id: string | null };
  }>)
    .filter((r) => r.courses.topic_id === topicId)
    .map((r) => r.course_id);

  let completedLessonCount = 0;
  if (shelfCourseIds.length > 0) {
    const { data: progressRows } = await supabase
      .from('lesson_progress')
      .select('lesson_id, lessons!inner(course_id)')
      .eq('user_id', userId)
      .not('completed_at', 'is', null);
    completedLessonCount = ((progressRows ?? []) as unknown as Array<{
      lesson_id: string;
      lessons: { course_id: string };
    }>).filter((r) => shelfCourseIds.includes(r.lessons.course_id)).length;
  }

  if (completedLessonCount > 0) {
    return {
      requiresConfirm: true,
      courseCount: shelfCourseIds.length,
      completedLessonCount,
    };
  }

  // No progress — safe to cascade immediately.
  return cascadeRemoveTopic(topicId, shelfCourseIds, userId);
}

/**
 * Force-cascade a topic removal even if progress exists. Call this after the
 * user confirms in the destructive-action modal.
 */
export async function confirmRemoveTopic(rawTopicId: string): Promise<{ ok: true }> {
  const topicId = Id.parse(rawTopicId);
  const { supabase, userId } = await authedClient();

  const { data: shelfRows } = await supabase
    .from('profile_courses')
    .select('course_id, courses!inner(topic_id)')
    .eq('user_id', userId);
  const shelfCourseIds = ((shelfRows ?? []) as unknown as Array<{
    course_id: string;
    courses: { topic_id: string | null };
  }>)
    .filter((r) => r.courses.topic_id === topicId)
    .map((r) => r.course_id);

  const res = await cascadeRemoveTopic(topicId, shelfCourseIds, userId);
  if ('ok' in res) return { ok: true };
  // cascadeRemoveTopic only returns ok branch; the requiresConfirm branch is
  // unreachable from here because we ignore the count check.
  throw new Error('unexpected_state');
}

async function cascadeRemoveTopic(
  topicId: string,
  shelfCourseIds: string[],
  userId: string,
): Promise<{ ok: true; cascaded: { courses: number; lessons: number } }> {
  const { supabase } = await authedClient();

  let lessonsDeleted = 0;
  if (shelfCourseIds.length > 0) {
    // Find lessons in those courses so we can count progress rows precisely.
    const { data: lessons } = await supabase
      .from('lessons')
      .select('id')
      .in('course_id', shelfCourseIds);
    const lessonIds = (lessons ?? []).map((l) => l.id);
    if (lessonIds.length > 0) {
      const { count } = await supabase
        .from('lesson_progress')
        .delete({ count: 'exact' })
        .eq('user_id', userId)
        .in('lesson_id', lessonIds);
      lessonsDeleted = count ?? 0;
    }
    await supabase
      .from('profile_courses')
      .delete()
      .eq('user_id', userId)
      .in('course_id', shelfCourseIds);
  }

  // Remove the topic from the user's interests array.
  const { data: profile } = await supabase
    .from('profiles')
    .select('interests')
    .eq('id', userId)
    .single();
  const interests = ((profile?.interests ?? []) as string[]).filter((id) => id !== topicId);
  await supabase
    .from('profiles')
    .update({ interests })
    .eq('id', userId);

  revalidatePath('/home');
  revalidatePath('/discover');
  revalidatePath(`/discover/topic/${topicId}`);
  return {
    ok: true,
    cascaded: { courses: shelfCourseIds.length, lessons: lessonsDeleted },
  };
}

/**
 * Tries to remove a single course from the user's shelf. If any
 * lesson_progress exists for this course, returns `requiresConfirm` so the
 * client can show a confirmation modal.
 */
export async function removeCourse(rawCourseId: string): Promise<ConfirmableCourse> {
  const courseId = Id.parse(rawCourseId);
  const { supabase, userId } = await authedClient();

  const { data: lessons } = await supabase
    .from('lessons')
    .select('id')
    .eq('course_id', courseId);
  const lessonIds = (lessons ?? []).map((l) => l.id);

  let completedLessonCount = 0;
  if (lessonIds.length > 0) {
    const { count } = await supabase
      .from('lesson_progress')
      .select('lesson_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('lesson_id', lessonIds)
      .not('completed_at', 'is', null);
    completedLessonCount = count ?? 0;
  }

  if (completedLessonCount > 0) {
    return { requiresConfirm: true, completedLessonCount };
  }

  return cascadeRemoveCourse(courseId, lessonIds, userId);
}

export async function confirmRemoveCourse(rawCourseId: string): Promise<{ ok: true }> {
  const courseId = Id.parse(rawCourseId);
  const { supabase, userId } = await authedClient();
  const { data: lessons } = await supabase
    .from('lessons')
    .select('id')
    .eq('course_id', courseId);
  const lessonIds = (lessons ?? []).map((l) => l.id);
  const res = await cascadeRemoveCourse(courseId, lessonIds, userId);
  if ('ok' in res) return { ok: true };
  throw new Error('unexpected_state');
}

async function cascadeRemoveCourse(
  courseId: string,
  lessonIds: string[],
  userId: string,
): Promise<{ ok: true }> {
  const { supabase } = await authedClient();

  if (lessonIds.length > 0) {
    await supabase
      .from('lesson_progress')
      .delete()
      .eq('user_id', userId)
      .in('lesson_id', lessonIds);
  }
  await supabase
    .from('profile_courses')
    .delete()
    .eq('user_id', userId)
    .eq('course_id', courseId);

  // Best-effort revalidate the topic's discover page.
  const { data: course } = await supabase
    .from('courses')
    .select('topic_id')
    .eq('id', courseId)
    .maybeSingle();
  if (course?.topic_id) {
    revalidatePath(`/discover/topic/${course.topic_id}`);
  }
  revalidatePath('/home');
  return { ok: true };
}
