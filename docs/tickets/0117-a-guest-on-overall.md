# Ticket: A Guest on `/overall`

**What to build:** `/overall` sums each Guest across the Competitions it sits in and ranks it
by the page's existing rule. It carries the qualification an Exhibition row carries: its
total may be over fewer Fixtures and fewer Competitions than the rows beside it. It is no
member of the Edition set. Spec: [0029](../specs/0029-guest-seats.md). Decision:
[ADR-0064](../adr/0064-a-guest-seat-answers-at-the-lock-without-joining-the-roster.md).

Decisions it must not bend:
- the Edition set is the roster ADR's alone (ADR-0061). A Guest changes no Entrant's total
  or rank on `/overall`;
- the combined ranking is a raw sum that states what it costs (ADR-0051).

**Blocked by:** [0115](0115-a-guest-is-ranked-with-its-label.md).

---

## What is already known

- **Rows are keyed apart from the roster's.** `overall-view` keys an Exhibition row
  `exhibition:${slug}` so a Base Model on the roster and replayed elsewhere never collapses
  into one. A Guest gets a third namespace, `guest:${slug}`, by the same rule.
- **The qualification sentence** gains the Guest beside the Exhibition sentence ADR-0052
  froze, as a constant.

## Acceptance

- [ ] A Guest seated in several Competitions is one `/overall` row summing them
- [ ] It carries the qualification, and the page names the Competitions it covers
- [ ] No Entrant's `/overall` total or rank moves with the Guest present
- [ ] An Exhibition row and a Guest row of one Base Model are two rows here until 0119
