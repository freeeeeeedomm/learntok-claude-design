// app/library/actions/lecture.ts
// Server actions for the lecture (lesson) layer of the library.
// PR-A ships addLectures; PR-D will append rename / delete / reorder.

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { parseYouTubeUrl } from '@/lib/youtube/parse';
import { fetchVideoMeta, expandPlaylist } from '@/lib/youtube/api';
import {
  requireUserId,
  assertCourseOwner,
  MAX_LECTURES_PER_SUBMISSION,
} from './_shared';

const AddLecturesInput = z.object({
  courseId: z.string().uuid(),
  urls: z.array(z.string().url()).min(1).max(MAX_LECTURES_PER_SUBMISSION),
});

/**
 * Resolve a batch of YouTube URLs (videos and/or playlists) and append
 * them as lectures to a user-owned course.
 *
 * Steps:
 * 1. Parse every URL. Video URLs contribute one ID; playlist URLs are
 *    expanded in-place. Expansion stops as soon as the running total
 *    reaches MAX_LECTURES_PER_SUBMISSION (50), so a 50-item playlist
 *    blocks a 51st individual URL with a clear error.
 * 2. De-duplicate while preserving first-seen order.
 * 3. Single batched videos.list call to fetch title + duration.
 * 4. Bulk insert lectures with sequential positions starting after the
 *    course's current max.
 *
 * Throws:
 *   not_authenticated · not_owner · unrecognized URL · no_videos_resolved
 *   exceeds_cap:50 · all_videos_unavailable · YouTube API errors
 */
export async function addLectures(input: z.infer<typeof AddLecturesInput>) {
  const { courseId, urls } = AddLecturesInput.parse(input);
  const userId = await requireUserId();
  await assertCourseOwner(courseId, userId);

  // 1) Parse + expand playlists in submission order.
  const videoIds: string[] = [];
  for (const raw of urls) {
    if (videoIds.length >= MAX_LECTURES_PER_SUBMISSION) break;
    const parsed = parseYouTubeUrl(raw);
    if (parsed.kind === 'video') {
      videoIds.push(parsed.videoId);
    } else if (parsed.kind === 'playlist') {
      const remaining = MAX_LECTURES_PER_SUBMISSION - videoIds.length;
      const expanded = await expandPlaylist(parsed.playlistId, remaining);
      videoIds.push(...expanded);
    } else {
      throw new Error(`unrecognized_url:${raw}`);
    }
  }

  // 2) Dedup, preserving first-seen order.
  const seen = new Set<string>();
  const dedup = videoIds.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (dedup.length === 0) throw new Error('no_videos_resolved');
  if (dedup.length > MAX_LECTURES_PER_SUBMISSION) {
    throw new Error(`exceeds_cap:${MAX_LECTURES_PER_SUBMISSION}`);
  }

  // 3) Single batched metadata fetch.
  const metas = await fetchVideoMeta(dedup);
  const metaById = new Map(metas.map((m) => [m.videoId, m]));

  // 4) Compute starting position.
  const supabase = createClient();
  const { data: maxRow } = await supabase
    .from('lessons')
    .select('position')
    .eq('course_id', courseId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const startPos = (maxRow?.position ?? -1) + 1;

  // 5) Bulk insert in submission order, skipping any IDs YouTube hid
  //    (private / deleted / region-blocked → not in metaById).
  const rows = dedup
    .map((id, i) => {
      const m = metaById.get(id);
      if (!m) return null;
      return {
        course_id: courseId,
        position: startPos + i,
        title: m.title,
        yt_id: m.videoId,
        duration_seconds: m.durationSeconds,
        video_provider: 'youtube' as const,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) throw new Error('all_videos_unavailable');

  const { data: inserted, error: insertErr } = await supabase
    .from('lessons')
    .insert(rows)
    .select('id');
  if (insertErr) throw insertErr;

  revalidatePath(`/course/${courseId}`);
  return { ids: (inserted ?? []).map((r) => r.id) };
}

const RenameLectureInput = z.object({
  lectureId: z.string().uuid(),
  newTitle: z.string().min(1).max(120),
});
export async function renameLecture(input: z.infer<typeof RenameLectureInput>) {
  const { lectureId, newTitle } = RenameLectureInput.parse(input);
  await requireUserId();
  const supabase = createClient();
  // Look up course for revalidation.
  const { data: row } = await supabase
    .from('lessons')
    .select('course_id')
    .eq('id', lectureId)
    .maybeSingle();
  const { error } = await supabase
    .from('lessons')
    .update({ title: newTitle })
    .eq('id', lectureId);
  if (error) throw error;
  if (row?.course_id) revalidatePath(`/course/${row.course_id}`);
}

const DeleteLectureInput = z.object({ lectureId: z.string().uuid() });
export async function deleteLecture(input: z.infer<typeof DeleteLectureInput>) {
  const { lectureId } = DeleteLectureInput.parse(input);
  await requireUserId();
  const supabase = createClient();
  const { data: row } = await supabase
    .from('lessons')
    .select('course_id')
    .eq('id', lectureId)
    .maybeSingle();
  const { error } = await supabase.from('lessons').delete().eq('id', lectureId);
  if (error) throw error;
  if (row?.course_id) revalidatePath(`/course/${row.course_id}`);
}

const ReorderLecturesInput = z.object({
  courseId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1),
});
export async function reorderLectures(input: z.infer<typeof ReorderLecturesInput>) {
  const { courseId, orderedIds } = ReorderLecturesInput.parse(input);
  const userId = await requireUserId();
  await assertCourseOwner(courseId, userId);
  const supabase = createClient();
  const updates = orderedIds.map((id, i) =>
    supabase
      .from('lessons')
      .update({ position: i })
      .eq('id', id)
      .eq('course_id', courseId)
  );
  const results = await Promise.all(updates);
  for (const r of results) if (r.error) throw r.error;
  revalidatePath(`/course/${courseId}`);
}
