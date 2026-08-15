-- The dashboard filters every Season-scoped read by Competition beside the
-- Season (ADR-0035), which means it now names `attempts.competition` -- and
-- that column is not in the grant.
--
-- `attempts` is the one table `dashboard_read` holds column by column rather
-- than whole (migration 0021): the row carries `raw_response`, a provider's
-- answer verbatim, which an internet-facing select-only role has no business
-- reading. The narrowing is the point and it stays; `competition` simply
-- belongs on the granted side of it, beside `season` and `gw`, being the third
-- part of the same key and no more secret than either.
--
-- A column-level grant is replaced rather than added to: `grant select (a, b)`
-- is additive per column, so naming the full list again is both the addition
-- and the statement of what the role may read, in one place.
grant select (
  model_id, competition, season, gw, track, attempt_no, error_kind, attempted_at
) on attempts to dashboard_read;
