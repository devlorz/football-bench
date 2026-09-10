-- Gameweek 6 takes its nine back, and is predicted on the day they are played.
--
-- Migration 0037 re-Locked nine matchday-6 La Liga Fixtures into Gameweek 5
-- because Gameweek 6 was closed to them: its deadline was frozen at 2026-09-03
-- 17:30Z by 0025's trigger for as long as any Fixture pointed at it, and Real
-- Sociedad-Celta -- genuinely brought forward, genuinely played on the 3rd,
-- eight Predictions correctly made under that Lock -- had to go on pointing at
-- it. Gameweek 5 was the latest Lock that still preceded all nine kick-offs.
-- It is also four to six days ahead of them, which is most of the staleness
-- 0037 existed to remove.
--
-- What changed between the 3rd and the 10th is the fetch, not the rule. A
-- Gameweek 6 whose deadline stands at 2026-09-15 15:30Z while Real
-- Sociedad-Celta's 2026-09-03 19:00Z kickoff is still Locked into it is a
-- Gameweek the daily fetch reads as breached: a Locked match is never excluded
-- from its Gameweek's kickoff list, a `FINISHED` match is still `scheduled`
-- (only postponed, suspended and cancelled are withdrawn), `deriveDeadline`
-- reports the breach and `KickoffInsideDeadlineError` makes the fetch write
-- nothing for `PD`. Not once: every day for the rest of the Season, because
-- Real Sociedad-Celta never stops being Locked into 6 -- La Liga's schedule,
-- results and every later deadline would simply stop landing. Ticket 0068
-- carves that case out: a Fixture both already Locked and already settled at
-- the source is left out of the derivation. The promise the breach alert
-- guards is that a Prediction precedes its kick-off, and all eight of Real
-- Sociedad-Celta's did. That carve-out is what makes Gameweek 6 an available
-- home, and it must be deployed before this migration is applied.
--
-- Gameweek 6 and nothing else. A Lock must precede every kick-off it covers;
-- Gameweek 7 Locks 2026-09-18 17:30Z, after all nine are played, and there is
-- no Gameweek number between 5 and 7.
--
-- The second recorded exception to two rules, a fortnight after the first.
-- ADR-0015 makes `locked_in_gw` immutable, enforced by 0022's
-- `fixture_locked_gameweek_is_immutable`; 0025 makes a committed Gameweek's
-- deadline immutable the same way. Both are disabled for this transaction only
-- and re-enabled before it commits -- the rows they protect are rewritten once,
-- by hand, and never again. The four `gameweek_deadline_preserves_*_lock`
-- triggers (0007, 0018, 0032, 0033) are deliberately not lifted and pass on
-- their own: each refuses a deadline only if some stored observation is at or
-- after it (`observed_at >= new.deadline_at`), and this deadline moves twelve
-- days *later* while every Gameweek 6 observation stays at 2026-09-03 06:23Z.
-- They would be the guards to watch if a deadline were ever pulled backwards;
-- nothing here pulls one backwards.
--
-- The nine are selected by the record, not by a typed list of ids:
-- `locked_in_gw = 5 and gw = 6` names exactly the rows 0037 moved and nothing
-- else, and Real Sociedad-Celta is excluded by both. The predicate is written
-- once, into a temp table, so the counts checked below and the rows deleted and
-- re-Locked are provably the same nine. The new deadline is computed off the
-- record -- the nine's earliest `kickoff_at` minus ninety minutes -- and then
-- asserted equal to 2026-09-15T15:30:00Z, so a record that has moved under this
-- file refuses it rather than writing an instant nobody checked. Every instant
-- here is an explicit UTC literal for the reason 0037's comment gives: a bare
-- date literal resolves at the session's own midnight, and this session is not
-- in UTC.
--
-- The nine's Gameweek 6 `contexts` rows are deleted. The `main` run stores a
-- context with `on conflict do nothing` and reads back whatever the row holds,
-- so leaving them means the nine are predicted on 2026-09-15 from a packet
-- built on 2026-09-03 -- the staleness this whole detour exists to remove.
-- Nothing references them: `attempts` never did, and the Predictions that did
-- were withdrawn by 0037. Real Sociedad-Celta's context stays.
--
-- `prediction_runs` for `PD` Gameweek 6 -- both `main` and `fill` -- are
-- deleted, because the scheduler skips a Gameweek whose run row is completed
-- and re-running Gameweek 6 is the point. The `attempts` ledger is untouched:
-- its 150 rows for Gameweek 6, 129 of them on the nine, stay, and the
-- 2026-09-15 run adds its own on top. A reader of that ledger will see Gameweek
-- 6 called twice, twelve days apart, and this comment is where they find out
-- why. `scores` are untouched too: scoring recomputes every Gameweek over the
-- Predictions standing at the time and upserts, so the nine join Gameweek 6's
-- rows once they are predicted and settled.
--
-- What it costs, stated. Nothing in Base Model calls: the nine's ~90 calls move
-- from 2026-09-11 to 2026-09-15 and Gameweek 5's run shrinks back to ~100. What
-- is spent is a second recorded exception to two immutability rules within a
-- fortnight of the first, and one narrowing of the fetch's breach alert -- a
-- breach first observed after the Fixture is settled is no longer alerted; the
-- record still shows it in `predicted_at` against `kickoff_at`. What is bought
-- is four days of freshness on nine Fixtures: predicted zero to two days before
-- kick-off instead of four to six.
--
-- No PD Fixture at either lock at all is the one shape let through as a no-op
-- rather than held to the nine-and-one below: a fresh clone or the test suite's
-- throwaway schemas, which have no such row to begin with. It is deliberately
-- not the shape the deployed database is in once this migration has already run
-- (all ten at 6) -- `schema_migrations` is what keeps this file from running a
-- second time there, and a count of zero moving on its own would also describe
-- an unexpected first-run state with nothing to move, which must still fail the
-- nine-and-one check rather than exit quietly.

