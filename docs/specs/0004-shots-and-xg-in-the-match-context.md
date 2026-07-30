# Spec 0004 — Shots and xG in the match context

**Status:** ready-for-agent
**Scope:** everything that must land before the 2026/27 Season's first Lock for the context
to carry per-match shots and xG under a new frozen Prompt Version
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:** [ADR 0001–0017](../adr/),
especially [ADR 0016](../adr/0016-raw-signals-only-in-the-entrant-context.md) and
[ADR 0017](../adr/0017-per-match-shots-and-xg-join-the-context-for-2026-27-v2.md)

---

## Problem Statement

The context hands every Entrant a Fixture's recent history as scorelines and nothing else.
Two teams can arrive at the same 1-0 by opposite routes — one dominant and wasteful, one
lucky and under siege — and the context cannot tell them apart, so an Entrant reasoning
from it cannot either. The strongest raw signals for separating performance from luck are
shot counts and per-match xG, and the benchmark currently discards both: the
football-data.co.uk CSVs it already downloads and archives every day carry shots and shots
on target in columns the parser ignores, and per-match xG is freely fetchable from
Understat with a reference implementation already sitting in this repository's docs.

The window to fix this is closing. A Prompt Version is frozen for a whole Season, and the
2026/27 Season's first Gameweek locks in mid-August. Whatever the context does not carry by
then, it cannot carry until August 2027.

## Solution

Before the first Lock, the fetch keeps what it already downloads and adds one new source,
and the context spends both on the one section where recent performance lives: the
last-five form lines.

The football-data parser stops discarding shots and shots on target, for both the Premier
League and the Championship. A new Understat fetcher — ported from the reference
implementation in the docs — pulls per-match xG for the Premier League, two seasons deep:
the prior season once at setup (the five-match form window crosses the season boundary
until roughly Gameweek 6), the current season through the daily fetch. Every form line then
reads like `W 2-1 v Chelsea (H) — shots 15-8, on target 7-3, xG 2.10-0.85`, and a line
whose match has no xG says so explicitly instead of pretending the number does not exist.

Everything else about the context is deliberately unchanged: no season aggregates, no
head-to-head enrichment, and — per ADR 0016 — no digested forecasts of any kind. The
change ships as a new frozen pair, `match/2026-27-v2`, with every Entrant re-pointed at it
and pre-flight re-run before the Season starts.

Understat is scraped from undocumented endpoints and will sometimes fail. When it does, the
context builder degrades the affected lines to an explicit "xG unavailable" and the run
carries on, loudly: an enrichment source is never allowed to cost a Gameweek of
Predictions.

---

## User Stories

### Keeping what is already downloaded

1. As an operator, I want shots and shots on target parsed out of the football-data.co.uk
   CSVs the daily fetch already downloads, so that the richest free performance signal
   stops being thrown away at the parser.
2. As an operator, I want those columns parsed for both the Premier League and the
   Championship, so that newly promoted sides carry the same baseline signal as everyone
   else.
3. As an operator, I want a CSV row whose shot columns are absent or blank to load with
   those fields empty rather than fail validation, so that older seasons without shot data
   remain loadable.
4. As an operator, I want a CSV row whose shot columns are present but malformed to fail
   validation naming the offending row and field, so that silent corruption cannot enter
   the record.
5. As an auditor, I want the raw CSVs archived byte-for-byte exactly as before, so that
   every shot count in a context can be traced back to the bytes it came from.

### Fetching xG

6. As an operator, I want per-match xG for finished Premier League matches fetched from
   Understat through the same injectable outbound-HTTP seam as every other source, so that
   the new source is testable and replayable like the old ones.
7. As an operator, I want the current season's xG refreshed by the daily fetch, so that
   form lines stay current without me remembering to run anything.
8. As an operator, I want a one-off ingest of the prior season's xG, so that the form
   window that crosses the season boundary in the opening Gameweeks is covered.
9. As an auditor, I want every raw Understat response archived exactly as received, so that
   xG figures are as traceable as every other number in the benchmark.
