# Spec 0006 — Fixtures, availability detail and the league table in the FPL context

**Status:** ready-for-agent
**Scope:** everything that must land after spec 0005 and before the FPL track's first Lock
for the context to carry the Gameweek's world state inside the same frozen Prompt Version,
`fpl/2026-27-v2`
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:** [ADR 0001–0021](../adr/),
especially [ADR 0018](../adr/0018-raw-signals-only-in-the-entrant-context.md) and
[ADR 0021](../adr/0021-fixtures-availability-detail-and-the-league-table-join-the-fpl-context-for-2026-27-v2.md)
**Siblings:** [spec 0005](./0005-player-performance-in-the-fpl-context.md) (the v2 this
extends; lands first) · [spec 0003](./0003-fpl-track.md) (the FPL track itself)

---

## Problem Statement

Spec 0005 lets an Entrant see who is producing, but not the world those players play in.
The context names no opponent, so a captaincy pick cannot weigh who a player faces or
whether he plays at home; it shows no schedule ahead, so a Chip is spent blind to the
Blank or Double Gameweek approaching; it compresses availability to one word, so a
Squad decision cannot tell a player 75% likely to start from one 25% likely; and it
carries no league table, so the strength of the club behind a Fixture is a guess from a
stale prior. Every one of these facts is already in the database — fetched, typed and
audited — and the context shows none of them.

## Solution

The context gains the Gameweek's world state, in three additions. A Fixtures section
lists the current Gameweek and the five after it as a raw schedule — home team, away
team, kickoff date — in which a Double or Blank Gameweek is a fact an Entrant reads off
the list, never an annotation. A league table summed from stored final results shows
each side's played, won, drawn, lost, goals and points in rule order, announcing the
date of the latest result it includes. Each pool line that has any carries FPL's
chance-of-playing percentage and raw news text. Nothing digested joins: no Fixture
Difficulty Rating, no strength or Elo rating, no fitness verdict. The additions ship
inside `fpl/2026-27-v2` — the constant spec 0005 introduces changes once, and the freeze
carries both specs' sections together.

---

## User Stories

### The schedule

1. As an Entrant, I want each of this Gameweek's Fixtures with its home side, away side
   and kickoff date, so that I can weigh opponent and venue when I pick a Team Sheet and
   captain.
2. As an Entrant, I want the same raw schedule for the five Gameweeks ahead, so that a
   Transfer or a Chip is a bet on the schedule I can actually see.
3. As an Entrant, I want a Double Gameweek to be visible as a club appearing twice in a
   Gameweek's list, so that I can time a Chip without being handed a recommendation.
4. As an Entrant, I want a Blank Gameweek to be visible as a club appearing nowhere in a
   Gameweek's list, so that I am not surprised by a Squad that cannot score.
5. As an Entrant, I want the schedule grouped by Gameweek in kickoff order, so that I can
   read six Gameweeks without untangling them myself.
6. As an Entrant near the season's end, I want the window to simply stop at the final
   Gameweek, so that a shorter horizon is a fact of the calendar rather than an error.

### The league table

7. As an Entrant, I want each side's played, won, drawn, lost, goals for, goals against
   and points, so that I can judge the strength behind a Fixture by my own reasoning.
8. As an Entrant, I want the table ordered by the competition's own rule — points, then
   goal difference, then goals scored — so that reading rank off the table is safe.
9. As an Entrant, I want the table to announce the date of the latest result it includes,
   so that its coverage is a statement I can weigh rather than an assumption.
10. As an Entrant in Gameweek 1, I want the context to state plainly that no results
    exist yet, so that an empty table is announced rather than silently missing.
11. As an Entrant, I want the table built only from the current Season's Premier League
    results, so that last year's form does not masquerade as this year's table.

### Availability detail

12. As an Entrant, I want each flagged player's chance of playing next round, so that I
    can price the difference between 75% doubtful and 25% doubtful myself.
13. As an Entrant, I want the raw news text behind a flag, so that "knee injury, expected
    back in March" and "suspended one match" stop being the same word.
14. As an Entrant, I want a player with no flag to carry no availability fields at all,
    so that the pool stays compact and absence keeps meaning "nothing to report".
15. As an Entrant, I want no digested availability verdict — no start probability of the
    context's own invention, no fitness rating — so that any forecast in my answer is
    mine.

### Fairness and audit

16. As an auditor, I want every Entrant of a Gameweek handed the identical context text,
    so that Paired Differences reflect Base Models rather than information asymmetry.
17. As an auditor, I want the extended context stored and hashed exactly as before, so
    that "it saw only this" stays verifiable.
18. As an auditor, I want everything recorded under earlier hashes untouched, so that a
    Prompt Version remains a frozen pair.
19. As an operator, I want the transfer-pricing readback to keep working on a body that
    carries the new sections and pool fields, so that an action is still priced from the
    text on record.
20. As an operator, I want the additions to read only from tables the fetches already
    fill, so that no new endpoint, migration or backfill enters the write path.