do $$
declare
  moving_count    integer;
  kept_count      integer;
  blocked_count   integer;
  predicted_count integer;
  new_deadline    timestamptz;
begin
  -- One share lock per table any guard below reads, held for the rest of this
  -- transaction. Without them a concurrent writer could change the shape between
  -- the count that validated it and the write that acts on it, and the write
  -- would then act on a shape nothing here had checked. Each is here for a
  -- writer that really exists at this hour:
  --
  -- `fixtures` -- a concurrent fetch commits results, `unscheduled` flags and
  --   moved kickoffs, all three of which the guards below read.
  -- `predictions` -- Gameweek 5's Lock stands until 2026-09-11 17:30Z and the
  --   nine are Locked into it right now, so a `main` or `fill` run could write a
  --   Prediction against one of them between the count that found none and the
  --   `update` that moves it out from under Gameweek 5. That is the exact state
  --   the Prediction guard exists to refuse, and without this lock the guard can
  --   be raced rather than merely satisfied.
  -- `gameweeks` -- the deadline this transaction writes.
  lock table fixtures in share mode;
  lock table predictions in share mode;
  lock table gameweeks in share mode;

  create temp table fixtures_to_relock on commit drop as
  select fixture_id, kickoff_at from fixtures
   where competition = 'PD' and season = '2026-27'
     and locked_in_gw = 5 and gw = 6;

  select count(*) into moving_count from fixtures_to_relock;

  select count(*) into kept_count
    from fixtures
   where competition = 'PD' and season = '2026-27' and locked_in_gw = 6;

  if moving_count = 0 and kept_count = 0 then
    return;
  end if;

  if now() >= '2026-09-11T11:30:00Z' then
    raise exception
      'refuses to run at or after Gameweek 5''s main run '
      '(2026-09-11 11:30Z): the nine would be moved out of the Gameweek that '
      'is about to predict them and into one that already has';
  end if;

  if moving_count <> 9 or kept_count <> 1 then
    raise exception
      'expected nine PD matchday-6 Fixtures locked into Gameweek 5 and one '
      'locked into Gameweek 6, found % and %', moving_count, kept_count;
  end if;

  select count(*) into blocked_count
    from fixtures f
    join fixtures_to_relock n using (fixture_id)
   where f.competition = 'PD' and f.season = '2026-27'
     and (f.result is not null or f.unscheduled);

  if blocked_count > 0 then
    raise exception
      'refuses to move % of the nine: it already has a result or is '
      'unscheduled', blocked_count;
  end if;

  select count(*) into predicted_count
    from predictions p
    join fixtures_to_relock n using (fixture_id)
   where p.competition = 'PD' and p.season = '2026-27';

  if predicted_count > 0 then
    raise exception
      'refuses to move the nine: % Prediction(s) already stand against them '
      'under Gameweek 5''s Lock', predicted_count;
  end if;

  select min(kickoff_at) - interval '90 minutes'
    into new_deadline from fixtures_to_relock;

  if new_deadline <> '2026-09-15T15:30:00Z' then
    raise exception
      'expected the nine to Lock at 2026-09-15 15:30Z, ninety minutes before '
      'the earliest of them; the record computes %', new_deadline;
  end if;

  alter table fixtures disable trigger fixture_locked_gameweek_is_immutable;
  alter table gameweeks
    disable trigger gameweek_deadline_is_immutable_once_committed;

  delete from contexts
   where competition = 'PD' and season = '2026-27' and gw = 6
     and fixture_id in (select fixture_id from fixtures_to_relock);

  delete from prediction_runs
   where competition = 'PD' and season = '2026-27' and gw = 6;

  update fixtures
     set locked_in_gw = 6, updated_at = now()
   where competition = 'PD' and season = '2026-27'
     and fixture_id in (select fixture_id from fixtures_to_relock);

  update gameweeks
     set deadline_at = new_deadline
   where competition = 'PD' and season = '2026-27' and gw = 6;

  alter table gameweeks
    enable trigger gameweek_deadline_is_immutable_once_committed;
  alter table fixtures enable trigger fixture_locked_gameweek_is_immutable;
end $$;
