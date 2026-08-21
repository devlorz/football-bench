# Ticket: Ligue 1's history and xG land behind reviewed maps

**What to build:** the same shape as ticket 0036, for France — one prior Season
(2025-26) of French first- and second-division history and one of Understat xG, behind
two derived, human-reviewed identity maps. Eighteen clubs, not twenty, and nothing may
assume otherwise. Demoable: an `FL1` context renders its history, league table,
prior-Season points per game and xG. Source:
[spec 0024](../specs/0024-serie-a-and-ligue-1-open.md), stories 9–10, 12–13, 20–22.
Decisions:
[ADR-0049](../adr/0049-serie-a-and-ligue-1-open-the-bundesliga-waits-on-hands-not-money.md),
[ADR-0037](../adr/0037-a-new-competition-plays-the-v2-context-minus-availability.md).

**Blocked by:** 0033 (the captured `FL1` response), 0034 (the divisions and the check).
Independent of 0036 — the two leagues' curation can run in parallel.

**Status:** ready-for-agent

- [ ] The Understat league slug for `FL1` is listed, and the Understat →
      football-data.co.uk map is derived from the real feeds — both sets exactly
      eighteen, nothing left over, keyed by Competition.
- [ ] The football-data.org → football-data.co.uk map is derived from the captured
      response — eighteen against eighteen, nothing left over.
- [ ] Both maps are reviewed and approved by a person **before** the backfill runs, the
      review recorded with what it was asked to decide.
- [ ] `HISTORICAL_COMPETITION=FL1` backfills 2025-26 `F1` and `F2` history and the
      Understat xG, every response archived before it is read, and replayable.
- [ ] The xG join rate is read and recorded; a promoted club's prior Season renders from
      the second division the way the Championship does for `PL`.
- [ ] An `FL1` packet rendered from the backfilled record shows history, the league table
      and xG; the contamination test covers it both directions.
- [ ] `MATCH_PROMPTS.FL1`'s sha is re-pinned if the table's rendering moved, the
      documented once.
