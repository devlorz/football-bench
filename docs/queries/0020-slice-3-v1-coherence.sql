-- Ticket 0020 slice 3: the bench's numbers need La Liga's v1 Gameweek 1 beside
-- them. Read-only.
--
-- Coherence is counted by the scorer's rule (score-match-gameweek.ts): the
-- likeliest outcome by `probs`, ties included, against the outcome the
-- Predicted Score implies. The Gameweek is selected by the scorer's rule too --
-- `locked_in_gw`, never `gw` (ADR-0013, ADR-0015) -- so a Fixture the calendar
-- moved is counted where it Locked and nowhere else.
with v1 as (
  select
    p.model_id,
    (p.probs->>'H')::float8 as h,
    (p.probs->>'D')::float8 as d,
    (p.probs->>'A')::float8 as a,
    p.pred_home,
    p.pred_away
  from predictions p
  join fixtures f
    on f.competition = p.competition
   and f.season = p.season
   and f.fixture_id = p.fixture_id
  where p.competition = 'PD'
    and p.season = '2026-27'
    and f.locked_in_gw = 1
),
scored as (
  select
    case when h >= d and h >= a then 'H'
         when d >= a then 'D'
         else 'A' end as likeliest,
    case when pred_home > pred_away then 'H'
         when pred_home < pred_away then 'A'
         else 'D' end as implied,
    h, d, a, pred_home, pred_away
  from v1
)
select
  count(*)                                            as predictions,
  count(*) filter (where likeliest = implied)         as coherent,
  count(*) filter (where pred_home = pred_away)       as draw_scorelines,
  count(*) filter (where likeliest = 'D')             as draw_likeliest,
  round(avg(h)::numeric, 3)                           as mean_home,
  round(avg(d)::numeric, 3)                           as mean_draw,
  round(avg(a)::numeric, 3)                           as mean_away,
  round(max(d)::numeric, 3)                           as max_draw
from scored;
