-- Migration 0035's eight names plus Germany's two, on the same terms:
-- `football-data/divisions.ts` holds the list a fetch stores and a context
-- selects on, and this check is what stops the two from drifting. Ten names
-- now, still one check and still not a lookup table.
--
-- The entry in `divisions.ts` and these names are one change and neither half
-- is safe alone: a list edited past this check is refused at write time, which
-- is the point. `docs/runbooks/opening-a-competition.md` counts the rest.
alter table historical_matches
  drop constraint historical_matches_division_check;

alter table historical_matches
  add constraint historical_matches_division_check check (
    division in (
      'Premier League', 'Championship',
      'La Liga', 'Segunda División',
      'Serie A', 'Serie B',
      'Ligue 1', 'Ligue 2',
      'Bundesliga', '2. Bundesliga'
    )
  );
