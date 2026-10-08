# Ticket: The API answers for one Edition

**What to build:** every match-track read the dashboard is served from takes an Edition
and answers within it — leaderboard, Fixtures, Entrant record, retired Gameweek — bounding
its per-Gameweek reads to the Edition's range and its seats to the Edition's members,
with the Edition defaulting to the one now playing so that every route that exists today
returns exactly what it returns today. Earlier Editions are reachable under a route
prefix, and every body says which Edition it is. The cumulative figures a body carries
(season-to-date points, the Anchor, the Paired Differences) are **read as the scorer
wrote them** — ticket 0097 is what makes those Edition-bounded; this ticket reads the
right row and bounds everything that is counted at read time. No page changes in this
ticket; the JSON does. Source:
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md), *What
the dashboard shows* (as amended 2026-10-08) and *What the record holds*. Decisions it
must not bend:
[ADR-0016](../adr/0016-each-snapshot-publishes-against-one-comparison-anchor.md) (the
Anchor and every Paired Difference are within one Edition — written so by 0097, never
recomputed here),
[ADR-0051](../adr/0051-a-combined-ranking-sums-the-leagues-and-publishes-what-that-costs.md)
(the Combined Ranking sums an Edition set; the Nations League joins none — enforced where
the sum is made, which is the page, ticket 0085),
[ADR-0042](../adr/0042-the-match-track-restarts-under-amended-prompt-versions.md) (the
retired Gameweek stays a separate block inside Edition 1, not a third Edition).

**Blocked by:** 0082 (the Editions table and its helpers), 0083 (the membership
predicate the seat CTE reuses), 0096 (its `created_at` half — a new seat excluded from
Edition 1 is that predicate, not a second one here), 0097 (the cumulative rows this
ticket reads at `throughGw` must already be Edition-bounded, or boxes 2 and 3 cannot
pass).

**Status:** drafted, 2026-09-22; redrafted 2026-10-08 after reading the scorer — the
first draft assumed a read-side bound could deliver Edition 2's totals, and it cannot.

---

## What is already known

**Where the first draft was wrong, and why.** The leaderboard reads the stored
`*_season_to_date` row at `gw = throughGw`; the scorer accumulates that row from
Gameweek 1. ADR-0042's retired cut works on the read side only because La Liga's v1 and
v2 seats are different rows. An Edition keeps the continuing seat's row, so the stored
total at an Edition 2 Gameweek contains Edition 1 inside it and no read-side bound can
remove it. The bound moved to the scorer (0097); this ticket reads.

**Membership is one predicate, already written.** A seat is on Edition N when
`isAskedAtLock("m", <Edition N's first Lock>)` holds — ticket 0083's helper, with the
`created_at` half ticket 0096 adds. The seat CTE calls it for `role = 'entrant'` rows
and does not restate it. Exhibition rows are not filtered by it (ADR-0061: an
Exhibition Run crosses the boundary as a playing seat does), but the derivation of an
Exhibition row's "ran after Gameweek N" label is bounded to the Edition's Gameweeks, so
the label never names a Gameweek of another Edition.

**Range at read time, for what is counted at read time.** `scoredThrough`, the
settled-Fixture count, the Gap count, the Fixtures page's Gameweek list and its default
Gameweek are bounded to Gameweeks from the Edition's first Gameweek up to the next
Edition's first Gameweek exclusive (open-ended for the current one). `rankedFrom` — today
"retired Gameweek plus one" — becomes the greater of that and the Edition's first
Gameweek, so La Liga's retired block stays inside its Edition 1. One function in the
Editions module answers `{ edition, firstGameweek, lastGameweek | null, firstLock }` for
a Competition and an optional Edition number: omitted means the latest, an unknown
number is the 404 below.

**The current Edition is the default and the old URLs keep it.** `/api/pl/leaderboard`
means the Edition now playing; `/api/edition-1/pl/leaderboard` means Edition 1 once a
second exists. The router strips the prefix and hands the four handlers an Edition
scope; nothing else about the handlers' shape changes. Before Edition 2 opens the two
are the same body, and a test proves the prefixed and unprefixed routes return
byte-identical JSON on a one-Edition record.

**A body says which Edition it is.** Each response carries the Edition number, its first
Gameweek and, for a closed Edition, its last, so the page (ticket 0085) can label it from
data and the frozen sentence needs no numbers of its own. The Combined Ranking is summed
on the page from these bodies, so "a mixed set is refused" is the page's check (0085)
over the `edition` field this ticket adds — there is no Combined Ranking route to refuse
it here.

**What ticket 0083 left for this one (2026-10-07).** The scorer writes a withdrawn seat's
cumulative rows at every Gameweek after its stamp (its `byEntrant` loop reads
Predictions, not the roster) while its `gap_rate` rows stop at the stamp. The seat CTE's
predicate is what keeps those frozen totals off the page: a seat withdrawn at Edition
2's first Lock is not a member of Edition 2 and is not read.

## Acceptance

- [ ] On today's production-shaped record (one Edition everywhere) every existing route
      returns the same JSON as before this ticket; a snapshot test holds it.
- [ ] On a fixture record with a league in Edition 2 from Gameweek 6, scored by 0097's
      scorer: the unprefixed leaderboard ranks over Edition 2's members and its totals
      are the Gameweek 6-onward rows; the Edition 1 route ranks Gameweeks 1–5 over
      Edition 1's members, a withdrawn seat included and a seat entered after Edition
      1's last Lock excluded; no count or list in either body reads a Gameweek of the
      other.
- [ ] The Anchor and Paired Differences a body carries are the rows 0097 wrote for that
      Gameweek, read unchanged; a test proves the body never recomputes them.
- [ ] The Fixtures route's Gameweek list and default Gameweek stay within the Edition.
- [ ] The retired-Gameweek route answers under Edition 1 and 404s under Edition 2.
- [ ] Every leaderboard body carries `edition`, its first Gameweek and, when closed, its
      last; an Exhibition row's "ran after" label never names a Gameweek outside the
      body's Edition.
- [ ] An unknown Edition number is a 404 with the Edition named; nothing falls back to
      "current".
