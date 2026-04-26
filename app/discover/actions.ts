'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const Payload = z.object({ courseId: z.string().uuid() });

export async function addCourseToShelf(raw: { courseId: string }) {
  const { courseId } = Payload.parse(raw);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('unauth');

  // Compute next shelf position. Tail-append keeps existing ordering stable.
  const { data: top } = await supabase
    .from('profile_courses')
    .select('position')
    .eq('user_id', user.id)
    .order('position', { ascending: false })
    .limit(1);
  const nextPos = (top?.[0]?.position ?? -1) + 1;

  const { error: shelfErr } = await supabase
    .from('profile_courses')
    .upsert(
      { user_id: user.id, course_id: courseId, position: nextPos },
      { onConflict: 'user_id,course_id' },
    );
  if (shelfErr) throw new Error(shelfErr.message);

  // Auto-add the course's topic to the user's interests so /home renders
  // the rail. Without this, adding a course in a topic the user never picked
  // during onboarding would silently fail to surface on home.
  const { data: course } = await supabase
    .from('courses')
    .select('topic_id')
    .eq('id', courseId)
    .maybeSingle();
  if (course?.topic_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('interests')
      .eq('id', user.id)
      .single();
    const interests = (profile?.interests ?? []) as string[];
    if (!interests.includes(course.topic_id)) {
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ interests: [...interests, course.topic_id] })
        .eq('id', user.id);
      if (profileErr) throw new Error(profileErr.message);
    }
    revalidatePath(`/discover/topic/${course.topic_id}`);
  }

  revalidatePath('/home');
  revalidatePath('/discover');
}

export async function removeCourseFromShelf(raw: { courseId: string }) {
  const { courseId } = Payload.parse(raw);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('unauth');

  // Don't auto-prune the topic from interests — user may want the rail visible
  // for future adds. Settings page (future PR) will let them prune manually.
  const { error } = await supabase
    .from('profile_courses')
    .delete()
    .eq('user_id', user.id)
    .eq('course_id', courseId);
  if (error) throw new Error(error.message);

  // Best-effort revalidation for the topic page; not catastrophic if topic_id
  // lookup fails.
  const { data: course } = await supabase
    .from('courses')
    .select('topic_id')
    .eq('id', courseId)
    .maybeSingle();
  if (course?.topic_id) {
    revalidatePath(`/discover/topic/${course.topic_id}`);
  }
  revalidatePath('/home');
  revalidatePath('/discover');
}
