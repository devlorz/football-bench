# Ticket: A Competition reads the sources its registry names

**What to build:** the daily fetch stops assuming every listed Competition reads every
source. A per-Competition source registry names where each Competition's schedule,
history, shots and xG, and head coaches come from; the four league-only loops
(football-data.co.uk, Understat, Squad Changes, Head Coach changes) and the
after-first-deadline guard walk only the Competitions whose entry names them; a listed
Competition with no entry fails the run by name before any source is reached. The five
open Competitions get entries that describe exactly what they read today, so nothing
about their days moves. In the same change, one migration: `UNL` joins the
`competition_code` domain, and the two tables a cup needs — `international_results` and a
team-stats table keyed by source and source match id — are created. Source:
[spec 0027](../specs/0027-the-nations-league-opens.md) stories 1–6, 43–46. Decisions:
[ADR-0057](../adr/0057-the-nations-league-opens-as-the-first-cup-on-sources-nobody-documents.md)
("which sources a Competition has is data the fetch reads, not a flag"; "new rows go in
new tables"), [ADR-0054](../adr/0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md)
(a missing map fails loudly).

**Blocked by:** None — can start immediately. This is the prefactor every later ticket
stands on: make the change easy, then make the easy change.

**Status:** built 2026-09-14 — the registry, the four loops and the guard that read it,
migration `0042`, and their tests. Migration `0042` is **pending**: written, applied by
every test's `resetSchema` and by nothing else. It is not applied to production by this
ticket, and it is the first migration behind production's head since `0041`
(2026-09-10), so [the Competition migration](../runbooks/the-competition-migration.md)'s
standing instruction applies — **re-run `npm run db:rehearse` before applying**, since a
rehearsal that predates the migrations it is supposed to cover has rehearsed nothing.
`UNL` is in the domain from that migration and absent from the registry until ticket
0071, which is a state the record can hold safely: nothing may list `UNL` until it has an
entry, because the daily fetch refuses it by name.

---

## What is already known

**Today the dispatch is a code test.** The daily fetch reads football-data.org for
"every listed Competition but `PL`", and then walks every listed Competition through
football-data.co.uk, Understat, Squad Changes and Head Coach changes; each of those
throws for a Competition it has no entry for ("no curated divisions", "no Understat
league"), and the guard after the first deadline asks `historical_matches` for rows a cup
will never have. Listing `UNL` today fails four ways a day.

**The registry is the field the fetch already needs.** One readonly map from Competition
code to the names of its schedule source, history source, stats source and head-coach
source. `PL` reads FPL for its schedule and the domestic four for the rest; the four
leagues read football-data.org and the same four; `UNL`'s entry is written by ticket
0071, not here — an entry naming sources that do not exist yet would be a lie the fetch
believes.

**`historical_matches` cannot hold a cup.** Its key is one meeting per pair per Season
under a Division, and its Division check names the ten league divisions. National sides
meet twice a year in different competitions under no Division. `international_results`
is keyed by date and the two sides and carries the competition name, the venue country
and the neutral flag. The team-stats table is keyed `(season, competition, source,
source_match_id)`, carries the kickoff and both sides for the join, and per side nullable
shots, shots on target and xG — nullable because a hole is a row that is read again
(ADR-0058), not a row that is absent.

**Migration 0022's shape is the precedent**: the domain is widened by `alter domain`, the
migration follows [the Competition migration](../runbooks/the-competition-migration.md),
and it is applied to production by the operator, never by this ticket.

## Acceptance

- [x] A source registry names, per Competition, its schedule, history, stats and
      head-coach sources; `PL`, `PD`, `SA`, `BL1`, `FL1` have entries describing what
      they read today, and the daily-fetch test proves each still reaches exactly the
      sources it reached before this change and no other.

      `src/fetch/competition-sources.ts`, five entries. **Five fields, not four**: the
      ticket names four league-only loops and Squad Changes is one of them, so
      `squadChanges` is a field beside the ADR's `{schedule, history, stats,
      headCoaches}` — a loop gated on a field another loop owns would be the flag the
      ADR refused. "Reaches exactly those sources and no other" is asserted as the
      whole list of URLs a run requested, undeduplicated so that a doubled read fails
      too, rather than as a filter over one host: a filter is blind to a loop that grew
      a source back, which is the regression the registry exists to prevent.

      **Two of the five are proven at the daily-fetch seam and three are not.** Listing
      `SA`, `BL1` or `FL1` there needs their four sources' archived bytes, which this
      ticket has no reason to record. `test/competition-sources.test.ts` covers all
      five in the direction that can drift: every source an entry names has a map for
      that Competition (`divisionsOf`, `understatTeamNamesOf`, `transferWindowsOf`,
      `headCoachSource`). Mutation-checked — renaming `SA`'s divisions key fails it by
      name. It is not the same assurance as a run: it proves the entry is answerable,
      not that the loop reached it.

      **That test widened one module's public surface, deliberately.**
      `src/squad-changes/transfer-window.ts` gains `transferWindowsOf(competition)`,
      three lines, exported for this test and read by nothing else today. Three of the
      four maps already answer "does this Competition have a map at all" — `divisionsOf`,
      `understatTeamNamesOf` (exported for its derivation test on exactly this
      argument) and `headCoachSource`. The transfer windows did not: `squadChangeWindow`
      asks whether *a date* falls inside a window, so using it here would have meant
      inventing a date that is inside a window in all five countries — a date that
      exists today and may not next Season, failing the test for a reason that is not
      the drift it watches for. A reviewer should read this as a seam opened for a
      test, which it is: the alternative was a test that goes red on a calendar.

      **`schedule: "fpl"` is half-live and the interface says so.** The
      football-data.org loop reads it for every Competition, and `PL`'s `"fpl"` is what
      keeps the Premier League out of that loop — the literal this ticket removed. But
      `fetchFplDaily` runs for the Season, not for a listed Competition (ADR-0035: the
      FPL track is the Premier League by nature), so naming `"fpl"` does not cause the
      FPL fetch and dropping it would not stop it. Left as data with that written down
      rather than removed: it is what the football-data.org filter reads.
- [x] A listed Competition with no registry entry fails the daily fetch by name before
      any HTTP request is made, and the failure is collected the way every
      per-Competition failure is: the other Competitions' days land, the run fails at
      the end.

      The listing is read and resolved against the registry before the first request of
      the run, which is what moved it above the FPL fetch. Two tests, because the two
      halves of the claim need different evidence. "Reaches no source": `UNL` listed
      beside `PL` throws `UnknownCompetitionSourcesError` naming it, the seven URLs the
      Premier League's entry names are the only ones requested, and its 380 Fixtures
      land. "Before any HTTP request": the FPL bootstrap is made invalid so it fails
      too, and the registry's error has to be **first** in the `AggregateError` —
      `errors` is appended in execution order, so first there means before the run's
      first request. Mutation-checked: moving the refusal below the FPL fetch fails it.
- [x] The four league-only loops and the after-first-deadline guard read the registry;
      a Competition whose entry names no history source is not asked for
      `historical_matches` rows.

      The guard is **passed the entry and reads `sources.history` itself**, and returns
      early for anything that is not football-data.co.uk. It first inherited the loop's
      filter instead, which was green today and wrong in shape: ticket 0073 has to ask
      the same question of `international_results`, and an inherited filter makes that
      a second guard rather than a branch. The football-data.co.uk fetch and ADR-0056's
      projection stay gated inside the loop, so the projection still never runs for a
      Competition whose history is elsewhere (story 46).

      The early return is **not reachable by any test today**, because every registry
      entry names football-data.co.uk. Faking an entry to reach it would test the fake.
      It becomes live and covered with `UNL`'s entry in ticket 0071.
- [x] One migration adds `UNL` to `competition_code`, creates `international_results`
      and the team-stats table with the keys above, and leaves
      `historical_matches_division_check` untouched; the schema test holds the registry's
      codes against the domain both ways.

      `migrations/0042`. The Division check is untouched and the existing "holds the
      curated names and no others" test is what proves it. The domain's own test is new
      and is that test's shape one table over — read off `pg_get_constraintdef` so a
      surplus is named rather than counted. It holds the registry's five codes plus one
      named line for `UNL`, which is in the domain and awaits ticket 0071's entry;
      closing that gap is deleting the line.
- [x] The migration is recorded as pending in the runbook's terms; it is not applied to
      production by this ticket.

      See **Status** above: pending, rehearsal to be re-run before it is applied.
- [x] Every existing test is green; no packet rendering changes (the `PL`/`PD` pins do
      not move).

      **Full suite, 2026-09-14: 101 files, 1392 passed, 6 skipped, 126s**, and
      `tsc --noEmit` clean.

      The targeted run before it said 264 passed and was wrong to stop there. The full
      suite found three failures in `test/rehearse-migration.test.ts`, whose three
      hard-coded migration-filename lists had not taken `0042` — the same drift already
      fixed in `test/migrations.test.ts`'s two lists. The file selection missed it
      because it was made from "who calls `runDailyFetch`" and "who reads the schema",
      and that suite does neither: it reads the `migrations/` directory. **A migration
      is five list edits across two suites**, and no targeted selection derived from
      the source change will find them.
- [x] **The runbook counts the change.** `docs/runbooks/opening-a-competition.md` was
      eight edits and is nine: the registry is edit **0**, numbered ahead of the eight
      rather than inserted into them, because tickets 0057, 0059 and 0075 cite those
      numbers and renumbering a list other documents point into costs every one of
      those references. It goes first because its absence is the one failure on that
      page that is loud — the whole run, by name, every day — where every other missing
      edit is a section that reads calm. The page also now says which of the nine a cup
      makes (0, 1, 2) and which are a league's (3 to 8), which is ADR-0057's
      Consequences line. Not on the ticket's acceptance list; the page has been missed
      twice before and this was the third time.
- [x] **The three findings a review would repeat.** `listedCompetitions` returns
      `{named, unnamed}` instead of appending to the caller's `errors` behind a name
      that promises a read. The three per-Competition source blocks — eighteen
      near-identical lines each once the registry gate went on — collapse into one
      `reported` helper; the remaining `competition === "PL"` literals decide whose
      outcome is *reported*, never who is *read*, and the comment says so instead of
      claiming the literals are gone. The "no Competition is listed for the Season"
      failure text becomes "no listed Competition reads this source" when Competitions
      are listed — it was a true sentence that ticket 0071 would have turned into a
      wrong one, sending an operator to a `competitions` table that is correct.
