# Ticket: The dashboard shows two different n

**What to build:** the FPL page shows the FPL track's own roster and the Match page shows
the Match track's, so a reader who compares the two is told there are two populations
rather than left to infer one. Source:
[spec 0023](../specs/0023-seven-seats-open-the-fpl-track.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md) — **Season Roster**, **Entrant**, **Track**.

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
- [x] The Match entrants read is untouched and reads ten from the same fixture — the
      assertion that catches a filter applied one table too widely.
- [x] Tests at the existing seams: the FPL API suites for leaderboard, squads and entrants
      and the FPL view suite, all against a fixture that withdraws seats, and the Match
      entrants suite against the same fixture.

**One thing the work turned up.** Two of the four filters went in as `//` comments inside
SQL template literals, which Postgres reads as syntax rather than as nothing — every squads
and leaderboard test failed at once, which is the cheapest way this could have been found.
They are `--` now. Nothing reached a branch anyone else reads.

## Not in this ticket

**Saying anything about the difference in prose on the page.** Two different n is a fact
the numbers now carry; whether the page should also explain it is a design question and
belongs with whoever owns the page's copy.

**Cross-track comparison surfaces.** Nothing on the dashboard computes across the two
tracks today, so nothing needs to learn about the divergence beyond the counts.
