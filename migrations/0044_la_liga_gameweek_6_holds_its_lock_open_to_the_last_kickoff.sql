-- La Liga Gameweek 6 ran on 2026-09-15 and came back forty Predictions short
-- of the hundred it asked for. Neither run failed: `main` (09:39-09:48Z) and
-- `fill` (13:36-13:41Z) both completed, and between them eighty-three calls
-- came back HTTP 402 `in_flight_budget_exhausted` -- the OpenRouter account
-- held $10.43, and the reservation OpenRouter takes against ten concurrent
-- calls at the 32,000-token ceiling is larger than that. The Gameweek's
-- deadline, 15:30Z, passed fifteen minutes before anyone read the damage, and
-- an Entrant answering after its Lock is refused by `attempt-match-calls.ts`
-- whatever trigger asks it.
--
-- Eight of the ten Fixtures have not kicked off. The promise the Lock exists
-- to keep -- a Prediction precedes its kick-off -- is therefore still
-- available for every one of them, and this migration buys the time to keep
-- it: the deadline moves from 2026-09-15 15:30Z to 2026-09-15 16:45Z.
--
-- Why 16:45Z and not later. Rayo Vallecano-Espanyol kicks off at 17:00Z, the
-- earliest kickoff still ahead, so 16:45Z is the latest instant that leaves
-- every Fixture in this Gameweek Locked *before* it is played. The margin
-- that buys Rayo-Espanyol is fifteen minutes where ADR-0036 derives ninety.
-- That Fixture already holds all ten Predictions, made at 09:39Z under the
-- 15:30Z Lock, so no seat gains a minute of news on it from this change --
-- but the stated margin is what it is, and this is the second Gameweek in the
-- benchmark whose Lock was set by hand rather than derived (the first is La
-- Liga Gameweek 1, recorded in ADR-0036's 2026-08-15 banner at a thirty-minute
-- cut-off). Elche-Real Madrid, at 19:30Z, is the earliest Fixture that still
-- has a Gap, and 16:45Z leaves it the full ninety.
--
-- What this does not do, and why the comparison survives. It writes no
-- Prediction and deletes none. The repair run that follows is a `fill`, which
-- reads the `contexts` rows stored at 09:39Z rather than building new ones --
-- so a seat answering at 16:00Z reads the same bytes, as of the same instant,
-- that the seats answering at 09:40Z read. The Entrants cannot tell the two
-- runs apart, because the only thing they see is the context, and the context
-- has not moved. That is what makes this a repair rather than a second, better
-- informed question put to the seats that happened to fail: the Paired
-- Differences of ADR-0011 are computed over Fixtures every seat answered, and
-- every seat that answers answers the same text. The `contexts` row's own
-- "Historical context as of 2026-09-15T15:30:00Z" line now names an instant
-- seventy-five minutes before the Lock it was built for; that line is the
-- honest record of when the data was read, which is the fact it was put there
-- to carry.
--
-- The one thing that cannot be repaired. Real Sociedad-Celta was played on
-- 2026-09-03 and holds eight Predictions; the two seats that Gapped it then
-- Gap it for ever, because `predict-gameweek.ts` refuses any Fixture whose
-- kickoff has passed. Thirty-eight of the forty Gaps are reachable; two are
-- not.
--
-- The rule lifted, and restored. `gameweek_deadline_is_immutable_once_
-- committed` (0025) refuses any change to the deadline of a Gameweek a Fixture
-- has Locked into, which is exactly this Gameweek. It is disabled for this
-- transaction and re-enabled before it commits, the way 0037 and 0041 lifted
-- theirs. The four `gameweek_deadline_preserves_*_lock` triggers are not
-- touched and pass unaided: each refuses a deadline moved to at-or-before a
-- stored observation, and Gameweek 6's Squad Changes and Head Coaches were
-- observed 2026-09-03 06:23Z, which this deadline moves further away from, not
-- towards.
--
-- What the daily fetch does with it. `deriveDeadline` reads this Gameweek as
-- committed and returns the stored instant unchanged; it reports a breach only
-- if a kickoff it still counts falls before that instant. Before tonight's
-- Fixtures settle the earliest such kickoff is 17:00Z, after 16:45Z; once they
-- settle they leave the derivation entirely under ticket 0068's carve-out, and
-- the earliest becomes 2026-09-16 17:00Z. The fetch is quiet either way.
--
-- Refuses to run at or after 16:45Z: past that instant the repair run it
-- exists to enable would be refused by the same Lock check that refused the
-- morning's, and a deadline moved to an instant already past would buy nothing
-- while still spending the exception.

do $$
declare
  stored_deadline timestamptz;
  new_deadline    constant timestamptz := '2026-09-15T16:45:00Z';
  fixture_count   integer;
  earliest_ahead  timestamptz;
begin
  -- Every table a guard below reads, held for the rest of this transaction: a
  -- concurrent fetch could move a kickoff and a concurrent predict run could
  -- write a Prediction between the reads and the write that acts on them.
  lock table gameweeks in share mode;
  lock table fixtures in share mode;

  select deadline_at into stored_deadline
    from gameweeks
   where competition = 'PD' and season = '2026-27' and gw = 6;

  select count(*), min(kickoff_at) filter (where kickoff_at > now())
    into fixture_count, earliest_ahead
    from fixtures
   where competition = 'PD' and season = '2026-27' and locked_in_gw = 6;

  -- A fresh clone and every throwaway schema the suite builds have no such
  -- Gameweek, and are let through as a no-op rather than held to the shape
  -- below -- the same admission 0037 and 0041 make.
  if stored_deadline is null and fixture_count = 0 then
    return;
  end if;

  if now() >= new_deadline then
    raise exception
      'refuses to run at or after the Lock it would write '
      '(2026-09-15 16:45Z): the repair run this exists for would be refused '
      'by that Lock, and the exception would be spent for nothing';
  end if;

  if stored_deadline <> '2026-09-15T15:30:00Z' then
    raise exception
      'expected La Liga Gameweek 6 to hold the Lock migration 0041 wrote, '
      '2026-09-15 15:30Z; the record holds %', stored_deadline;
  end if;

  if fixture_count <> 10 then
    raise exception
      'expected the ten Fixtures migration 0041 left Locked into Gameweek 6, '
      'found %', fixture_count;
  end if;

  -- The whole of what 16:45Z is: earlier than every kickoff still ahead, so
  -- no Fixture in this Gameweek ends up Locked after it was played. Read off
  -- the record rather than assumed, because a kickoff the source moved since
  -- this file was written would silently break that promise.
  if earliest_ahead is null or earliest_ahead <= new_deadline then
    raise exception
      'refuses to write a Lock at or after the earliest kickoff still ahead '
      '(%): a Prediction must precede its kick-off', earliest_ahead;
  end if;

  alter table gameweeks
    disable trigger gameweek_deadline_is_immutable_once_committed;

  update gameweeks
     set deadline_at = new_deadline
   where competition = 'PD' and season = '2026-27' and gw = 6;

  alter table gameweeks
    enable trigger gameweek_deadline_is_immutable_once_committed;
end $$;
