-- `UNL` joins the vocabulary and brings the two tables a cup needs
-- (ADR-0057). The domain is widened the way migration 0022 said it would be:
-- "a sixth Competition is `alter domain` in the migration that opens it".
--
-- Three things in one migration because they are one fact -- a Competition
-- that is not a league -- and none of the three is useful without the others:
-- the code with nowhere to file a national side's results, or the tables with
-- no code that may be written into them, are each half a change.
--
-- `historical_matches` and its Division check do not move, deliberately:
-- national sides meet twice a year in different competitions under no Division
-- at all, so a cup's history filed there would be filed under a Division it
-- does not have. `test/schema.test.ts` holds that check against
-- `src/football-data/divisions.ts` and is what proves it did not move.
alter domain competition_code drop constraint competition_code_check;

alter domain competition_code add constraint competition_code_check
  check (value in ('PL', 'PD', 'SA', 'BL1', 'FL1', 'UNL'));

-- One men's international, as the `martj42/international_results` dataset
-- states it (ADR-0057). Keyed by the date and the two sides and by nothing
-- else: there is no Season here -- an international year is not a league
-- Season and the dataset has never had one -- and no Division, because a
-- national side has none.
--
-- `tournament` is the dataset's own column name, carried verbatim, and it is
-- a word CONTEXT.md tells this project to avoid: it means neither Competition
-- nor anything else in the vocabulary, and the value in it ("UEFA Nations
-- League", "FIFA World Cup", "Friendly") is a string from a CSV and not a
-- Competition code -- `PL` and `UNL` are Competitions, "Friendly" is not.
-- Keeping the source's spelling is what says so at a glance, on the precedent
-- `understat_match_xg` set by storing Understat's names as Understat spells
-- them. Renaming it to something from the vocabulary would claim it is one of
-- ours. `country` is where it was played and `neutral` says whether that was
-- anybody's home.
--
-- No Competition column and no foreign key anywhere: these rows are not this
-- record's Fixtures, they are what each side did last, read for every
-- Competition whose registry entry names this source. The same pair playing
-- twice in a year is two rows; the same match read on two days is one.
create table international_results (
  played_on   date not null,
  home_team   text not null,
  away_team   text not null,
  home_goals  integer not null check (home_goals >= 0),
  away_goals  integer not null check (away_goals >= 0),
  tournament  text not null,
  country     text not null,
  neutral     boolean not null,
  primary key (played_on, home_team, away_team)
);

alter table international_results enable row level security;

-- Per-side shots and xG for one match, keyed by the source that issued the id
-- and the id itself. Generic on purpose (ADR-0057): the key says where the
-- number came from, so a second stats source for the same Fixture is a second
-- row and not a column named for a source the figure did not come from.
-- `understat_match_xg` is untouched and stays the five leagues' source.
--
-- The kickoff and both sides are here for the join: nothing links this table
-- to `fixtures`, because a sheet may be read before the Fixture it belongs to
-- settles and a source's ids are its own.
--
-- Every stat is nullable, which is the whole of ADR-0058's hole rule: a
-- settled Fixture whose sheet holds no xG is a row with a null in it and is
-- read again on every daily fetch until the Season closes. A row that was
-- simply absent would be indistinguishable from a Fixture nobody asked about,
-- and rendering a null as zero would be the lie the Entrant reads.
create table team_match_stats (
  season                text not null,
  competition           competition_code not null,
  source                text not null,
  source_match_id       text not null,
  kicked_off_at         timestamptz not null,
  home_team             text not null,
  away_team             text not null,
  home_shots            integer check (home_shots >= 0),
  away_shots            integer check (away_shots >= 0),
  home_shots_on_target  integer check (home_shots_on_target >= 0),
  away_shots_on_target  integer check (away_shots_on_target >= 0),
  home_xg               numeric(5, 2) check (home_xg >= 0),
  away_xg               numeric(5, 2) check (away_xg >= 0),
  primary key (season, competition, source, source_match_id)
);

alter table team_match_stats enable row level security;