21. As an analyst, I want the per-call token cost read from recorded attempts after the
    first Gameweek, so that the cost of the additions is a fact rather than a guess.

### Proving it

22. As a reviewer, I want the table verified against a hand-computed one, including a
    tie broken by goal difference and one broken by goals scored, so that rule ordering
    is checked rather than described.
23. As a reviewer, I want a scripted schedule containing a Double and a Blank verified to
    render as repetition and absence within the six-Gameweek window, so that the raw-list
    promise is proven.
24. As a reviewer, I want a flagged player verified to carry percentage and news, an
    unflagged player verified to carry neither, and a flagged player with no percentage
    (FPL sends null) verified to carry news alone, so that omission stays lossless.
25. As a reviewer, I want the Gameweek 1 case verified end to end — no results, an
    announced empty table, a full schedule — so that the season opener is a first-class
    path, not an edge case.

---

## Implementation Decisions

### Nothing new is fetched, nothing new is stored

All three additions read what the existing fetches already write: the Fixtures section
from the stored fixture rows, availability from the pre-Lock player snapshot's percentage
and news columns, the table from the stored final results the Match track's fetch
maintains. There is no new endpoint, no migration and no backfill. The table's read is
this track's one deliberate cross-track dependency, accepted by ADR 0021; the announced
coverage date is what keeps a stale table honest instead of silent.

### The context builder stays pure

As with spec 0005's stat windows, the schedule and the table arrive as inputs computed by
the opening flow; the builder renders what it is handed. The Fixtures section and the
league table sit between the Manager State and the pool. Availability rides the pool
lines as two optional fields, omitted when empty, under v2's zero-omission convention;
the legend defines them once.

### The table is summed, announced, and current-Season only

Summation of stored final results — played, won, drawn, lost, goals for and against,
points — ordered by points, then goal difference, then goals scored, matching the
summation the Match track already performs for its own context. Only current-Season
Premier League results contribute. A side appears once it has a stored result; before any
result exists the table is replaced by a plain announcement, Gameweek 1's normal case.
The coverage line names the date of the latest included result; no mapping of results
into Gameweeks is attempted (ADR 0021).

### The schedule is raw and six Gameweeks wide

One line per Fixture — home side, away side, kickoff date — grouped by Gameweek from the
current one through the fifth ahead, truncated by the calendar at season's end. No
difficulty marking, no venue elaboration, no Double or Blank annotation: repetition and
absence carry that information themselves.

### The readback tolerates the new fields

The stored context remains the priced universe of legal transfers. The pool readback
accepts lines carrying availability fields while continuing to validate exactly the
fields it prices from, the same tolerance spec 0005 demands for stat fields.

### The Prompt Version does not change again

Spec 0005 moves the constant to `fpl/2026-27-v2`; this spec adds sections to the same
frozen text before its first use. Nothing recorded under any earlier hash is touched. If
the first Lock arrives before this spec lands, the additions must ship as a v3 instead —
a frozen pair is never edited after use.

---

## Testing Decisions

A good test asserts external behaviour at an existing seam — the stored context text, the
action a stored context prices — never the private steps that produced them. No new seam
is introduced; spec 0005's three are enough, and the fetch seam is not needed at all:

- **The pure context builder**, called directly with state, pool, stat windows, schedule
  and table: rendering of the Fixtures section including a Double and a Blank, the table
  with hand-computed rule-order ties, the coverage announcement, the empty-table
  announcement, availability fields present and omitted, and the readback round-trip on
  a body carrying everything. Prior art: the FPL context and pool-fixture tests.
- **A real Postgres**, for the opening flow's reads: the six-Gameweek fixture window, the
  summation from stored results, and the current-Season-only boundary. Prior art: the
  schema and opening-flow tests.
- **The highest seam proves the whole:** `openFplGameweek` driven through HTTP and
  Postgres, asserting on the stored, hashed context body carrying spec 0005's windows and
  this spec's sections together. Prior art: spec 0005's converging test.

## Out of Scope

- **Any digested signal** — Fixture Difficulty Rating, strength ratings, Elo, invented
  start probabilities. Excluded by ADR 0018 and ADR 0021, permanently, not deferred.
- **New fetches, migrations or backfills.** Every input already flows.
- **Mapping results into Gameweeks** for the table's cutoff (ADR 0021).
- **The Match track's context**, and any change to the rules reducer, the Repair loop or
  the Lock.
- **Kickoff times beyond the date.** The schedule informs selection, not scheduling.

## Further Notes

**Sequencing is the one hard constraint.** This spec edits the same builder and freezes
into the same Prompt Version as spec 0005; it lands after spec 0005 and before the first
Lock, or not as v2 at all.

**Document numbering was checked at merge time.** The 0016/0017 ADR collisions were
renumbered on main while this spec was drafted; its ADR took 0021, the next free number
after that renumbering, and every reference here follows the new numbering.

**Cost is measured, not estimated.** Roughly sixty schedule lines, twenty table lines and
news text on the few dozen flagged players — small against spec 0005's addition. Spec
0003's rule stands: read the real figure from recorded attempts after the first Gameweek.
