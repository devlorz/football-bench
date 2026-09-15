# Ticket: Each side's last five internationals, and the date the dataset was read

**What to build:** the `UNL` packet shows, for each side, its five most recent
internationals before the Lock across every competition — World Cup, qualifiers,
friendlies — with the competition named and a neutral venue marked, merged with the
Season's own settled Fixtures from the record so no match appears twice, and one line
stating the date the dataset was last updated. The daily fetch reads the dataset once a
day. Source: [spec 0027](../specs/0027-the-nations-league-opens.md) stories 28–32, 41.
Decisions:
[ADR-0057](../adr/0057-the-nations-league-opens-as-the-first-cup-on-sources-nobody-documents.md)
(the packet section; the dataset's staleness belongs in what the Entrant reads).

**Blocked by:** 0070 — `international_results`; 0071 — the settled `UNL` Fixtures the
section merges with, and the stored spelling the dataset's names map onto.

**Status:** built, 2026-09-15

---

## What is already known

**The dataset.**
`https://raw.githubusercontent.com/martj42/international_results/master/results.csv`,
one CSV: `date, home_team, away_team, home_score, away_score, tournament, city, country,
neutral`. Every men's international since 1872; 658 "UEFA Nations League" rows through
the June 2025 Finals; the whole 2026 World Cup (104 rows); latest row 2026-08-26.
Commits land roughly monthly (2026-07-19, 07-31, 08-26). Recorded on 2026-09-14 as
`test/fixtures/martj42-international-results-2026-08-26-recorded.csv.gz`.

**Two names differ from the stored spelling**: "Czech Republic" → "Czechia", "Turkey" →
"Türkiye". A row naming one of the fifty-four under any other spelling is refused by
name; rows for sides outside the fifty-four are simply not stored.

**Store from 2024-06-01 forward, for the fifty-four sides only.** Keyed by date and the
two sides. The read is idempotent: every daily fetch re-reads the file and upserts.
The file's latest row date is what the packet prints; where it is kept (the snapshot's
metadata, or one row) is this ticket's call, the least code that survives a dry run.

**The section.** Per side, the five latest rows before the Lock, newest first, each
line: date, opponent, home/away/neutral, score, tournament. Merged with the Season's
settled `UNL` Fixtures from the record (which the dataset will lag by up to a month),
deduplicated on date and sides. One trailing line: "dataset last updated 2026-08-26".
The section is present and empty ("no international stored for this side") for a side
with no rows; it is absent for a Competition whose registry names no history source,
so no league packet grows it.

**The base rates of ADR-0043** for `UNL` are computed over `international_results` and
never over `historical_matches`.

## Acceptance

- [x] The registry names the dataset as `UNL`'s history source; the daily fetch reads
      it for `UNL` alone and archives the body (daily-fetch seam).
      *`history: "martj42/international_results"` — the repository path and not
      "github", because the bytes are one person's dataset and a second dataset on the
      same host would be a different source. The fetch is walked in the same loop as
      football-data.co.uk's, so a cup's history and a league's are dispatched by one
      field and neither Competition is walked into the other's read.*
      *One request a day whatever is outstanding, which is the opposite of ADR-0058's
      rule and is right for the opposite reason: this is one file holding every
      international ever played, so there is no per-Fixture read to skip and the whole
      window is rewritten on every read.*
      *Archived before validation under one constant name, `martj42:international_results`.
      It is the first source whose snapshot name carries neither Season nor Competition,
      because there is one file and it is the same file for every Competition that reads
      it — and so the first whose URL the dry run's replay maps back without translating
      anything. Two reads whose bytes differ are two rows under that one name, which is
      what makes a commit visible in the archive.*
      *The seam pins all of it in one run: the URL set is the Premier League's seven,
      UEFA's two pages and this file, and the run leaves 156 Fixtures, 758
      `international_results` rows and one snapshot. A Competition whose schedule has
      not been read yet asks for nothing — the sides the file is filtered by are the
      record's own.*
