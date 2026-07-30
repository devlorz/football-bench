-- Per-match xG, scraped from Understat's internal endpoints for the Premier
-- League only. Team names are stored as Understat spells them; the join to
-- historical_matches happens at context-build time through an alias mapping.
--
-- Deliberately no foreign key to historical_matches: a match with no xG row is
-- a legitimate state -- a Championship match, an early-season gap, or an
-- Understat outage -- and not an integrity error.
create table understat_match_xg (
  season             text not null,
  understat_match_id text not null,
  kicked_off_at      timestamptz not null,
  home_team          text not null,
  away_team          text not null,
  home_xg            numeric(5, 2) not null check (home_xg >= 0),
  away_xg            numeric(5, 2) not null check (away_xg >= 0),
  primary key (season, understat_match_id)
);

alter table understat_match_xg enable row level security;
