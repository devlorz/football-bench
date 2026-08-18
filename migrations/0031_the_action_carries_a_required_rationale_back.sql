-- The Match track has required a `rationale` per Prediction since spec 0001;
-- the FPL action's schema now requires one too (ADR-0041). Stored beside the
-- Gameweek's record, nullable: null only for a Rolled Over Gameweek, which
-- reached no legal action to explain -- a refused attempt's Rationale already
-- lives verbatim in `attempts.raw_response`.
alter table manager_states
  add column rationale text;
