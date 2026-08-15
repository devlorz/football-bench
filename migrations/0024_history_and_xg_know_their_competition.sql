-- The last two Competition-blind tables. `historical_matches` and
-- `understat_match_xg` are read by date and Season alone -- the form window,
-- the xG join and the Elo line's prior Season all ask "what was played before
-- this Lock", never "in which league" -- so the first La Liga backfill would
-- put Spanish results into a Premier League packet and Spanish results into
-- the Premier League Elo line. ADR-0037 requires the filters before the rows,
-- which is why this migration ships with ticket 5 and the backfill with
-- ticket 6.
--
-- Neither primary key grows, and neither would help if it did. A division
-- belongs to one Competition by convention -- nothing in the schema says so,
-- which is why the contamination tests seed both leagues under one division --
-- but a Spanish row mislabelled `PL` collides with no English row under either
-- key, so widening the key would separate rows that were never going to
-- collide and catch nothing. An Understat match id is global besides.
--
-- `default 'PL'` to relabel the rows that are here, then dropped, which is
-- where this parts company with 0022. There the default was safe to keep
-- because the column joined the key; here it does not, so a writer that
-- omitted `competition` would file Spanish rows under the Premier League in
-- silence -- no collision, no check, and a contaminated packet that reads
-- perfectly. Both writers name their Competition as of this change, so the
-- default has no caller left to serve and only a mistake left to swallow.
alter table historical_matches
  add column competition competition_code not null default 'PL';
alter table understat_match_xg
  add column competition competition_code not null default 'PL';

alter table historical_matches alter column competition drop default;
alter table understat_match_xg alter column competition drop default;