10. As an operator, I want an Understat response with an unexpected shape to be archived,
    then fail validation at the boundary naming every offending field, and store no derived
    rows, so that a format change on their side cannot corrupt the record.
11. As an operator, I want Understat team names resolved to the benchmark's team names
    through an explicit alias mapping that fails loudly on an unknown name, so that a
    rename on their side surfaces as an error and not as a silently xG-less team.
12. As an operator, I want the Understat fetch rate-limited and its results stored, so that
    the benchmark is a polite scraper and never re-fetches what it already has.

### Surviving the new source's failures

13. As an operator, I want a failed Understat fetch to leave the daily fetch and the
    prediction run able to proceed, so that an enrichment source can never cost a Gameweek
    of Predictions that cannot be back-filled.
14. As an operator, I want every degraded run to say loudly that xG was missing and why, so
    that I find out the day it happens and not from a half-empty column at season's end.
15. As an operator, I want the football-data staleness guard to keep blocking as it does
    today, so that the skeleton of the context — results and form — still cannot silently
    go stale.

### What the Entrant reads

16. As an Entrant, I want each of my last-five form lines to carry both sides' shots, shots
    on target, and xG for that match, so that I can tell a flattering scoreline from a
    dominant performance.
17. As an Entrant, I want a form line whose match has no xG to say so explicitly, so that I
    can weigh a missing number instead of misreading it as zero.
18. As an Entrant, I want the numbers per match and never pre-averaged, so that finding the
    pattern in five data points is my reasoning to do, not the context builder's.
19. As an Entrant, I want the head-to-head section unchanged and score-only, so that my
    attention is spent where the signal is.
20. As an analyst, I want every team's section to have the same shape — shots always
    present, xG present where it exists and explicitly absent where it does not — so that
    a promoted side's section differs from an established side's only in the gaps the data
    actually has.
21. As an analyst, I want no market odds, no Elo, no strength ratings and no Poisson
    lambdas anywhere in the context, so that Entrants are separated by their reasoning and
    not by who parrots the same digested forecast.

### Freezing the new pair

22. As an operator, I want the enriched context to ship as a new frozen Prompt Version,
    `match/2026-27-v2`, with its own hash, so that a Prompt Version remains an immutable
    pair and rehearsal data recorded under v1's hash stays attributable to v1.
23. As an operator, I want every Entrant re-pointed at the new Prompt Version before the
    Season's first Lock, so that the Season is run entirely on one pair.
24. As an operator, I want pre-flight re-run against the enriched context before going
    live, so that a context twice the density cannot surprise an Entrant into malformed
    output on opening day.
25. As an auditor, I want contexts stored and hashed under the new version exactly as under
    the old, so that a sceptic can reconstruct what every Entrant knew, byte for byte.
26. As an analyst, I want the stored context reused verbatim by Fill runs as it is today,
    so that every Entrant on a Fixture reads identical bytes no matter when it answered.

## Implementation Decisions

### Extend the existing verticals, add one new one

The football-data change is a widening of the existing fetch vertical: same download, same
archive, same delete-and-insert load, more columns parsed. The Understat fetcher is a new
source module shaped like the existing ones — injectable HTTP, archive-then-validate,
boundary errors that name fields — and wired into the daily fetch beside them. The context
change is confined to the historical-context builder and the loader that feeds it; the
prompt envelope, the FPL player section, storage and Fill behaviour do not change shape.

### Schema

The historical-matches table gains four nullable columns: home and away shots, home and
away shots on target. Absent means the source had no data; the loader never invents zeros.
Per-match xG lands in a new table keyed by season and the Understat match id, carrying
kick-off time, both team names as Understat spells them, and both xG values. It is joined
to historical matches at context-build time by date and alias-resolved team names — xG rows
are Premier League only and there is no foreign key to historical matches, because a
missing xG row is a legitimate state, not an integrity error.

### The Understat boundary

The fetcher uses Understat's internal JSON endpoints with the headers the reference
implementation documents as required, falling back is out of scope. xG arrives as strings
and is parsed to numbers at the boundary; matches without an xG field (not yet played) are
skipped, not stored as zero. Team-name aliases live beside the existing name-resolution
machinery as a third mapping; an unmapped name is a validation error, never a silent skip.

