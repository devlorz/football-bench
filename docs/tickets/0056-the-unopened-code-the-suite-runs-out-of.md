# Ticket: The unopened Competition code the suite is about to run out of

**What to build:** every test that needs "a Competition code the schema admits and nothing
has opened" keeps testing that case after the fifth league opens. Seven test sites use
`BL1` for it today, and they do so because it was the one code in migration 0022's
`competition_code` domain no ticket was about to open — a property
[ADR-0054](../adr/0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md) removes.
There is no sixth code to move them to. A prefactor: no behaviour changes, the suite is
green before and after, and every ticket below it lands without dragging a test rewrite
along.

**Blocked by:** None — can start immediately, and should, because it is the only ticket
here that can run while the curation is still being derived.

**Status:** ready-for-agent

---

## What is already known

The seven sites, and what each asserts `BL1` produces: no frozen Prompt Version
(`openrouter-entrant`, `season-roster`), no curated divisions
(`fetch-football-data-season`), no Understat league (`fetch-understat-season-xg`), no
stored division history (`build-historical-context`), no listed Season article
(`build-head-coach-context`), and — the two that are not about a registry — no built route
(`dashboard-competition-view`) and a 404 from the read API (`dashboard-read-api`).

`dashboard-read-api`'s comment states the problem in its own words: it read `SA` until
Serie A was opened, and an unopened code "has to be one no ticket is about to open". That
test pairs `/api/xx/leaderboard` — a typo, outside the domain — against
`/api/bl1/leaderboard` — a real code nobody serves — precisely to show the reader gets the
same answer either way. Once every code in the domain is served, the second half of that
pair cannot be written. **Whether the distinction is worth keeping is this ticket's call
to make and to write down**, and dropping it silently is not one of the options.

The route-enumeration test in `dashboard-competition-view` is not this ticket's: `BL1`
joins that list as a real entry when its Prompt Version is frozen, which is ticket 0058's
change to make and to assert.

## Acceptance

- [ ] Every registry-absence test states its case with a code that stays unopened for as
      long as the assertion is meant to hold, and none of them depends on `BL1` in
      particular.
- [ ] The read API's 404 test either keeps the valid-but-unserved case under a code that
      keeps that property, or records in the test itself why the case is gone and what
      still covers the typo.
- [ ] No production code changes. The suite is green before and after, and the diff is
      tests and comments only.
