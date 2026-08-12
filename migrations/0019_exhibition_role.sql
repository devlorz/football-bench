-- A Base Model that arrived after the Season began replays the stored Season
-- as an Exhibition Run (ADR-0032). It is one `models` row like any competitor,
-- told apart by its role alone: every scheduled job already selects
-- `role = 'entrant'`, so widening the check is the whole join path and the
-- whole isolation at once. A second marker would be a second place to
-- disagree.
--
-- No row rewrite and no guard: the constraint only widens, so every existing
-- row already satisfies it, and Postgres validates the new constraint against
-- the table as it adds it. Migration 0007 asserts by hand because it invents a
-- value it cannot otherwise prove; this invents nothing.

alter table models drop constraint models_role_check;

alter table models add constraint models_role_check
  check (role in ('entrant', 'reference', 'exhibition'));
