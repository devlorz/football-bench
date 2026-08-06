# Tickets: Unscheduled Fixtures leave the schedule

One tracer-bullet slice that makes the FPL fetch tell an Unscheduled Fixture from a
scheduled one, so the context's schedule section stops listing matches that will not be
played and the Blank they create renders as absence. Source:
[spec 0009](../specs/0009-unscheduled-fixtures-leave-the-schedule.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md). Decisions: [ADR 0001–0024](../adr/), especially
[ADR 0013](../adr/0013-a-postponed-fixture-keeps-its-original-prediction.md) and
[ADR 0024](../adr/0024-an-unscheduled-fixture-leaves-the-stored-schedule.md).

Everything lands before the season's first FPL Lock — this slice is what makes spec 0006's
stories 3 and 4 true, and closes the limitation recorded on ticket 0006's schedule slice.

---

## The calendar tells the truth about a withdrawn Fixture

**What to build:** The fetch splits withdrawn Fixtures (`event = null`) on the Lock: a
never-Locked row is deleted, a Locked row keeps everything it has and gains
`unscheduled = true`, cleared when FPL names a new date. The schedule read excludes
unscheduled rows. One migration adds the column.

**Blocked by:** nothing — ticket 0006's schedule slice has landed.

- [ ] A never-Locked Fixture FPL withdraws is deleted; restored later, it reappears under
      its new Gameweek
- [ ] A Locked Fixture FPL withdraws keeps its row, Prediction, locked Gameweek and
      `deferred` flag, and gains `unscheduled`; rescheduling clears `unscheduled` while
      `deferred` stays true
- [ ] The existing deferral tests run unchanged and green
- [ ] The schedule section omits an unscheduled Fixture; the club's absence renders as the
      Blank, with no annotation
- [ ] The fetch behaviour and the schedule read are tested against a real Postgres
- [ ] A stored, hashed body shows the Blank — asserted at the `openFplGameweek` seam
- [ ] The limitation note on ticket 0006's schedule slice is marked closed and the doc
      comment on the schedule read is removed
