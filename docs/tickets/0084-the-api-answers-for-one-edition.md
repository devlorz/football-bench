# Ticket: The API answers for one Edition

**What to build:** every match-track read the dashboard is served from takes an Edition
and answers within it — leaderboard, Fixtures, Entrant record, retired Gameweek, and the
Combined Ranking's per-Competition bodies — bounding its Gameweeks to the Edition's range
and its seats to the Edition's members, with the Edition defaulting to the one now
playing so that every route that exists today returns exactly what it returns today.
Earlier Editions are reachable under a route prefix. No page changes in this ticket; the
JSON does. Source:
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md), *What
the dashboard shows* and *What the record holds*. Decisions it must not bend:
[ADR-0016](../adr/0016-each-snapshot-publishes-against-one-comparison-anchor.md) (the
Anchor and every Paired Difference are within one Edition, never across),
[ADR-0051](../adr/0051-a-combined-ranking-sums-the-leagues-and-publishes-what-that-costs.md)
(the Combined Ranking sums an Edition set; the Nations League joins none),
[ADR-0042](../adr/0042-the-match-track-restarts-under-amended-prompt-versions.md) (the
retired Gameweek stays a separate block inside Edition 1, not a third Edition).

**Blocked by:** 0082 (the Editions table and its helpers), 0083 (the membership predicate
the seat CTE reuses).

**Status:** drafted, 2026-09-22

---

## What is already known

**Membership is derived from two dates against the Edition's first Lock.** A seat is on
Edition N when its `created_at` is at or before Edition N's first Lock and its
`withdrawn_at` is null or at or after that Lock — the same predicate ticket 0083 lands,
now applied to the dashboard's shared seat CTE. No per-Edition roster list.

**Range, then members.** Season-to-date points, `scoredThrough`, settled-Fixture counts,
Gap counts and the Fixtures page's Gameweek list are bounded to Gameweeks from the
Edition's first Gameweek up to the next Edition's first Gameweek exclusive (or open-ended
for the current one). `rankedFrom` — today "retired Gameweek plus one" — becomes the
greater of that and the Edition's first Gameweek, so La Liga's retired block stays
inside its Edition 1.

**The current Edition is the default and the old URLs keep it.** `/api/pl/leaderboard`
means the Edition now playing; `/api/edition-1/pl/leaderboard` means Edition 1 once a
second exists. Before Edition 2 opens the two are the same body, and a test proves the
prefixed and unprefixed routes return byte-identical JSON on a one-Edition record.

**The Combined Ranking takes an Edition set.** Its body lists which Competitions and
which Edition of each it summed; the five leagues' Edition N form one set, and `UNL` is
never in a set. An Edition set whose Competitions are at different Edition numbers is
refused, not summed.

**A body says which Edition it is.** Each response carries the Edition number, its first
Gameweek and, for a closed Edition, its last, so the page (ticket 0085) can label it from
data and the frozen sentence needs no numbers of its own.

## Acceptance

- [ ] On today's production-shaped record (one Edition everywhere) every existing route
      returns the same JSON as before this ticket; a snapshot test holds it.
- [ ] On a fixture record with a league in Edition 2 from Gameweek 6: the unprefixed
      leaderboard ranks only Gameweek 6 onward over Edition 2's members; the Edition 1
      route ranks Gameweeks 1–5 over Edition 1's members, a withdrawn seat included and a
      new seat excluded; no figure in either body reads a Gameweek of the other.
- [ ] The Comparison Anchor and every Paired Difference on an Edition 2 body are computed
      from Edition 2 Gameweeks alone.
- [ ] The Fixtures route's Gameweek list and default Gameweek stay within the Edition.
- [ ] The retired-Gameweek route answers under Edition 1 and 404s under Edition 2.
- [ ] The Combined Ranking route sums the five leagues' Edition 1 bodies under the
      prefix and Edition 2's unprefixed; `UNL` appears in neither; a mixed set is refused.
- [ ] An unknown Edition number is a 404 with the Edition named; nothing falls back to
      "current".
