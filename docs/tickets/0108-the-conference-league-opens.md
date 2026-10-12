# Ticket: The Conference League opens

**What to build:** `UECL` opens at its Gameweek 2 (Lock 2026-10-22T13:00Z) with every
section of ADR-0063's packet. That includes six Gameweeks only, its three reviewed maps,
its registry entry, and `match-uecl/2026-27-v1` pinned from a render read whole. It is
activated by the runbook's *Opening a club cup*. Its `MD1` (2026-10-15) is played before
activation and arrives as Locked history with its sheets.

Source: ADR-0063, spec 0028 stories 59, 61, 75–80.

**Blocked by:** 0106 (the runbook), 0103 and 0104.

**Hard deadline:** pinned and deployed by 2026-10-22T07:00Z. The fallback is Gameweek 3,
Lock 11-05T16:15Z.

**Status:** ready-for-agent

---

## What is already known

- `UECL`'s feed holds 108 league-phase matches over `MD1`–`MD6`, plus 258 qualifiers,
  which is the most of the three.
- Only 5 of its 36 clubs play in the five leagues. Its sides are the ones the record
  knows least about, and history and Head Coach lines carry the most weight here.
- Atalanta is in `UECL`. Its history shows no fixture between 09-20 and 10-12, and that is
  real.
- `UECL`'s `MD1` sheets do not exist yet. A 2025-26 `UECL` sheet sampled carried xG.
  Whether every `MD1` sheet of 2026-27 does is read after 10-15. ADR-0063 states that
  "at least one match with xG from Gameweek 2" holds for `UECL` once those sheets exist.
- The pre-flight is paid: eight calls, roughly $0.30, and asked for separately.
- **From 0103**: club results read one page a side, and `previousPage` is not followed.
  Check that every side has five competitive matches on its page. `FRIENDLIES` in
  `src/365scores/fetch-club-results.ts` holds only the names in `UCL`'s 2026-10-12
  archive. Check this cup's archive for friendlies under other names, and check again
  in January for winter-break tournaments.

## Acceptance criteria

- [ ] The three `UECL` maps are derived from the archive with nothing left over.
- [ ] After 10-15, all 18 `MD1` sheets are read and the count with xG is recorded here.
- [ ] A `UECL` Gameweek 2 render holds every section; `MATCH_PROMPTS.UECL` is pinned; every other pin unchanged.
- [ ] Production answers `UECL` with eight seats and its caveat; the boundary is recorded.
