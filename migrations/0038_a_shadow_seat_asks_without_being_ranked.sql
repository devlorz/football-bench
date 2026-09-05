-- ADR-0055: a Shadow Seat asks the same Fixture as the seat it shadows, with
-- a different `models.config`, and is ranked nowhere. `role` is what every
-- reader already tells a competitor apart by, so admitting the value here is
-- the whole change; ticket 0066 widens the one reader that must see it
-- (the prediction run) and touches no other query.
--
-- No row rewrite and no guard, on the same grounds as migration 0034: the
-- constraint only widens, so every existing row already satisfies it.

alter table models drop constraint models_role_check;

alter table models add constraint models_role_check
  check (role in ('entrant', 'reference', 'exhibition', 'shadow'));
