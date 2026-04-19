-- 0004_heartbeat_rpc.sql
-- Atomic heartbeat helper: applies a signed delta to sessions.earned_or_spent_seconds,
-- inserts the corresponding ledger entry, and optionally force-closes a feed session
-- if its budget is exhausted. The route layer verifies auth + ownership before calling
-- this; the function trusts its caller and is only reachable via service-role.

create or replace function public.apply_heartbeat_delta(
  p_session_id uuid,
  p_user_id uuid,
  p_delta int,                -- signed: positive for learn credit, negative for feed debit
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
  v_ended boolean := false;
  v_reason text := null;
begin
  -- Atomic increment; Postgres acquires a row lock so concurrent callers serialize.
  update public.sessions
    set earned_or_spent_seconds = earned_or_spent_seconds + p_delta,
        last_heartbeat_at = p_now
    where id = p_session_id
      and ended_at is null
    returning earned_or_spent_seconds, kind, budget_seconds
    into v_new_eos, v_kind, v_budget;

  if not found then
    raise exception 'session_not_found_or_closed';
  end if;

  insert into public.ledger_entries (user_id, delta_seconds, label, ref_id)
    values (p_user_id, p_delta, p_label, p_ref_id);

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
    'ended', v_ended,
    'reason', v_reason
  );
end;
$func$;

-- The function is only ever invoked by server routes using the service-role key,
-- which bypasses RLS anyway. Revoke from public/anon/authenticated to make it
-- obvious that this is not a client-callable RPC.
revoke all on function public.apply_heartbeat_delta(uuid, uuid, int, text, uuid, timestamptz) from public;
revoke all on function public.apply_heartbeat_delta(uuid, uuid, int, text, uuid, timestamptz) from anon, authenticated;
