# Spec 0026 — Exhibition Runs reach the remaining surfaces

**Status:** ready-for-agent
**Scope:** the read API's two per-Competition bodies, the combined ranking's pure module, and the three pages that render them. No schema, no scorer, no write path.
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:** [ADR-0052](../adr/0052-an-exhibition-run-shows-up-wherever-it-answered.md)

---

ADR-0032 admitted Exhibition Runs to the record and scoped their surface to "the readable
Match Points and Bet Points tables only". [ADR-0052](../adr/0052-an-exhibition-run-shows-up-wherever-it-answered.md)
replaces that list with a test — an Exhibition Run appears, labelled and caveated, on every
surface that publishes what it answered, and enters no figure of the evidential layer — and
this spec turns that test into buildable, testable requirements for the three surfaces the
list could not answer.

Reads ADR-0012 (a claim about one Base Model forecasting better than another rests on Paired
Differences and their interval), ADR-0028 (a static build that fetches at runtime), ADR-0038
(one Prompt Version per Competition), ADR-0039 (every Competition owns a path and a seat's
slug is its identity across leagues), ADR-0042 (a figure published with the reason it proves
nothing), and ADR-0051 (the combined ranking is a raw sum that states what it costs).

## Problem Statement

`stealth/ox-alpha` holds four Exhibition seats, has answered nineteen Fixtures across four
Competitions, is scored, and is ranked among the Entrants on four leaderboards. A reader who
sees it there and wants to know more has nowhere to go.

Clicking into a Fixture shows the ten Entrants' forecasts and not the Exhibition Run's, so
the one page where a reader could ask "what did it actually say about this match, next to
what everyone else said" is the page that omits it. Opening its record is impossible: the
entrant record endpoint selects the roster, so the row that appears on the leaderboard has no
record behind it — a rank with nothing underneath. And the combined ranking drops it, which
means the dashboard ranks it four times and then refuses to add those four rankings up.

The reader is left able to see that an Exhibition Run placed fifth in the Premier League and
unable to see anything else about it, including the two Fixtures it never answered.

## Solution

The Exhibition Run reaches all three surfaces under one rule, carrying its label and the
recall-versus-skill caveat wherever it appears.

On a **Fixture**, it is an eleventh forecast beside the roster's ten — on the Fixtures it
answered, and absent from the ones it did not, because an empty slot on that page already
means "asked before the Lock and did not answer" and an Exhibition Run was never asked.

On its **record**, it publishes what the roster's rows publish, minus one figure: Gap rate is
withheld and said to be withheld, because an Entrant's Gap is a missed deadline and an
Exhibition Run's is an operator's run failing, and one column cannot carry both meanings. In
its place the record shows what it answered against what the roster was asked.

On the **combined ranking**, it is summed and ranked like any other row, with no threshold and
no separate block, and the page's qualification says that its total may be over fewer Fixtures
and fewer leagues than the rows beside it.

## User Stories

1. As a reader of the Premier League leaderboard, I want to click through from the Exhibition
   Run's row to its record, so that a rank I can see is a rank I can investigate.
2. As a reader of a Fixture, I want to see what the Exhibition Run forecast for this match
   beside the ten Entrants' forecasts, so that I can compare answers on the thing they are
   answers about.
3. As a reader of a Fixture that has not been played, I want the Exhibition Run to be absent
   rather than shown as an empty slot, so that an empty slot keeps meaning a Gap.
4. As a reader of a Fixture that has been played but that the Exhibition Run has not answered,
   I want its absence to read as the Gap it is, so that a failed replay is visible rather than
   hidden.
5. As a reader of any surface showing an Exhibition Run, I want the recall-versus-skill caveat
   in front of me, so that I never read its figures as evidence of forecasting.
6. As a reader of any surface showing an Exhibition Run, I want the "ran after Gameweek N"
   label on the row itself, so that I can tell which rows answered after the whistle without
   consulting a footnote.
7. As a reader of an Exhibition Run's record, I want its Match Points and Bet Points per
   Gameweek and season-to-date, so that its leaderboard figure has the same resolution behind
   it that every Entrant's has.
8. As a reader of an Exhibition Run's record, I want its RPS published under the caveat rather
   than hidden, so that the record does not quietly become a different record for one row.
9. As a reader of an Exhibition Run's record, I want its Gap rate withheld and the withholding
   stated, so that I do not compare a rate of missed deadlines against a rate of failed calls.
