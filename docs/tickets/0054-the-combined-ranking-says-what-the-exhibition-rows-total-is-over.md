# Ticket: The combined ranking says what an Exhibition Run's total is over

**What to build:** `/overall` shows the Exhibition Run in the ranked table, labelled, with the
recall-versus-skill caveat under it, and its qualification tells the reader the one thing the
arithmetic will not: that an Exhibition Run's total may be over fewer Fixtures, and in fewer
leagues, than the rows it is ranked beside, and that the sum does not correct for it. Source:
[spec 0026](../specs/0026-exhibition-runs-reach-the-remaining-surfaces.md). Decisions:
[ADR-0052](../adr/0052-an-exhibition-run-shows-up-wherever-it-answered.md), amending
[ADR-0051](../adr/0051-a-combined-ranking-sums-the-leagues-and-publishes-what-that-costs.md).

**Blocked by:** None — can start immediately, and does not wait on the other two. The
arithmetic is done; what is missing is the page.

**Status:** ready-for-agent

---

## What is already known

**The summing half is built and pinned.** The combined ranking's pure module sums an Exhibition
Run like any other row, carries a flag saying which rows are Exhibition Runs, and keys them
apart from the roster's rows so a Base Model holding an Entrant's seat in one league and an
Exhibition Run's in another is never added into one row. That last case is not hypothetical:
section 3 of the new-Base-Model runbook puts every candidate in exactly that state. What
remains is the page.

**The flag is a boolean and not the leaderboard's label, on purpose.** "Ran after Gameweek N"
names one Competition's Gameweek, and this row spans several. The page says what the row is and
leaves which Gameweek to the league it came from.

**The caveat needs no new import.** The page already fetches the four leaderboard bodies, and
each carries the caveat exactly when a labelled row is in it.

**ADR-0051's qualification is a frozen constant in a module of its own**, and gaining a clause
is an edit to that constant — not a string in the page and not a row the scorer writes.

**The evidence line is not the place for this.** Its per-league Fixture counts describe the
sum's denominator, which is the roster's, and are unchanged.

## Acceptance

- [ ] `/overall` ranks the Exhibition Run among the Entrants, in the position its total earns,
      in both the Match Points and Bet Points columns
- [ ] The row is visibly an Exhibition Run's, and the recall-versus-skill caveat appears under
      the table exactly when one is in it
- [ ] The qualification carries the new clause — that an Exhibition Run's total may be over
      fewer Fixtures and fewer leagues than the rows beside it, uncorrected — and it lives in
      the frozen constant, not in the page
- [ ] The evidence line's per-league Fixture counts are unchanged
- [ ] With no Exhibition Run in any covered league, the page is what it is today: no caveat, no
      clause shown, the same rows in the same order
- [ ] Every roster row's total and position among the Entrants is identical with the Exhibition
      rows present and absent
- [ ] ADR-0051's superseded paragraph and the comment in the pure module that repeats its stale
      premise both say what is now true
