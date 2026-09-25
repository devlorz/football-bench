# Ticket: The Match track writes a Gameweek's record in one statement, not one per metric

**What to build:** the daily scoring run (`npm run match:score`) writes each target
Gameweek's `scores` rows for the Match track in one statement instead of one round trip
per metric per Entrant. The rows written are exactly the rows written today, `scored_at`
included; only the number of trips to the database changes. Found reading the scoring
runs cancelled at their thirty-minute limit on 2026-09-22 and 2026-09-24.

**Blocked by:** None — can start immediately. Independent of tickets 0088 and 0089 (the
FPL track's scorer is 0089's; this is the Match track's).

**Status:** ready-for-agent

---

## What is already known

**Where the run goes.** The scheduled scoring runs of the last two weeks took 19 to 29
minutes and grew by the day; 2026-09-23's took 28 min 52 s (10:07:41 to 10:36:32) and
scored BL1 1–4, FL1 1–5, PD 1–7, PL 1–5, SA 1–5 and UNL 1. The runs of 2026-09-22 and
2026-09-24 were cancelled at 30 minutes.

**Every row is its own statement.** One target Gameweek of one Competition writes, one
`insert … on conflict … do update … where … is distinct from` at a time:

| Rows | Per |
| --- | --- |
| 18 — nine metrics, the Gameweek's and the Season-to-date's | Entrant with a Prediction |
| 4 — `gap_rate` and `attempts_to_valid`, both scopes | Entrant of the roster |
| 18 — three metrics, both scopes | Reference Line (three of them) |
| 9, plus one `delete` of the comparisons outside the declared set | Snapshot |

About 250 statements for a ten-seat Competition's Gameweek, about 180 for the Nations
League's seven. A pass rewrites every published Gameweek from the earliest Lock (ticket
0069, which is what lets a corrected result reach every snapshot after it), so
2026-09-23 was 27 target Gameweeks, about 6,600 statements. At the 0.2 s a round trip
ticket 0088 inferred for a GitHub-hosted runner reaching `ap-southeast-1`, that is about
22 minutes; the reads make up the rest. The per-trip rate is carried over from 0088, not
measured on this job.

**Not the cause.** The pass is already linear in the Season (0069). The 10,000-resample
bootstrap per published comparison is in-memory arithmetic over a few dozen Fixtures. A
row whose value did not change is not rewritten, but its statement still makes the trip.

**Where it is heading.** Linear is still too slow at this rate: at the Season's end the
five leagues and the cup hold about 190 target Gameweeks, about 46,000 statements, about
two and a half hours a morning.

**The shape to copy** is ticket 0088's: the rows collected in memory, deduplicated by the
table's key, and written with one `insert … select … from unnest(…) on conflict … do
update`.

**What must not change.**

- Every row, every column value, including `detail` byte for byte and `scored_at`.
- A row whose value, `n` and `detail` did not change is not rewritten, so its `scored_at`
  still says when that figure was arrived at. The batch keeps the `where … is distinct
  from` clause; this is the property most easily lost.
- The comparisons outside a snapshot's declared set are still deleted, and a leader
  change still leaves no row naming the former anchor.
- Each call to the scorer stays one transaction, as it is today.
- A Gameweek whose Lock owns no Fixture still returns before a transaction opens.

## Acceptance

- [ ] Each target Gameweek's Match track rows are written by one statement (or one per
      scorer call if that is simpler; either way not one per metric). Proven by a test that
      counts the statements, beside a test that asserts the stored rows equal those the
      current code stores. That expectation is captured from the current code before it
      changes and committed, so the equivalence is against bytes and not against a reading
      of the new code. The seeded Season has at least three Gameweeks, a Gap, a Repair, an
      unsettled Fixture and a comparison-anchor change between two snapshots.
- [ ] A second pass over unchanged inputs changes no row, `scored_at` included. A pass
      after one result is corrected moves `scored_at` on exactly the rows whose figures
      moved, as the per-row code does. Both are compared against the captured bytes.
- [ ] The existing suites are green unchanged: `score-match-gameweek`,
      `score-match-season`, `rehearse-scoring`, `verify-scoring-rehearsal`. Any assertion
      that counted statements is updated and says why.
- [ ] `npm run match:rehearse` still passes.
- [ ] Measured on production after deploy: the next scheduled scoring run's duration,
      and that it scored every listed Competition. Record both in this ticket with the
      run's id.

## What this ticket does not do

- **Rewrite fewer Gameweeks.** The sweep from the earliest Lock is how a correction
  reaches every later snapshot. Skipping unchanged Gameweeks is a separate question about
  proving nothing upstream moved.
- **The order the Competitions are scored in.** They go alphabetically, each in its own
  transaction, so a run cut off by the timeout drops the last ones, and `UNL` is last.
  Whether UNL Gameweek 1 went unscored on 2026-09-24 is not checked here. Once the run
  fits, the order does not matter; splitting the job per Competition is the same idea as
  splitting the daily fetch, researched on 2026-09-25 and not ordered.
- **The workflow's timeout.** A separate one-line change if the record needs it before
  this ships.
- **The FPL track.** Ticket 0089.
