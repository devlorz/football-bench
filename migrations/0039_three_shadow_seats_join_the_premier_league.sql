-- ADR-0055 / ticket 0066: the three Shadow Seats, seated directly with
-- role = 'shadow' rather than through the temporary role = 'exhibition'
-- door ADR-0034's roster candidates used. That door -- and the roster CLI's
-- `upsertSeats` (season-roster.ts) built on it -- write a `config` of
-- observational fields (baseModelClass, canonical_slug, catalog_checked_at)
-- a Shadow does not carry; its whole `config` is the one line ADR-0055 puts
-- on the wire, `{"reasoning": {"effort": "none"}}`.
--
-- Each shadows the seat named in its id, at `match/2026-27-v2` -- the
-- Premier League's Prompt Version, so this seats the Premier League only.
-- Selected by the record, not by a typed list (migration 0037's idiom):
-- base_model, provider and quantization are read from the Entrant row each
-- shadow shadows rather than copied by hand from SEASON_ROSTER, so a pin
-- that has moved since that constant was last read moves the shadow with
-- it. A fresh clone or the test suite's throwaway schema has none of the
-- three Entrant rows yet -- the roster is entered by `npm run roster:enter`,
-- a door this migration does not run -- so this is a no-op there, and a
-- shadow is seated only beside an Entrant row that already exists, holds
-- `role = 'entrant'` and has not been withdrawn from the match track.

do $$
declare
  shadowed_count integer;
begin
  create temp table shadow_seats (
    shadow_id   text,
    shadow_name text,
    entrant_id  text
  ) on commit drop;

  insert into shadow_seats (shadow_id, shadow_name, entrant_id) values
    ('match/shadow-kimi-k3', 'Shadow of Kimi K3', 'match/kimi-k3'),
    ('match/shadow-deepseek-v4-pro', 'Shadow of DeepSeek V4 Pro',
     'match/deepseek-v4-pro'),
    ('match/shadow-glm-5.3', 'Shadow of GLM 5.3', 'match/glm-5.3');

  select count(*) into shadowed_count
    from shadow_seats s
    join models m on m.id = s.entrant_id and m.role = 'entrant'
     and m.prompt_version = 'match/2026-27-v2' and m.withdrawn_at is null;

  -- No Entrant rows yet at all: a fresh clone or the test suite's schema,
  -- which has not run `roster:enter` and has no seat for a shadow to sit
  -- beside. Seating the three anyway would seat them as orphans nothing
  -- shadows.
  if shadowed_count = 0 then
    return;
  end if;

  if shadowed_count <> 3 then
    raise exception
      'expected all three shadowed Entrants seated at match/2026-27-v2 and '
      'not withdrawn, found %', shadowed_count;
  end if;

  insert into models (id, name, base_model, provider, quantization,
                       prompt_version, role, config)
  select s.shadow_id, s.shadow_name, m.base_model, m.provider,
         m.quantization, m.prompt_version, 'shadow',
         '{"reasoning": {"effort": "none"}}'
    from shadow_seats s
    join models m on m.id = s.entrant_id and m.role = 'entrant'
     and m.prompt_version = 'match/2026-27-v2' and m.withdrawn_at is null;
end $$;
