# Ticket: The rule that adds four leagues up, and the sentence it may not be published without

**What to build:** The whole of the combined ranking's arithmetic, as a pure module with no
DOM, no database and no fetch, plus the qualification sentence that must appear under any
table built from it. Hand it the four leagues' leaderboard bodies and it answers with the
ranked rows, the covered leagues, the Fixture breakdown and which state the page is in.
Nothing renders yet; everything that can be wrong is decided and pinned here. Source:
[spec 0025](../../specs/0025-the-combined-ranking.md), Implementation and Testing Decisions.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

---

## What is already known

The bodies this module reads are already published and need no change. `/api/{code}/leaderboard`
answers `active`, `throughGw`, `settledFixtures` and, per row, `matchPoints`, `betPoints`,
`baseModelClass`, `n` and `exhibition`. The module reads those and nothing else.

Three prior modules set the pattern and the reason for it — `competition-view.ts`,
`fpl-view.ts` and `chart-domain.ts` — under the rule spec 0014 wrote down: a page's own script
is a fetch and a render and has no test; these functions do. Every rule below is here because
it renders perfectly while being wrong.

**A Competition is covered when `active` is true and `throughGw` is not null.** The two
exclusions are different states and must be handled separately: a league nobody has entered,
and a league that has opened and scored nothing. The second answers every figure with null, and
counting it would add a nought that reads as a score.

**The covered set is decided once for the table and never per row.** This is the load-bearing
rule. Under a raw sum, a league missing from one row's total is a nought in it, so rows covering
different sets are not a ranking of anything.

**La Liga's retired Gameweek 1 needs no handling.** `rankedFrom` refuses it to every figure the
per-league body carries (ADR-0042), so the exclusion arrives already made and this module must
not re-implement it.

**The qualification has no row to be read back from.** Every other figure this dashboard
publishes reads its qualification out of the `scores` row the scorer wrote it into; this figure
is computed in a browser from four rows that each carry their own. The sentence is therefore a
frozen constant in a module of its own, the form `EXHIBITION_CAVEAT` already takes, and not a
new row for the scorer to write — writing one would put two Competitions in one call to obtain
a string, which is the property ADR-0051 spends its length protecting.

## Acceptance

- [x] Totals are the sum of the covered leagues' figures for both columns, and reconcile by hand
      with the bodies handed in.
- [x] A league with `active: false` is excluded, and a league with `active: true` and a null
      `throughGw` is excluded, asserted separately — one fix must not be able to hide the other.
- [x] Every row's total covers the same leagues, asserted on a case where one Entrant has figures
      another does not.
- [x] A row carrying `exhibition` is absent from the output entirely, and no Exhibition caveat is
      returned for a table that holds none.
- [x] Rows are keyed by the seat's slug through the existing helper, so one Base Model under four
      Competition-prefixed ids is one row and not four, and no second way of deriving a slug is
      written.
- [x] A seat that Gapped a whole covered league scores nought there and still ranks, which is what
      its body already says.
- [x] The Fixture breakdown and its total are drawn from the covered set only, and the total equals
      the breakdown's sum.
- [x] The covered leagues are reported in the order the page will render them.
- [x] The nothing-covered state is distinguishable from the ranking state by what the module returns,
      not by an empty array a caller has to interpret.
- [x] The module holds no copy of `MATCH_PROMPT_COMPETITIONS` itself. It takes each Competition's
      body pre-labelled with its code, so the page (a later ticket) reads `MATCH_PROMPT_COMPETITIONS`
      directly for its fetch list — the same list the build and the read API already share — without
      this module re-exporting it and dragging `zod` and the rest of the server-side prompt tooling
      into a browser bundle, which is the leak `entrant-link.ts` was already written to stop.
- [x] Ties rank as the per-league leaderboard ranks them.
- [x] The qualification constant states all three of: the total is a raw sum across leagues; a league
      with more settled Fixtures weighs more; the leagues run under different Prompt Versions, the
      confound ADR-0038 names for exactly this comparison.
- [x] `read-api.ts`, the scorer, the scheduler, the schema and every migration are untouched, and the
      existing read API suites stay green unchanged.