### Degrade, don't block — but only for xG

A failed or invalid Understat fetch logs the failure, archives whatever arrived, and leaves
the stored xG as it was. Context building treats every absent xG row identically — whether
promoted-side gap, early-season gap, or outage — by emitting the explicit unavailable
marker on that line. The football-data staleness guard is untouched and remains blocking.

### The form line

Decided format, from the grilling session (illustrative, exact wording fixed at freeze
time):

```
W 2-1 v Chelsea (H) — shots 15-8, on target 7-3, xG 2.10-0.85
L 0-1 v Brentford (A) — shots 19-6, on target 8-2, xG unavailable
```

Shots always present when the source had them; xG present or explicitly unavailable; the
two sides' numbers always ordered this-team-first to match the existing line convention.

### Two seasons of xG, no more

Prior season fetched once at setup; current season through the daily fetch. Deeper history
has nowhere to appear (the head-to-head section is score-only) and is not fetched.

### Version bump

The prompt-version constant moves to `match/2026-27-v2` with a recomputed hash, every
Entrant row is updated to the new pair, and pre-flight is re-run. The v1 constant and its
rehearsal artifacts are left intact in the record.

## Testing Decisions

Three seams, all existing, agreed with the operator:

1. **The outbound-HTTP seam.** The Understat fetcher and the widened CSV parser are tested
   by injecting canned or archived responses through the same fetcher seam every other
   source uses: a CSV with shot columns loads them, a CSV without them loads nulls, a
   malformed row names itself; an Understat JSON body yields xG rows, a reshaped body
   fails at the boundary, an HTTP failure leaves the store untouched and the run alive.
   No test touches the network.
2. **The pure context-builder seam.** Data in, string out. Given matches with shots and
   xG, the form lines carry them in the decided format; given a match with no xG row, the
   line says unavailable; aggregates and head-to-head stay absent. Tested exactly like the
   existing historical-context builder tests, down to asserting on the emitted strings.
3. **The real-Postgres schema seam.** Migrations build the widened table and the new xG
   table against a real Postgres; nullability and keys are verified by the same
   migration-test pattern the schema already has.

A good test here asserts external behaviour only: the bytes a fetch stores, the string a
builder emits, the constraint a database enforces. No test reaches into parser internals,
mock call counts, or intermediate data shapes. Prior art: the existing fetch tests
(replayed archived responses), the existing context-builder tests (exact string
assertions), and the migration tests (real database, real constraints).

## Out of Scope

- **The `reference-odds` line.** Parsing odds columns is spec 0002's deferred item; this
  spec neither implements the reference line nor parses odds. Odds in the Entrant context
  are not merely out of scope but forbidden by ADR 0016.
- **Corners, fouls, cards, referee, attendance, half-time scores** — available in the same
  CSVs, deliberately excluded as noise.
- **FPL strength ratings and the Understat lambda calculator** — digested forecasts,
  excluded by ADR 0016 (the lambda machinery may someday become a Reference Line; not
  here).
- **Season-aggregate shot or xG statistics** in any section of the context.
- **Understat player-level data, shot-level data, and non-EPL leagues** — only per-match
  team xG for the EPL is fetched.
- **Championship xG from any source**, and xG history deeper than the prior season.
- **A sparse context arm** — ADR 0008's single-arm decision stands.
- **Any change to the FPL player section, the prompt envelope's output contract, Lock
  enforcement, or Fill semantics.**

## Further Notes

- The hard deadline is the 2026/27 Season's first Gameweek deadline in mid-August; the
  scope was cut to land within roughly a week, leaving the second week for pre-flight and
  repair.
- The port source is the reference implementation and guide in the repository's Understat
  docs, including required headers, the escaped-JSON fallback decoder, and known gotchas
  (string-typed xG, timezone-less datetimes, 404s on future seasons).
- The two signals are severable: if the Understat port threatens the freeze date, shipping
  v2 with shots only is an operator decision that keeps the deadline — the form-line
  format leaves xG as an optional trailing segment either way.
