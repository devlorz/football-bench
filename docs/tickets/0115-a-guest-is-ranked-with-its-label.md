# Ticket: A Guest is ranked with its label

**What to build:** a Competition's readable ranking shows each Guest among the Entrants, by
the same ordering, labelled "Guest · from GW N". Its Season-to-date and its Gap rate count
from its first Lock, its `n` is shown, and it carries no recall caveat. A closed Edition
with no Guest renders byte for byte as before. Spec: [0029](../specs/0029-guest-seats.md).
Decision: [ADR-0064](../adr/0064-a-guest-seat-answers-at-the-lock-without-joining-the-roster.md).

Decisions it must not bend:
- the roster-invariance assertion from 0114, rerun;
- a Guest's Gap rate is published, unlike an Exhibition Run's, which ADR-0052 withholds. A
  Guest's Gap is a missed deadline, as an Entrant's is;
- frozen text is a constant, never a row.

**Blocked by:** [0114](0114-a-guest-answers-at-the-lock-and-stands-nowhere-yet.md).

---

## What is already known

- **The first Lock is one derivation used three times.** It is the first Gameweek whose
  deadline follows the row's `created_at`, under the asked-at-Lock rule. It is this
  ticket's "from GW N", the start of the Season-to-date, and 0118's cap. Write it once.
- **Bodies carry the facts the combine step will need**, so 0119 adds no API field. Every
  ranked row gains `role` and `base_model`, and a Guest gains `guest: { fromGw }` beside the
  existing `exhibition: { ranAfterGw }`. Both are null on an Entrant.
- **Gaps are counted over Fixtures the Guest was asked**, never over those before its first
  Lock. The Entrants' Gap count already follows the same membership.
- **Two roster splits read "not an Exhibition" as "roster".** `read-api.ts` filters
  `row.role !== "exhibition"` in the leaderboard (`rosterRows`) and the entrant records.
  Safe only while `SEATS_CTE` admits `entrant` and `exhibition` alone: widen the CTE for
  `guest` and both count the Guest as roster. Narrow them to `role === "entrant"` in the
  same change. The scorer writes no `gap_rate` row for a Guest yet either (`matchRoster` is
  `entrant` only), so its Gap rate needs its own derivation here. Found in 0114's review.
- **The label sentence** lives in the dashboard's frozen-text module beside the
  Exhibition's.

## Acceptance

- [ ] A Guest appears in its Competition's ranking, ordered by the page's existing rule,
      with "Guest · from GW N" and its `n`
- [ ] Its Season-to-date and Gap rate count from its first Lock
- [ ] It carries no Exhibition caveat
- [ ] Every ranked row's body carries `role` and `base_model`, and a Guest's carries
      `guest.fromGw`
- [ ] A closed Edition's page with no Guest is byte-identical to before
- [ ] The roster-invariance assertion still holds
