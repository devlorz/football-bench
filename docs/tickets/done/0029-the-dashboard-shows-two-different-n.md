# Ticket: The dashboard shows two different n

**What to build:** the FPL page shows the FPL track's own roster and the Match page shows
the Match track's, so a reader who compares the two is told there are two populations
rather than left to infer one. Source:
[spec 0023](../../specs/0023-seven-seats-open-the-fpl-track.md). Vocabulary:
[CONTEXT.md](../../../CONTEXT.md) — **Season Roster**, **Entrant**, **Track**.

**Blocked by:** 0028 — the column, the withdrawal list and the dates are its output.

**Status:** ready-for-agent

Until this lands, the FPL page lists every seat and shows the withdrawn ones on nought
points, which reads as three Base Models that played the Season and lost rather than three
that never held a Season path. The dashboard's entrant-count line is already derived from
the list it is handed, so it follows the filter on its own — what has to move is the three
reads behind it.

- [x] **All four** FPL reads skip withdrawn seats — `fplLeaderboard`, `fplSquads`, and the
      two inside `fplEntrants` (the Manager State replay and the entrant-name list, which
      are separate queries in one endpoint). Four, not three: the two Manager-State-shaped
      reads sit in different endpoints and one of them is easy to take for the other.
- [x] The four are checked against the code rather than against this list — every place
      `FPL_PROMPT_VERSION` is passed to a query in the read API carries the filter.
- [x] The FPL entrants body carries only standing seats, and the view's entrant-count line
      reads the same number without a second count of its own. The page needed no edit:
      `fpl.astro` and its two siblings pass `body.entrants.length` into `statusLine`, so the
      count followed the filter the moment the read did. The line's own rendering is already
      covered in the view suite.
- [x] The Match entrants read is untouched and answers with every seat it held while every
      `fpl/` row is withdrawn — the assertion that catches a filter applied one table too
      widely. **Ten and seven are production's numbers, not a fixture's:** the seeded Season
      seats nine per track, so what a suite can prove here is the behaviour — filtered on one
      track, unfiltered on the other — and the counts that matter are checked where the
      roster is, in the season-roster and start-track suites.
- [x] Tests at the existing seams, and they are two different kinds. The FPL API suites for
      leaderboard, squads and entrants run against a fixture that withdraws seats, as does
      the Match entrants suite. The FPL view suite does not: it reads the page sources and
      asserts the wiring — every `statusLine` call takes the served list's length and no page
      names a roster-size constant — because the count is the page's own arithmetic over a
      body the API already filtered, and a fixture cannot reach it.

**Why the withdraw-and-restore setup is copied across three API suites rather than
extracted.** Six lines, three files, and each suite seeds and reads through its own
connections; the only thing they share is a shape. This project's rule for that is to wait
for a forced simultaneous edit rather than to extract on similarity, so it stays copied
until one arrives.

**One thing the work turned up.** Two of the four filters went in as `//` comments inside
SQL template literals, which Postgres reads as syntax rather than as nothing — every squads
and leaderboard test failed at once, which is the cheapest way this could have been found.
They are `--` now. Nothing reached a branch anyone else reads.

## The manual checklist, walked

`dashboard/README.md` requires spec 0011's nine steps before a slice that touches a page is
complete, in both themes at 1440px and 375px. Walked 2026-08-21 against a local Postgres
seeded to "the design's" with `fpl/glm`, `fpl/minimax` and `fpl/qwen` withdrawn, so the
fixture carries the shape production will: six standing FPL seats against nine on the match
track. 375px measured inside an iframe, per `docs/runbooks/testing-narrow-viewports.md`.

| # | Step | Result |
| --- | --- | --- |
| 1 | Nav reaches each page and marks itself current | **Pass** — `aria-current="page"` moves with the page |
| 2 | Sort control reorders, URL updates, reload holds | **N/A** — the FPL leaderboard has no sort control; its views are Table/Race/Cards |
| 3 | Picking an Entrant redraws, URL updates, reload holds | **Pass** — six pickable seats, `?entrant=deepseek`, h1 and pressed state survive reload |
| 4 | Opening a rationale closes the one already open | **N/A** — no disclosure on the FPL pages; the rationale disclosure is the match track's |
| 5 | Theme toggle flips both ways and holds across nav and reload | **Pass** — light↔dark, `localStorage.theme`, held across two navigations and a reload |
| 6 | Tab reaches every control, focus ring is the accent | **Pass** — `solid 2px rgb(169, 92, 205)` = `--color-accent`, not the UA default |
| 7 | 375px: nav collapses, link closes it, one column, tables scroll inside, no sideways scroll | **Pass with one defect** — see below |
| 8 | Worker stopped: one error line, no spinner | **Pass** — one line per page, no `aria-busy`, no rows |
| 9 | Pre-season seed: pre-season state | **Pass** — all three pages read "6 ENTRANTS" and `entered-count` is 6 |

Both themes at 375px: `innerWidth` 375, the 760px breakpoint active, `documentElement.scrollWidth`
360, one grid and no multi-column track, nav `display: none` until the burger and `block` after.

**The defect step 7 found, which is not this slice's.** With the burger menu open at 375px the
page scrolls sideways by 14px: `NAV.navlinks` and its three links measure to x=390 against a
375px viewport. Closed, the document is 360px wide and does not scroll. The nav is shared
chrome and untouched here, so it is spun out rather than fixed in this ticket.

**The defect step 7 did not find, and a screenshot did.** Every measurement above passed while
the ranking printed 1, 2, 5, 6, 7, 9 for six seats. Filtering the seat read left the score rows
of withdrawn seats in the ranking's arithmetic — a place is one more than the seats above it —
so the survivors kept their old places and the Δ column measured movement against a field that
no longer existed. Fixed in this ticket: the totals read joins `models` and carries the same
filter, and the leaderboard suite now bounds every rank by the size of the field it is a place
in. The runbook's line about screenshots earned itself here: the numbers all said pass.

## Not in this ticket

**Saying anything about the difference in prose on the page.** Two different n is a fact
the numbers now carry; whether the page should also explain it is a design question and
belongs with whoever owns the page's copy.

**Cross-track comparison surfaces.** Nothing on the dashboard computes across the two
tracks today, so nothing needs to learn about the divergence beyond the counts.
