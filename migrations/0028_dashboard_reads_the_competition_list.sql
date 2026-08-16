-- A Competition can be served and not open. The route list is the frozen
-- Prompt Versions (ADR-0038) and the Season's list of Competitions is the
-- `competitions` table, so between freezing a Prompt Version and opening the
-- league there is a path a reader can reach with no Season behind it. The
-- leaderboard has to say so, and saying so means reading the one table that
-- holds the fact.
--
-- The grant and the policy arrive together as migration 0017 requires, and as
-- 0020 and 0021 each did before this: under Row Level Security a grant
-- without a policy selects zero rows and reports no error -- which here would
-- answer "this league has not opened" for every league, including the one
-- being scored daily. `competitions` had Row Level Security from birth, in
-- migration 0022 that created it, so only the grant and the policy are new.
--
-- Nothing in the table is a secret: it is a Competition code and a Season, both
-- of which the dashboard already puts in a URL.
grant select on competitions to dashboard_read;

create policy dashboard_read_select on competitions
  for select to dashboard_read using (true);
