# Ticket: The Bundesliga renders

**What to build:** a Bundesliga Fixture builds a complete packet and the site advertises
the league — its Prompt Version frozen at `match-bl1/2026-27-v1` and pinned, its two
divisions curated and admitted by the schema, and its Season's Head Coach article listed.
Source: [opening a Competition](../runbooks/opening-a-competition.md) edits 2, 3, 4 and 7.
Decisions:
[ADR-0054](../adr/0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md),
[ADR-0038](../adr/0038-one-prompt-template-one-prompt-version-per-competition.md)
(one template, one Prompt Version per Competition),
[ADR-0042](../adr/0042-the-match-track-restarts-under-amended-prompt-versions.md) /
[ADR-0043](../adr/0043-base-rates-xg-rates-and-two-instruction-lines-join-the-restarted-match-versions.md)
(the current template it is born on).

**Blocked by:** 0056 (the suite stops asserting `BL1` has nothing behind it), 0057 (the
transfer windows exist, so the pin is read once and does not move).

**Status:** done — every box green 2026-08-27. `BL1` has no `competitions` row until 0060
activates it, so nothing here can have written a real row anywhere either.

---

## What is already known

**No `retired` block.** Born on the current amended template, like Serie A and Ligue 1, so
there is no v1 to keep whole and the page carries no frozen block at all. A label there
would claim a Gameweek was played under a question nobody asked.

**The divisions entry and the check constraint are one change and neither half is safe
alone.** The migration must hold the two names character for character as the entry writes
them — the second division's is `2. Bundesliga`, period included — and `test/schema.test.ts`
checks the two against each other. The migration is the next number after 0035.

**`competitionName` must equal the top-flight name**, which `test/openrouter-entrant.test.ts`
requires: one packet must not call one league two things.

**The site advertises the league from the freeze, not from the activation.** Routes are
built from the frozen Prompt Version list, so `/bl1` and `/api/bl1/*` exist the moment this
lands and before any row does — the same way Serie A and Ligue 1 appeared, and the reason
the route-enumeration test gains its `BL1` entry here rather than in 0056. The read API
answers with an empty, unscored league; `/overall` keeps it out of the sum until it is both
Active and scored, so nothing there needs an edit.

**The Head Coach article is silent when it is missing.** An unlisted Season article stores
nothing and the packet says the article is not listed — no failure anywhere. The two
leagues before this one each needed their own column names read off the real page rather
than assumed.

**The pin hashes the suite's render, which is built from a literal and reads no database**,
so no later backfill can move it. What moves it is a rendering change — which is why 0057
comes first.

## Acceptance

- [x] A Bundesliga Fixture renders a complete packet: every section present or stating its
      own absence, and the league table reading "no result has been played yet this
      Season" rather than unavailable.

      `test/openrouter-entrant.test.ts`'s `test.each(MATCH_PROMPT_COMPETITIONS)` now walks
      `BL1` along with the other four, over the suite's own literal render, exactly as it
      already did for Serie A and Ligue 1 before either had a database row behind it.

- [x] `match-bl1/2026-27-v1` is frozen with its sha read from that render, and the seats
      guard refuses a roster the record disagrees with.

      Read off the suite's render with both of `BL1`'s render gates already open — the
      transfer window (ticket 0057) and the Head Coach article (this ticket) — so the pin
      is a single freeze rather than one that moves after the fact the way `SA` and `FL1`'s
      each did. The seats guard is the existing `season-roster.test.ts` machinery, generic
      over every code `matchPromptOf` admits; it needed no `BL1`-specific edit.

- [x] The divisions entry and the migration name the same two divisions, and the schema
      test proves it.

      `D1`/`D2` → `Bundesliga`/`2. Bundesliga` in `src/football-data/divisions.ts`, and
      migration `0036` widens `historical_matches_division_check` to the same two strings,
      period included. `test/schema.test.ts`'s "holds the curated names and no others" test
      drives both directions.

