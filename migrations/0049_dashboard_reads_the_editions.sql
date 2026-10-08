-- The dashboard answers for one Edition (ticket 0084), so it reads where each
-- Edition begins. The grant and the policy arrive together as 0028 explains:
-- `editions` has had Row Level Security since migration 0048 created it, and a
-- grant alone would select zero rows -- every route would then 404 its
-- Competition's current Edition, or fail on a Season with no Edition at all.
--
-- Nothing in the table is a secret: an Edition number and a Gameweek, both of
-- which the dashboard puts in a URL or a body.
grant select on editions to dashboard_read;

create policy dashboard_read_select on editions
  for select to dashboard_read using (true);
