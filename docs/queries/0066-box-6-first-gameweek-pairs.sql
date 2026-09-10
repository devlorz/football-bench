-- Ticket 0066 box 6: after Premier League Gameweek 4 settles, each Shadow
-- Seat beside the seat it shadows, paired on `fixture_id` -- the same
-- Fixture, the same Lock, the same context bytes, one envelope apart
-- (ADR-0055). Read-only.
--
-- A pair is a (shadow, seat) whose ids differ by the `shadow-` prefix, which
-- is how migration 0039 named them. RPS and the argmax pick are computed here
-- from `probs` for both halves rather than read from `scores`, because the
-- scorer writes no row for a Shadow (ADR-0055: it is excluded from scoring)
-- and a comparison has to price both sides by one rule. The RPS is the
-- scorer's: cumulative squared error over the ordered outcomes H, D, A,
-- halved. Ties in `probs` break H > D > A, as `argmaxOutcome` does.
--
-- Twenty pairs prove the plumbing and nothing else; the ticket says so beside
-- whatever this returns.

-- 1. Per pair, per Fixture: both forecasts, both RPS, both picks, whether the
--    scorelines agree, and what each half's standing attempt cost.
with shadows as (
  select id as shadow_id, replace(id, 'match/shadow-', 'match/') as seat_id
    from models where role = 'shadow'
),
locked as (
  select fixture_id, home_team, away_team, result ->> 'outcome' as actual
    from fixtures
   where competition = 'PL' and season = '2026-27' and coalesce(locked_in_gw, gw) = 4
     and result is not null
),
half as (
  select p.model_id, p.fixture_id,
         (p.probs->>'H')::float8 as h, (p.probs->>'D')::float8 as d,
         (p.probs->>'A')::float8 as a,
         p.pred_home, p.pred_away, p.attempts_used,
         standing.tokens_out, standing.usd
    from predictions p
    left join lateral (
      select a.tokens_out,
             (substring(a.raw_response from '\{"id".*')::jsonb
              -> 'usage' ->> 'cost')::numeric as usd
        from attempts a
       where a.model_id = p.model_id and a.competition = p.competition
         and a.season = p.season and a.fixture_id = p.fixture_id and a.ok
       order by a.attempted_at desc limit 1
    ) standing on true
   where p.competition = 'PL' and p.season = '2026-27'
),
scored as (
  select s.shadow_id, s.seat_id, l.fixture_id, l.home_team, l.away_team, l.actual,
         -- the seat
         e.h as seat_h, e.d as seat_d, e.a as seat_a,
         case when e.h >= e.d and e.h >= e.a then 'H' when e.d >= e.a then 'D' else 'A' end as seat_pick,
         round(((power(e.h - (l.actual = 'H')::int, 2)
               + power(e.h + e.d - (l.actual in ('H','D'))::int, 2)) / 2)::numeric, 4) as seat_rps,
         e.pred_home as seat_home, e.pred_away as seat_away, e.tokens_out as seat_tokens, e.usd as seat_usd,
         -- the shadow
         w.h as shadow_h, w.d as shadow_d, w.a as shadow_a,
         case when w.h >= w.d and w.h >= w.a then 'H' when w.d >= w.a then 'D' else 'A' end as shadow_pick,
         round(((power(w.h - (l.actual = 'H')::int, 2)
               + power(w.h + w.d - (l.actual in ('H','D'))::int, 2)) / 2)::numeric, 4) as shadow_rps,
         w.pred_home as shadow_home, w.pred_away as shadow_away, w.tokens_out as shadow_tokens, w.usd as shadow_usd
    from shadows s
    cross join locked l
    join half e on e.model_id = s.seat_id and e.fixture_id = l.fixture_id
    join half w on w.model_id = s.shadow_id and w.fixture_id = l.fixture_id
)
select shadow_id, fixture_id, home_team, away_team, actual,
       seat_pick, shadow_pick, seat_rps, shadow_rps,
       (seat_pick = actual)::int as seat_hit, (shadow_pick = actual)::int as shadow_hit,
       (seat_home = shadow_home and seat_away = shadow_away) as same_scoreline,
       seat_tokens, shadow_tokens, seat_usd, shadow_usd
  from scored
 order by shadow_id, fixture_id;

