-- FPL's bootstrap names each club's known takers -- `penalties_order`,
-- `direct_freekicks_order`, `corners_and_indirect_freekicks_order` -- on every
-- player, populated only for the roughly 60-80 of ~590 the source lists a
-- taker for. That sparseness is the source's own shape: FPL lists known
-- takers and stays silent otherwise (ADR-0041).
--
-- Nullable, following the club-code precedent (migration 0029) -- but 0029's
-- refusal to backfill does not bind here. That refusal was about legitimacy:
-- there was no second record to recover a code from, so inventing one would
-- have been derivation. Here there is a second record -- the archive holds
-- every bootstrap a Lock has read -- so filling rows written before this
-- migration would be reading the record, not inventing it (ADR-0041). It is
-- still not done now because no reader exists yet, and a backfill without a
-- reader is rows written to gather dust: a different reason, arrived at once
-- the disqualifying one no longer applies.
alter table fpl_players
  add column penalties_order integer,
  add column direct_freekicks_order integer,
  add column corners_and_indirect_freekicks_order integer;
