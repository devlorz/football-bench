# Tickets: Season aggregates and the league table in the match context

Three tracer-bullet slices delivering
[spec 0007](../../specs/0007-season-aggregates-and-the-league-table-in-the-match-context.md):
season-to-date team performance and the full league table inside `match/2026-27-v2`,
before the 2026/27 Season's first Lock.

Work the **frontier**: any ticket whose blockers are all done. Tickets 1 and 2 are
independent; ticket 3 waits for both.

## Season aggregates ride the record lines

**What to build:** An Entrant reading a match context sees each team's season-to-date
shots, shots on target and xG — for and against, this-team-first — on the three record
lines it already reads: Current-Season overall, home split and away split. The sums
cover only the current-Season Premier League matches each line already counts, and they
are honest about gaps: a stat pair covering fewer matches than the line announces
`(over N of M matches)`, a pair with no covered matches reads `unavailable`, and
complete coverage says nothing. A team with no matches yet keeps its plain empty-record
text — Gameweek 1's normal case. Sums are computed at render time in the pure context
builder; nothing new is fetched or stored.

**Blocked by:** None — can start immediately.

- [x] All three record lines carry shots, on target and xG pairs, ordered
      this-team-first, summed over current-Season Premier League matches only
- [x] Aggregates verified against hand-computed sums by exact-string assertions at the
      pure context-builder seam, per the existing historical-context test prior art
- [x] A line whose matches include one without an xG row announces coverage on the xG
      pair; a team with no xG rows renders `unavailable`; complete coverage renders no
      announcement
- [x] The empty-record text is unchanged and carries no aggregates
- [x] No query, migration or fetch changes; no aggregate is stored anywhere

## The league table replaces the position ordinal

**What to build:** An Entrant reading a match context sees the full current-Season
Premier League table — one verbose row per side with played, won, drawn, lost, goals
for, goals against and points, in the competition's rule order — between the context
header and the first team section, under a line announcing the date of the latest
result it includes. Before any current-Season result exists the section is a single
plain announcement, Gameweek 1's normal case. The `Current-Season league position` line
disappears from both team sections — with the table visible the ordinal is derivable,
and ADR 0022 forbids pre-computing what the context already shows — while the
prior-Season final position line stays. Built entirely from the results the builder
already receives; nothing new is fetched or stored.

**Blocked by:** None — can start immediately.

- [x] The table renders once per context, in rule order — points, then goal
      difference, then goals scored — verified against a hand-computed table including
      one tie broken by goal difference and one broken by goals scored
- [x] Rows are verbose with no legend; goal difference is not a column
- [x] The coverage line names the date of the latest included result
- [x] Before any current-Season result exists, the section is a single announcement
      line, asserted as the Gameweek 1 first-class path
- [x] The current-Season position line is absent from both team sections; the
      prior-Season final position line is kept
- [x] Only current-Season Premier League results contribute
- [x] Exact-string assertions at the pure context-builder seam, per the existing
      historical-context test prior art

## Freeze verification: pre-flight on the extended v2

**What to build:** The operator can point to a pre-flight run, executed against
contexts carrying both new sections, that passes for every Entrant on the roster before
the 2026/27 Season's first Lock — the one converging check that the denser
`match/2026-27-v2` cannot surprise an Entrant into malformed output on opening day.
This is the same freeze-verification move spec 0004 made for v2's first shape and specs
0005/0006 demand for the FPL track.

**Blocked by:** Season aggregates ride the record lines · The league table replaces
the position ordinal.

- [x] Pre-flight re-run passes for all nine Entrants against a context carrying the
      season aggregates and the league table together — **run 2026-08-07, 9/9 parseable
      three times**: against the live opening-day context, against a dense mid-Season
      context in a throwaway Postgres, and against the live context again once the shot
      backfill landed; verdict in
      [the pre-flight report](../../reports/2026-08-07-season-aggregates-league-table-preflight.md),
      which also records a shot-coverage finding, closed outside this ticket
- [x] The run happens before the first Lock; if the Lock arrives first, the additions
      ship as `match/2026-27-v3` instead — a frozen pair is never edited after use
      — **verified against stored data, not assumed**: `contexts`, `predictions` and
      `attempts` were all empty before and after the runs, and the 2026-27 Gameweek 1
      deadline is 2026-08-21T17:30Z, so v2 is still frozen-but-unused and the edit stands
- [x] Context storage and hashing mechanisms are unchanged, and nothing recorded under
      any earlier hash is touched — `src/predictions/predict-gameweek.ts`, where a
      context is hashed and stored, is byte-identical across `ca320b2` and `d2e270f`;
      the only change outside the builder and its tests is the pinned
      `MATCH_PROMPT_SHA256`

**A shot-coverage finding surfaced during the runs and is closed.** The deployed fetch
had been wiping live shot data every morning; the backfill, the deploy that ended the
wipe, and the hand-triggered run that proved it are all recorded in
[the pre-flight report](../../reports/2026-08-07-season-aggregates-league-table-preflight.md).
Still standing, outside this ticket: the fetch has no assertion that fails on coverage
loss.
