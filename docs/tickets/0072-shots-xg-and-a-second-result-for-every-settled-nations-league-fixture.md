# Ticket: Shots, xG and a second result for every settled Nations League Fixture

**What to build:** the morning after a Nations League Fixture settles, the daily fetch
reads its 365Scores match sheet and stores each side's expected goals, total shots and
shots on target against the Fixture; a Fixture whose sheet holds no xG is asked again
every day and renders as "no shots or xG stored for this Fixture" until it does; the
365Scores score is compared with the UEFA result and any disagreement is reported. The
packet's shot lines and xG rates for `UNL` read these rows. Source:
[spec 0027](../specs/0027-the-nations-league-opens.md) stories 21–27, 41. Decisions:
[ADR-0058](../adr/0058-the-nations-leagues-shots-and-xg-come-from-365scores.md),
[ADR-0056](../adr/0056-results-have-a-second-source-shots-have-one.md),
[ADR-0050](../adr/0050-a-row-the-source-has-no-result-for-is-not-corruption.md).

**Blocked by:** 0071 — the sheets are looked up by the stored Fixtures' kickoff dates and
joined to them by side and date; 0070 — the team-stats table.

**Status:** built 2026-09-15; the last acceptance box is half this ticket's and half 0073's, see its note

---

## What is already known

**Two endpoints, no key.** The listing:
`https://webws.365scores.com/web/games/?appTypeId=5&langId=1&timezoneName=UTC&userCountryId=1&competitions=7016&startDate=DD/MM/YYYY&endDate=DD/MM/YYYY`
answers `games[]` with `id`, `homeCompetitor`/`awayCompetitor` (`id`, `name`), `startTime`
(ISO, UTC), `groupName` ("League A - Group 2"), `statusText`. The sheet:
`…/web/game/stats/?…&games=<id>` answers `statistics[]` rows of `{competitorId, name,
value}` with `"Expected Goals"`, `"Total Shots"`, `"Shots On Target"` among thirty-eight
names — or, for a hole, thirty-eight rows with no `"Expected Goals"` at all. Recorded on
2026-09-14 as `test/fixtures/365scores-UNL-games-2026-09-24-recorded.json.gz`,
`365scores-UNL-games-2025-06-08-recorded.json.gz`,
`365scores-UNL-stats-4444714-portugal-spain-recorded.json.gz` (a full sheet) and
`365scores-UNL-stats-4051269-spain-switzerland-no-xg-recorded.json.gz` (a hole).

**The listing takes the date, so the fetch asks per kickoff date.** For every date the
stored `UNL` schedule has a kickoff on and that is not in the future, one listing read;
for every settled Fixture whose stats row is absent or whose xG is null, one sheet read.
Twenty-six sheets a Gameweek, plus retries of holes until the Season closes.

**Three names differ from the stored spelling**: "Ireland" → "Republic of Ireland",
"Turkiye" → "Türkiye", "Bosnia & Herzegovina" → "Bosnia and Herzegovina". The other
fifty-one match character for character. A listed side outside the map and outside the
fifty-four is refused by name, never skipped.

**Team level only.** The value read is the sheet's own "Expected Goals" per side; no
per-shot map is summed (ADR-0058 records why).

**The second result.** The listing carries each side's score once a game has ended;
compare it with the Fixture's stored result and report a disagreement in the daily
fetch's outcome the way `movedAttachments` are reported. Change neither.

**How far back the listing reaches is not established**: a probe for 2024-09-05 returned
no games while November 2024, March 2025 and June 2025 did. This ticket relies on the
listing only for the current Season, and records what it finds about reach.

## Acceptance

