-- Where each Edition of a Competition begins (ADR-0061, "What the record
-- holds"). A row is an Edition and its first Gameweek; presence is the fact,
-- as it is for `competitions` -- a Competition with no row is one this
-- migration missed, not one implicitly in its first Edition.
--
-- The Edition's first Lock is deliberately not a column: it is
-- `gameweeks.deadline_at` of the first Gameweek, which migration 0025 makes
-- immutable once a Fixture locks into it, and a second copy here would be a
-- second place for it to disagree. A Gameweek belongs to the row with the
-- greatest `first_gw` at or below it, so two Editions may not begin at the
-- same Gameweek.
create table editions (
  competition competition_code not null,
  season      text not null,
  edition     integer not null check (edition > 0),
  first_gw    integer not null check (first_gw > 0),
  -- A Competition's first Edition begins at its first Gameweek (CONTEXT.md),
  -- which is what lets every Gameweek fall in some Edition.
  check (edition > 1 or first_gw = 1),
  primary key (competition, season, edition),
  unique (competition, season, first_gw)
);

alter table editions enable row level security;

-- Every Competition the domain lists, Active or not: `UNL` gets its row now so
-- opening the cup does not have to remember to. Only `2026-27`: the record
-- holds no other Season yet, and whatever opens the next one inserts its
-- Edition 1 rows with it -- until then `readEdition` refuses that Season
-- rather than guessing it is in Edition 1.
insert into editions (competition, season, edition, first_gw)
select code, '2026-27', 1, 1
  from unnest(array['PL', 'PD', 'SA', 'BL1', 'FL1', 'UNL']) as code;
