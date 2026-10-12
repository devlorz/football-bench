-- `UCL`, `UEL` and `UECL` join the vocabulary with the two tables a club cup
-- needs and an Edition 1 row each (ADR-0063). One file, as migration 0042 was
-- for `UNL`, so the operator applies one file to production.
--
-- The codes are UEFA's own abbreviations, not football-data.org's `CL` and
-- `EL`: none of the three is read from that source, and its `UCL` names a cup
-- this project's token cannot read (CONTEXT.md's naming rule, as ADR-0063
-- amends it).
--
-- `historical_matches` and its Division check do not move (ADR-0057): a club
-- cup's sides play under Divisions this record does not curate, and their
-- recent matches go in `club_results` below.
alter domain competition_code drop constraint competition_code_check;

alter domain competition_code add constraint competition_code_check
  check (value in ('PL', 'PD', 'SA', 'BL1', 'FL1', 'UNL', 'UCL', 'UEL', 'UECL'));

-- A club's recent result in any competition, as the source states it
-- (ADR-0063). Keyed by the source and the id it issued, as `team_match_stats`
-- is, so a second source for the same match is a second row. No Season,
-- Division or Competition column, on migration 0042's terms: a club plays in
-- competitions under none of this record's codes, and `competition_name` is
-- the source's string ("Parva Liga", "Super Cup"), not a Competition code.
create table club_results (
  source            text not null,
  source_match_id   text not null,
  kicked_off_at     timestamptz not null,
  home_team         text not null,
  away_team         text not null,
  home_goals        integer not null check (home_goals >= 0),
  away_goals        integer not null check (away_goals >= 0),
  competition_name  text not null,
  primary key (source, source_match_id)
);

alter table club_results enable row level security;

-- Who is in post at a club on one morning, as its English Wikipedia infobox
-- names them (ADR-0063). The same model as migration 0045: keyed by the side
-- and the day, a Change is the difference between two mornings, and the
-- instant beside the day is what the reader bounds by.
--
-- Not `national_team_head_coaches`, because of the one column it has and this
-- has not: an infobox carries no appointment date, and that table's check
-- demands one for every named coach. `head_coach` null is a morning on which
-- the infobox named nobody -- a vacancy, or a field empty or unreadable
-- (spec 0028) -- and is told apart from a club nobody read, which has no row.
create table club_head_coaches (
  team         text not null,
  observed_on  date not null,
  observed_at  timestamptz not null,
  head_coach   text,
  primary key (team, observed_on)
);

alter table club_head_coaches enable row level security;

-- Edition 1 from Gameweek 1, as migration 0048 seeded the other six. Gameweek
-- *n* is matchday *n*, so `MD1` is Gameweek 1 and holds the table's
-- `edition > 1 or first_gw = 1` check although no cup predicts it: it arrives
-- as Locked history (ADR-0015).
insert into editions (competition, season, edition, first_gw)
select code, '2026-27', 1, 1
  from unnest(array['UCL', 'UEL', 'UECL']) as code;
