'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const NameSchema = z
  .string()
  .trim()
  .min(1, 'empty_name')
  .max(40, 'name_too_long');

export async function updateDisplayName(
  raw: string,
): Promise<{ ok: true } | { error: string }> {
  const parsed = NameSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'invalid_name' };
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'unauth' };

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: parsed.data })
    .eq('id', user.id);
  if (error) return { error: error.message };

  revalidatePath('/profile');
  return { ok: true };
}

const RestSchema = z
  .number()
  .int()
  .min(5, 'rest_out_of_range')
  .max(60, 'rest_out_of_range');

export async function updateRestMinutes(
  raw: number,
): Promise<{ ok: true; rate: number } | { error: string }> {
  // Snap to 5-min step before validating so a stray 7 from a misbehaving
  // client UI gets normalized rather than rejected.
  const snapped = Math.round(Number(raw) / 5) * 5;
  const parsed = RestSchema.safeParse(snapped);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'invalid_rest' };
  }
  // Same formula as onboarding: rate = restMin / 60.
  // Round to 3 decimals so storage matches numeric(4,3) without surprise drift.
  const rate = Math.round((parsed.data / 60) * 1000) / 1000;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'unauth' };

  const { error } = await supabase
    .from('profiles')
    .update({ rate })
    .eq('id', user.id);
  if (error) return { error: error.message };

  revalidatePath('/profile');
  return { ok: true, rate };
}
