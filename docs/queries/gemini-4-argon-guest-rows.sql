-- Gemini 4 Argon takes its Guest Seat in the five leagues (ADR-0065, ticket 0121).
-- Run after migration 0052 is applied, and before each league's Lock. The insert
-- is what sets the first Lock: a Guest is asked at every Lock after `created_at`.
-- The cups (UCL, UEL, UECL, UNL) follow after their four pre-flights, in their
-- own file.
--
-- Same pin and config as the Exhibition rows (gemini-4-argon-exhibition-rows.sql).
-- The Competition rides in the id's prefix, so every row slugs to `gemini-4-argon`.

-- 1. The role check must already admit 'guest' (migration 0052). Expect one row.
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conname = 'models_role_check'
   and pg_get_constraintdef(oid) like '%guest%';

begin;

insert into models (id, name, base_model, provider, quantization, prompt_version, role, config)
select id, 'Gemini 4 Argon', 'google/gemini-4-argon', 'google-vertex', null, prompt_version,
       'guest',
       '{"baseModelClass": "Frontier", "canonical_slug": "google/gemini-4-argon-20261013", "catalog_checked_at": "2026-10-14"}'::jsonb
  from (values
    ('guest/gemini-4-argon',     'match/2026-27-v2'),
    ('guest-pd/gemini-4-argon',  'match-pd/2026-27-v2'),
    ('guest-sa/gemini-4-argon',  'match-sa/2026-27-v1'),
    ('guest-fl1/gemini-4-argon', 'match-fl1/2026-27-v1'),
    ('guest-bl1/gemini-4-argon', 'match-bl1/2026-27-v1')
  ) as seat (id, prompt_version);

commit;

-- 2. Read-back: five rows, all role 'guest', with created_at before every league's Lock.
select m.id, m.role, m.prompt_version, m.created_at,
       (select min(g.gw) from gameweeks g
         where g.competition = (case split_part(m.id, '/', 1)
                                  when 'guest' then 'PL' when 'guest-pd' then 'PD'
                                  when 'guest-sa' then 'SA' when 'guest-fl1' then 'FL1'
                                  when 'guest-bl1' then 'BL1' end)::competition_code
           and g.season = '2026-27' and m.created_at <= g.deadline_at) as first_lock_gw
  from models m
 where m.role = 'guest'
 order by m.id;

-- Walking away, before any Lock has asked them:
-- delete from models where role = 'guest' and base_model = 'google/gemini-4-argon';
