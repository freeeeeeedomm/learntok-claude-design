-- 0014_extend_feed_session.sql
-- Atomic +60s feed extend. Called from app/api/sessions/extend.
--
-- Locks the session row + the profile row, validates ownership and
-- preconditions (feed-only, not ended, balance >= 60), then inserts a
-- single -60 ledger entry labelled 'feed_extend' and bumps
-- sessions.budget_seconds by 60. Returns { newBudget, balanceAfter }.
--
-- balanceAfter is computed from the locked profile snapshot minus 60
-- (deterministic): the after_ledger_insert trigger updates
-- jar_balance_cached, but that update can race with the FOR UPDATE lock
-- already held here, so we don't re-read.
--
-- security definer: reads/writes profiles + ledger_entries + sessions
-- regardless of caller RLS, but enforces auth.uid() = session.user_id
-- internally to prevent cross-user extend.

create or replace function public.extend_feed_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
  v_balance int;
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'unauthenticated';
  end if;

  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null then
    raise exception 'invalid_session';
  end if;
  if v_session.user_id <> v_caller then
    raise exception 'forbidden';
  end if;
  if v_session.kind <> 'feed' then
    raise exception 'invalid_session';
  end if;
  if v_session.ended_at is not null then
    raise exception 'session_already_ended';
  end if;

  select jar_balance_cached into v_balance
    from public.profiles where id = v_session.user_id for update;

  if v_balance is null or v_balance < 60 then
    raise exception 'insufficient_balance';
  end if;

  insert into public.ledger_entries (user_id, delta_seconds, label, ref_id)
    values (v_session.user_id, -60, 'feed_extend', v_session.id);

  update public.sessions
    set budget_seconds = coalesce(budget_seconds, 0) + 60
    where id = p_session_id;

  return jsonb_build_object(
    'newBudget',     coalesce(v_session.budget_seconds, 0) + 60,
    'balanceAfter',  v_balance - 60
  );
end;
$$;

revoke all on function public.extend_feed_session(uuid) from public;
grant execute on function public.extend_feed_session(uuid) to authenticated;
