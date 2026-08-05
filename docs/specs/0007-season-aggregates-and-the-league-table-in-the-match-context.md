# Spec 0007 — Season aggregates and the league table in the match context

**Status:** ready-for-agent
**Scope:** everything that must land before the 2026/27 Season's first Lock for the match
context to carry season-to-date team performance and the full league table inside the
same frozen Prompt Version, `match/2026-27-v2`
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:** [ADR 0001–0022](../adr/),
especially [ADR 0018](../adr/0018-raw-signals-only-in-the-entrant-context.md) and
[ADR 0022](../adr/0022-season-aggregates-and-the-league-table-join-the-match-context-for-2026-27-v2.md)
**Siblings:** [spec 0004](./0004-shots-and-xg-in-the-match-context.md) (the v2 this
extends; landed) · [spec 0006](./0006-fixtures-availability-detail-and-the-league-table-in-the-fpl-context.md)
(the FPL track's league-table precedent)

---

## Problem Statement

Spec 0004 gave every form line its shots and xG, but a form line shows five matches of a
~38-match Season: an Entrant can see that a team was dominant last Tuesday and cannot
see that it has been dominant since August. The season-long signal is not derivable from
the context — the other thirty-three matches are simply not there — so the one place
sustained over- or under-performance would show is invisible, and a team riding luck to
a good record is indistinguishable from a team earning one. Meanwhile each team's league
standing arrives as a bare ordinal: the gap above, the gap below, and the motivation
they imply — a title race, a relegation scrap, mid-table safety — are guesses from a
Base Model's stale prior. Every number needed to fix both is already stored and already
loaded on every prediction call; the context simply never shows it.

## Solution

Two additions, both confined to the pure context builder that renders historical data.
The three existing record lines — Current-Season overall, home split, away split — each
gain shots, shots on target and xG, for and against, summed over the same
current-Season Premier League matches the line already counts; a sum whose coverage is
incomplete announces it, and a stat with no covered matches says it is unavailable. The
two teams' bare position ordinals are replaced by the full Premier League table —
played, won, drawn, lost, goals for and against, points, in rule order — announcing the
date of the latest result it includes, with Gameweek 1's empty table a plain
announcement. Nothing is fetched, nothing is stored, no query changes; the additions
ship inside `match/2026-27-v2` before its first use, exactly as spec 0006's additions
shipped inside `fpl/2026-27-v2`.

---

## User Stories

### Season aggregates

1. As an Entrant, I want each team's season-to-date shots, shots on target and xG, for
   and against, so that sustained performance is visible beyond the five matches whose
   lines I am shown.
2. As an Entrant, I want the aggregates on the overall record line, so that a team's
   underlying season sits beside the W/D/L record it produced.
3. As an Entrant, I want the same aggregates on the home and away split lines, so that
   a venue effect in underlying performance is mine to find, not mine to guess.
4. As an Entrant, I want every pair ordered this-team-first, so that the aggregates
   count from the same end as the form lines and records they sit beside.
5. As an Entrant, I want the aggregates summed and never averaged, so that dividing by
   matches played remains my reasoning to do.
6. As an Entrant, I want a sum built from fewer matches than the line counts to
   announce its coverage, so that I can weigh an incomplete number instead of
   misreading it as a complete one.
7. As an Entrant, I want a stat with no covered matches to say it is unavailable, so
   that absence is a statement and never a silent zero.
8. As an Entrant, I want no coverage announcement when coverage is complete, so that
   the common case stays compact and an announcement always means something.
9. As an Entrant, I want the aggregates built only from current-Season Premier League
   matches, so that a promoted side's numbers are as complete as an established side's
   from its first Premier League match.
10. As an Entrant, I want a team with no current-Season matches to keep its plain
    empty-record text with no aggregates, so that Gameweek 1 reads as the empty case it
    is.

### The league table

11. As an Entrant, I want every side's played, won, drawn, lost, goals for, goals
    against and points, so that the strength behind both teams — and the gaps around
    them — is mine to judge.
12. As an Entrant, I want the table ordered by the competition's own rule — points,
    then goal difference, then goals scored — so that reading rank off the table is
    safe.
13. As an Entrant, I want the table placed before the two team sections, so that I see
    the league's shape before I zoom into the Fixture's two sides.
14. As an Entrant, I want the table to announce the date of the latest result it
    includes, so that its coverage is a statement I can weigh rather than an
    assumption.
15. As an Entrant in Gameweek 1, I want the context to state plainly that no results
    exist yet, so that an empty table is announced rather than silently missing.
16. As an Entrant, I want the old bare position line gone once the table is visible, so
    that the context never pre-computes what it already shows me (ADR 0022).
17. As an Entrant, I want the prior-Season final position line kept, so that a standing
    whose table is not shown remains stated.
18. As an Entrant, I want the table readable without a legend, so that a weaker Base
    Model in the roster cannot misalign a column of bare numbers.

### Fairness and audit

19. As an auditor, I want every Entrant of a Fixture handed the identical context text,
    stored and hashed exactly as before, so that "it saw only this" stays verifiable.
20. As an auditor, I want nothing recorded under any earlier hash touched, so that a
    Prompt Version remains a frozen pair.
21. As an operator, I want the additions to read only from data the loader already
    loads, so that no query, migration or fetch enters the change.
22. As an operator, I want pre-flight re-run against the extended context before the
    first Lock, so that the denser context cannot surprise an Entrant into malformed
    output on opening day.
23. As an analyst, I want no digested signal anywhere in the additions — no strength
    rating, no Elo, no forecast — so that ADR 0018's line holds and Paired Differences
    keep measuring Base Models.
24. As an analyst, I want the per-call token cost read from recorded attempts after the
    first Gameweek, so that the cost of the additions is a fact rather than a guess.

### Proving it

25. As a reviewer, I want the aggregates verified against hand-computed sums, so that
    the arithmetic is checked rather than described.
26. As a reviewer, I want a team with one match missing its xG row verified to announce
    coverage, and a team with no xG rows verified to read unavailable, so that honesty
    under gaps is proven.
27. As a reviewer, I want the table verified against a hand-computed one, including a
    tie broken by goal difference and one broken by goals scored, so that rule ordering
    is asserted on the rendered string for the first time.
28. As a reviewer, I want the Gameweek 1 case verified end to end — announced empty
    table, plain empty records, no position line anywhere — so that the season opener
    is a first-class path, not an edge case.

---

## Implementation Decisions

### The admitting line is ADR 0022's

A summation the Entrant cannot derive from the context it is shown adds raw information
and is admitted; pre-computing anything the context already shows is forbidden; a
forecast of any kind is forbidden permanently under ADR 0018. This supersedes ADR
0019's season-aggregate sentence and is why the position ordinal must go the day the
table arrives.

### Aggregates ride the existing record lines

No new lines. The three record lines extend, illustratively (exact wording fixed at
freeze time; from the grilling session):

```
Current-Season overall: 10 played, 6W 2D 2L, GF 18, GA 9, shots 152-98, on target 61-35, xG 16.40-8.20.
Current-Season home split: 5 played, 4W 1D 0L, GF 12, GA 3, shots 88-41, on target 37-14, xG 9.80-3.10 (over 4 of 5 matches).
```

Coverage — `(over N of M matches)` — appears per stat pair only when that line's
matches include some without the stat; a pair with no covered matches renders as
`unavailable`, the same explicit-absence rule the form lines use. The empty-record text
is unchanged and carries no aggregates. Sums are computed at render time from the
per-match rows the builder already receives; no aggregate is ever stored.

### The table replaces the ordinal, and sits first

The current-Season position line is removed from both team sections. The table renders
once per context, between the context header and the first team section, one verbose
row per side in rule order — points, then goal difference, then goals scored, the
ordering the builder's existing table computation already implements — with no legend:

```
Premier League table (results through 2026-11-08):
1. Arsenal — Pld 10, W 7, D 2, L 1, GF 24, GA 8, Pts 23
```

Before any current-Season result exists, the section is a single announcement line —
Gameweek 1's normal case. The prior-Season final position line stays: the prior
season's table is not shown, so the ordinal remains underivable. Goal difference is not
a column — it is derivable from the goals columns shown.

### Current-Season Premier League only

Both additions sum only the matches the record lines already count: current Season,
Premier League division. Championship history contributes to neither; it remains the
province of the prior-season line and the early-season form lines, whose explicit
xG-unavailable gaps (ADR 0019) are untouched.

### Nothing new is fetched, nothing new is stored

The context data loader already loads every historical match and every xG row before
the deadline, and the builder already joins them. The change is confined to the
historical-context builder and its tests. No migration, no query change, no new source,
no change to the FPL player section or the prompt envelope.

### The Prompt Version does not change

`match/2026-27-v2` is frozen but unused: no 2026-27 context has been stored under it.
Per the rule spec 0006 states, a frozen pair may be edited until its first use and
never after. This spec lands before the first Lock, followed by a pre-flight re-run —
or it ships as `match/2026-27-v3`, not as an edit.

---

## Testing Decisions

A good test asserts external behaviour at an existing seam — here, the one seam this
change touches: **the pure context builder**, data in, string out, asserted exactly.
Prior art: the existing historical-context tests, which assert emitted strings down to
the character. The fetch seam and the Postgres seam are deliberately not used: no fetch
and no query changes in this spec, so there is nothing for them to prove.

- Hand-computed aggregate sums on all three record lines, including the
  missing-xG-row case (coverage announced) and the no-xG case (unavailable).
- A hand-computed table with both tie-breaks exercised — one broken by goal
  difference, one by goals scored — and the coverage date asserted.
- The Gameweek 1 empty case as a first-class path: announced empty table, plain empty
  records, and the position line's absence asserted.

## Out of Scope

- **Per-player performance in the match context.** Deferred, not rejected: it depends
  on spec 0005's widened stats table, and this Season's record is the evidence that
  will justify or kill it for a 2027-28 version.
- **Any digested signal** — strength ratings, Elo, difficulty markings, forecasts.
  Excluded permanently by ADR 0018.
- **A coverage threshold** hiding incomplete sums — rejected by ADR 0022; announcement
  replaces judgment.
- **A Championship table**, aggregates over Championship matches, and Championship xG
  from any source.
- **Head-to-head enrichment** — the section stays score-only per spec 0004.
- **Any change to fetches, queries, migrations, the FPL player section, the prompt
  envelope, Lock enforcement or Fill semantics.**

## Further Notes

**The deadline is the first Lock, mid-August 2026.** The same constraint spec 0004
shipped under; the scope here is deliberately a fraction of 0004's — one builder and
its tests — to fit beside the FPL track's in-flight 0005/0006 work without competing
for the pre-flight window.

**Cost is measured, not estimated.** The projected addition is ~600–700 input tokens
per call (~2–3% of what spec 0005 added to the FPL track), roughly $8–10 across the
nine-Entrant roster for the Season at spec 0005's blended rate, partly offset by the
two removed position lines. Spec 0003's rule stands: read the real figure from recorded
attempts after the first Gameweek.

**Document numbering must be checked at merge time.** Spec and ADR numbers here (0007,
0022) follow the tree this was drafted in; parallel work may claim them first, and the
0016/0017 collision is the precedent for renumbering before merge.

**This work belongs on its own branch.** The tree it was drafted in is dedicated to the
FPL track's 0005/0006 implementation; the match-track change should land as a separate
review.