- [x] The registry names 365Scores as `UNL`'s stats source and the daily fetch reaches
      it for `UNL` alone (daily-fetch seam); a 365Scores failure is a `UNL` failure and
      costs no other Competition.
      *`src/fetch/competition-sources.ts` turns `UNL`'s `stats: null` into
      `"365scores"` and widens the union; nothing else in the daily fetch names the
      Competition. At the daily-fetch seam the whole request set is asserted, not a
      filter over one host: `UNL` listed beside `PL` reaches UEFA's two pages, one
      365Scores listing and nothing more, and the Premier League's set is unchanged —
      less the transfer list, because the clock has to be past a Nations League kickoff
      for a date to exist and the summer window shut a month before it.*
      *The failure half is its own test: 365Scores answers with a body that cannot be
      read, the run fails by name, and the Premier League's 380 Fixtures and the cup's
      own 156 land anyway. Collected into `errors` rather than reported through
      `reported()` deliberately — `xg` is the Premier League's Understat outcome the
      fetch workflow has always consumed, and a cup's shots are not that outcome under
      another name. `UNL` has one source for them, so an unreadable answer fails the
      run rather than degrading a form line quietly.*
      *`test/competition-sources.test.ts` grew the second arm of its `stats` check, so
      an entry naming 365Scores for a Competition the id map has no row for is a red
      test rather than a Competition that fails every morning in production.*
- [x] Over the recorded listing and sheets, a settled Fixture gets one team-stats row
      under source `365scores` with both sides' xG, shots and shots on target; a hole
      gets a row with null xG and is read again on the next run; a later full sheet
      fills it (per-source seam).
      *The recorded bytes do not compose into a league-phase example and cannot be made
      to: the only archived listing whose games have been played is the 2025 Finals,
      and those are knockout rounds the UEFA fetch refuses outright (ticket 0071), so
      the Season's own MD1 listing carries eight unplayed games. The Postgres tests
      therefore seed the two Finals Fixtures by hand — their kickoff, their two sides
      and their result all read off the same recorded bytes the listing is — and the
      listing and the Portugal–Spain sheet are a genuinely matched pair, id for id and
      competitor for competitor.*
      *The hole is proven twice. Its shape is proven at the parse seam over the real
      Spain–Switzerland recording: thirty-eight rows, both sides' shots and shots on
      target present, no `"Expected Goals"` row at all — which is what makes reading it
      as a missing sheet, or as a zero, two different lies. The retry is proven at the
      fetch seam by cutting that shape into the matched sheet: the row lands with null
      xG and its shots, the next morning asks again and fills it, and the morning after
      that asks only for the listing. A settled Fixture whose figures are complete
      costs nothing for the rest of the Season.*
      *What decides a sheet is read is the record's own result and never the listing's
      `statusText`: the third-place match is `Ended` in the recorded listing and stored
      here unsettled, and no sheet is read for it.*
      *Added while building, and not in the ticket: a sheet names its own game, so a
      body answered for another match is refused rather than filed under the match that
      was asked for. Both bodies in that test are real recordings.*
      *What decides which requests a morning costs is what is **outstanding** — settled,
      kicked off, and still short of a figure — and not which dates are in the past.
      Review found the first reading breached ADR-0058's budget: the note says one
      listing a day, and a read keyed on past dates would have grown to a dozen listings
      every morning by `MD6` and gone on until the Season closed, for days nothing was
      left to learn about. The rule is now pinned from both ends — a morning with
      nothing outstanding makes no request at all, and the morning after a hole is
      filled makes none either.*
      *The cost of that rule: the score comparison is made on the read the shots arrive
      with, once per Fixture, rather than every morning for the rest of the Season. A
      result corrected upstream after its figures are complete is not re-checked.*
- [x] The three-name map resolves the recorded listing's sides onto the stored names
      with nothing left over; an unmapped name is refused by name.
      *Reworded from "the recorded listing's fifty-four sides", which no archived body
      holds: the two recorded listings are one day each and name twenty of the
      fifty-four between them. What is derived is what the bytes support — every side
      either listing names, mapped, is one of the fifty-four UEFA's own pages store,
      with nothing left over — and each of the three map entries is held against that
      set in both directions: the key is a name the record does not hold, the value is
      one it does. "Ireland" is the one of the three these two days reach, and the
      record holds a "Northern Ireland" as well, which is why nothing here matches on a
      prefix.*
      *The refusal is proven at the fetch seam by renaming Ireland to "Eire" in the
      real MD1 listing: the day fails with the listed spelling in the message, the
      response is archived, and nothing is written.*
      *The row carries the names the refusal checked, and not a second resolution of
      the sheet's own copy of them — review found the guard asymmetric. One guarded
      spelling reaches the record or none does, and a sheet whose copy of a name
      differs from the listing's cannot put an unchecked spelling in a row.*
      *The fifty-four are the names the record stores for this Competition and Season,
      because there is no other list of them in the codebase and inventing a second one
      would be a fifty-four-entry transcription to keep in step with the schedule. It
      is sound because the UEFA fetch refuses a Season that is missing a round (ticket
      0071), so the stored set is all fifty-four or none.*
