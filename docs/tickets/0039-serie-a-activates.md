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

**Status:** ready-for-agent

- [ ] The pre-cron checklist runs **in order** this time: secrets verified, then the
      `competitions` insert (operator), then `roster:enter`, then the prior-Season xG
      check, then the dry run — the sequence spec 0016's launch met out of order.
- [ ] `roster:enter` seats ten Entrants under `match-sa/2026-27-v1`; the stored-seats
      guard refuses any roster the record disagrees with.
- [ ] `COMPETITION=SA` dry run is green against the archived snapshots before the first
      Lock: every club name resolves, every present section renders, expected Gaps match.
- [ ] Serie A opens at the first Gameweek whose derived deadline had not passed at
      activation; earlier Gameweeks, if any, arrive as Locked history with no Fixture
      queued for prediction. **This box records which Gameweek that turned out to be.**
- [ ] No Lock is set by hand under any clock; a missed deadline means the Gameweek is
      let go, ADR-0035's accepted price.
- [ ] The first Lock is observed at the derived deadline, and every Entrant's Prediction
      with its stored context predates it.
- [ ] Serie A appears on the dashboard with no dashboard change.