- [x] The Season's Head Coach article is listed and its columns are read off the real page.

      Read from the live English Wikipedia article on 2026-08-27 by raw `curl`, not a
      summarized fetch, and archived whole as
      `test/fixtures/wikipedia-2026-27-bundesliga.txt.gz`. Its Personnel table matches the
      common `Team, Manager` shape. Its Managerial changes table does not: it splits both
      the vacancy and the appointment into an announced date and the actual one, ten leaf
      columns rather than the seven every other league's table has. The existing parser
      could not read that shape at all — its field positions are fixed at 0/1/2/3/5/6 and
      its label check assumed a single header row — so this ticket widened
      `parse-head-coach-changes.ts` with a per-article `fields` override (resolved by
      column *name*, against the one already-pinned `columns` list, never a second index
      that could drift from it), a two-row grouped-header flattener, and `colspan` support
      in the row filler for the merged-date cells the page uses when a departure and its
      announcement fall on the same day. `wikitext.ts` also gained two small template
      readings this article needed: `{{Abbr|display|title}}` header tooltips, and a bare
      `nowrap` keyword ahead of `data-sort-value` in the Personnel table's Team column.
      `test/parse-bundesliga-head-coach-tables.test.ts` proves the whole thing against the
      archived bytes, including a test that the *actual* dates are read (Union Berlin's
      row states its vacancy was announced 11 April but did not fall vacant until 30 June)
      rather than the announced ones a naive read of the split columns would grab.

      _A Standards + Spec review found four comment errors and three real gaps in this box's
      first pass. **Found by review**, all fixed:_

      _Comments miscounted or misdescribed the other leagues — "on all four articles that
      carry one, and ... the three that do not" when only `BL1` carries a grouped header and
      there are four others, not three, and "the three dated fields" when `incoming` names a
      manager, not a date, so only two fields are actually dates. Both wrong sentences were
      duplicated verbatim across `parse-head-coach-changes.ts` and `head-coach-source.ts` —
      one error, two places it could go stale from independently. `wikitext.ts`'s own
      `CELL_ATTRIBUTES` doc undercounted too, "the three shapes" when the `nowrap` reading
      added a fourth. All four corrected._

      _`leafColumnLabels` dropped a third header row and an out-of-bounds sub-label cell
      silently — the first is exactly the "shape change ... should refuse rather than
      quietly ignore" the docblock it replaced already promised, and the second reached
      `cellText(undefined)` and threw a raw `TypeError` rather than the
      `HeadCoachSourceValidationError` this pipeline exists to raise instead. Both are now
      explicit refusals, and `test/parse-bundesliga-head-coach-tables.test.ts` proves each
      one — including, mutation-checked, that removing either guard reproduces exactly the
      silent-drop and the raw `TypeError` the review named._

      _The `columns` list carried `"Announced on"` twice (index 3 and 7), so `Exit date` and
      `Incoming date`'s own group words were pinned nowhere and `columns.indexOf` could only
      ever resolve the first occurrence. Fixed by writing every grouped leaf as
      `<group>/<sub-label>` (`Exit date/Announced on`, `Incoming date/Announced on`), which
      folds the group word into the pin and makes the two occurrences distinct strings
      `indexOf` can no longer confuse — one change closing both findings at once. `fields`
      and `columns` in `head-coach-source.ts` were updated to the new label spelling._

      _The `nowrap\s+` reading missed the same fixture's bare `nowrap|` (no space, directly
      against the pipe) — harmless today because that column is never read, but widened to
      `nowrap\b\s*` anyway rather than left as a known inconsistency in a reader this project
      keeps re-widening one real case at a time._

- [x] `/bl1` builds and `/api/bl1/leaderboard` answers an empty league rather than a 404;
      `/overall` still sums only the leagues that are Active and scored.

      `test/dashboard-competition-view.test.ts`'s route-enumeration tests gained `BL1`'s
      entries. The leaderboard API needed no edit — it is generic over
      `MATCH_PROMPT_COMPETITIONS`. `/overall`'s Active-and-scored gate is untouched by this
      ticket.

      _A Spec review found the "answers an empty league rather than a 404" half of this box
      stood on reasoning about the dispatch mechanism rather than on an assertion — Serie A's
      and Ligue 1's openings set that precedent, but a precedent of not testing something is
      not the same claim as the thing being tested. **Found by review.**
      `test/dashboard-read-api.test.ts` gained "answers a Competition with no `competitions`
      row as an unopened league, not a 404": `/api/bl1/leaderboard` returns 200 and the exact
      `{ active: false, entrants: [], ... }` body the handler's pre-season branch writes,
      proving `MATCH_PROMPT_COMPETITIONS` deciding what is *served* and `competitions`
      deciding what is *open* are two gates this Competition walks through the first of
      without ever reaching the second._

## Mutation checks

Each mutation was applied to the source, the file confirmed changed, the affected test(s)
run, and the source restored from a byte copy taken before the run — never `git checkout`.

| Mutation | Result |
| --- | --- |
| `fields.vacancy` pointed at "Announced on" instead of "Departed on" | 2 red |
| `fields.appointment` pointed at "Announced on" instead of "Arrived on" | 2 red |
| `BL1`'s frozen sha256 flipped a trailing character | 1 red |
| Migration `0036`'s second division respelled `II. Bundesliga` | 2 red (a check-constraint violation, then the schema test) |
| The `{{Abbr\|...\|...}}` header-tooltip reading removed from `wikitext.ts` | 2 red |
| The bare `nowrap` keyword reading removed from `CELL_ATTRIBUTES` | 1 red |
| The third-header-row refusal removed from `leafColumnLabels` | 1 red |
| The missing-sub-label refusal removed (raw cast restored) | 1 red — a `TypeError`, not the `HeadCoachSourceValidationError` the test requires |
