# Ticket: Season-to-date starts at the Edition's first Gameweek

**What to build:** every cumulative figure the scorer writes for a Gameweek — the
season-to-date Match Points, Bet Points, hit and score percentages and their
`{ gameweeks: [...] }` detail, the Comparison Anchor and every Paired Difference, the
Gap rate and attempts-to-valid — accumulates from the first Gameweek of the Edition
the target Gameweek is in, not from Gameweek 1. For a Competition in its first Edition
nothing changes: every row it writes is byte-identical to today's, and re-scoring any
Gameweek of Edition 1 after Edition 2 has opened still leaves Edition 1's rows exactly as
they were. For a Gameweek of Edition 2 the cumulative rows hold Edition 2's Gameweeks
alone, so a seat that played both Editions carries two independent totals in one row
of `models`, told apart by Gameweek. Source:
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md), *What
the dashboard shows* ("every figure is within one Edition… all read from the Edition's
first Gameweek"), as amended 2026-10-08 to say the figure is *written* bounded, not read
bounded. Decisions it must not bend:
[ADR-0016](../adr/0016-each-snapshot-publishes-against-one-comparison-anchor.md) (one
Anchor per snapshot, chosen among the seats asked; now among the Edition's Gameweeks),
[ADR-0042](../adr/0042-the-match-track-restarts-under-amended-prompt-versions.md) (La
Liga's retired Gameweek 1 stays excluded exactly as it is today),
[ADR-0012](../adr/0012-two-output-layers-points-for-the-leaderboard-probabilities-for-the-evidence.md)
(a figure is never published without its qualification — the qualification a cumulative
row carries has to say what it is cumulative over).

**Blocked by:** 0082 (`readEdition` is how the scorer learns the target's first
Gameweek). Not blocked by the roster ADR: it changes what the scorer writes for an
Edition that *could* open, and until one does every Edition is the first.

**Status:** drafted, 2026-10-08

---

## What is already known

**Why the retired-Gameweek precedent does not carry.** ADR-0042's cut is enforced on the
read side (`rankedFrom`), and that was enough because La Liga's v1 and v2 seats are
different `models` rows: v2's cumulative at Gameweek 2 was empty at Gameweek 1 by
construction. An Edition keeps the continuing seat's row (ADR-0061, *What the record
holds*), so Claude Opus 5's season-to-date row at Edition 2's third Gameweek would hold
Edition 1's five Gameweeks inside it, and no read-side bound can take them back out of a
stored total. The bound has to be where the total is made. Ticket 0084 was drafted on
the read-side assumption and is corrected to depend on this ticket.

**One lower bound, read once per target.** The scorer already resolves its roster per
target Gameweek (ticket 0083). It now also resolves the target's Edition — `readEdition`
from ticket 0082 — and every place that today filters `gw <= target` filters
`gw >= firstGw and gw <= target`. The four places are known (the season-to-date pass,
the Locked-Fixture pass, the settled-forecast pass and the comparison candidates); they
take the bound from one value, not four lookups. A Competition whose Editions table
holds only Edition 1 resolves `firstGw = 1`, which is today's behaviour exactly.

**The retired Gameweek stays out by the same mechanism it uses today.** La Liga's
retired seats are different rows under a different Prompt Version; nothing here touches
them, and `rankedFrom` on the read side keeps meaning what it means. A test holds that
La Liga's cumulative rows are byte-identical before and after.

**"Season-to-date" keeps its name and changes its scope.** The metric names
(`match_points_season_to_date` and the rest) are a wide rename across the scorer, the
read API, the dashboard and the tests, and they are not renamed here. What a reader sees
is the qualification: the sentence the cumulative row carries in `detail` says it is
cumulative over the Edition's Gameweeks, and names the first one, so a figure that says
"Season-to-date" over a stored sentence saying "from Gameweek 6" is not a lie. The
frozen sentence constants are the place that moves (frozen text is a constant, never a
row); the scorer writes whichever applies.

**What this does not do.** It does not filter a withdrawn seat's cumulative rows after
its stamp — ticket 0083 deferred that and the read side hides them (0084). It does not
read `created_at` — that is 0096's predicate, which the scorer gets for free once 0096
lands, and the two tickets do not conflict because they bound different things (which
Gameweeks; which seats).

## Acceptance

- [ ] On a record whose every Competition is in Edition 1, scoring any Gameweek writes
      rows byte-identical to the rows the current scorer writes; a test runs both over
      the same fixture and compares every `scores` row.
- [ ] On a record with a league in Edition 2 from Gameweek 6: scoring Gameweek 7 writes
      season-to-date rows over Gameweeks 6–7 only, a Comparison Anchor chosen over
      Gameweeks 6–7, and a `detail.gameweeks` list beginning at 6; the seat that played
      Gameweeks 1–5 and 6–7 has two totals that sum to its Season total and share no
      Gameweek.
- [ ] Re-scoring Gameweek 3 of that league after Edition 2 has opened leaves every
      Gameweek 1–5 row byte-identical to before.
- [ ] La Liga's rows — retired Gameweek 1 excluded, Gameweek 2 onward cumulative — are
      byte-identical before and after.
- [ ] The cumulative row's qualification names the Edition's first Gameweek when it is
      not 1, from a frozen constant; a test pins the constant's bytes and proves the
      number comes from the Editions table.
- [ ] The FPL scorer is untouched; its suites pass.