10. As a reader of an Exhibition Run's record, I want the count of Fixtures it answered against
    the count the roster was asked, so that I get the fact the rate was hiding.
11. As a reader of an Exhibition Run's record, I want an empty cell never to stand in for a
    withheld figure, so that a blank is not read as a nought.
12. As a reader of the combined ranking, I want the Exhibition Run ranked in the table, so that
    a page that adds up four rankings adds up all of each.
13. As a reader of the combined ranking, I want the Exhibition Run's row labelled, so that its
    position is never mistaken for a competitor's.
14. As a reader of the combined ranking, I want the qualification to say that an Exhibition
    Run's total may span fewer Fixtures and fewer leagues, so that I can discount the position
    myself rather than being protected from it.
15. As a reader of the combined ranking, I want the caveat under the table whenever an
    Exhibition Run is in it, and absent when none is, so that the page says only what applies.
16. As an operator checking a candidate Base Model, I want a temporary Exhibition row never to
    merge into the Entrant seat of the same Base Model, so that a total is never half a
    competitor's and half a replay's.
17. As an operator, I want every roster figure — the Entrants' scores, their order among
    themselves, the Comparison Anchor, the published intervals and the Gap rates — to be
    identical with the Exhibition rows present and absent, on all three new surfaces.
18. As an operator, I want the Exhibition Run to remain outside the Comparison Anchor, the
    complete-case intersection and every published interval, so that opening three surfaces
    opens nothing in the evidential layer.
19. As an operator of a Competition with no Exhibition Run seated, I want all three surfaces to
    answer exactly as they do today, so that the change is invisible where it does not apply.
20. As a maintainer, I want the rule to be the test ADR-0052 states rather than a list of
    pages, so that a fourth surface does not need a fourth decision.
21. As a maintainer, I want the fixture page's ten-slot invariant to survive with its meaning
    intact, so that the Gap reading it exists for is not spent on a row that is not competing.
22. As a maintainer, I want the combined ranking's arithmetic to stay in the pure module that
    already holds it, so that the page script stays a fetch and a render.

## Implementation Decisions

**The label and the caveat already exist and are not rebuilt.** `EXHIBITION_CAVEAT` is a
module constant, and the leaderboard body already carries an `exhibitionCaveat` field that is
present exactly when a row with an `exhibition` label is in the body. Both new bodies carry
the same field under the same rule; the combined ranking reads the caveat from the four
leaderboard bodies it already fetches rather than importing it, which keeps the page's imports
where ADR-0051 put them.

**The fixture body gains an eleventh slot, conditionally.** `FixtureSlot` gains the same
`exhibition: { ranAfterGw } | null` shape the leaderboard row carries. The roster's ten remain
first and in id order, and an Exhibition slot is appended to a Fixture's `slots` **only where a
Prediction exists**. A Fixture the Exhibition Run has not answered — unplayed, or played and
Gapped — carries ten slots exactly as today. The row's presence is therefore the signal, and
the page needs no third state.

**The entrant record gains the row and loses one figure for it.** `EntrantRecord` gains
`exhibition: { ranAfterGw } | null`. For an Exhibition row `gaps` is `null` — the same `null`
the body already uses for "no figure", which is why the page must render a sentence rather than
an empty cell. Every other field is computed and published as it is for an Entrant, `rps`
included. The count the withheld rate is replaced by is already in the body: each
`EntrantGameweek` carries `fixtures`, the Fixtures the Gameweek's Lock owned, beside `settled`,
the Fixtures the row settled a Prediction on. No new field is added to carry a number that is
already there twice.

**Both bodies stop filtering the roster and start selecting the leaderboard's set.** The
per-Competition reads currently select `role = 'entrant'` at the Competition's Prompt Version.
They select what the leaderboard selects instead: the roster, plus an Exhibition row that has a
derived "ran after Gameweek N" — the same `role = 'entrant' or (role = 'exhibition' and ...)`
condition, derived from stored `predicted_at` against the Gameweek deadlines and never asserted
from configuration. One condition, three endpoints, so the three cannot disagree about which
rows exist.

