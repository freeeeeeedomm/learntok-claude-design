// app/library/actions/_shared.ts
// Auth + ownership helpers shared across the per-entity action files.
// All callers run with the user-token Supabase client; RLS enforces
// per-row policies, but these helpers add early-fail checks so we get
// clean error messages instead of opaque RLS denials.

'use server';

import { createClient } from '@/lib/supabase/server';

export const MAX_LECTURES_PER_SUBMISSION = 50;

export async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('not_authenticated');
  return data.user.id;
}

/**
 * Fail loudly if the course is not owned by `userId`. Used at the top
 * of every lecture-mutating action (add / rename / delete / reorder).
 * RLS would already block writes, but this lets the caller distinguish
 * "you don't own this course" from generic Supabase errors.
 */
export async function assertCourseOwner(courseId: string, userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('courses')
    .select('id, owner_id')
    .eq('id', courseId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.owner_id !== userId) throw new Error('not_owner');
}
