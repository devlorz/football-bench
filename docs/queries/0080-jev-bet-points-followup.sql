-- Ticket 0080, follow-up to 0080-why-jev-leads-bet-points.sql. Read-only.
--
--   psql "$DATABASE_URL" -f docs/queries/0080-jev-bet-points-followup.sql
--
-- Query A of the first file settled two things and killed two guesses: every
-- seat settled the same forty Fixtures (so no Gap flatters the count), and
-- Jev's Handicap rate is not above the field. What it left standing is one
-- column: Jev wins `btts` at 0.675 where the best Entrant reads 0.600 and the
-- median reads 0.550, and that single leg is the whole of its three-point lead
-- over Claude Opus 5. These two queries ask where that leg comes from, and what
-- the evidential layer says about the same Predictions.
--
-- C decomposes the BTTS leg. A slip's position is 'no' exactly when the named
-- scoreline gives one side a clean sheet (`both()` in score-match-gameweek.ts),
-- so the question is how often each seat names one and how often the Fixtures
-- obliged.
--
-- D reads the probability layer, which is the only layer ADR-0012 lets a claim
-- rest on. Jev's pre-flight answered `H` at probability 1.0 with the other two
-- at 0.0; if that shape is typical, a degenerate distribution behind a 0.475
-- result leg should show up here as the worst RPS and Brier on the board, and
-- Coherence should show whether its two independent Choices agree with each
-- other at all.
--
-- Shadow Seats are excluded the way the scorer excludes them (ADR-0055).

\echo 'C. The BTTS leg, decomposed'

select
  p.model_id,
  m.role,
  count(*) as settled_fixtures,
  count(*) filter (where p.pred_home = 0 or p.pred_away = 0)
    as named_clean_sheet,
  round(
    avg((p.pred_home = 0 or p.pred_away = 0)::int)::numeric, 4
  ) as named_no_share,
  count(*) filter (
    where (f.result->>'home_goals')::int = 0
       or (f.result->>'away_goals')::int = 0
  ) as actual_clean_sheet,
  count(*) filter (
    where (p.pred_home = 0 or p.pred_away = 0)
      and ((f.result->>'home_goals')::int = 0
        or (f.result->>'away_goals')::int = 0)
  ) as no_and_no,
  count(*) filter (
    where p.pred_home > 0 and p.pred_away > 0
      and (f.result->>'home_goals')::int > 0
      and (f.result->>'away_goals')::int > 0
  ) as yes_and_yes
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
order by named_no_share desc;

\echo 'D. The probability layer over the same Predictions'

select
  s.model_id,
  m.role,
  max(s.n) filter (where s.metric = 'rps_season_to_date') as n,
  round(max(s.value) filter (where s.metric = 'rps_season_to_date'), 4)
    as rps,
  round(max(s.value) filter (where s.metric = 'brier_season_to_date'), 4)
    as brier,
  round(max(s.value) filter (where s.metric = 'accuracy_season_to_date'), 4)
    as accuracy,
  round(max(s.value) filter (where s.metric = 'coherence_season_to_date'), 4)
    as coherence,
  round(max(s.value) filter (where s.metric = 'outcome_pct_season_to_date'), 4)
    as outcome_pct,
  round(max(s.value) filter (where s.metric = 'score_pct_season_to_date'), 4)
    as score_pct
from scores s
join models m on m.id = s.model_id and m.role <> 'shadow'
where s.competition = 'PL'
  and s.season = '2026-27'
  and s.track = 'match'
  and s.metric in (
    'rps_season_to_date',
    'brier_season_to_date',
    'accuracy_season_to_date',
    'coherence_season_to_date',
    'outcome_pct_season_to_date',
    'score_pct_season_to_date'
  )
  and s.gw = (
    select max(gw) from scores
     where competition = 'PL' and season = '2026-27' and track = 'match'
       and metric = 'rps_season_to_date'
  )
group by s.model_id, m.role
order by rps nulls last;
