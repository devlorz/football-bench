# Ticket: The dry run rehearses a Gameweek of this Season again

**What to build:** `npm run dry-run` once more exercises the Match track's write path for a
PL Gameweek of 2026-27. For the named Gameweek it builds contexts for that Gameweek's own
Fixtures, writes the Predictions the archive can answer, and matches an expected outcome
that means something. Today it does one of three things, and none of them rehearses
anything:

- **A settled Gameweek:** zero contexts, zero expected, and it reports a match.
- **The next open Gameweek:** it throws.
- **A later Gameweek:** it builds contexts and writes no Predictions.

The pre-cron checklist tells the operator to run it before trusting cron.

**Blocked by:** None — can start immediately. Ticket 0091 found the cause for the scoring
rehearsal and left the dry run unchanged on purpose.

**Status:** ready-for-agent.

---

## What is already known

**Runs on 2026-09-29, all free.** Archive of 728 snapshots and 94 Entrants, observed
2026-09-29T12:32:35Z. `FOOTBALL_DATA_SEASON=2026-27` was exported and
`DRY_RUN_AT=deadline-6h` left at its default.

| `GAMEWEEK` | Contexts | Predictions | Gaps | Verdict |
|---|---|---|---|---|
| 1 | 0 | 0 (expected 0) | 0 (expected 0) | "matched" |
| 6 | — | — | — | throws `Gap for Entrant match/claude-opus-5 and Fixture 1 has no recorded cause` |
| 7 | 10 | 0 (expected 0) | 100 (expected 100) | "matched" |

Gameweek 6 was the next open Gameweek when the archive was observed.

**The cause is the one ticket 0091 confirmed for the rehearsal.** The dry run loads the
replay into an empty database at the archive's own instant. The fetch Locks a Fixture it
first sees after its deadline into the next open Gameweek. So every played Fixture of
Gameweeks 1–5 is Locked into Gameweek 6. On 0091's archive (observed 2026-09-28), all 50
had `locked_in_gw = 6`.

What follows, read off the code and consistent with every row above:

- **Gameweek 1 matches on nothing.** No Fixture's Lock is Gameweek 1. So the expected
  outcome is built from zero Fixture ids, and 0 = 0 passes. Nothing guards against a
  Gameweek whose Lock owns no Fixture.
- **Gameweek 6 throws.** Its Lock owns the 50 played Fixtures as well as its own.
  - The prediction path asks only Fixtures that kick off after the run's instant, so it
    never attempts the 50 played ones.
  - The Gap Alert selects by Lock and has no kick-off bound. It finds those Fixtures with
    no Prediction and no failed attempt, and refuses them as Gaps with no recorded cause.
  - In production this cannot happen, because each of those Fixtures was Locked into its
    own Gameweek before its deadline.
- **Gameweek 7 writes nothing, correctly.** The replay answers each Base Model with its
  newest archived preflight. None of those names a Gameweek 7 Fixture, so every Entrant
  Gaps with `schema`. That is the guard working, but it means no Gameweek ahead of the
  archive can rehearse a write. On 0091's archive, two of the ten Match seats' preflights
  named PL Fixture 32 (Gameweek 4). The rest named a Nations League Fixture.

**The rehearsal's fix is the likely one here.** The scoring rehearsal now loads the
replay just before the Season's first deadline, read off the archived FPL bootstrap.
Before that deadline no Fixture is Locked, and the prediction path Locks the asked
Gameweek's own Fixtures. `runDryRun` already takes that instant as a parameter; only the
command does not pass it.

**A second fault, read off the code and not yet seen in a run.** The expected outcome
counts only seats whose role is `entrant`. The Prediction count read after each phase
counts every row of the Competition and Season. The prediction path asks Shadow Seats as
well (ADR-0055). PL has two: the shadows of Kimi K3 and DeepSeek V4 Pro. A shadow shares
its Entrant's Base Model, so the replay answers it with the same preflight. Once a
shadowed Entrant's preflight names a Fixture of the rehearsed Gameweek, the run writes
one more Prediction than it expects and fails. The Gap Alert already counts `entrant`
only, so Gaps would still agree.

**The runbook is stale.** The pre-cron checklist runs `GAMEWEEK=1` and lists "before the
Lock: 10 Predictions, 90 Gaps". Today that command prints 0 and 0 and reports a match.

## Acceptance

- [ ] `npm run dry-run` with `DRY_RUN_AT=deadline-6h` does three things:
      - For a settled PL Gameweek of 2026-27 and for the next open one, it builds one
        context for each of that Gameweek's own scheduled Fixtures and does not throw.
      - It writes a Prediction for every seat whose archived preflight names one of those
        Fixtures.
      - It matches its expected outcome.
      Record the Gameweeks run and their counts here.
- [ ] A run whose Gameweek owns no Fixture under its Lock fails and names the Gameweek,
      rather than matching 0 against 0.
- [ ] The expected Prediction count and the observed one count the same seats. Either
      both include Shadow Seats or both exclude them, and this ticket records which and
      why. A test fails if they diverge.
- [ ] `DRY_RUN_AT` at or after the Lock still writes no Prediction, and every Gap it
      reports has a recorded cause.
- [ ] Answers are still replayed exactly as recorded. The `fixture_id` rewrite stays in
      the scoring rehearsal only. The expected outcome rests on "each Entrant can only
      answer the one Fixture its archived response names", and the run must keep
      exercising the fixture-id guard.
- [ ] If the load instant moves, the output says the packets were built from bytes newer
      than the Gameweek's Lock, as the rehearsal's output does.
- [ ] Other Competitions: `COMPETITION` still works. Either they keep the archive's
      instant or they get their own load instant, and this ticket records which. The
      rehearsal's instant is read off the FPL bootstrap, which only PL has.
- [ ] The pre-cron checklist's dry-run step and its table match what the fixed command
      prints.
- [ ] The command stays read-only against the configured database and writes only to its
      throwaway cluster.

## What this ticket does not do

- **Change how the fetch Locks a late-listed Fixture.** That is correct in production.
  Only a replay into an empty database misreads it.
- **Change the Gap Alert's selection.** It throws on a Gap with no cause by design. The
  fix is to stop the replay from creating one.
- **Rewrite archived answers to the Fixture asked.**
