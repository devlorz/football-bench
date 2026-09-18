-- Ticket 0080, third follow-up: why `jev-latest` stands second on the combined
-- ranking's Bet Points. Read-only.
--
--   psql "$DATABASE_URL" -f docs/queries/0080-jev-overall-coverage.sql
--
-- What prompts these two: /overall shows `jev-latest` at 767 Bet Points over a
-- ranking whose evidence line reads 196 Fixtures. Ticket 0080's report
-- documents one replay, the Premier League's, of 40 Fixtures and 157 Bet
-- Points. 767 is the arithmetic of roughly 196 Fixtures, not 40, so either
-- four more replays ran undocumented or the sum is reading something it should
-- not.
--
-- E answers which. `summedRows` in dashboard/src/overall-view.ts adds a seat's
-- score in every covered Competition and lets an absent seat contribute
-- nothing, uncorrected (ADR-0051, ADR-0052) — so a Base Model's total is its
-- coverage times its rate, and coverage is the column to read first. Bet Points
-- store a count of winning legs, never a rate (score-match-gameweek.ts), and an
-- Exhibition Run answers with no Lock, no deadline and no budget to exhaust,
-- while every Entrant's Gap is permanent. If the Entrants cover fewer settled
-- Fixtures than the replay does, the count rewards never having Gapped.
--
-- F dates the runs and names the Prompt Version each answered under, which is
-- what tells an undocumented replay from a documented one (ADR-0038: a seat
-- answers one Competition at that Competition's frozen version).
--
-- Shadow Seats are excluded the way the scorer excludes them (ADR-0055).

\echo 'E. Coverage and totals per Base Model, across every covered Competition'

with latest as (
  select competition, max(gw) as gw
    from scores
   where season = '2026-27'
     and track = 'match'
     and metric = 'bet_points_season_to_date'
   group by competition
),
per_comp as (
  select
    s.model_id,
    s.competition,
    s.n as settled,
    s.value as bet_points
  from scores s
  join latest l on l.competition = s.competition and l.gw = s.gw
  where s.season = '2026-27'
    and s.track = 'match'
    and s.metric = 'bet_points_season_to_date'
)
select
  m.base_model,
  m.role,
  count(distinct p.competition) as competitions,
  sum(p.settled) as settled_fixtures,
  sum(p.bet_points) as bet_points,
  round(sum(p.bet_points) / nullif(7.0 * sum(p.settled), 0), 4) as bet_hit_pct,
  max(p.settled) filter (where p.competition = 'PL') as pl,
  max(p.settled) filter (where p.competition = 'PD') as pd,
  max(p.settled) filter (where p.competition = 'SA') as sa,
  max(p.settled) filter (where p.competition = 'FL1') as fl1,
  max(p.settled) filter (where p.competition = 'BL1') as bl1
from per_comp p
join models m on m.id = p.model_id and m.role <> 'shadow'
group by m.base_model, m.role
order by bet_points desc nulls last;

\echo 'F. Every jev-latest seat: when it answered, and under which Prompt Version'

select
  m.id as model_id,
  m.competition_of_row,
  m.role,
  m.prompt_version,
  m.created_at,
  count(p.fixture_id) as predictions,
  min(p.predicted_at) as first_answer,
  max(p.predicted_at) as last_answer
from (
  select
    m.id,
    m.role,
    m.prompt_version,
    m.created_at,
    coalesce(
      (select p2.competition from predictions p2 where p2.model_id = m.id limit 1),
      '(none)'
    ) as competition_of_row
  from models m
  where m.base_model = 'jev-latest'
) m
left join predictions p on p.model_id = m.id
group by m.id, m.competition_of_row, m.role, m.prompt_version, m.created_at
order by m.id;