- [x] A disagreement between the 365Scores score and the stored result is reported in
      the run's outcome and changes no row.
      *Reported the way `movedAttachments` are: a `resultDisagreements` field on the
      daily fetch's result and a line in `src/cli/fetch.ts` naming both readings. The
      test seeds the Final as 2–1 against the recorded listing's 2–2, and asserts the
      stored `result` afterwards as well as the report — neither source is preferred
      (ADR-0056), and the shots and xG still land, because the sheet is not what is in
      dispute.*
      *A second report joins it, from review: a settled Fixture the day's listing did
      not carry is named in `unlistedFixtures` rather than skipped. Story 26's "never
      silently skipped" covered the names and nothing covered the **day**, and this
      project has already had that failure once — Understat's dates drift on some
      matchdays, the join rate falls, and nothing says so. So the join is made on the
      day 365Scores says its own game kicked off, never on the day that was asked for,
      and a Fixture that falls between the two sources' days is reported. Both halves
      are pinned: a listing whose game is moved across midnight joins nothing and is
      reported, and one unpublished match costs the day nothing but a line.*
      *Reported and not refused, deliberately: refusing would take the whole
      Competition's morning out for one match 365Scores has not published yet, every
      morning until it did.*
- [ ] The `UNL` packet's shot lines and xG rates (ADR-0043) are computed over the
      team-stats table and never over `understat_match_xg` or `historical_matches`; a
      settled Fixture with null xG renders "no shots or xG stored for this Fixture"
      (context seam).
      *Half done, deliberately, and the half that is done is the read. `MatchContextData`
      grows `playedFixtures`: this Season's settled Fixtures with the shots and xG
      stored against them, joined by date and both stored names, and read only for a
      Competition whose registry entry names a Fixture-keyed stats source. The
      contamination test holds it in both directions — a league's `365scores` row does
      not reach the cup across `competition`, and a league whose entry names Understat
      reads no row from that table even when one is stored under its own code beside a
      settled Fixture of its own — and the read is bounded by the Gameweek's deadline
      and by a stored result, both pinned.*
      *The rendering half is ticket 0073's, on the user's decision. The section that
      would carry these lines is the one 0073 builds — it already merges "the Season's
      own settled `UNL` Fixtures from the record" with the recent internationals, and
      the same match would otherwise be two lines — and putting them on the league form
      lines in the meantime would print a Division a cup does not have. The pins in
      `test/openrouter-entrant.test.ts` did not move, which is the assertion that
      nothing renders it yet.*
      *The frozen sentence is a finding, not an omission. A hole is a sheet with no xG
      **and both sides' shots on it** — Spain–Switzerland is 21–11 — so "no shots or xG
      stored for this Fixture" would be false about the shots on every hole the source
      really publishes. Decided: the sentence belongs to a Fixture that has neither, and
      a hole renders its shots beside the "xG unavailable" the other five Competitions
      already read. ADR-0058's prose is looser than its own recording; spec story 24
      ("a settled Fixture with no stored shots or xG") already reads the way this does.*
