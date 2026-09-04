-- La Liga's fetch on 2026-09-03 read Real Sociedad-Celta's kickoff brought
-- forward to the 3rd -- well *before* Gameweek 6's own round window, 15-17
-- September, not inside it -- and the label-grouped deadline derivation
-- ticket 0064 later formalised took the earliest kickoff among every match
-- still labelled matchday 6, this one included, as the whole label's
-- deadline: every one of Gameweek 6's ten Fixtures was Locked and
-- predicted against 2026-09-03 17:30Z -- twelve to fourteen days before the
-- other nine actually kick off (2026-09-15 through 2026-09-17). Ninety
-- Predictions, ten seats across the nine, were made on stale team news that
-- far ahead of the sides they described stepping onto a pitch.
--
-- Ticket 0064 fixes the fetch so this cannot recur: a brought-forward
-- Fixture that has not itself opened attaches to the Gameweek whose window
-- has, and cannot drag the rest of its label's deadline back with it. It
-- does not reach backwards. This migration is the one-time undo for the
-- nine Predictions the bug already produced.
--
-- The nine, not the ten, named once. Real Sociedad-Celta was genuinely
-- brought forward and genuinely played on the 3rd; its Prediction was made
-- under a Lock that correctly described it, so it keeps that Lock and its
-- ten Predictions. The nine are selected by the record, not by a typed
-- list of ids: `locked_in_gw = 6 and kickoff_at > 2026-09-04T00:00Z` names
-- them and excludes Real Sociedad-Celta on both counts. That boundary is
-- written as an explicit UTC instant rather than a bare date literal,
-- which a session outside UTC (this one included) would resolve at its own
-- midnight instead. The predicate is written once, into a temp table, so
-- the count checked below and the rows deleted and re-Locked are provably
-- the same nine rather than three separately-typed copies of one predicate.
--
-- Gameweek 5, not 4 or 6. Gameweek 6's deadline is frozen at 2026-09-03
-- 17:30Z by 0025's trigger for as long as any Fixture points at it, and
-- Real Sociedad-Celta must go on pointing at it. Gameweek 4 Locks
-- 2026-09-04 17:30Z, eleven days before the nine kick off -- reproducing
-- most of the staleness this migration exists to remove. Moving Real
-- Sociedad-Celta into Gameweek 4 instead, and re-deriving its deadline over
-- that one Fixture, was priced separately and rejected: it would have put
-- Gameweek 4's deadline at 2026-09-03 17:30Z, seventy-seven minutes from
-- the moment the decision was taken, with Gameweek 4's own run already
-- overdue by the scheduler's arithmetic. Gameweek 5 Locks 2026-09-11
-- 17:30Z: the latest Lock that still precedes every one of the nine, and
-- not yet run.
--
-- The one recorded exception to two rules. ADR-0013 makes Predictions
-- insert-only, enforced since 0001 by `predictions_are_immutable`; this is
-- the one migration that deletes from that table. 0022's
-- `fixture_locked_gameweek_is_immutable` protects `locked_in_gw` the same
-- way. Both triggers are disabled for this transaction only and re-enabled
-- before it commits -- the rows they protect are rewritten once, by hand,
-- and never again. `alter table ... disable trigger` needs the same
-- table-owner connection 0022's `drop trigger ... on fixtures` already
-- needed; nothing new is asked of whoever runs `db:migrate`.
--
-- $1.71 of the ninety withdrawn Predictions (Gameweek 6's share for the
-- nine) is sunk. Gameweek 5's run grows by nine Fixtures on 2026-09-11.
-- `attempts` keeps its 135 rows for the nine under Gameweek 6: a ledger
-- entry for calls that no longer have a Prediction standing behind them,
-- which is why this comment exists for whoever reads that ledger next.
--
-- No PD Gameweek 6 Fixture at all -- moved or kept -- is the one shape let
-- through as a no-op rather than held to the nine-and-one below: a fresh
-- clone or the test suite's throwaway schemas, which have no such row to
-- begin with. It is deliberately not the shape the deployed database is in
-- once this migration has already run (nine at 5, Real Sociedad-Celta alone
-- still at 6) -- `schema_migrations` is what keeps this file from running a
-- second time there, and a `moved_count = 0` on its own would also describe
-- an unexpected first-run state with nothing to move, which must still fail
-- the nine-and-one check below rather than exit quietly.

do $$
declare
  moved_count   integer;
  kept_count    integer;
  blocked_count integer;
begin
  -- Held for the rest of this transaction. Without it, a concurrent fetch
  -- could commit a result, an `unscheduled` flag or a moved kickoff between
  -- the counts and guards below and the writes that act on them, and the
  -- writes would then act on a shape nothing here had validated.
  lock table fixtures in share mode;
  lock table predictions in share mode;

  create temp table fixtures_to_relock on commit drop as
  select fixture_id from fixtures
   where competition = 'PD' and season = '2026-27'
     and locked_in_gw = 6 and kickoff_at > '2026-09-04T00:00:00Z';

  select count(*) into moved_count from fixtures_to_relock;

  select count(*) into kept_count
    from fixtures
   where competition = 'PD' and season = '2026-27'
     and locked_in_gw = 6 and kickoff_at <= '2026-09-04T00:00:00Z';

  if moved_count = 0 and kept_count = 0 then
    return;
  end if;

  if now() >= '2026-09-11T11:30:00Z' then
    raise exception
      'refuses to run at or after Gameweek 5''s main run '
      '(2026-09-11 11:30Z): the nine would be re-locked into a Gameweek '
      'nobody will predict';
  end if;

  if moved_count <> 9 or kept_count <> 1 then
    raise exception
      'expected nine PD Gameweek 6 Fixtures kicking off after '
      '2026-09-04T00:00Z and one on or before it, found % and %',
      moved_count, kept_count;
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

  alter table fixtures disable trigger fixture_locked_gameweek_is_immutable;
  alter table predictions disable trigger predictions_are_immutable;

  delete from predictions
   where competition = 'PD' and season = '2026-27'
     and fixture_id in (select fixture_id from fixtures_to_relock);

  update fixtures
     set locked_in_gw = 5, updated_at = now()
   where competition = 'PD' and season = '2026-27'
     and fixture_id in (select fixture_id from fixtures_to_relock);

  alter table predictions enable trigger predictions_are_immutable;
  alter table fixtures enable trigger fixture_locked_gameweek_is_immutable;
end $$;
