-- Ticket 0066 box 8: what the Shadow Seats add to the Premier League's bill,
-- Gameweek by Gameweek, beside the seats they shadow -- read off `usage.cost`
-- in every stored body, never estimated. Read-only.
--
-- Every call is priced, Repairs and failures included, the same rule the
-- price reports use ("money that was spent"). The `gw` here is the run's
-- Gameweek as `attempts` records it; both halves of a pair are called by the
-- same run, so the two columns of one row describe the same Fixtures.
with shadows as (
  select id as shadow_id, replace(id, 'match/shadow-', 'match/') as seat_id
    from models where role = 'shadow'
),
priced as (
  select a.model_id, a.gw, a.ok,
         (substring(a.raw_response from '\{"id".*')::jsonb -> 'usage' ->> 'cost')::numeric as usd,
         (substring(a.raw_response from '\{"id".*')::jsonb -> 'usage'
            -> 'completion_tokens_details' ->> 'reasoning_tokens')::int as reasoning
    from attempts a
   where a.competition = 'PL' and a.season = '2026-27' and a.track = 'match'
     and a.raw_response like '%{"id"%'
)
select s.shadow_id, p.gw,
       count(*) filter (where p.model_id = s.seat_id)                       as seat_calls,
       round(sum(p.usd) filter (where p.model_id = s.seat_id), 3)           as seat_usd,
       sum(p.reasoning) filter (where p.model_id = s.seat_id)               as seat_reasoning_tokens,
       count(*) filter (where p.model_id = s.shadow_id)                     as shadow_calls,
       round(sum(p.usd) filter (where p.model_id = s.shadow_id), 3)         as shadow_usd,
       sum(p.reasoning) filter (where p.model_id = s.shadow_id)             as shadow_reasoning_tokens,
       round(sum(p.usd) filter (where p.model_id = s.seat_id)
           - sum(p.usd) filter (where p.model_id = s.shadow_id), 3)         as saved_if_shadow_were_the_seat
  from shadows s
  join priced p on p.model_id in (s.seat_id, s.shadow_id)
 group by s.shadow_id, p.gw
 order by p.gw, s.shadow_id;
