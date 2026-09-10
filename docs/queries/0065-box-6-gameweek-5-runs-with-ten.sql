-- Ticket 0065 box 6: after La Liga Gameweek 5's main run (2026-09-11 11:30Z)
-- and its fill (15:30Z), did the ten Fixtures Locked into Gameweek 5 each get a
-- Prediction from every seat, and if not, which pairs are Gaps and what the
-- run's attempts say about them? Read-only.
--
-- Ten, not the nineteen this ticket first expected: migration 0037 re-Locked
-- nine matchday-6 Fixtures into Gameweek 5, and migration 0041 (ticket 0068)
-- moved them back to Gameweek 6 before this run, to be predicted on 2026-09-15
-- instead. `0068-box-8-gameweek-6-runs-with-nine.sql` is this file's sibling for
-- that run. The `label = 6` counters below are kept rather than deleted: they
-- read zero here, and a non-zero is how this file says 0041 did not land.
--
-- Selected by `coalesce(locked_in_gw, gw)`, the predict path's own rule:
-- Gameweek 5's own ten carry `locked_in_gw` only once a Prediction has been
-- written under them (`assignCanonicalLock`), so before the run they are found
-- by label and after it by Lock, and this file reads the same ten either way.
-- `role = 'entrant'` alone: the Premier League's Shadow Seats (ADR-0055) are
-- seated at `match/2026-27-v2`, not La Liga's version, so none would match
-- anyway, but the filter says what the count means.

-- 1. The Gameweek in one row: Fixtures, seats, pairs answered, pairs missing.
with seats as (
  select id from models
   where role = 'entrant' and prompt_version = 'match-pd/2026-27-v2'
     and withdrawn_at is null
),
locked as (
  select fixture_id, gw as label, home_team, away_team, kickoff_at
    from fixtures
   where competition = 'PD' and season = '2026-27' and coalesce(locked_in_gw, gw) = 5
),
pairs as (
  select l.fixture_id, l.label, s.id as model_id,
         exists (
           select 1 from predictions p
            where p.competition = 'PD' and p.season = '2026-27'
              and p.fixture_id = l.fixture_id and p.model_id = s.id
         ) as answered
    from locked l cross join seats s
)
select
  (select count(*) from locked)                         as fixtures,
  (select count(*) from locked where label = 6)         as of_which_relocked_from_6,
  (select count(*) from seats)                          as seats,
  count(*)                                              as pairs,
  count(*) filter (where answered)                      as answered,
  count(*) filter (where not answered)                  as gaps,
  count(*) filter (where not answered and label = 6)    as gaps_on_the_nine
from pairs;

-- 2. Every Gap by name, with the last attempt's verdict beside it -- the
--    same row the gap alert would have raised (gap-alert.ts reads the latest
--    attempt per pair).
with seats as (
  select id from models
   where role = 'entrant' and prompt_version = 'match-pd/2026-27-v2'
     and withdrawn_at is null
),
locked as (
  select fixture_id, gw as label, home_team, away_team
    from fixtures
   where competition = 'PD' and season = '2026-27' and coalesce(locked_in_gw, gw) = 5
)
select l.fixture_id, l.label, l.home_team, l.away_team, s.id as model_id,
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
 order by l.label, l.fixture_id, s.id;

-- 3. What the run cost, split between the ten and the nine: calls, the
--    attempts that stood, and `usage.cost` off every stored body. The body is
--    the streamed response with its keep-alive padding, so the JSON is reached
--    by `substring`, not by casting the column.
with locked as (
  select fixture_id, gw as label
    from fixtures
   where competition = 'PD' and season = '2026-27' and coalesce(locked_in_gw, gw) = 5
)
select l.label,
       count(distinct l.fixture_id)                                   as fixtures,
       count(a.*)                                                     as calls,
       count(a.*) filter (where a.ok)                                 as ok_calls,
       count(a.*) filter (where a.error_kind = 'timeout')             as timeouts,
       round(sum((substring(a.raw_response from '\{"id".*')::jsonb
                  -> 'usage' ->> 'cost')::numeric), 3)               as usd
  from locked l
  join attempts a
    on a.competition = 'PD' and a.season = '2026-27'
   and a.fixture_id = l.fixture_id and a.track = 'match' and a.gw = 5
 group by l.label
 order by l.label;
