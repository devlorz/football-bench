-- The second scheduled prediction run is a Fill, not a Repair. A Repair is a
-- second chance at one Entrant's invalid output, which is a different thing
-- entirely, and the two shared a word in this column.
--
-- Databases created before the rename still allow 'repair', so the constraint
-- is replaced unconditionally rather than added. On a database built from
-- 0001_initial.sql the dropped and re-added constraints are identical, which
-- keeps both paths converging on the same schema.
--
-- No row rewrite: a pre-existing 'repair' row would mean a Fill ran under the
-- old vocabulary, and this migration should fail loudly rather than guess.

alter table attempts drop constraint attempts_trigger_check;

alter table attempts add constraint attempts_trigger_check
  check (trigger in ('main', 'fill', 'manual'));