- [x] Over the recorded CSV, `international_results` holds every row from 2024-06-01
      for the fifty-four sides and nothing else; the two-name map resolves with nothing
      left over; an unmapped spelling of one of the fifty-four is refused by name.
      *758 of the window's 2,360 rows. A row is stored when **either** side is one of
      the fifty-four, not both: England's World Cup quarter-final against Argentina is
      exactly the match story 29 asks the packet to show, and requiring both sides would
      drop every knockout tie the 2026 World Cup produced. Both halves are pinned — that
      tie is stored, and the file's own last row (Vietnam v Thailand) is not.*
      *The map's derivation is checked against the archived bytes in both directions:
      each key is a name the record does not hold and is really in the file, each value
      is one of the fifty-four UEFA's own pages store, and every one of the fifty-four
      is reachable once the map is applied.*
      *The refusal is asked in the **opposite** direction from 365Scores', and it has to
      be. 365Scores lists one Competition, so a stranger in its listing is caught on
      sight; this file lists every men's international ever played, so a row naming an
      unmapped "Turkey" cannot be told from a row about one of the two hundred sides
      this record has no section for. The question is therefore "is every side the
      record stores reachable in the file since the window opened" — every one of them
      has played in that time — and a side that is not is a spelling that moved. The
      test renames "Turkey" to "Turkiye" in the real file: the read fails naming Türkiye
      and writes nothing, because the check runs before the insert.*
      *`parseCsv` moved out of `football-data/fetch-season.ts` into `src/csv.ts` rather
      than being copied. Six rows in the window carry a comma inside a quoted field —
      a tournament called "Morocco, Capital of African Football" — and a `split(",")`
      would read the city as the country and shift `neutral` off the end. None of the
      six names one of the fifty-four today, which is the reason to hold it rather than
      trust that it stays that way.*
      *A malformed row costs this Competition its morning, the same trade ticket 0072
      recorded for a malformed figure: skipping the row would be a side quietly losing a
      match off its form while the packet read as if it had played four.*
- [x] The after-first-deadline guard, reading the registry, asks `international_results`
      for `UNL` and never `historical_matches`; a `UNL` with no stored rows after its
      Gameweek 1 deadline fails by name.
      *`requireCurrentSeasonMatchesAfterFirstDeadline` became
      `requireHistoryAfterFirstDeadline`: the deadline is read once, and past it the
      registry's history source decides which table is asked. The single correlated
      `exists` it replaced could not be kept — the two sources' rows are found by
      different columns, because `international_results` holds no Season and no
      Competition at all (migration 0042), and one query that can ask either is one
      query with a table name in a string.*
      *`StaleInternationalResultsError` is the name it fails by, and the name is the
      assertion: a guard still reading `historical_matches` would raise
      `StaleFootballDataSeasonError` instead, and would raise it every day for ever,
      because the Division check refuses a `UNL` row in that table outright. The test is
      the morning after `MD1` with the dataset's host down — two collected failures, the
      source that went down and the question that went unanswered because of it, and the
      Premier League's day landing whole beside them.*
      *What it asks is "has this record **read** the file since this Competition Locked
      its first Gameweek", not "does the table hold a row". Story 44 asks for
      current-Season rows and the table has no Season to filter by; a `played_on` bound
      tied to this Season would fire falsely every morning, because the dataset lags the
      record by up to a month and will carry no row from this Season for weeks after
      `MD1`. So the question is asked of `international_results_source.read_at`, which is
      the same fixed point the league guard uses — its own Gameweek 1 deadline — and is
      the reason that column exists. The test seeds a row and a read dated before the
      Lock: "any row at all" would have passed it.*
      *The quiet half is pinned by the 365Scores test beside it: the same clock, past
      the same deadline, no `historical_matches` row for `UNL` anywhere, and no failure
      — because the dataset landed earlier in the same run.*
