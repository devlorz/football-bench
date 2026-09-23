-- Which group of a cup's league phase a Fixture belongs to, as the schedule
-- source names it -- "Group A2" -- so the packet can put the group's table in
-- front of an Entrant the way a league's packet puts the league's (ADR-0057
-- deferred the table; ticket 0087 takes it before the cup's first Lock).
--
-- Nullable, because a league's Fixture has no group and the five leagues
-- write nothing here. Written by the cup's schedule fetch beside the engine's
-- own upsert rather than through it: the shared writer (ticket 0071) carries
-- what every source has and a group is what one source has.
alter table fixtures add column group_name text;
