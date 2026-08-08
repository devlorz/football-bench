-- A Fixture FPL has withdrawn from its calendar was indistinguishable from a
-- scheduled one: `deferred` is monotone and also marks a Fixture legitimately
-- moved to another Gameweek, so it cannot answer "currently off the calendar"
-- (ADR-0024). This column answers only that, and only for a Locked Fixture —
-- a never-Locked withdrawal is deleted by the fetch instead.
--
-- The default is right for every existing row: a Fixture FPL had already
-- withdrawn before this lands is exactly the stale row the next fetch deletes
-- or marks, so no backfill is needed.

alter table fixtures
  add column unscheduled boolean not null default false;
