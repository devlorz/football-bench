-- Gemini 4 Argon takes its Guest Seat in the four cups (ADR-0065, ticket 0121). Run only
-- for cups whose pre-flight came back `parseable` through Google. Drop a cup's line
-- from the values list if its pre-flight did not. The candidate rows must already be
-- deleted (gemini-4-argon-cup-candidates.sql): a second `exhibition` row of the Base
-- Model stops the combined row.
--
-- Insert more than two hours before each cup's Lock, or its fill run will not ask it:
-- UCL GW3 2026-10-20 15:15Z, UECL GW2 2026-10-22 13:00Z, UEL GW3 2026-10-22 15:15Z,
-- UNL GW5 2026-11-12 15:30Z.
-- Run with: psql "$DATABASE_URL" -P pager=off -v ON_ERROR_STOP=1 -f <this file>

-- 1. No candidate row is left. Expect zero rows.
select id from models where id like 'candidate-%/gemini-4-argon';

begin;

insert into models (id, name, base_model, provider, quantization, prompt_version, role, config)
select id, 'Gemini 4 Argon', 'google/gemini-4-argon', 'google-vertex', null, prompt_version,
       'guest',
       '{"baseModelClass": "Frontier", "canonical_slug": "google/gemini-4-argon-20261013", "catalog_checked_at": "2026-10-14"}'::jsonb
  from (values
    ('guest-unl/gemini-4-argon',  'match-unl/2026-27-v1'),
    ('guest-ucl/gemini-4-argon',  'match-ucl/2026-27-v1'),
    ('guest-uel/gemini-4-argon',  'match-uel/2026-27-v1'),
    ('guest-uecl/gemini-4-argon', 'match-uecl/2026-27-v1')
  ) as seat (id, prompt_version);

commit;

-- 2. Read-back: all nine Guest rows, each with the first Lock it will be asked at.
--    Expect the cups at UNL GW5, UCL GW3, UEL GW3, UECL GW2 when inserted before 2026-10-20.
select m.id, m.prompt_version, m.created_at,
       (select min(g.gw) from gameweeks g
         where g.competition = (case split_part(m.id, '/', 1)
                                  when 'guest' then 'PL' when 'guest-pd' then 'PD'
                                  when 'guest-sa' then 'SA' when 'guest-fl1' then 'FL1'
                                  when 'guest-bl1' then 'BL1' when 'guest-unl' then 'UNL'
                                  when 'guest-ucl' then 'UCL' when 'guest-uel' then 'UEL'
                                  when 'guest-uecl' then 'UECL' end)::competition_code
           and g.season = '2026-27' and m.created_at <= g.deadline_at) as first_lock_gw
  from models m
 where m.role = 'guest' and m.base_model = 'google/gemini-4-argon'
 order by m.id;

-- Walking away from a cup before its first Lock:
-- delete from models where id = 'guest-<cup>/gemini-4-argon' and role = 'guest';
