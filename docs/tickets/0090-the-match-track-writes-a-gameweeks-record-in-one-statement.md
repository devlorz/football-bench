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

- [x] Each target Gameweek's Match track rows are written by one statement (or one per
      scorer call if that is simpler; either way not one per metric). Proven by a test that
      counts the statements, beside a test that asserts the stored rows equal those the
      current code stores. That expectation is captured from the current code before it
      changes and committed, so the equivalence is against bytes and not against a reading
      of the new code. The seeded Season has at least three Gameweeks, a Gap, a Repair, an
      unsettled Fixture and a comparison-anchor change between two snapshots.
- [x] A second pass over unchanged inputs changes no row, `scored_at` included. A pass
      after one result is corrected moves `scored_at` on exactly the rows whose figures
      moved, as the per-row code does. Both are compared against the captured bytes.
- [x] The existing suites are green unchanged: `score-match-gameweek`,
      `score-match-season`, `rehearse-scoring`, `verify-scoring-rehearsal`. Any assertion
      that counted statements is updated and says why.
- [ ] `npm run match:rehearse` still passes.
- [ ] Measured on production after deploy: the next scheduled scoring run's duration,
      and that it scored every listed Competition. Record both in this ticket with the
      run's id.

**How the ticked boxes are proven (2026-09-26).** `storeMetric` in
`src/predictions/score-match-gameweek.ts` now holds each row in a map keyed as the table
is. `writeScores` sends one target Gameweek's rows as one
`insert … select … from unnest(…) on conflict … do update … where … is distinct from`.
It writes one statement per target Gameweek, not one per scorer call. A call from the
earliest Lock late in the Season would otherwise carry about 9,500 rows, each cumulative
one holding every Fixture in its `detail`. The per-snapshot `delete` of comparisons
outside the declared set is unchanged. It now runs before that Gameweek's upsert instead
of after it. That order does not matter, because the delete never touches a declared row.

Both tests are in `test/match-scoring-stores-the-rows-it-always-did.test.ts`. The seeded
Season has three Gameweeks and three Entrants. Entrant b's Fixture 3 took two Repairs.
Entrant c Gapped Fixture 3 on a failed attempt and was never asked about Fixture 5.
Fixture 6 is unplayed. Before the correction, a anchors the Gameweek 1 and 2 snapshots and
b anchors Gameweek 3. Correcting Fixture 1 hands all three to c, so the anchor changes
both between snapshots and between passes.

- "a first pass, a repeat pass and a pass after a correction store the rows they always
  did" compares every `scores` row, `scored_at` included, after each of the three passes
  against `test/fixtures/match-scores-stored-rows-before-0090.json.gz`. That fixture was
  captured by running the same test at `8987b01` in a scratch worktree. Each pass has 250
  rows. The repeat pass keeps every stamp. The corrected pass restamps 134 rows and keeps
  116.
- "each target Gameweek's rows are written by one statement" runs a pass with all three
  Gameweeks published, which is one call sweeping three targets. It counts three
  `insert into scores` statements. The old code sent 250.

A mutant that drops the `where … is distinct from` clause fails the first test.

`score-match-gameweek`, `score-match-season`, `rehearse-scoring` and
`verify-scoring-rehearsal` pass unchanged. So do the other eight suites that reach the
scorer: `competition-coexistence`, the four `dashboard-*` suites that read `scores`,
`format-scoring-rehearsal`, `score-workflow` and `seed-season`. That is 212 tests across
13 files. No assertion counted statements.

**`npm run match:rehearse` is not ticked.** It fails at `8987b01` exactly as it fails with
this change. The dry run creates "0 contexts, 0 Predictions" for Gameweeks 1, 4 and 5, so
the scorer receives nothing and the command reports "Score rows: 0". The archive was
observed at 2026-09-25T06:53:58Z. That failure is upstream of the scorer and was not
investigated here.

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
