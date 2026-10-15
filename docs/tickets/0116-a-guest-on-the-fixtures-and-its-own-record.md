# Ticket: A Guest on the Fixtures and its own record

**What to build:** a Fixture's page shows the Guest's forecast beside the roster's on every
Fixture it was asked, and an empty slot where it was asked and has no Prediction, as an
Entrant's would be. Clicking the Guest's ranked row opens its record, which publishes what
an Entrant's record publishes, Gap rate included. Spec:
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
  share a slug by ADR-0064's id convention. Until 0119 lands, the record opened from a
  Guest's ranked row is the Guest's, and the Exhibition's record is the one its own row
  opens. 0119 makes the toggle choose between them.

## Acceptance

- [ ] A Fixture the Guest was asked shows its forecast with the roster's
- [ ] A Fixture the Guest was asked and did not answer shows its empty slot
- [ ] A Fixture before the Guest's first Lock shows no slot for it
- [ ] The Guest's record publishes the Entrant record's figures, Gap rate included, with
      its label
- [ ] The roster-invariance assertion still holds
