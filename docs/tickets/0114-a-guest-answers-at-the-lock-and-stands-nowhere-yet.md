# Ticket: A Guest answers at the Lock and stands nowhere yet

**What to build:** a `models` row with `role = 'guest'` is asked by the scheduled Match run at
every Lock after it exists. It uses the same stored context, pinned call path and three
Repairs as the roster. Its Predictions are scored, its Gaps are recorded and alert nobody,
and the single-model pre-flight accepts it. Every Entrant figure stays exactly where it was.
No page shows the Guest yet: it is recorded the way a Shadow Seat is, before 0115 ranks it.
Spec: [0029](../specs/0029-guest-seats.md). Decision:
[ADR-0064](../adr/0064-a-guest-seat-answers-at-the-lock-without-joining-the-roster.md).

Decisions it must not bend:
- every roster figure is identical with Guest rows present or absent: each Entrant's score,
  order, Comparison Anchor, interval, Gap rate and `scored_at`;
- a Guest is asked by the asked-at-Lock rule every seat uses, and nothing else;
- the "no Entrants configured" refusal still asks for an `entrant`, not merely a non-empty
  roster.

**Blocked by:** None — can start immediately.

---

## What is already known

- **The role check widens only.** `models_role_check` gains `'guest'` the way migration
  0019 added `'exhibition'`: no row rewrite and no guard. A new migration needs several
  test-list edits, and `rehearse-migration.test.ts` is one a targeted run never finds.
- **Every `role` filter decides about `guest` on purpose.** List each one in the PR with its
  decision:
  - the scheduled run's roster and work selects admit it;
  - the scorer's scored-rows select already admits it, since it excludes only `shadow`;
  - the Comparison Anchor, complete-case and interval selects stay `role = 'entrant'`;
  - the Gap alert stays `entrant`;
  - the Exhibition loader's default stays `['exhibition']`;
  - the pre-flight's single-model door admits `guest` beside `exhibition` and `shadow`.
- **`ModelRole` gains `"guest"`.** The read API's ranked branch admits only `entrant` and
  `exhibition` today, which is what keeps the Guest off every page until 0115.
- **The seam is `exhibition-candidate-coexistence`.** It already drives the pre-flight,
  `predictGameweek`, the Gap alert and `handleDashboardRequest` over one seeded Season. The
  Guest's coexistence test is built the same way and holds the roster-invariance assertion
  every later ticket reruns.

## Acceptance

- [ ] A Guest row inserted before a Gameweek's Lock is asked every Fixture of it, by the
      scheduled run, over the context row the roster was shown
- [ ] A Guest row inserted after a Lock is not asked that Gameweek, and is asked the next
- [ ] A withdrawn Guest is not asked from its next Lock
- [ ] A Competition with Guests and no Entrant is refused, as one with no seats is today
- [ ] A Guest's Prediction is scored. Its Gap is recorded, never back-filled, and raises no
      Gap alert
- [ ] The single-model pre-flight runs against a Guest row
- [ ] Every Entrant figure is identical with the Guest rows present and absent, asserted in
      the coexistence test
- [ ] No page and no read API body shows the Guest
