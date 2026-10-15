-- Gemini 4 Argon enters as an Exhibition Run (ADR-0032), one row per league.
-- Released 2026-10-13, after ADR-0062's date, so no Edition 2 seat is open to it.
-- The Competition rides in the id's prefix so every row slugs to `gemini-4-argon`
-- and /overall sums the five into one (ticket 0080's lesson).
-- Catalog read 2026-10-14: canonical google/gemini-4-argon-20261013; every
-- endpoint reports quantization `unknown`, and plain `google-ai-studio` was at
-- status -2 while every Vertex endpoint was at 0, hence the Vertex pin.
-- Run by the operator against production 2026-10-14 16:41:14Z: INSERT 0 5. The
-- pre-flight on PL Fixture 41 was parseable. The replay answered 288 of 291
-- Fixtures; La Liga 564636, 564679 and 564697 are Gaps from an HTTP 429.

begin;

insert into models (id, name, base_model, provider, quantization, prompt_version, role, config)
select id, 'Gemini 4 Argon', 'google/gemini-4-argon', 'google-vertex', null, prompt_version,
       'exhibition',
       '{"baseModelClass": "Frontier", "canonical_slug": "google/gemini-4-argon-20261013", "catalog_checked_at": "2026-10-14"}'::jsonb
  from (values
    ('exhibition/gemini-4-argon',     'match/2026-27-v2'),
    ('exhibition-pd/gemini-4-argon',  'match-pd/2026-27-v2'),
    ('exhibition-sa/gemini-4-argon',  'match-sa/2026-27-v1'),
    ('exhibition-fl1/gemini-4-argon', 'match-fl1/2026-27-v1'),
    ('exhibition-bl1/gemini-4-argon', 'match-bl1/2026-27-v1')
  ) as seat (id, prompt_version);

commit;

-- Read-back: five rows, all role 'exhibition'.
select id, provider, prompt_version, role, config, created_at
  from models
 where base_model = 'google/gemini-4-argon'
 order by id;

-- Walking away, before any replay has written a Prediction:
-- delete from models where base_model = 'google/gemini-4-argon' and role = 'exhibition';