- [x] The `UNL` packet renders each side's five latest internationals before the Lock,
      merged with settled `UNL` Fixtures without duplicates, followed by the
      dataset-date line (context seam); a `PL` packet does not grow the section.
      *The section **replaces** the historical-results section for a Competition whose
      registry entry names the dataset, rather than joining it. Ticket 0075 already says
      "replacing", and the alternative is worse than untidy: the league section is built
      on Divisions, a table and prior-Season positions, so a cup would render four lines
      saying those are unavailable and one — "Current-Season overall: no matches played"
      — that stops being true the moment a matchday settles.*
      *One line per match whichever source it came from: `tournament | date | home
      score away | W/D/L`, plus a tail. Home-team-first ordering is what says who was at
      home, exactly as the league form lines say it, so the tail marks only a **neutral**
      venue — the one case where that ordering means nothing. A merged Fixture from the
      record is labelled with the dataset's own word for the Competition, from a
      one-entry map in the fetch, so the list reads as one list rather than two.*
      *The dedupe key is the day and the two sides, and the record wins every collision:
      the dataset lags the record by up to a month, and its copy of a match the record
      already holds would lose the shots and xG. Pinned both ways — one line for a match
      both sources carry, and that line is the one with the figures on it.*
      *ADR-0058's frozen sentence renders here, as its amendment says: a settled Fixture
      carrying none of the six figures reads "no shots or xG stored for this Fixture",
      and a hole — a sheet with no xG and both sides' shots still on it — reads its
      shots beside the "xG unavailable" the other five Competitions already read. Asked
      of the six figures and not of the rendered segments, so the sentence follows the
      rule rather than the wording `performanceSegments` happens to return. That
      function is now exported over a narrower `MatchPerformance` type: one performance
      format for both packets, or two that drift.*
      *Both sources are bounded again in the renderer, the way the historical section
      bounds its own rows. The dataset's bound is the Lock's own UTC day, **exclusive**,
      because a row dated that day says nothing about the hour: a match played that
      morning is lost and one played that evening cannot leak. For a source that lags by
      a month, one day of form is the cheaper of the two.*
      *The half this ticket cannot close: a `UNL` packet cannot be rendered through
      `buildMatchContext` at all until `MATCH_PROMPTS` grows `UNL`, which is ticket
      0075's first box and is blocked on this one. So the rendering is proven at the
      builder over seeded rows, the read at the context seam over a real database, and
      the contamination test asserts that building a `UNL` packet now fails for the
      Prompt Version and for nothing else — a section that threw would fail it with a
      different message.*
- [x] Base rates for `UNL` are computed over `international_results`.
      *One line, in this section, over the stored rows bounded by the Lock: home wins,
      draws, away wins and goals per match, with the match count printed so the shares
      can be weighed against what they were computed over. In this section and not
      beside the historical one's, because that one now does not render for a cup at
      all; two base-rate lines, one of them reading "unavailable", was the outcome the
      replacement above avoided.*
      *This line is **not** the thing ADR-0043 describes, and it says so itself. The
      ADR's base rates are "the prior Season's top-flight results alone": one
      competition, one closed Season, fixed for the year. A cup's sides play in no league
      and have no prior Season, so the set here is every competition — World Cup,
      qualifiers, friendlies — from a fixed day, against opponents inside and outside the
      fifty-four, and it grows with each Gameweek's Lock. The rendered line states all
      four of those facts, because a reader who took "base rates" to mean the ADR's
      sentence would be reading a different number.*
      *Matches at a **neutral** venue are left out. A home-win share over a set in which
      a third of the matches had no home side understates home advantage for an Entrant
      reading a Fixture that has one, and the dataset's `neutral` column exists to tell
      them apart. Mutation-checked: counting the neutral matches moves every figure.*
      *Over the dataset's rows alone, and not merged with this Season's own Fixtures.
      ADR-0043's anchor is a body of results rather than the Gameweek being predicted,
      and the merge exists to stop one match being two lines — which is a rendering
      problem, not an arithmetic one.*
      *The wording of the rates themselves is now one function, `baseRatesClause`, shared
      with the league section. ADR-0043 owns that sentence, so a change to it would
      otherwise have to be made in two places at once — the forced-simultaneous-edit this
      project requires before extracting anything. What each section keeps is its own
      prefix, which is the half that differs.*
      *ADR-0043's **other** rate is here too, and the box does not name it: story 41 says
      "base rates **and xG rates**", and the ADR spells the second as "xG for and against
      per game — overall, home and away". It renders per side, over this Season's own
      Fixtures and over nothing else, because `international_results` has no xG column at
      all — which is the other half of story 41's "and the team-stats table". Ticket 0072
      handed the rendering of those figures to this ticket and this ticket's boxes named
      only the base rates; review found the gap. `xgRatePerGame` is now exported from the
      league section over a predicate rather than an alias map, so both packets read the
      rate the same way, with the same both-or-nothing rule and the same "(over 2 of 3
      matches)" coverage wording; a side with no Fixture yet reads "no Fixture played
      yet" rather than three `unavailable`s.*
