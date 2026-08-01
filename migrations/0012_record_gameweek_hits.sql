-- Points owed for the paid Transfers of one Gameweek, deducted when that same
-- Gameweek scores. Manager State is the system of record for it: the reducer
-- is the only place that knows how many Transfers an action made and how many
-- Free Transfers were banked to pay for them, and neither the action nor the
-- Transfer count is stored anywhere else. Deriving Hits later by differencing
-- two Gameweeks' Squads would re-decide a settled question from weaker
-- evidence, and would need the earlier row that the reducer is forbidden to
-- read.
--
-- A column rather than a key inside the `squad` JSONB: that envelope is pinned
-- by ADR-0017 to the active Squad and the Free Hit stash, and a Hit is not a
-- fact about the Squad. This corrects spec 0003 §Storage, which said
-- `manager_states` needed no migration — true of everything it enumerated, but
-- it did not enumerate Hits.
--
-- `default 0` so the existing immutability trigger and every prior row stay
-- valid without a backfill: no Gameweek has been played yet.
alter table manager_states
  add column hits integer not null default 0 check (hits >= 0);
