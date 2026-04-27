// app/library/actions/import.ts
// Server action that forks a preset topic onto the calling user's shelf
// via a three-level deep copy (topic -> courses -> lessons). Each new
// row carries source_*_id pointing back at its preset origin so we can
// later surface upstream-changed indicators or block re-imports.
//
// The unique partial index `topics_owner_source_uniq` (migration 0015)
// means a second import attempt fails with SQLSTATE 23505. Discover's
// per-card CTA reads the same key to flip between "Add to home" and
// "Open" — so the unique-violation path is only reachable via stale UI
// or a direct DB write, never the happy flow.

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireUserId } from './_shared';

const ImportPresetTopicInput = z.object({
  presetTopicId: z.string().uuid(),
});

/**
 * Deep-copy a preset topic + its courses + its lessons onto the user's
 * owned shelf. Each level carries a `source_*_id` back-reference.
 *
 * Throws:
 *   not_authenticated · not_preset · already_imported (unique violation,
 *   SQLSTATE 23505) · any underlying Supabase error.
 */
export async function importPresetTopic(
  input: z.infer<typeof ImportPresetTopicInput>,
) {
  const { presetTopicId } = ImportPresetTopicInput.parse(input);
  const userId = await requireUserId();
  const supabase = createClient();

  // Verify the source row is actually a preset.
  const { data: src, error: srcErr } = await supabase
    .from('topics')
    .select('id, title, icon, color, is_preset')
    .eq('id', presetTopicId)
    .maybeSingle();
  if (srcErr) throw srcErr;
  if (!src || !src.is_preset) throw new Error('not_preset');

  // 1) Pick the next position for the user's owned topics.
  const { data: maxRow } = await supabase
    .from('topics')
    .select('position')
    .eq('owner_id', userId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (maxRow?.position ?? -1) + 1;

  // 2) Insert the owner-owned topic. The unique index on
  //    (owner_id, source_topic_id) makes a duplicate import fail with
  //    code 23505 — we surface that as `already_imported` so callers
  //    can show a friendly toast.
  const { data: newTopic, error: topicErr } = await supabase
    .from('topics')
    .insert({
      owner_id: userId,
      is_preset: false,
      title: src.title,
      icon: src.icon,
      color: src.color,
      group_id: null, // user-side topics are ungrouped (field is preset-only)
      position,
      source_topic_id: src.id,
    })
    .select('id')
    .single();
  if (topicErr) {
    if ((topicErr as { code?: string }).code === '23505') {
      throw new Error('already_imported');
    }
    throw topicErr;
  }

  // 3) Copy preset courses under this topic.
  const { data: presetCourses, error: coursesErr } = await supabase
    .from('courses')
    .select('id, title, icon, position')
    .eq('topic_id', src.id)
    .eq('is_preset', true)
    .order('position', { ascending: true });
  if (coursesErr) throw coursesErr;

  for (const pc of presetCourses ?? []) {
    const { data: newCourse, error: courseErr } = await supabase
      .from('courses')
      .insert({
        owner_id: userId,
        topic_id: newTopic.id,
        is_preset: false,
        title: pc.title,
        icon: pc.icon,
        position: pc.position,
        source_course_id: pc.id,
      })
      .select('id')
      .single();
    if (courseErr) throw courseErr;

    // 4) Copy preset lessons under this preset course. We bulk-insert
    //    the new rows first, then backfill source_lesson_id in a second
    //    pass keyed on `position` (which is unique per course in the
    //    preset catalog, so the join is safe). This is the two-pass
    //    approach called out in the plan — Supabase's insert().select()
    //    doesn't carry the source IDs through, and a typical preset
    //    has ≤30 lessons per course so the extra round-trip is fine.
    const { data: presetLessons, error: lessonsErr } = await supabase
      .from('lessons')
      .select('id, title, yt_id, duration_seconds, position')
      .eq('course_id', pc.id)
      .order('position', { ascending: true });
    if (lessonsErr) throw lessonsErr;

    if (!presetLessons || presetLessons.length === 0) continue;

    const lessonRows = presetLessons.map((pl) => ({
      course_id: newCourse.id,
      title: pl.title,
      yt_id: pl.yt_id,
      duration_seconds: pl.duration_seconds,
      position: pl.position,
      video_provider: 'youtube' as const,
    }));

    const { data: insertedLessons, error: insertErr } = await supabase
      .from('lessons')
      .insert(lessonRows)
      .select('id, position');
    if (insertErr) throw insertErr;

    const presetIdByPos = new Map(
      presetLessons.map((pl) => [pl.position, pl.id]),
    );
    const updates = (insertedLessons ?? []).map((il) =>
      supabase
        .from('lessons')
        .update({ source_lesson_id: presetIdByPos.get(il.position) ?? null })
        .eq('id', il.id),
    );
    const results = await Promise.all(updates);
    for (const r of results) if (r.error) throw r.error;
  }

  revalidatePath('/home');
  revalidatePath('/discover');
  return { topicId: newTopic.id };
}