- [x] The contamination test holds in both directions: no `UNL` row in a league packet,
      no league row in a `UNL` packet.
      *`international_results` is the one shared table in that file: it has no
      `competition` column and cannot have one, because a national side plays in several
      competitions under none of this record's codes. So the filter is not a `where`
      clause — it is the registry, and that is what the test tests. The contaminant is a
      row naming Arsenal and Chelsea, in the Premier League's own spelling, dated before
      its Lock: a packet reading the table without asking the registry would put it on
      Arsenal's form line and nothing else would stop it.*
      *The Premier League reads neither that row nor the dataset's date, and its packet
      grows neither the section nor the "Dataset last updated" line. The cup reads both
      rows, which is what makes the absence mean something — the read is not simply
      broken. The other direction, a cup reading no league row, is the
      `historicalMatches` assertion ticket 0072 left in the same file.*

## The decision this ticket was asked to make

**Where the dataset's latest row date is kept: a one-row table, `migration 0043`.**

The ticket left it open between "the snapshot's metadata or one row, the least code that
survives a dry run". Neither of the two cheaper options works:

- **`max(played_on)` over `international_results`** is not the same number. That table
  holds only what the fifty-four did from 2024-06-01 forward, and the file's last row is
  usually somebody else's: in the recording, 2026-08-26 Vietnam v Thailand against
  2026-07-19 for the latest row naming a UEFA side. A packet printing the second would
  report a monthly source as five weeks staler than it is, which is the opposite of what
  story 30 asks for.
- **The snapshot's name** cannot carry it. Every source in this project archives its
  bytes *before* validating them, so nothing parsed out of a body can reach the name that
  body is archived under.

The table carries two columns and they answer two questions that are easy to confuse:
`latest_row_on` is how fresh the **file** is and is what the packet prints; `read_at` is
when this record last read it and is what the after-first-deadline guard asks.

The cost is the one a migration always has here: the pending pass is now `0042`, `0043`
and `0044`, `npm run db:rehearse` must be re-run before an operator applies any of them
(`docs/runbooks/the-competition-migration.md` §2), and five hard-coded filename lists in
two suites grew rows.

## Found beside the work

**Migration `0044` was never added to the five filename lists.** It arrived with
`d6b3698` ("Hold La Liga Gameweek 6's Lock open to 16:45Z"), which landed on `main` while
this ticket was being built, and neither `test/migrations.test.ts` nor
`test/rehearse-migration.test.ts` had it. This diff adds `0043` **and** `0044` to all
five, so the suites enumerate what `applyMigrations` really returns. That is a fix this
ticket did not ask for and it is recorded here rather than left to be found in a diff:
the alternative was a red suite that said nothing about ticket 0073.

## What this ticket did not do

- **The Season-wide "no result has been played yet this Season" line, the league-table
  absence and the Squad Changes absence.** Ticket 0075's, and replacing the historical
  section is what makes them its: with that section gone, a `UNL` packet says nothing
  about the Season it is in until 0075 writes the three absences it has already listed.
- **A head-to-head section, and the stated absence that went with it.** The league
  section ends with either the last five meetings or the line "No prior meeting in stored
  data."; replacing that section for a cup takes both away, and ADR-0037 wants an absence
  stated rather than silent. `international_results` would answer the section itself —
  two national sides have usually met — so the choice for ticket 0075 is to build it or
  to state its absence, and doing neither is the one option this ticket has left open.
- **The pin.** `MATCH_PROMPTS` has no `UNL` entry and this ticket did not add one; the
  five leagues' pins are unchanged, which is the assertion that no league packet grew a
  section.
- **The nested ternary in the daily fetch's schedule dispatch.** Still deferred to
  whichever ticket adds a third *schedule* source. This one adds a history source and the
  two `if`s it adds are not that shape.
- **A slice of `results.csv` for the daily-fetch seam.** Spec 0027 suggested one; the
  whole recorded file is used instead, because it parses in 54ms and a slice is bytes
  nobody recorded.
- **Merging a Fixture that kicks off after midnight UTC.** The dedupe key reads two
  clocks: the record's kickoff instant in UTC, and the day the file says the match was
  played on. A Fixture kicking off at 00:30Z is the 30th to the record and the 29th to a
  file written in the country it was played in, so it would be two lines once the dataset
  caught up. No Fixture of this Season's recorded schedule kicks off later than 19:45Z,
  so it cannot happen to `UNL`; a `ponytail:` note in the builder names the ceiling and
  the upgrade path — match the adjacent day too, which is safe because two national sides
  do not meet twice inside two days — and a test pins what the limit does today rather
  than leaving it for the first Competition that plays outside Europe.
- **Applying migration 0043.** No migration has been applied to production and this one
  does not change that.
