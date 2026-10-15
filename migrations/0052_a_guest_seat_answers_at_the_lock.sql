-- ADR-0064: a Guest Seat is asked live at every Lock after its row exists and
-- is ranked apart from the roster. `role` is what every reader already tells
-- a competitor apart by, so admitting the value here is the whole schema
-- change; ticket 0114 widens the scheduled run and the pre-flight's
-- single-model door and decides every other `role` filter on purpose.
--
-- No row rewrite and no guard, on the same grounds as migration 0019: the
-- constraint only widens, so every existing row already satisfies it.

alter table models drop constraint models_role_check;

alter table models add constraint models_role_check
  check (role in ('entrant', 'reference', 'exhibition', 'shadow', 'guest'));
