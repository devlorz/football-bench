-- Ticket 0068 box 8: after La Liga Gameweek 6's main run (2026-09-15 09:30Z)
-- and its fill (13:30Z), did the nine Fixtures migration 0041 gave back to
-- Gameweek 6 each get a Prediction from every seat, and if not, which pairs are
-- Gaps and what the run's attempts say about them? Read-only. The sibling of
-- `0065-box-6-gameweek-5-runs-with-ten.sql`, which reads the run four days
-- earlier that these nine were taken out of.
--
-- Ten Fixtures carry `locked_in_gw = 6` and only nine of them are the subject.
-- Real Sociedad-Celta (564682) was played on 2026-09-03 and predicted then; the
-- predict path's work query refuses it now on `kickoff_at > now()`, so it is
-- separated here by the same fact rather than by its id, and it is expected to
-- show eight Predictions and no new attempt.
--
-- `role = 'entrant'` alone: the Premier League's Shadow Seats (ADR-0055) are
-- seated at `match/2026-27-v2`, not La Liga's version, so none would match
-- anyway, but the filter says what the count means.

-- 1. The Gameweek in one row: Fixtures, seats, pairs answered, pairs missing --
--    the nine and the one kept apart, because a Gap on the one would be the
--    2026-09-03 run's and not this one's.
with seats as (
  select id from models
   where role = 'entrant' and prompt_version = 'match-pd/2026-27-v2'
     and withdrawn_at is null
),
locked as (
  select fixture_id, kickoff_at,
         kickoff_at > '2026-09-15T15:30:00Z' as predicted_on_the_15th
    from fixtures
   where competition = 'PD' and season = '2026-27' and locked_in_gw = 6
),
pairs as (
  select l.fixture_id, l.predicted_on_the_15th, s.id as model_id,
         exists (
           select 1 from predictions p
            where p.competition = 'PD' and p.season = '2026-27'
              and p.fixture_id = l.fixture_id and p.model_id = s.id
         ) as answered
    from locked l cross join seats s
)
select
  (select count(*) from locked)                                    as fixtures,
  (select count(*) from locked where predicted_on_the_15th)        as of_which_the_nine,
  (select count(*) from seats)                                     as seats,
  count(*) filter (where predicted_on_the_15th)                    as pairs,
  count(*) filter (where predicted_on_the_15th and answered)       as answered,
  count(*) filter (where predicted_on_the_15th and not answered)   as gaps,
  count(*) filter (where not predicted_on_the_15th and answered)   as real_sociedad_celta_kept
from pairs;

-- 2. Every Gap on the nine by name, with the last attempt's verdict beside it --
--    the same row the gap alert would have raised (gap-alert.ts reads the
--    latest attempt per pair).
with seats as (
  select id from models
   where role = 'entrant' and prompt_version = 'match-pd/2026-27-v2'
     and withdrawn_at is null
),
locked as (
  select fixture_id, home_team, away_team
    from fixtures
   where competition = 'PD' and season = '2026-27' and locked_in_gw = 6
     and kickoff_at > '2026-09-15T15:30:00Z'
)
select l.fixture_id, l.home_team, l.away_team, s.id as model_id,
       last_attempt.error_kind, last_attempt.attempt_no, last_attempt.trigger,
       left(last_attempt.error_detail, 80) as error_detail
  from locked l
  cross join seats s
  left join lateral (
    select a.error_kind, a.attempt_no, a.trigger, a.error_detail
      from attempts a
     where a.model_id = s.id and a.competition = 'PD' and a.season = '2026-27'
       and a.fixture_id = l.fixture_id and a.track = 'match'
     order by a.attempted_at desc
     limit 1
  ) last_attempt on true
 where not exists (
   select 1 from predictions p
    where p.competition = 'PD' and p.season = '2026-27'
      and p.fixture_id = l.fixture_id and p.model_id = s.id
 )
 order by l.fixture_id, s.id;

-- 3. What the run cost, and the ledger read the way migration 0041's comment
--    warns it has to be read: Gameweek 6's `attempts` hold both the 2026-09-03
--    calls, whose Predictions 0037 withdrew, and the 2026-09-15 calls that
--    replace them. Split by the day, not summed. `usage.cost` is reached by
--    `substring` because the stored body is the streamed response with its
--    keep-alive padding.
select date_trunc('day', a.attempted_at)                          as called_on,
       count(distinct a.fixture_id)                               as fixtures,
       count(*)                                                   as calls,
       count(*) filter (where a.ok)                               as ok_calls,
       count(*) filter (where a.error_kind = 'timeout')           as timeouts,
       round(sum((substring(a.raw_response from '\{"id".*')::jsonb
                  -> 'usage' ->> 'cost')::numeric), 3)            as usd
  from attempts a
 where a.competition = 'PD' and a.season = '2026-27'
   and a.track = 'match' and a.gw = 6
 group by called_on
 order by called_on;
