-- Migration 0026's four names plus Italy's and France's, on the same terms:
-- `football-data/divisions.ts` holds the list a fetch stores and a context
-- selects on, and this check is what stops the two from drifting. Eight names
-- now, still one check and still not a lookup table -- nothing joins to a
-- division, so a table would buy a foreign key and cost a second place for the
-- Bundesliga to be added.
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
      'Ligue 1', 'Ligue 2'
    )
  );
