-- Gemini 4 Argon's four cup pre-flights (ADR-0065 step 2, ticket 0121), on temporary
-- candidate rows rather than Guest rows (a-new-base-model-arrives.md section 9 step 2).
-- A Guest row inserted before its pre-flight passed would be asked at the next Lock
-- anyway, and its Gaps alert nobody.
--
-- The rows carry `role = 'exhibition'` with the Guest's pin and config, at each cup's
-- Prompt Version. No scheduled run calls an Exhibition row, and a pre-flight writes no
-- Prediction, so these rows never reach a page. Delete them once the four reports are
-- read (the statement at the bottom).

begin;

insert into models (id, name, base_model, provider, quantization, prompt_version, role, config)
select id, 'Gemini 4 Argon', 'google/gemini-4-argon', 'google-vertex', null, prompt_version,
       'exhibition',
       '{"baseModelClass": "Frontier", "canonical_slug": "google/gemini-4-argon-20261013", "catalog_checked_at": "2026-10-14"}'::jsonb
  from (values
    ('candidate-unl/gemini-4-argon',  'match-unl/2026-27-v1'),
    ('candidate-ucl/gemini-4-argon',  'match-ucl/2026-27-v1'),
    ('candidate-uel/gemini-4-argon',  'match-uel/2026-27-v1'),
    ('candidate-uecl/gemini-4-argon', 'match-uecl/2026-27-v1')
  ) as seat (id, prompt_version);

commit;

-- Read-back: four rows, role 'exhibition'.
select id, role, prompt_version, provider from models where id like 'candidate-%/gemini-4-argon' order by id;

-- After the four reports are read, whatever they said:
-- delete from models where id like 'candidate-%/gemini-4-argon' and role = 'exhibition';
