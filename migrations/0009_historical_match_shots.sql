-- Shots and shots on target ride the football-data.co.uk CSVs the fetch
-- already downloads. Nullable: seasons whose CSVs predate the shot columns
-- keep loading, and an absent count is never stored as a zero.
alter table historical_matches
  add column home_shots            integer check (home_shots >= 0),
  add column away_shots            integer check (away_shots >= 0),
  add column home_shots_on_target  integer check (home_shots_on_target >= 0),
  add column away_shots_on_target  integer check (away_shots_on_target >= 0);
