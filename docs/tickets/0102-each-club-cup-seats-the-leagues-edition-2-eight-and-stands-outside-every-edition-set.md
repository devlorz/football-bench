# Ticket: Each club cup seats the leagues' Edition 2 eight and stands outside every Edition set

**What to build:**
- `matchRosterOf` answers the eight of the leagues' Edition 2 for `UCL`, `UEL` and `UECL`
  in Edition 1. These are the same entrant objects, in the same order, and the size is
  eight.
- `roster:enter` would enter those eight under a cup's Prompt Version once one exists.
- Each cup carries ADR-0063's frozen roster caveat with its name, wherever its ranking is
  shown.
- Until ticket 0110, the dashboard keeps the cups out of the leagues' Edition set, so `/overall` still sums
  the five leagues' Edition 2 and never shows "mixed Editions".
- Each cup appears in the switcher under `UCL`, `UEL` or `UECL`.
- Every existing Edition 1 (`PL`, `PD`, `SA`, `BL1`, `FL1`, `UNL`) answers exactly what it
  answers today.

Source: ADR-0063 *The roster* and its two-point amendment, spec 0028 stories 64–70.

Decisions it must not bend:
- ADR-0061 rule 4: the cutoff is ADR-0063's date, and all eight were listed before it.
- Ticket 0081/0098's shape: sizes derived, never a second written list of seats.
- ADR-0060: `UNL`'s seven and its caveat.

**Blocked by:** None — can start immediately. **On the `UCL` critical path.** The
dashboard routes for a cup appear only once ticket 0105 adds its `MATCH_PROMPTS` entry,
and the caveat must exist by then.

**Status:** ready-for-agent

---

## What is already known

- **Edition 1 today can only take seats away.** It is the Season Roster less
  `MATCH_EXCLUSIONS` plus `MATCH_SUBSTITUTIONS`, with no seats added. Claude Opus 5.5 is
  an addition, so Edition 1 must be able to name an Edition roster outright: a
  per-Competition Edition 1 entry beside the existing Edition 2 map. The three cups name
  `LEAGUE_EDITION_2`, and a Competition without one derives as today.
- **The dashboard's league test is "has no roster caveat."** A cup with no caveat would
  join the leagues' set at Edition 1 beside Edition 2, and the overall view would return
  `mixed-editions`. Until ticket 0110, the caveats are what keep the cups out, and the
  league test needs no change here. Ticket 0110 replaces that test with a roster rule,
  which is why the caveat sentence claims nothing about any sum.
- The frozen caveat, from ADR-0063, with `{cup}` replaced by the competition name:
  "The {cup} seats the eight Base Models of the leagues' Edition 2, from its own first
  predicted Gameweek. This is the {cup}'s Edition 1, and its ranking here is its own
  (ADR-0063)." It is a constant per Competition and is never
  assembled at read time (the frozen-text-is-a-constant rule).
- The pre-flight's expected count reads the roster of record, so it answers eight for a
  cup with no new code. A test proves it.

## Acceptance criteria

- [ ] `matchRosterOf("UCL"|"UEL"|"UECL", 1)` is the eight in Edition 2's order, identical objects; `matchRosterSizeOf` is 8.
- [ ] Every existing Competition's Edition 1 and Edition 2 roster is unchanged, entry for entry.
- [ ] `ROSTER_CAVEATS` holds the three frozen sentences; the read API serves each as `rosterCaveat`.
- [ ] The dashboard treats the three cups as not leagues; the leagues' set is still the five, and `/overall` renders a total.
- [ ] The switcher labels read `UCL`, `UEL`, `UECL`.
- [ ] The touched roster and dashboard suites pass.
