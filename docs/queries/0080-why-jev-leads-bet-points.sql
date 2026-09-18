-- Ticket 0080: why `exhibition/jev-latest` stands high on the Bet Points
-- ranking. Read-only — two selects, no write.
--
--   psql "$DATABASE_URL" -f docs/queries/0080-why-jev-leads-bet-points.sql
--
-- Three things this answers, in order:
--
-- 1. Whether Jev's lead is a rate or a count. `bet_points` stores
--    `betSlips(settled).won`, a count of winning legs
--    (score-match-gameweek.ts), and `bet_hit_pct` stores won/bet beside it.
--    A seat with a Gap settles fewer Fixtures and so wins fewer legs at the
--    same accuracy: read `n` next to `bet_points` before reading the rank.
-- 2. Which market the lead is won in. The per-market rates live in the
--    `bet_hit_pct_season_to_date` row's `detail->'markets'`. The frozen
--    qualification says the cheap goal-total lines are weighed against one
--    Handicap that "pays only for naming a decisive result" — so
--    `handicap_1.5` is the column to read first.
-- 3. Whether Jev names decisive scorelines where the chat seats hedge.
--    `handicapSide` returns 'none' for a predicted margin of 1 or 0, and a
--    'none' position is forced to lose, so a seat that habitually names 1-0 or
--    2-1 forfeits that leg on every Fixture. Query B counts exactly that.
--
-- Shadow Seats are excluded the way the scorer excludes them (ADR-0055).

\echo 'A. The ranking, its two denominators, and the seven market rates'

select
  s.model_id,
  m.role,
  max(s.n) filter (where s.metric = 'bet_hit_pct_season_to_date') as n,
  max(s.value) filter (where s.metric = 'match_points_season_to_date')
    as match_points,
  max(s.value) filter (where s.metric = 'bet_points_season_to_date')
    as bet_points,
  round(
    max(s.value) filter (where s.metric = 'bet_hit_pct_season_to_date'), 4
  ) as bet_hit_pct,
  max(s.detail->'markets'->>'result')
    filter (where s.metric = 'bet_hit_pct_season_to_date') as result_leg,
  max(s.detail->'markets'->>'over_under_1.5')
    filter (where s.metric = 'bet_hit_pct_season_to_date') as ou_1_5,
  max(s.detail->'markets'->>'over_under_2.5')
    filter (where s.metric = 'bet_hit_pct_season_to_date') as ou_2_5,
  max(s.detail->'markets'->>'over_under_3.5')
    filter (where s.metric = 'bet_hit_pct_season_to_date') as ou_3_5,
  max(s.detail->'markets'->>'over_under_4.5')
    filter (where s.metric = 'bet_hit_pct_season_to_date') as ou_4_5,
  max(s.detail->'markets'->>'btts')
    filter (where s.metric = 'bet_hit_pct_season_to_date') as btts,
  max(s.detail->'markets'->>'handicap_1.5')
    filter (where s.metric = 'bet_hit_pct_season_to_date') as handicap_1_5
from scores s
join models m on m.id = s.model_id and m.role <> 'shadow'
where s.competition = 'PL'
  and s.season = '2026-27'
  and s.track = 'match'
  and s.metric in (
    'match_points_season_to_date',
    'bet_points_season_to_date',
    'bet_hit_pct_season_to_date'
  )
  and s.gw = (
    select max(gw) from scores
     where competition = 'PL' and season = '2026-27' and track = 'match'
       and metric = 'bet_points_season_to_date'
  )
group by s.model_id, m.role
order by bet_points desc nulls last;

\echo 'B. The shape of each seat''s named scorelines over the settled Fixtures'

select
  p.model_id,
  m.role,
  count(*) as settled_fixtures,
  count(*) filter (where abs(p.pred_home - p.pred_away) >= 2)
    as decisive_margin,
  round(
    avg((abs(p.pred_home - p.pred_away) >= 2)::int)::numeric, 4
  ) as decisive_share,
  count(*) filter (where abs(p.pred_home - p.pred_away) <= 1)
    as hedged_margin,
  round(avg(p.pred_home + p.pred_away)::numeric, 3) as mean_predicted_goals,
  round(avg(
    (f.result->>'home_goals')::int + (f.result->>'away_goals')::int
  )::numeric, 3) as mean_actual_goals,
  count(*) filter (
    where p.pred_home = (f.result->>'home_goals')::int
      and p.pred_away = (f.result->>'away_goals')::int
  ) as exact_scorelines
from predictions p
join fixtures f
  on f.competition = p.competition
 and f.season = p.season
 and f.fixture_id = p.fixture_id
join models m on m.id = p.model_id and m.role <> 'shadow'
where p.competition = 'PL'
  and p.season = '2026-27'
  and f.locked_in_gw is not null
  and f.result is not null
group by p.model_id, m.role
order by decisive_share desc;
