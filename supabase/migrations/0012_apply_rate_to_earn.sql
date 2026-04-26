-- 0012_apply_rate_to_earn.sql
-- Two coupled fixes:
--   1. Widen profiles.rate from numeric(3,1) to numeric(4,3) so 3-decimal
--      values produced by the new onboarding formula (rate = restMinutes / 60,
--      e.g. 0.083, 0.167, 0.333) round-trip exactly. The old precision was
--      collapsing distinct slider positions to the same stored value.
--   2. Replace apply_heartbeat_delta to multiply learn-session credits by
--      profiles.rate (the long-standing bug: rate was set at onboarding but
--      never applied at credit time, so every user effectively had rate=1.0).
--      Feed debits stay unchanged (rate is an earn-only multiplier per spec).

alter table public.profiles
  alter column rate type numeric(4,3);

create or replace function public.apply_heartbeat_delta(
  p_session_id uuid,
  p_user_id uuid,
  p_delta int,                -- signed: positive for learn credit (raw study seconds), negative for feed debit
  p_label text,               -- 'lesson' or 'feed'
  p_ref_id uuid,              -- lesson_id for learn, session_id for feed
  p_now timestamptz
) returns json
language plpgsql
as $func$
declare
  v_new_eos int;
  v_kind text;
  v_budget int;
  v_rate numeric;
  v_credit int;
  v_ended boolean := false;
  v_reason text := null;
begin
  -- Look up rate first (cheap; uses PK).
  select rate into v_rate from public.profiles where id = p_user_id;
  if v_rate is null then
    raise exception 'profile_not_found_for_rate_lookup';
  end if;

  -- For learn sessions: multiply raw study seconds by rate (earn-only multiplier).
  -- For feed sessions: pass through unchanged (rate does not apply on spend side).
  -- p_delta carries the sign: positive = learn credit, negative = feed debit.
  if p_delta > 0 then
    v_credit := round(p_delta * v_rate);
  else
    v_credit := p_delta;
  end if;

  -- Atomic increment; Postgres acquires a row lock so concurrent callers serialize.
  update public.sessions
    set earned_or_spent_seconds = earned_or_spent_seconds + v_credit,
        last_heartbeat_at = p_now
    where id = p_session_id
      and ended_at is null
    returning earned_or_spent_seconds, kind, budget_seconds
    into v_new_eos, v_kind, v_budget;

  if not found then
    raise exception 'session_not_found_or_closed';
  end if;

  insert into public.ledger_entries (user_id, delta_seconds, label, ref_id)
    values (p_user_id, v_credit, p_label, p_ref_id);

  -- Feed budget exhaustion — one overdraft heartbeat allowed, then force-close.
  if v_kind = 'feed' and (-v_new_eos) > v_budget then
    update public.sessions
      set ended_at = p_now
      where id = p_session_id;
    v_ended := true;
    v_reason := 'budget_exhausted';
  end if;

  return json_build_object(
    'new_earned_or_spent', v_new_eos,
    'credited', v_credit,
    'ended', v_ended,
    'reason', v_reason
  );
end;
$func$;

-- Re-revoke (create or replace preserves grants in some cases, but be explicit).
revoke all on function public.apply_heartbeat_delta(uuid, uuid, int, text, uuid, timestamptz) from public;
revoke all on function public.apply_heartbeat_delta(uuid, uuid, int, text, uuid, timestamptz) from anon, authenticated;