**The combined ranking sums the row under a key of its own.** `OverallRow` gains
`exhibition: boolean` — a flag rather than the leaderboard's per-league "ran after Gameweek N",
because one row spans several Competitions and one Gameweek number cannot speak for them. Rows
are keyed by slug for the roster and by slug prefixed with the Exhibition marker for an
Exhibition Run, because one Base Model can hold an Entrant's seat in one league and an
Exhibition Run's in another — section 3 of the new-Base-Model runbook puts every candidate in
exactly that state — and a shared key would add the two into one row. This part is built.

**The combined ranking's qualification gains a clause.** The exported constant in
`overall-caveat.ts` says three things today; it gains a fourth: that an Exhibition Run's total
may be over fewer Fixtures, and in fewer leagues, than the rows it is ranked beside, and that
the sum does not correct for it. The evidence line's per-league Fixture counts are the roster's
and are unchanged — they describe the sum's denominator, not any one row's.

**Nothing in the evidential layer is touched.** The Comparison Anchor, the complete-case
intersection and every published interval read the `role = 'entrant'` roster alone, in the
scorer and in the read API, and this spec changes none of those reads.

## Testing Decisions

A good test here asserts on what a reader can observe — the body a request answers with, or the
rows a pure function returns — and never on how it was computed. The two properties most worth
pinning are negative ones: that a surface is unchanged where no Exhibition Run is seated, and
that every roster figure is identical with the Exhibition rows present and absent. Both are
proved by comparing two runs of the same request, not by reading the query.

**Two existing seams, no new ones.**

- `handleDashboardRequest` — a `Request` in and a `Response` out, over a real throwaway
  Postgres built through the real migration path. Everything the fixture page and the entrant
  record do is proved here: the conditional eleventh slot, the ten-slot body on an unanswered
  Fixture, the `null` Gap rate, the published RPS, the label, the caveat field's presence and
  absence, and the before-and-after invariance of every roster figure. Prior art:
  `test/dashboard-read-api.test.ts` and `test/dashboard-competition-view.test.ts`, which
  already assert on these two bodies for the roster.
- `overallRanking` — a pure function over hand-built `LeaderboardBody` values, no DOM, no
  database, no fetch. The summing, the ranking, the flag and the separate key are proved here.
  Prior art: `test/dashboard-overall-view.test.ts`, which holds this shape already.

**The page scripts are deliberately not a seam.** ADR-0051 already names the cost of logic
living in a built page — it is proved by whatever proves a build and not by the read API's
suite — and accepts it only while the rule is a sum. The rendering of the label, the caveat and
the withheld-figure sentence must therefore stay rendering: no branch in a page script that a
module could hold. Anything that grows a condition moves behind one of the two seams above.

**One end-to-end assertion is worth its cost.** A Competition seeded with a roster, an
Exhibition Run holding Predictions on some Fixtures and not others, and one request to each of
the three endpoints — proving in one test that the same row appears on all three under the same
label, which is the property a reader experiences and no per-endpoint test states.

## Out of Scope

- The schema, the scorer, the scheduler and every write path. This spec is a read.
- The FPL track's surfaces. An FPL Exhibition Run is a Manager State chain, not a Prediction
  set, and its record page asks different questions; ADR-0052's test applies to it and the work
  is not this spec's.
- The evidential layer. The Comparison Anchor, the complete-case intersection and the published
  intervals stay roster-only, and no story here asks otherwise.
- The Bundesliga, which is not open (ADR-0049).
- Any correction, normalisation or weighting of the combined sum. ADR-0051 chose a raw sum that
  states its confounds, and this spec adds a clause to the statement rather than a term to the
  arithmetic.
- A cross-league Exhibition page. If an Exhibition Run's four-league record is worth publishing
  as something other than a ranked row, ADR-0052 says it belongs on a page that is not a
  ranking, and that page is not specified here.

## Further Notes

The combined ranking's half of this spec is already implemented and tested in the working tree —
`overallRanking` sums the row, `OverallRow` carries the flag, and the separate key is pinned by
a test built from the runbook's candidate state. What remains there is the page: the label, the
caveat under the table, and the qualification's fourth clause.

Ligue 1 is the Competition to seed the negative cases from. Its Exhibition Run answered four of
six played Fixtures — two calls returned HTTP 429, `rate_limit` is no Repair's business, and the
asking ended there — so it is the live example of a played Fixture with no Exhibition slot, of a
record whose answered count is below the roster's, and of exactly why the Gap rate is the figure
that could not be published.
