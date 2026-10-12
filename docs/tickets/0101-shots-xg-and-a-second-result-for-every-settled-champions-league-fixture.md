# Ticket: Shots, xG and a second result for every settled Champions League Fixture

**What to build:** with `UCL` listed, the daily fetch reads 365Scores' sheet for every
settled `UCL` Fixture that has no complete row, and stores each side's shots, shots on
target and xG. That includes `MD1`'s 18 Fixtures, settled before the Competition was
listed. 365Scores' score is compared with UEFA's as the second source of results. Every
one of the 36 sides resolves through a reviewed map from 365Scores' spelling to UEFA's
`internationalName`, and a side the map lacks is refused by name. The fetch also knows
365Scores' ids for `UEL` (573) and `UECL` (7685). Their name maps are tickets 0107 and
0108. `UCL`'s registry entry names `365scores` for its stats.

Source: ADR-0063, ADR-0058, spec 0028 stories 21–26.

Decisions it must not bend:
- ADR-0058: a hole is a sheet with no xG, read again until filled.
- ADR-0056: results have a second source.

**Blocked by:** 0100. **On the `UCL` critical path.**

**Status:** ready-for-agent

---

## What is already known

- The fetch already selects every settled, kicked-off Fixture of the Season without a
  complete row, so adopted history is read with no change to that selection. This ticket
  pins that behaviour with a test.
- `UCL` `MD1` read 2026-10-12: 18 of 18 sheets carry "Expected Goals" for both sides, and
  `UEL` 18 of 18. This includes clubs whose domestic leagues have none (Slovan, Slavia,
  Shakhtar, Sabah).
- **17 of `UCL`'s 36 365Scores spellings differ from UEFA's**: "AS Roma", "Atletico
  Madrid", "Bayern Munich", "Bodo Glimt", "Borussia Dortmund", "FC Barcelona", "FC Porto",
  "Fenerbahçe SK", "Inter Milan", "LASK Linz", "Manchester City", "Manchester United",
  "PSG", "PSV Eindhoven", "RB Leipzig", "Shakhtar Donetsk", "Slovan Bratislava". The map
  is derived from archived responses by a test, both sides the same size, nothing left
  over, so a reviewer checks a diff.
- The comments that assume fifty-four sides (`UNL`) become per-Competition. A cup's sides
  are still read off its stored Fixtures.

## Acceptance criteria

- [ ] Over archived responses, the first fetch after `UCL`'s schedule lands stores 18 `MD1` rows with both sides' xG and shots.
- [ ] A 365Scores side not in `UCL`'s map is refused by name; no row is stored under an unmapped name.
- [ ] A sheet with shots and no xG is stored as a hole and read again on the next fetch.
- [ ] A score disagreement with UEFA surfaces as it does for `UNL`.
- [ ] The `UCL` map test derives 36 pairs from the archive with nothing left over.
- [ ] `UNL`'s stats tests pass unchanged.
