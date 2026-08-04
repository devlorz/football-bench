-- One FPL context per Entrant per Gameweek, where there was one per Gameweek.
--
-- A Match context is one Fixture's and every Entrant is shown the same text,
-- so `fpl_id` identifies it and nothing else needs to. An FPL context carries
-- the Entrant's own Manager State — its Squad, its bank, its Free Transfers —
-- so from the second Gameweek onwards no two Entrants can be handed the same
-- text. `contexts_identity` had room for one of them, and `storeFplContext`
-- refused the second Entrant loudly rather than hand it a Squad it does not
-- own and then judge it on the Squad it does. Widening the key is what lets
-- the whole roster play a Gameweek, which is this ticket's whole subject.
--
-- The opening's context is per-Entrant too, though every Entrant is seeded
-- from the same empty Squad and the nine texts are identical. One shape for
-- every Gameweek is worth nine copies of one body: the alternative leaves
-- `model_id` null for exactly one Gameweek of the Season, and every reader of
-- the table then has to know which Gameweek that was.

-- No FPL context on record can be attributed to an Entrant, because the
-- column it would be named in is the one being added. The track has never run
-- outside a throwaway cluster, so this is expected to find nothing; it is here
-- so that a database where it does find something says so in a sentence rather
-- than through an opaque check violation below.
do $$
begin
  if exists (select 1 from contexts where track = 'fpl') then
    raise exception
      'FPL contexts predate per-Entrant identity and cannot be attributed to '
      'an Entrant; remove them before applying this migration';
  end if;
end $$;

alter table contexts add column model_id text references models(id);

-- Exactly one of the two identifies a context, and which one is decided by the
-- track. A Match context that named an Entrant would claim a text built for
-- one seat when every seat is shown the same one; an FPL context that named
-- none would be the row this migration exists to stop being possible.
alter table contexts drop constraint contexts_track_identity;
alter table contexts add constraint contexts_track_identity check (
  (track = 'match' and fpl_id is not null and model_id is null)
  or (track = 'fpl' and fpl_id is null and model_id is not null)
);

-- The `coalesce` form is kept so both tracks share one index and one
-- `on conflict` target, as they did before.
drop index contexts_identity;
create unique index contexts_identity
  on contexts (season, gw, track, coalesce(fpl_id, -1), coalesce(model_id, ''));
