# Ticket: The FPL fetch writes a Gameweek in one statement, not one per player

**What to build:** the daily fetch's two FPL writes — each settled Gameweek's player
points, and the morning's players, events and Fixtures — land as one statement per table
instead of one round trip per row. The rows written are exactly the rows written today;
only the number of trips to the database changes. Found reading the daily fetch that has
been cancelled at its thirty-minute limit on 2026-09-23, 24 and 25.

**Blocked by:** None — can start immediately. Independent of ticket 0089.

**Status:** ready-for-agent

---

## What is already known

**Where the morning goes.** Read off `raw_snapshots` for the run of 2026-09-25, which
GitHub cancelled at 06:54:40:

| Step | From | To | Rows written one query at a time |
| --- | --- | --- | --- |
| Daily FPL fetch (bootstrap and fixtures) | 06:24:42 | 06:28:39 | ~770 players, ~380 Fixtures, the events |
| Player points, Gameweeks 1–5 | 06:28:39 | 06:37:54 | 667 per Gameweek, 2 min 15 s each |
| FPL scoring, five calls | 06:37:54 | 06:43:48 | ticket 0089 |

667 rows in 135 seconds is about 0.2 s a row, which is one round trip from a GitHub-hosted
runner in the United States to the session pooler in `ap-southeast-1`. The rate is
inferred from those two numbers, not measured with a ping; it is also why the same code
run from Bangkok is fast enough that nobody noticed.

**The shape to copy is already in the codebase.** The dataset fetch (ticket 0073) writes
758 rows of `international_results` with one `insert … select * from unnest($1::…[], …)
on conflict … do update`, and it is the one step of the 06:52 minute that took no time.

**What must not change.**

- Every row, every column value, every conflict target and every `do update set` list is
  what the per-row statement writes today.
- Each call stays one transaction, begun and committed where it is today, so a failed
  write still leaves nothing half-written.
- Validation still runs over the whole response before the first write, as it does now.
- The raw snapshot is still archived before validation (`storeRawSnapshots` writes one or
  two rows and is not part of this).

## Acceptance

- [x] Player points for one Gameweek are written by one statement. Proven by a test that
      runs the fetch over a recorded `event/{gw}/live/` response and asserts the stored
      rows equal those the current code stores — captured from the current code before it
      changes and committed as the expectation, so the equivalence is against bytes and
      not against a reading of the new code.
- [x] The daily FPL fetch writes its players, its events and its Fixtures one statement
      per table, with the same equivalence test over the recorded bootstrap and fixtures.
- [x] A second run over the same response writes nothing different (the upsert is still
      idempotent), and a response that fails validation writes no row of either table.
- [x] The existing FPL suites are green unchanged: `fetch-fpl-gameweek`,
      `settled-player-points`, `score-fpl-gameweek`, `fpl-demonstration-record`,
      `daily-fetch`.
- [ ] Measured on production after deploy: the next scheduled daily fetch's five
      `fpl_live` snapshots are seconds apart, not minutes, and the gap from
      `fpl_bootstrap` to the first `fpl_live` is under a minute. Recorded in this ticket
      with the run's id.

**How the ticked boxes are proven (2026-09-25, after review).** All of it is in
`test/fpl-fetch-stores-the-rows-it-always-did.test.ts`. The tests compare against
`test/fixtures/fpl-2026-27-stored-rows-before-0088.json.gz`, which was captured by running
the per-row code at `274b9d4` over the same responses. The recorded Gameweek 1 live body
is `fpl-live-2026-27-gw1-recorded.json.gz`. The archived fixtures file is pre-season, so
it holds no played, Locked or moved Fixture. A third test builds those cases by patching
the responses across three runs:

- a result that later reads as unplayed and is kept (`coalesce`);
- a Fixture first listed after its Lock, then moved to Gameweek 3 (`locked_in_gw` and
  `deferred`);
- a Locked deadline that FPL moves and that is not stored, next to an open one that is
  (the `openEvents` filter).

Four mutants of the new code each fail that test: the `openEvents` filter removed,
`coalesce` removed, the `deferred` deadline comparison flipped, and `locked_in_gw` dropped.

A batch upsert cannot touch one row twice, so each batch is keyed by id before its
statement. When FPL sends an id twice, the last copy is stored, as it was when each row
was its own statement. A fourth test pins that for events, Fixtures and player points,
again against the captured bytes.

## What this ticket does not do

- **Read fewer Gameweeks.** Every settled Gameweek is still read every morning. Reading
  only the ones whose bytes changed is a separate question for ADR-0053 (bonus corrections
  land after `finished`), and it is not needed once each read costs one statement.
- **The scorer.** Ticket 0089.
- **Split the daily fetch into jobs.** Researched on 2026-09-25 and still worth doing for
  isolation and for seeing where a run died; not needed for time once this and 0089 land.
- **The workflow's timeout.** A separate one-line change if the Lock needs it before this
  ships.
