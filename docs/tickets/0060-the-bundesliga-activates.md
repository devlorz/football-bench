# Ticket: The Bundesliga activates

**What to build:** the first real Bundesliga Gameweek — the `competitions` row inserted,
ten Entrants seated, the pre-cron checklist run in order, the dry run green, and the first
Gameweek whose derived deadline still stood open at activation predicted and Locked before
kickoff. **An operator ticket: the insert is the point the scheduled runs begin to spend,
and it is the operator's act alone**
([ADR-0054](../adr/0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md)) — no
implementing agent takes it. Decisions: ADR-0054, the
[ADR-0036](../adr/0036-a-new-competitions-schedule-results-and-lock-come-from-football-data-org.md)
banner (no hand-set Lock, ever again).

**Blocked by:** 0058 (the league renders and its Prompt Version is frozen), 0059 (its
history and xG are curated and reviewed).

**Status:** ready-for-agent

---

## What is already known

**The clocks, read on 2026-08-27.** 306 Fixtures across 34 Gameweeks, 18 clubs, none of
them played. Gameweek 1's earliest kickoff is 2026-08-28T18:30Z, so its derived deadline is
2026-08-28T17:00Z; Gameweek 2's is 2026-09-04T17:00Z. **No target Gameweek**: the league
opens at the first Gameweek whose derived deadline has not passed when it is activated, and
a Gameweek the activation misses is let go. Which one that turned out to be is this
ticket's to record.

**`FOOTBALL_DATA_SEASON` is one variable over five leagues now.** The pre-cron checklist's
advance check grows from eight files to ten as `D1` and `D2` join, and a Season in which the
sources publish at different times fails more fetches more loudly before the variable can
move.

**In order, and the order is the one spec 0016's launch met out of order:** secrets
verified, then the `competitions` insert, then `roster:enter` — which seats ten Entrants
per listed Competition and must run after the insert, not before — then the prior-Season xG
check, then the dry run.

## Acceptance

- [ ] The pre-cron checklist runs in order, with the advance check covering all ten
      football-data.co.uk files.
- [ ] `roster:enter` seats ten Entrants under `match-bl1/2026-27-v1`.
- [ ] A `COMPETITION=BL1` dry run is green against the archived snapshots before the first
      Lock: every club name resolves, every present section renders, expected Gaps match.
- [ ] The Bundesliga opens at the first Gameweek whose derived deadline had not passed at
      activation; earlier Gameweeks, if any, arrive as Locked history with no Fixture queued
      for prediction. **This box records which Gameweek that turned out to be.**
- [ ] No Lock is set by hand under any clock; a missed deadline means the Gameweek is let
      go.
- [ ] The first Gameweek's Predictions are made and Locked before its earliest kickoff, and
      the spend is stated once it settles.
