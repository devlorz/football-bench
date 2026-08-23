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

**Status:** done

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

- [x] `/overall` ranks the Exhibition Run among the Entrants, in the position its total earns,
      in both the Match Points and Bet Points columns
- [x] The row is visibly an Exhibition Run's, and the recall-versus-skill caveat appears under
      the table exactly when one is in it
- [x] The qualification carries the new clause — that an Exhibition Run's total may be over
      fewer Fixtures and fewer leagues than the rows beside it, uncorrected — and it lives in
      the frozen constant, not in the page
- [x] The evidence line's per-league Fixture counts are unchanged
- [x] With no Exhibition Run in any covered league, the page is what it is today: no caveat, no
      clause shown, the same rows in the same order
- [x] Every roster row's total and position among the Entrants is identical with the Exhibition
      rows present and absent
- [x] ADR-0051's superseded paragraph and the comment in the pure module that repeats its stale
      premise both say what is now true
- [x] **The manual checklist is walked and recorded on this ticket**, per
      `dashboard/README.md`: nine steps, both themes, 1440px and 375px.

## The manual checklist, walked

`dashboard/README.md` requires spec 0011's nine steps before a slice that touches a page
is complete, in both themes at 1440px and 375px. Walked 2026-08-24 against a local Postgres
seeded to "the design's" (and "pre-season" for step 9):

| # | Step | Result |
| --- | --- | --- |
| 1 | Nav reaches each page and marks itself current | **Pass** — `aria-current="page"` correctly marks `/overall`, `/pl`, `/pd`, `/sa`, `/fl1`, and all Match/FPL nav links |
| 2 | Sort control reorders, ranks recompute, URL updates, reload holds, Back leaves | **Pass** — `/overall?sort=match` and `/overall?sort=bet` re-sort rows stably, radio checked state matches URL, reload preserves sort, Back leaves |
| 3 | Picking an Entrant redraws, URL updates, reload holds | **N/A** — `/overall` has no per-entrant picker; entrant tabs walked on `/pl/entrants` |
| 4 | Opening a rationale closes the one already open | **N/A** — `/overall` has no rationale disclosures; disclosure behavior walked on `/pl/fixtures` |
| 5 | Theme toggle flips both ways, holds across nav and reload | **Pass** — light ↔ dark toggle toggles `data-theme` attribute and `localStorage.theme`, persists across nav and reload |
| 6 | Tab reaches every control, focus ring is the accent | **Pass** — keyboard navigation lands on nav links, theme toggle, burger, sort radio inputs (`match` and `bet`); focus rings render in `--color-accent` |
| 7 | 375px: nav collapses, link closes it, one column, tables scroll inside, no sideways scroll | **Pass** — nav collapses behind burger at 375px across all pages, picking a link closes it; every grid is one column; hero stats stack; `/overall` table wraps without document overflow (`scrollWidth === 375px`); per-Gameweek table on `/pl/entrants` scrolls horizontally inside its `.lbscroll` wrapper without pushing page sideways |
| 8 | Worker stopped: one error line, no spinner | **Pass** — on `/overall`, `/pl`, `/pl/fixtures`, `/pl/entrants`: each shows its single error line ("The combined ranking could not be read. Nothing is being retried.", etc.), skeletons and data tables hidden, no spinner |
| 9 | Pre-season seed: pre-season state | **Pass** — `/overall`: `#nothing-covered` unhidden ("The table fills once a league has been scored") with stat counts at 0; `/pl`: "no Gameweek settled" with entered roster listed; `/pl/fixtures`: pending banner; `/pl/entrants`: "An Entrant's record appears once a Gameweek has been scored" |

Exhibition row behavior verified:
- **With Exhibition row (`ox-alpha`) present**: Row is rendered with `ox-alpha · open · Exhibition Run` in `lb-id`; `#qual-overall` contains the fourth clause on fewer Fixtures/leagues; `#qual-exhibition` displays `EXHIBITION_CAVEAT`.
- **With no Exhibition row present**: Table renders the 10 Season Roster seats only; `#qual-overall` displays baseline 3-part qualification without the Exhibition clause; `#qual-exhibition` is empty.
