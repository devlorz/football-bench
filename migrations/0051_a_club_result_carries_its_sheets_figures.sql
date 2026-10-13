-- A club result's shots, shots on target and xG, as its 365Scores sheet holds
-- them (ADR-0063, as amended 2026-10-13), on `team_match_stats`' checks.
--
-- `sheet_read_at` is the instant the sheet was read. A row with it and no xG
-- was read and found without xG, which is final; a row without it was never
-- read. Null figures are the source's hole and never a zero (ADR-0058).
alter table club_results
  add column home_shots            integer check (home_shots >= 0),
  add column away_shots            integer check (away_shots >= 0),
  add column home_shots_on_target  integer check (home_shots_on_target >= 0),
  add column away_shots_on_target  integer check (away_shots_on_target >= 0),
  add column home_xg               numeric(5, 2) check (home_xg >= 0),
  add column away_xg               numeric(5, 2) check (away_xg >= 0),
  add column sheet_read_at         timestamptz;
