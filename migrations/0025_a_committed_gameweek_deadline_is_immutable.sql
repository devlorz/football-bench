-- A Gameweek's deadline stops moving once something has committed under it.
--
-- The Premier League's deadline is published by FPL. Every other Competition's
-- is derived -- earliest kickoff minus ninety minutes, recomputed at every
-- fetch until a Lock is observed at it and frozen from then (ADR-0036). Spec
-- 0016 asks for that freeze to be "enforced the same way `locked_in_gw` is",
-- and `locked_in_gw` has had a trigger since 0022 while `deadline_at` had only
-- an `if` in one writer. Any other writer could move a deadline the Entrants
-- had already committed against, and nothing would object.
--
-- The condition is not the clock. "Now is past the deadline" would have been
-- the literal reading of the freeze, and it is the wrong invariant twice over:
-- it depends on `now()`, which every replay, rehearsal and Season seed writes
-- against a simulated instant instead, and it would refuse the first write of
-- a Competition adopted mid-Season -- rows that are Locked on arrival and have
-- nothing committed under them yet.
--
-- What must not become false is the sentence "these Entrants committed before
-- X". A Prediction requires a Locked Fixture (`prediction_requires_locked_
-- fixture`, 0022) and `assignCanonicalLock` is what sets `locked_in_gw` when
-- one is written, so a Fixture pointing its `locked_in_gw` at a Gameweek is
-- exactly the trace of something having committed under that Gameweek's
-- deadline. That is the condition, and it composes with 0022: `locked_in_gw`
-- is immutable, and now so is the instant it was Locked at, so neither half of
-- the commitment can be rewritten by an update.
--
-- A Gameweek that is Locked but has no Fixture pointing at it is left movable
-- on purpose. Nobody has committed anything under it, so moving it makes no
-- stored record false -- and that is precisely the state a mid-Season adoption
-- arrives in.

create or replace function reject_committed_gameweek_deadline_change()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
      from fixtures f
     where f.competition = old.competition
       and f.season = old.season
       and f.locked_in_gw = old.gw
  ) then
    raise exception
      'a Gameweek deadline is immutable once a Fixture has locked into it'
      using
        errcode = '55000',
        constraint = 'gameweek_deadline_is_immutable_once_committed';
  end if;
  return new;
end;
$$;

-- Guarded on a real change, the shape `fixture_locked_gameweek_is_immutable`
-- is written in: every fetch upserts the deadlines it derived, so rewriting a
-- Gameweek with the value it already holds is the ordinary case and must stay
-- a no-op rather than becoming an error.
create trigger gameweek_deadline_is_immutable_once_committed
before update of deadline_at on gameweeks
for each row
when (new.deadline_at is distinct from old.deadline_at)
execute function reject_committed_gameweek_deadline_change();
