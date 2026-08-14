-- The FPL section's endpoints read two tables the Match track's never did, so
-- they arrive with their grants here, as migration 0017 says a later migration
-- must: under Row Level Security a grant without a policy selects zero rows and
-- reports no error, which reaches a reader as an empty leaderboard rather than
-- as a failure.
--
-- `manager_states` is where a Squad, its purchase prices and the Chips spent
-- live, and `fpl_players` holds the price each Gameweek's Lock found, which is
-- the other half of Selling Price. Both tables already have Row Level Security
-- enabled -- migration 0003 enabled it on everything and migration 0005 on
-- `fpl_players` at creation -- so only the grant and the policy are new.
--
-- `fpl_player_points` is deliberately not here: no endpoint reads a player's
-- Gameweek points yet, and the migration that first does carries its grant.
do $$
declare
  target text;
begin
  foreach target in array array['manager_states', 'fpl_players'] loop
    execute format('grant select on %I to dashboard_read', target);
    execute format(
      'create policy dashboard_read_select on %I '
      || 'for select to dashboard_read using (true)',
      target);
  end loop;
end;
$$;
