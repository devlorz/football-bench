# Ticket: A Guest on the Fixtures and its own record

**What to build:** a Fixture's page shows the Guest's forecast beside the roster's on every
Fixture it was asked, and an empty slot where it was asked and has no Prediction, as an
Entrant's would be. The Guest has its own record, reached by its tab and slug as an
Entrant's is, which publishes what an Entrant's record publishes, Gap rate included. Spec:
[0029](../specs/0029-guest-seats.md). Decision:
[ADR-0064](../adr/0064-a-guest-seat-answers-at-the-lock-without-joining-the-roster.md).

Decisions it must not bend:
- an empty slot on the Fixtures page means "asked before the Lock and did not answer"
  (ADR-0052). A Guest earns that slot by being asked, and an Exhibition Run still does not;
- the record carries the Guest label and no recall caveat.

**Blocked by:** [0115](0115-a-guest-is-ranked-with-its-label.md).

---

## What is already known

- **The Fixtures endpoint holds an `exhibitions` array** alongside the roster's forecasts
  (spec 0026). A Guest is asked at the Lock, so its forecast is placed with the roster's
  and not in that array.
- **The record is addressed by slug.** A Guest's row and its Base Model's Exhibition row
  share a slug by ADR-0064's id convention. Until 0119 lands, each has its own tab on the
  record page. 0119 makes the toggle choose between them.

## Acceptance

- [x] A Fixture the Guest was asked shows its forecast with the roster's: after the
      roster's slots, before any Exhibition slot (tested with one Exhibition Run that
      replayed a Guest's Fixture), with `guest: { fromGw }`
- [x] A Fixture the Guest was asked and did not answer shows its empty slot
- [x] A Fixture before the Guest's first Lock shows no slot for it. "Asked" is
      `isAskedAtLock` at that Gameweek's Lock, so a withdrawn Guest also has no slot
      from its next Lock. The withdrawn case is not tested on this page
- [x] The Guest's record publishes the Entrant record's figures, Gap rate included, with
      its label: `gaps` and the per-Gameweek Gaps come from the same SQL fragment as
      the ranked row's Gap rate (`guestAskedFixtures`), and `guest.gapRate` is tested
      equal on both bodies. The Guest's history holds only the Gameweeks its Locks
      asked, so there is no row of noughts (points, settled, Gaps) before its first Lock
      or after a withdrawal, and its chart line starts at its first Lock. The chart's
      x-axis now spans the roster's Gameweeks, not the selected record's. Every record
      now carries `role`, `baseModel` and `guest`, which `dashboard-edition-api.test.ts`
      strips before comparing with the archive. **Tested at the body only.** The label
      on the Fixtures slot and the record KPI, the chart axis, and the roster's "N of M
      predicted" that now skips the Guest's slot are inline `.astro` script with no seam,
      so 0121's surface check confirms them by eye
- [x] The roster-invariance assertion still holds. It now drops the Guest's record and
      slots, as well as its ranked row, before comparing, and then finds no "argon"
      in any body

## Where this departs from the spec and the ticket

- **Fixture slots carry no `role` or `baseModel`**, although spec 0029 says every
  Fixture forecast does. Only a Guest's slot carries `guest`, and an Exhibition's carries
  `exhibition` as before, so an Entrant's slot is byte-identical. Nothing on the Fixtures
  page combines rows (the toggle does not apply there), so nothing would read those
  fields. Records do carry them, because 0119 combines records by Base Model.
- **No ranked row is a link.** An Entrant's row is not one either. The Guest's record
  is reached the way an Entrant's is: through its tab and its slug on the record page.
