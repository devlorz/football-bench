-- The latest-squads endpoint reads two things migration 0020 left out, and they
-- arrive with their grants here as migration 0017 requires: under Row Level
-- Security a grant without a policy selects zero rows and reports no error,
-- which reaches a reader as a Squad that scored nothing rather than as a
-- failure.
--
-- `fpl_player_points` is the Gameweek points beside each of the fifteen. It was
-- deliberately withheld in 0020 -- no endpoint read a player's Gameweek points
-- then -- and this is the migration that first does.
--
-- `attempts` is where the last violation lives, and it is the only record it
-- lives in: a Manager State is written once and says nothing about the
-- responses refused before it (`score-fpl-gameweek.ts` reads the same rows for
-- the violation profile). The grant is column-level rather than whole-table
-- because the row also carries `raw_response`, which is a provider's answer
-- verbatim, and an internet-facing select-only role has no business reading it.
-- Row Level Security governs which rows are visible and cannot narrow a row to
-- some of its columns; the grant is what does that, so the two are written
-- together here.
grant select on fpl_player_points to dashboard_read;
create policy dashboard_read_select on fpl_player_points
  for select to dashboard_read using (true);

grant select (model_id, season, gw, track, attempt_no, error_kind, attempted_at)
  on attempts to dashboard_read;
create policy dashboard_read_select on attempts
  for select to dashboard_read using (true);
