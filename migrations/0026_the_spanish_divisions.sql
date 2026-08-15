-- Migration 0004 wrote the two English division names straight into a column
-- check, which was right while a division name was a constant of the schema.
-- With the second Competition it is a value of `football-data/divisions.ts`,
-- and this constraint is what stops the two from drifting: a backfill run
-- against a division name the list has since edited is refused here rather
-- than stored as history no reader selects on.
--
-- Four names in one check, not a lookup table. Nothing joins to a division --
-- `historical_matches.division` is read only by equality against the name the
-- list holds -- so a table would buy a foreign key over a check and cost a
-- second place for a fifth league to be added.
--
-- Opening a league is therefore **two edits in one change**: the entry in
-- `divisions.ts` and the two names here. Not one, and the list's own docblock
-- said one until review caught it. A constraint cannot read a TypeScript
-- module, and the point of having both is that they can disagree loudly: an
-- edited list writing a spelling this check does not hold is refused at write
-- time instead of surfacing as a division nothing selects on.
-- `docs/runbooks/opening-a-competition.md` lists all five places a league
-- touches; this is one of them.
alter table historical_matches
  drop constraint historical_matches_division_check;

alter table historical_matches
  add constraint historical_matches_division_check check (
    division in (
      'Premier League', 'Championship',
      'La Liga', 'Segunda División'
    )
  );
