# Ticket: Serie A activates

**What to build:** the first real Serie A Gameweek — the `competitions` row inserted, ten
Entrants seated, the pre-cron checklist run in order, the dry run green, and the first
Gameweek whose derived deadline stood open at activation predicted and Locked before
kickoff. An operator ticket: **the insert is the point the scheduled runs begin to spend,
and it is the operator's act alone** (ADR-0049) — no implementing agent takes it. Source:
[spec 0024](../specs/0024-serie-a-and-ligue-1-open.md), stories 23–29. Decisions:
[ADR-0049](../adr/0049-serie-a-and-ligue-1-open-the-bundesliga-waits-on-hands-not-money.md),
the ADR-0036 banner (no hand-set Lock, ever again).

**Blocked by:** 0034 (the league renders), 0035 (its staleness guard exists before its
first deadline), 0036 (its history and xG are curated and reviewed). Deliberately not
blocked by 0038 — Squad Changes may trail.

**Status:** activated — boxes 1–4 green; 5–7 wait on the Lock at 2026-08-22T15:00Z

- [x] The pre-cron checklist runs **in order** this time: secrets verified, then the
      `competitions` insert (operator), then `roster:enter`, then the prior-Season xG
      check, then the dry run — the sequence spec 0016's launch met out of order.
- [x] `roster:enter` seats ten Entrants under `match-sa/2026-27-v1`; the stored-seats
      guard refuses any roster the record disagrees with.
- [x] `COMPETITION=SA` dry run is green against the archived snapshots before the first
      Lock: every club name resolves, every present section renders, expected Gaps match.
- [x] Serie A opens at the first Gameweek whose derived deadline had not passed at
      activation; earlier Gameweeks, if any, arrive as Locked history with no Fixture
      queued for prediction. **This box records which Gameweek that turned out to be.**
- [ ] No Lock is set by hand under any clock; a missed deadline means the Gameweek is
      let go, ADR-0035's accepted price.
- [ ] The first Lock is observed at the derived deadline, and every Entrant's Prediction
      with its stored context predates it.
- [ ] Serie A appears on the dashboard with no dashboard change.

## What happened

Activated 2026-08-21T19:10Z. Serie A opened at **Gameweek 1**, deadline
**2026-08-22T15:00:00Z** — derived from the earliest Gameweek 1 kick-off,
2026-08-22T16:30:00Z, minus ninety minutes, and recomputed from
`test/fixtures/football-data-org-2026-27-SA-recorded.json.gz` rather than taken
from a note. No earlier Gameweek existed, so none arrived as Locked history.

**Box 1, in order.** Secrets verified (`FOOTBALL_DATA_ORG_TOKEN` already set for
Ligue 1, `SEASON=2026-27`), the `competitions` insert run by the operator, then
`roster:enter`, then the prior-Season xG check, then the dry run. The sequence
spec 0016's launch met out of order was met in order this time.

**Box 2.** Forty Entrants across the four listed Competitions, ten of them
`match-sa/*` under the frozen `match-sa/2026-27-v1` (`openrouter-entrant.ts:157`).
The run named every seat; a Competition with no frozen Prompt Version fails here
by name, and none did.

**Box 3, green and not backdated.** `COMPETITION=SA GAMEWEEK=1
DRY_RUN_AT=deadline-6h npm run dry-run` exits 0 — ten contexts, 0 Predictions
and 100 Gaps, both derived by the run and both matched, nineteen hours before
the Lock. 0040 could not close this box; two changes made it reachable, and both
carry a mutation check:

- Serie A's `Personnel and kits` leads `Team, Chairman, Manager`, like Ligue 1's
  and unlike the registry's default pair. The first live fetch after the insert
  refused it, correctly — read by position, every club's chairman would have been
  filed as its Head Coach. One registry line (`ef58e6a`).
- The rehearsal listed `PL` beside the league being rehearsed. Free while the
  Premier League's feed was live; from its own Gameweek 1 Lock at
  2026-08-21T17:30Z it fails the stale-Season guard, and listed everywhere it
  failed every league's rehearsal — 0e2f5d6's own fault through the door the
  pairing left open. Now the rehearsed Competition alone (`1adb847`).

Each league now stands on its own facts: SA green; PD, FL1 and PL each red on
their own stale-Season guard, which is ticket 0035 showing through.

**Ordering.** 0040's trap was real and was resolved deliberately rather than
worked around: the insert came first, the hand-run fetch archived Serie A's
snapshots, and only then could the rehearsal read them. Box 3 asks for green
*before the first Lock*, not before the insert, so the ordering satisfies it as
written.

### Artifacts named so they are not rediscovered as faults

- **Prior-Season xG reads `unavailable` throughout the rehearsal**, for every
  league. The daily fetch ingests the current Season's Understat only; the prior
  Season's comes from the one-off `fetch:xg-history` backfill no rehearsal runs.
  Production renders the real numbers — `COMPETITION=SA GAMEWEEK=1 npm run
  context:show` carries Udinese at 1.25-1.50 xG per game and Como at 1.79-1.04,
  with xG on every form line. Read the packet for the numbers and the rehearsal
  for the shape.
- **0 Predictions and 100 Gaps is the honest derivation for Serie A**, not the
  runbook's 10/90. One OpenRouter response is archived per Base Model against a
  single Premier League Fixture; none was recorded against a Serie A one. The run
  states the count it should produce and fails on a mismatch, so the verdict is
  what to read.

### What is left

- **Boxes 5 and 6 are observations, not work.** The Lock is at
  2026-08-22T15:00Z and the scheduled poll reaches Serie A at
  `deadline − 6h` = **2026-08-22T09:00Z**, where ten seats over ten Fixtures is
  **100 Base Model calls**. No Lock is to be set by hand under any clock.
- **Box 7** — Serie A on the dashboard — has not been looked at. 0040 left the
  live dashboard unread too; only its view test has run.
- **Ticket 0035 stays open and is now the only thing red.** `FOOTBALL_DATA_SEASON`
  reads `2025-26` and still cannot be advanced: read live 2026-08-21T19:20Z,
  `E1 SP1 SP2 F2` publish their own division and `E0 I1 I2 F1` answer
  `<html><head>`. Serie A is unaffected until its own Gameweek 1 Locks.
- **Ligue 1's Gameweek 1 keeps `Head Coach: unavailable` permanently**; the rows
  now exist and reach Gameweek 2 onward. Verified: Lille reads
  `Davide Ancelotti`, Strasbourg `Hugo Oliveira`.
