# Tickets: Unscheduled Fixtures leave the schedule

Two tracer-bullet slices that make the FPL fetch tell an Unscheduled Fixture from a
scheduled one, so the context's schedule section stops listing matches that will not be
played and the Blank they create renders as absence. Source:
[spec 0009](../../specs/0009-unscheduled-fixtures-leave-the-schedule.md). Vocabulary:
[CONTEXT.md](../../../CONTEXT.md). Decisions: [ADR 0001–0024](../../adr/), especially
[ADR 0013](../../adr/0013-a-postponed-fixture-keeps-its-original-prediction.md) and
[ADR 0024](../../adr/0024-an-unscheduled-fixture-leaves-the-stored-schedule.md).

Work the **frontier**: any ticket whose blockers are all done — here a linear chain, top
to bottom. Everything lands before the season's first FPL Lock: this pair is what makes
spec 0006's stories 3 and 4 true, and closes the limitation recorded on ticket 0006's
schedule slice.

---

## The fetch tells a withdrawn Fixture from a scheduled one

**What to build:** After any fetch, the fixtures table matches FPL's calendar: a
never-Locked Fixture FPL withdraws is gone — and with it the phantom work the match
track's prediction run and gap alert would have found — while a Locked one keeps
everything it has and carries the Unscheduled mark, cleared again the moment FPL names a
new date. One migration adds the column.

**Blocked by:** None — can start immediately.

- [x] A never-Locked Fixture FPL withdraws is deleted; restored later, it reappears under
      its new Gameweek
- [x] A Locked Fixture FPL withdraws keeps its row, Prediction, locked Gameweek and
      `deferred` flag, and gains the Unscheduled mark; rescheduling clears the mark while
      `deferred` stays true
- [x] Observing the same withdrawal on a later fetch is a no-op — the daily cadence stays
      idempotent
- [x] The existing deferral tests run unchanged and green
- [x] The fetch behaviour is tested against a real Postgres at the fetch seam

## The Blank renders as absence

**What to build:** An Entrant opening a Gameweek reads a schedule with no withdrawn
Fixture in it: the club's absence is the Blank, a restoration's repetition is the Double,
and neither carries any annotation. The stored, hashed body proves it end to end, and the
limitation recorded on ticket 0006's schedule slice closes.

**Blocked by:** The fetch tells a withdrawn Fixture from a scheduled one.

- [x] The schedule section omits an Unscheduled Fixture; the club's absence renders as
      the Blank, with no annotation — tested against a real Postgres
- [x] A restored Fixture lists under its new Gameweek, including the Double it may create
- [x] A stored, hashed body shows the withdrawn Fixture's club nowhere in its Gameweek's
      list — asserted at the `openFplGameweek` seam
- [x] The limitation note on
      [ticket 0006's schedule slice](./0006-fixtures-availability-detail-and-the-league-table-in-the-fpl-context.md)
      is marked closed and the doc comment recording it on the schedule read is removed
