-- Has the FPL track started? ADR-0034: `manager_states` is insert-only, so
-- once a seat has a Season path, reassigning it to a different Base Model is
-- not representable -- which is the edge the GLM 5.3 swap has to clear on the
-- FPL side. Read-only.
--
--   psql "$DATABASE_URL" -f docs/queries/0020-slice-4-fpl-track-started.sql
--
-- No rows from the second query means the door is still open.

select id, name, base_model, provider, quantization,
       config ->> 'canonical_slug' as canonical_slug
  from models
 where role = 'entrant' and prompt_version = 'fpl/2026-27-v2'
 order by id;

select model_id, min(gw) as first_gw, max(gw) as last_gw, count(*) as states
  from manager_states
 where season = '2026-27'
 group by model_id
 order by model_id;
