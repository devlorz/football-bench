# Ticket: The Champions League activates

**What to build:** `UCL` is an Active Competition on production with its eight seats
entered under `match-ucl/2026-27-v1`. Its Gameweek 1 is adopted as Locked history and
its Gameweek 2 is predicted at the 2026-10-13T15:15Z Lock. The runbook gains a
*Opening a club cup* section that this ticket follows step by step, and that tickets 0107
and 0108 follow again.

Source: ADR-0063 *Consequences*, spec 0028 stories 75–80, ticket 0086's corrected order,
spec 0027's corrected activation order.

**Blocked by:** 0105.

**The writes are the operator's.** The migration, the `competitions` insert,
`roster:enter` and every paid call are never taken by the implementing agent. Each
pre-flight is asked for with its call count and cost.

**Status:** ready-for-agent

---

## What is already known

- **The order**, every step before 15:15Z:
  1. Gate run of the suite, asked for.
  2. Push and deploy by 09:15Z. Cron runs `origin/main`; check the gap first.
  3. `npm run db:rehearse` against the new migration.
  4. The operator applies the migration on production, and the `schema_migrations` diff
     is read against the repo.
  5. The eight-seat `UCL` pre-flight. This is paid: eight calls, roughly $0.30. The
     classifier may block it, in which case the operator runs the command.
  6. The operator's `competitions` insert.
  7. `roster:enter` for `UCL`.
  8. The first daily fetch for `UCL`, hand-run. This puts its bytes in the archive, adopts
     `MD1` and stores its sheets.
  9. `COMPETITION=UCL npm run dry-run` over that archive, which reaches no Base Model.
- **The dry run is the check on the packet**, not a gate on the insert: a dry run replays
  only bytes production has stored (spec 0027's banner).
- **If 15:15Z is missed**, `UCL` opens at Gameweek 3 (Lock 10-20T15:15Z) by ADR-0054's
  rule, with nothing set by hand.
- Local dry runs need `FOOTBALL_DATA_SEASON=2026-27` exported. `.env`'s `DATABASE_URL`
  points at production.

## Acceptance criteria

- [ ] The runbook's *Opening a club cup* section exists and lists the order above.
- [ ] The dry run of `UCL` Gameweek 2 shows `MD1` Locked with 18 results and 18 sheets, the 36-side table, and every section the pin froze.
- [ ] Production's read API answers `UCL` with eight seats, Edition 1, and the roster caveat.
- [ ] After the Lock, eight Predictions per Fixture or named Gaps for Gameweek 2.
- [ ] The ticket records the boundary that happened (Gameweek 2, or Gameweek 3 under the fallback).