-- 2. Per pair: the paired differences the report will carry. `rps_diff` is
--    shadow minus seat, so a negative number says the shadow forecast better.
--    No interval at ten pairs -- that is the Season report's (box 7), where n
--    is large enough for one to mean something.
with shadows as (
  select id as shadow_id, replace(id, 'match/shadow-', 'match/') as seat_id
    from models where role = 'shadow'
),
locked as (
  select fixture_id, result ->> 'outcome' as actual
    from fixtures
   where competition = 'PL' and season = '2026-27' and coalesce(locked_in_gw, gw) = 4
     and result is not null
),
half as (
  select p.model_id, p.fixture_id,
         (p.probs->>'H')::float8 as h, (p.probs->>'D')::float8 as d,
         (p.probs->>'A')::float8 as a, p.pred_home, p.pred_away,
         standing.tokens_out, standing.usd
    from predictions p
    left join lateral (
      select a.tokens_out,
             (substring(a.raw_response from '\{"id".*')::jsonb
              -> 'usage' ->> 'cost')::numeric as usd
        from attempts a
       where a.model_id = p.model_id and a.competition = p.competition
         and a.season = p.season and a.fixture_id = p.fixture_id and a.ok
       order by a.attempted_at desc limit 1
    ) standing on true
   where p.competition = 'PL' and p.season = '2026-27'
),
pairs as (
  select s.shadow_id, l.fixture_id, l.actual,
         (power(e.h - (l.actual = 'H')::int, 2) + power(e.h + e.d - (l.actual in ('H','D'))::int, 2)) / 2 as seat_rps,
         (power(w.h - (l.actual = 'H')::int, 2) + power(w.h + w.d - (l.actual in ('H','D'))::int, 2)) / 2 as shadow_rps,
         (case when e.h >= e.d and e.h >= e.a then 'H' when e.d >= e.a then 'D' else 'A' end = l.actual)::int as seat_hit,
         (case when w.h >= w.d and w.h >= w.a then 'H' when w.d >= w.a then 'D' else 'A' end = l.actual)::int as shadow_hit,
         (e.pred_home = w.pred_home and e.pred_away = w.pred_away)::int as same_scoreline,
         e.tokens_out as seat_tokens, w.tokens_out as shadow_tokens,
         e.usd as seat_usd, w.usd as shadow_usd
    from shadows s
    cross join locked l
    join half e on e.model_id = s.seat_id and e.fixture_id = l.fixture_id
    join half w on w.model_id = s.shadow_id and w.fixture_id = l.fixture_id
)
select shadow_id,
       count(*)                                          as pairs,
       round(avg(seat_rps)::numeric, 4)                  as seat_rps,
       round(avg(shadow_rps)::numeric, 4)                as shadow_rps,
       round(avg(shadow_rps - seat_rps)::numeric, 4)     as rps_diff,
       round(avg(seat_hit)::numeric, 3)                  as seat_hit_rate,
       round(avg(shadow_hit)::numeric, 3)                as shadow_hit_rate,
       sum(same_scoreline)                               as same_scorelines,
       sum(seat_tokens)                                  as seat_tokens,
       sum(shadow_tokens)                                as shadow_tokens,
       round(sum(seat_usd), 3)                           as seat_usd,
       round(sum(shadow_usd), 3)                         as shadow_usd
  from pairs
 group by shadow_id
 order by shadow_id;

-- 3. Pairs that did not form: a Fixture one half answered and the other did
--    not. A Shadow's Gap raises no alert (ADR-0055), so this is where it is
--    seen at all.
with shadows as (
  select id as shadow_id, replace(id, 'match/shadow-', 'match/') as seat_id
    from models where role = 'shadow'
),
locked as (
  select fixture_id from fixtures
   where competition = 'PL' and season = '2026-27' and coalesce(locked_in_gw, gw) = 4
)
select s.shadow_id, l.fixture_id,
       exists (select 1 from predictions p where p.model_id = s.seat_id
                and p.competition = 'PL' and p.season = '2026-27' and p.fixture_id = l.fixture_id) as seat_answered,
       exists (select 1 from predictions p where p.model_id = s.shadow_id
                and p.competition = 'PL' and p.season = '2026-27' and p.fixture_id = l.fixture_id) as shadow_answered
  from shadows s cross join locked l
 where not exists (select 1 from predictions p where p.model_id = s.seat_id
                    and p.competition = 'PL' and p.season = '2026-27' and p.fixture_id = l.fixture_id)
    or not exists (select 1 from predictions p where p.model_id = s.shadow_id
                    and p.competition = 'PL' and p.season = '2026-27' and p.fixture_id = l.fixture_id)
 order by s.shadow_id, l.fixture_id;
