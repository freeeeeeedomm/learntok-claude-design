-- 0002_triggers.sql
-- Auto-create profile, maintain jar_balance_cached, streak bump.
-- Uses explicit $func$ dollar-quoted bodies to avoid SQL-editor parser quirks.

-- Create profile on auth signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $func$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  -- welcome gift
  insert into public.ledger_entries (user_id, delta_seconds, label)
  values (new.id, 300, 'welcome_gift');

  return new;
end;
$func$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Maintain jar_balance_cached on every ledger entry
create or replace function public.recompute_jar_balance()
returns trigger language plpgsql as $func$
begin
  update public.profiles
  set jar_balance_cached = coalesce((
    select sum(delta_seconds) from public.ledger_entries where user_id = new.user_id
  ), 0)
  where id = new.user_id;
  return new;
end;
$func$;

drop trigger if exists after_ledger_insert on public.ledger_entries;
create trigger after_ledger_insert
  after insert on public.ledger_entries
  for each row execute function public.recompute_jar_balance();

-- Bump streak when lesson completes
create or replace function public.bump_streak_on_lesson()
returns trigger language plpgsql as $func$
declare
  v_last_date date;
begin
  if new.completed_at is null then return new; end if;

  select p.last_study_date into v_last_date
  from public.profiles p
  where p.id = new.user_id;

  if v_last_date = current_date then
    return new;
  elsif v_last_date = current_date - 1 then
    update public.profiles
      set streak = streak + 1, last_study_date = current_date
      where id = new.user_id;
  else
    update public.profiles
      set streak = 1, last_study_date = current_date
      where id = new.user_id;
  end if;
  return new;
end;
$func$;

drop trigger if exists after_lesson_completed on public.lesson_progress;
create trigger after_lesson_completed
  after insert or update on public.lesson_progress
  for each row execute function public.bump_streak_on_lesson();
