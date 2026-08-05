# Season aggregates and the league table join the match context for 2026-27-v2

Before its first use, the frozen match context gains two additions built entirely from
data already stored and already loaded: season-to-date aggregates of shots, shots on
target and xG (for and against, on the existing overall / home / away record lines), and
the full current-Season Premier League table in place of the two teams' bare position
ordinals. The line that admits them refines ADR 0019: **a summation an Entrant cannot
derive from the context it is shown adds raw information and is admitted; pre-computing
anything the context already makes visible stays forbidden; a forecast of any kind stays
forbidden permanently under ADR 0018.** ADR 0019's "never as season aggregates" sentence
is superseded by this line — its rationale ("averaging five data points is the Entrant's
job") only ever protected the five visible form lines, and a season aggregate over ~38
matches, of which the context shows five, is not derivable from them. The precedent was
already in the context: GF and GA on the record lines have been season summations from
the start, as has the league table the position ordinals were computed from.

## Considered options

- Showing the whole season as per-match lines, keeping 0019's sentence intact, was
  rejected on cost: ~38 matches × 2 teams ≈ 2,000 input tokens per call, ten times the
  aggregate for the same information, spent on making the Entrant do arithmetic rather
  than reasoning.
- Per-player performance for the two squads (spec 0005's analogue) was considered and
  deferred, not rejected: it depends on spec 0005's widened stats table, which has not
  landed, and its value — weighing an absence — already has a partial proxy in price,
  status and news. If this Season's record shows Entrants systematically mispricing
  absences, that is the evidence for a 2027-28 version.
- A coverage threshold below which an incomplete xG sum is hidden was rejected: choosing
  the threshold is the builder judging reliability on the Entrant's behalf. Instead an
  incomplete sum always announces its coverage and the Entrant weighs it.
- Keeping the `Current-Season league position` line alongside the full table was
  rejected: with the table visible, the ordinal is derivable, and keeping it would
  violate this ADR's own line on the day it is adopted.
- The change lands inside `match/2026-27-v2` rather than a v3 because the pair, though
  frozen, has not yet been used — no 2026-27 context has been stored under it. Per the
  rule spec 0006 states for the FPL track, a frozen pair may be edited until its first
  use and never after; if the first Lock arrives first, this ships as v3 instead.
