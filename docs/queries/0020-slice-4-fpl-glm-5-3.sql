-- The FPL track's GLM seat moves to GLM 5.3, beside the Match track's.
-- ADR-0042 reopened the roster window; ADR-0034 requires both tracks to move
-- together, and GLM 5.3 cleared the arrival cutoff (published
-- 2026-08-18T20:57:35Z, cutoff 2026-08-19).
--
--   psql "$DATABASE_URL" -f docs/queries/0020-slice-4-fpl-glm-5-3.sql
--
-- One transaction, and it refuses rather than half-moves. `models.id` is the
-- primary key four tables point at, so the guard below is the whole safety of
-- this file: if the seat has walked any Season path at all, ADR-0034's
-- insert-only edge has already bound and reassigning it is not representable.
-- The five referencing tables are checked by name rather than trusted to the
-- foreign keys, because none of them cascades and a blocked update would say
-- "violates foreign key constraint" without saying which Season it protected.

-- Stop at the first error rather than reporting a refusal and then a wall of
-- "current transaction is aborted": the guard below is the point of the file
-- and its message has to be the last thing on the screen.
\set ON_ERROR_STOP on

begin;

do $$
declare
  bound integer;
begin
  select
      (select count(*) from predictions    where model_id = 'fpl/glm-5.2')
    + (select count(*) from manager_states where model_id = 'fpl/glm-5.2')
    + (select count(*) from attempts       where model_id = 'fpl/glm-5.2')
    + (select count(*) from scores         where model_id = 'fpl/glm-5.2')
    + (select count(*) from contexts       where model_id = 'fpl/glm-5.2')
  into bound;

  if bound > 0 then
    raise exception
      'fpl/glm-5.2 has walked % row(s) of this Season; manager_states is '
      'insert-only and the seat cannot be reassigned (ADR-0034). The seat '
      'stays on GLM 5.2 and GLM 5.3 arrives as an Exhibition Run (ADR-0032).',
      bound;
  end if;
end $$;

update models
   set id            = 'fpl/glm-5.3',
       name          = 'GLM 5.3',
       base_model    = 'z-ai/glm-5.3',
       config        = config
                       || jsonb_build_object(
                            'canonical_slug', 'z-ai/glm-5.3-20260816',
                            'catalog_checked_at', '2026-08-19'
                          )
 where id = 'fpl/glm-5.2';

-- Provider and quantization are unchanged on purpose: Z.AI is GLM 5.3's only
-- endpoint and serves it at the same fp8 the outgoing seat was pinned to, so
-- the swap moves the Base Model and nothing about how it is reached.

select id, name, base_model, provider, quantization,
       config ->> 'canonical_slug' as canonical_slug
  from models
 where role = 'entrant' and prompt_version = 'fpl/2026-27-v2'
 order by id;

commit;
