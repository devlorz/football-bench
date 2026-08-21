# Ticket: Ligue 1 activates

**What to build:** the same act as ticket 0039, for France — the `FL1` row inserted by
the operator, ten Entrants seated, the checklist in order, the dry run green, and the
first open Gameweek predicted and Locked before kickoff. Independent of Serie A's
activation: the two leagues open on their own clocks. Source:
[spec 0024](../specs/0024-serie-a-and-ligue-1-open.md), stories 23–29. Decisions:
[ADR-0049](../adr/0049-serie-a-and-ligue-1-open-the-bundesliga-waits-on-hands-not-money.md),
the ADR-0036 banner.

**Blocked by:** 0034, 0035, 0037. Deliberately not blocked by 0038 — Squad Changes may
trail.

**Status:** ready-for-agent

- [ ] The pre-cron checklist runs in order: secrets, insert (operator), `roster:enter`,
      prior-Season xG, dry run.
- [ ] `roster:enter` seats ten Entrants under `match-fl1/2026-27-v1`; the stored-seats
      guard holds.
- [ ] `COMPETITION=FL1` dry run is green against the archived snapshots before the first
      Lock.
- [ ] Ligue 1 opens at the first Gameweek whose derived deadline had not passed at
      activation — its Gameweek 1 deadline was hours from ADR-0049's drafting, so played
      Gameweeks arriving as Locked history is the expected shape here, and the
      mid-Season adoption path (no `locked_in_gw` for a Fixture with a result) is what
      this activation exercises for real. **This box records which Gameweek Ligue 1
      opened at.**
- [ ] No Lock is set by hand; a missed deadline means the Gameweek is let go.
- [ ] The first Lock is observed at the derived deadline, and every Entrant's Prediction
      with its stored context predates it.
- [ ] Ligue 1 appears on the dashboard with no dashboard change.
