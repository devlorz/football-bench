# Ticket: The dashboard switches between Editions

**What to build:** a reader can move between three views — Edition 1 of the five leagues,
the Nations League's Edition 1, and Edition 2 of the five leagues — and every page in a
view (the Competition leaderboard, its Fixtures and Entrant record pages, `/overall`)
reads that view's Edition from the API. The current Edition keeps today's URLs; an
earlier Edition's pages live under `/edition-1/…`, carry the label "Edition 1 · Gameweek
1–N" with N from the data, and open with a frozen sentence saying why the Edition ends
there and naming ADR-0061 and the ADR that opened the next one. Before a second Edition
exists the site renders exactly as it does today, switcher and prefix included, with the
switcher offering one league set and the cup. Source:
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md), *What
the dashboard shows*. Decisions it must not bend:
[ADR-0051](../adr/0051-a-combined-ranking-sums-the-leagues-and-publishes-what-that-costs.md)
(`/overall`'s qualification is published beside the sum; it gains the Edition-set clause
and the roster-differs-between-Competitions clause ADR-0060 owes),
[ADR-0042](../adr/0042-the-match-track-restarts-under-amended-prompt-versions.md) (the
retired block's rendering is unchanged and appears on Edition 1's La Liga page only).

**Blocked by:** 0084 (the bodies carry the Edition and the prefixed routes exist).

**Status:** drafted, 2026-09-22

---

## What is already known

**Same pages, one more parameter.** The Astro pages are built once per route; the prefix
is a second route set pointing at the same components with the Edition fixed, and the
worker serves the same assets under both. No second build, no static snapshot of Edition
1 — a live read of a closed Edition equals a snapshot.

**The switcher reads the Editions table through the API**, not a constant: the set of
views is "for each distinct (Edition set) the leagues have, one entry" plus the cup's
own. Adding Edition 3 one day is a row, not a deploy.

**The frozen sentence is a constant, and the numbers on it are not.** ADR-frozen text
lives beside `RETIRED_GAMEWEEK_CAVEAT`; the Gameweek range on the label and in the
sentence's "through Gameweek N" comes from the body. The dashboard suite pins the
sentence's bytes the way it pins the other caveats.

**`/overall` says what it summed.** Its qualification gains one clause: which Edition of
which Competitions, and that the Nations League is not in the sum because its roster is
not the leagues'. The hero's settled-Fixture stat and the evidence line are the Edition's.

**Narrow viewports.** The switcher is one more control in the header; the
testing-narrow-viewports runbook's checklist runs over it.

## Acceptance

- [ ] On a one-Edition record, the built site's HTML and the rendered pages are
      byte-identical to today's except for the switcher, which offers "2026-27" for the
      leagues and "UNL" for the cup and nothing else.
- [ ] On a two-Edition record: `/pl` shows Edition 2 from its first Gameweek with a
      leaderboard, Fixtures and Entrant pages reading only Edition 2; `/edition-1/pl`
      shows Edition 1 through its last Gameweek with the label, the frozen sentence and
      the retired block where one exists; links between pages stay inside the view.
- [ ] `/overall` and `/edition-1/overall` each sum their own set and say so in the
      qualification; neither includes the cup.
- [ ] The switcher moves between the three views on every page, and the current view is
      marked; deep links into an earlier Edition work without visiting the switcher.
- [ ] The frozen sentence's bytes are pinned by a test; the Gameweek numbers on the label
      are proven to come from the body by changing the fixture data.
- [ ] Narrow-viewport checklist passes with the switcher present.