- [x] Every 365Scores response is archived in `raw_snapshots` under its own source name
      before validation.
      *`365scores:2026-27:UNL:games:2026-09-24` and
      `365scores:2026-27:UNL:stats:4444714` — `source:season:competition:…`, the shape
      `uefa:2026-27:UNL:0` and `understat:2026-27:EPL` already use. Neither URL carries
      the Season, which is why the first cut of this left it out of the names, and
      review was right that it left the archive with one family of names that did not
      say which Season its bytes were from. The replay matches the ending instead —
      `fplLiveSource` has found a Gameweek's snapshot that way since the first
      rehearsal — and a miss names the ending it looked for, `<season>` and all, so an
      operator is sent to the archive rather than to the pattern. Both are pinned,
      driven from this fetch's own URL and name builders so the two cannot drift.*
      *Before validation and before the status check both: a listing that 404s is
      archived with its empty body and then refused, which is pinned — ADR-0058's
      baseline is only repeatable from bodies the archive kept.*

## What review changed, besides the boxes above

- **One `"365scores"`, exported.** `SCORES_365_SOURCE` is the word the row is written
  with and the word both consumers compare against. The registry's union and the
  constant are tied by the compiler — renaming one gives three `TS2367`s and a `TS2820`,
  which was checked rather than assumed — and the contamination test's seed binds the
  constant instead of spelling it, so renaming the fetch's side can no longer leave a
  green test over a packet that had stopped finding rows.
- **The upsert's parameters follow its columns**, the way the Understat insert's do,
  rather than appending the source as `$13` for a column that is third.
- **`figure`'s last argument is the shape a value may take**, `A_COUNT` or `A_RATE`, and
  not a number of decimal places: nothing here is rounded or reformatted, and the
  argument only ever chose between two patterns.
- **Three small duplications left in place with the reason written down**: the reversed
  id lookup that `uefaCompetitionOf` also has, the five warn loops in `src/cli/fetch.ts`
  that a shared formatter would turn into a switch, and the absence of a transaction
  around the upsert — one row is written per sheet as it is read, because a transaction
  around the loop would hold a lock across twenty-six requests to another host.

## What this ticket did not do

- **The `UNL` packet's shot and xG lines.** The box above; ticket 0073.
- **Thirty-four of the fifty-four spellings.** The two recorded listings cover twenty.
  "Turkiye" and "Bosnia & Herzegovina" are in the map on ADR-0058's word and have not
  been seen in an archived body here; a recorded listing for a day either side plays
  would close it, and until then those two entries are the note's transcription rather
  than this ticket's derivation.
- **How far back the listing reaches.** The ticket asked for what this read finds about
  it. Nothing was found, because nothing was read: no request left the machine. The
  probe recorded on 2026-09-14 stands as the only evidence — 2024-09-05 answered no
  games where November 2024 forward did — and this fetch asks only for dates the stored
  schedule has, so the current Season is all it can reach anyway.
- **The nested ternary in the daily fetch's schedule dispatch.** Deferred to whichever
  ticket adds a third schedule source; this one adds a stats source, and the two `if`s
  it adds to the stats loop are not that shape.
- **A Season whose schedule has not been read.** The fetch asks for nothing and reports
  nothing rather than failing: the schedule source runs earlier in the same run and
  fails loudly on its own if it produced no Fixture (`StaleUefaSourceError`), and a
  second guard here would name the wrong source.
- **Per-shot maps.** ADR-0058 records why they are not summed; the sheet's own team
  figure is what is read.
- **Narrowing what a value that is not a number costs.** A `"-"` where an xG belongs is
  a validation error, so it takes the Competition's whole morning rather than that one
  Fixture's figures — and it does so every morning until the source changes back or
  this code does. The trade is deliberate and was not written down until review asked:
  a hole is a row that is **absent**, and reading a row that is present but malformed as
  a hole would retry it for ever behind a packet line reading "unavailable", which is
  the quiet failure this project keeps finding. Loud and wide beats quiet and narrow
  here because the blast radius is one Competition's enrichment for one morning, not a
  Gameweek of Predictions.
- **A test over `src/cli/fetch.ts`'s lines.** Neither the disagreement line nor the
  unlisted line has one, because no test covers that file at all; both facts are
  asserted on the fetch's own result, which is what the CLI prints. And both are lost if
  a later source in the same run throws before the run returns — the behaviour
  `movedAttachments` has always had.
