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

- [x] A Guest seated in several Competitions is one `/overall` row summing them
- [x] It carries the qualification, and the page names the Competitions it covers
- [x] No Entrant's `/overall` total or rank moves with the Guest present
- [x] An Exhibition row and a Guest row of one Base Model are two rows here until 0119

## What was verified

- `test/dashboard-overall-view.test.ts`, "a Guest": one row under `guest:${slug}` summed
  over PL and PD carrying `guest: { competitions }` in the covered order; Entrant totals,
  ranks and Fixtures unchanged with a Guest ranked between them; three rows for one Base
  Model as Entrant, Guest and Exhibition; the Guest clause, after the Exhibition clause
  when both are present.
- `test/guest-seat-coexistence.test.ts`: the roster-invariance test now runs
  `overallRanking` over the real PL leaderboard body. With the Guest's row and its clause
  removed, the ranking equals the one without a Guest and contains no "argon".
- Each `/overall` row carries `role` and `baseModel` as its leaderboard row does (spec
  0029, "Read API bodies"), so ticket 0119 can find the rows of one Base Model.
- Mutation: removing the `guest:` key, the Competitions list or the clause, reordering the
  clauses, or skipping Guests again each fails at least one test. The invariance test seats
  its Guest under an Entrant's slug, so it fails on its own when the `guest:` key is gone.
- The label text comes from `guestOverallLabel` in `exhibition-view.ts`, which is tested.
  Whether `overall.astro` calls it is checked only by `astro check`.
- `COMBINED_RANKING_QUALIFICATION_WITH_EXHIBITION` is deleted; the tests compare against
  the clauses instead.
- A Guest's clause is decided by its rows, not by a body field: the leaderboard body
  carries none (0116's invariance test strips only the row).
