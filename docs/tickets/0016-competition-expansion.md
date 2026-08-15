# Tickets: Competition expansion

Nine tracer-bullet slices that take the match track from one league to five — the
Competition dimension, a second schedule source with a derived Lock, a Competition-scoped
context, per-Competition seats, and La Liga live. Source:
[spec 0016](../specs/0016-competition-expansion.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md). Decisions: [ADR 0035–0038](../adr/).

Work the **frontier**: after ticket 1, four tickets open at once (2, 3, 4, 5). Ticket 9
waits on an external event — Premier League Gameweek 1 settling — and on nothing here.

One note on shape: ticket 1 is this set's wide refactor, and it is deliberately **not**
sequenced as expand–contract. ADR-0035 chose a single rehearsed pass: carrying two schemas
side by side through the most deadline-critical week of the Season is a larger risk than
one migration proven green on a temporary Postgres first. The rehearsal is the safety, and
the rollout windows in ADR-0035 are the rule for when the pass may run.

---

## 1 — The Competition dimension migration

**What to build:** A developer runs the migrations against a seeded Premier League record
and gets the same record back, relabelled: every keyed table carries `competition = 'PL'`,
nothing else about any row has changed, and the whole test suite is green. This is the
gate for everything else in the set, and its deadline is the Premier League Gameweek 1
Lock.

**Blocked by:** None — can start immediately.

- [x] A `competitions` table lists the active Competitions per Season, with `PL` as its
      first row.
- [x] The seven keyed tables — gameweeks, fixtures, contexts, predictions, attempts,
      prediction runs, scores — key by `(competition, season, …)`, foreign keys included.
- [x] Existing rows are backfilled `PL` with no other value changed; the migration test
      seeds a scored Premier League record, migrates it, and proves every Prediction,
      context and score readable and identical.
- [x] The Fixture id column carries its source-native name (`fixture_id`), everywhere it
      appears, including the contexts uniqueness expression.
- [x] Both Lock triggers — a Prediction requires a Locked Fixture, a Locked Gameweek is
      immutable — are recreated against the new keys and proven still enforcing.
- [x] The full migration rehearses green on a temporary Postgres before it may touch the
      live database, and the ADR-0035 rollout windows are honoured when it does — after
      ADR-0034's roster refresh has finished, never straddling its pre-flights.
      _Rehearsed green 2026-08-15 over a `pg_dump` copy of the live record (38 Gameweeks,
      380 Fixtures, nothing else written yet): `npm run db:rehearse`. The migration has
      **not** been applied to the live database; the window checks in
      [the runbook](../runbooks/the-competition-migration.md) were clear at the time of
      the rehearsal and must be re-run immediately before it is._
- [x] The Fixture id rename is carried through the whole suite, dashboard tests and the
      Season seed included; its blast radius grew with the FPL dashboard work.

## 2 — Two Competitions through one scheduler and scorer

**What to build:** Two Competitions sharing a Season, Gameweek numbers and Fixture ids
flow through the real scheduled-prediction and scoring entry points in one run, and every
row each produces — runs, contexts, Predictions, scores — lands disjoint. This is the
coexistence proof spec 0016 requires before any La Liga row reaches the live database.

**Blocked by:** 1.

- [x] The scheduler is one loop under the existing advisory lock, walking the active
      Competitions read from the database — adding a Competition is an insert, not a
      workflow edit.
      _One due query joining `competitions`, so the whole Season's due work is ordered by
      when it was due rather than by which league was walked first. A Season with
      Gameweeks and no `competitions` row now has nothing due, which is the operational
      act the migration left listing as; the manual insert is
      [pre-cron checklist](../runbooks/pre-cron-checklist.md) §1._
- [x] Two Competitions due in the same run are both processed, with disjoint prediction
      run rows — the overwrite the old key made possible is proven dead.
- [x] The scorer is scoped by `(competition, season)` and derives its Gameweek list per
      Competition; scores rows land disjoint and each leaderboard reads only its own.
      _Every read API query that filters by Season filters `competition = 'PL'` beside it,
      both tracks, as a literal rather than a parameter: a ranking must not be able to
      span two leagues before any second league's rows exist, while which Competition a
      reader asks for stays the shape ADR-0035 defers to the dashboard's own decision.
      **The FPL-track reads are the one place this set reaches past its own scope.** The
      spec puts the FPL track entirely out of scope, and ADR-0035 asks the read API to
      filter by Competition everywhere it filters today; the tables carry the column
      either way, because ticket 1 was forced to give it to them. Filtering them costs
      one grant — `migrations/0023`, the `competition` column on the column-level
      `attempts` grant the FPL squads endpoint reads through — and leaves no read whose
      Competition-blindness needs its own explanation. A later ticket that decides the
      FPL track should never have been filtered removes both together._
      The scorer's stored `scores.detail` calls the Fixture id `fixtureId`, not `fplId` —
      a football-data.org id under an FPL name would have been a false label on the
      record's own evidence, and `scores` is empty in every deployed database, so the
      rename cost nothing. The dashboard's published `fplId` **API field** is untouched
      and stays a contract (ADR-0035)._
- [x] The coexistence test drives the same entry points the crons call, over a temporary
      Postgres, and is green before ticket 8 may begin.
      _`test/competition-coexistence.test.ts`, over `runScheduledPredictions` and
      `scoreMatchCompetitions` — the functions `predict:scheduled` and `match:score` call.
      The scorer's per-Competition loop moved out of the CLI into
      `scoreMatchCompetitions` so that the test covers it rather than a copy of it._

## 3 — A derived-Lock Gameweek from football-data.org

**What to build:** The daily fetch, pointed at a non-`PL` Competition, turns recorded
football-data.org snapshots into Gameweeks with derived deadlines and Fixtures with
kickoffs and results — and observes a Lock at the derived deadline exactly the way the
FPL path observes one at FPL's. Demoable on a temporary Postgres end to end.

**Blocked by:** 1.

- [ ] The fetch dispatches per Competition row: `PL` takes the existing path, untouched;
      everything else the football-data.org client, writing the same tables.
- [ ] A Gameweek with no observed Lock carries `deadline_at` = earliest kickoff minus
      ninety minutes, recomputed every fetch; the derived-deadline rules live in a pure
      module with its own tests.
- [ ] The first fetch at or past the deadline performs the Lock; from then the deadline is
      immutable and the Fixture owns the Gameweek it Locked in (ADR-0015), with postponed
      and unscheduled Fixtures handled by the existing machinery (ADR-0013, ADR-0024).
- [ ] A kickoff observed earlier than the current derived deadline raises the loud alert
      and never silently relocks.
- [ ] A Competition whose source has produced no rows by its first derived deadline fails
      the fetch loudly (the per-Competition stale-source guard).
- [ ] Every response is stored in raw snapshots under its own source name, and the parser
      is tested against recorded snapshots.

## 4 — Ten seats under a frozen La Liga prompt

**What to build:** The ten Entrants hold seats in a second Competition under
`match-pd/2026-27-v1` — one shared template rendered with the Competition's name, frozen
with its own hash — while the Premier League's version is untouched in text, hash and
seats.

**Blocked by:** 1.

- [ ] One template whose only variable is the Competition's name; each Competition's
      rendered text is a frozen constant with a sha over the rendered form.
- [ ] A render test proves each Competition's text differs from the Premier League's
      rendering by exactly the Competition name.
- [ ] The `PL` prompt constants are byte-for-byte untouched (ADR-0026).
- [ ] Ten seats per active Competition are entered through the existing roster machinery,
      and the Season-prefix validation on version strings carries the Competition.
- [ ] The seats are the Season Roster that stood at the Season's first Lock; a later
      Competition is not a door for a Base Model that missed ADR-0034's cutoff.
- [ ] Prediction runs, fill runs and gap alerts operate per Competition through their
      existing Prompt Version filters, unchanged.

## 5 — A Competition-scoped context

**What to build:** The match context builder, asked for a Competition, assembles that
Competition's packet and can be proven to contain only that Competition's data — closing
the two date-only queries before any second league's rows can land in their tables.

**Blocked by:** 1.

- [x] Every context builder takes the Competition it is building for.
      _`loadMatchContextData` already did; `MatchContextData` carries the Competition
      through to `buildMatchContext`, which is what lets the availability decision be made
      in the pure builder and tested without a database.
      `buildHistoricalContext` takes it too, and needs it: it selected the table, the
      prior-Season position line, the points-per-game rate and the promoted flag on the
      literals `'Premier League'` and `'Championship'`, so a `PD` packet would have
      rendered another league's table or none with no way to tell which.
      The pair now comes from `src/football-data/divisions.ts` — **the same list the fetch
      writes the rows by**, not a second copy. That is what keeps a missing entry from
      becoming silent history loss: a Competition absent from the list cannot be fetched
      either, so "no divisions" means "no rows yet" rather than rows the context has
      dropped. Two lists would each have been correct alone while a full backfill rendered
      as an empty table. **Ticket 6 adds the `PD` entry once**, and the reader and the
      context light up together; until then a `PD` packet says the table is unavailable
      rather than implying an empty league.
      The remaining two take rows that are already scoped and are left alone:
      `buildFplContext` is only ever called for `PL` (see the next box), and
      `buildSquadChangesContext` reads a per-Gameweek partition its loader has already
      filtered — a Competition either could only re-filter by would decide nothing.
      ADR-0037 read "every builder"; it carries a dated amendment recording this narrowing
      and why, with its original sentence left standing, and spec story 16 points at the
      amendment. Three places, one rule._
- [x] The historical-matches and xG reads filter by Competition; a contamination test
      seeds two leagues' rows and proves each packet contains only its own, both
      directions.
      _`migrations/0024` gives both tables the column and then **drops the default**:
      neither primary key contains it, so unlike 0022 the default would have been the only
      net, and a writer that omitted the Competition would file Spanish rows under the
      Premier League with no collision and no check to catch it. Both writers name their
      Competition as of this change. Dropping it broke 27 tests across 8 files that had
      been seeding history through the default — which is the number worth recording,
      because every one of them was a place the mistake was already possible.
      **Five reads, not the two the story named:** the context's history and xG, the Elo
      reference line's `priorSeasonResults` (a rating carried over from another league's
      results is a number about nobody), the daily fetch's staleness guard (`gw = 1`
      returns a row per Competition now, and `rows[0]` was picking between them by luck),
      and the FPL track's league table. The last two filter `competition = 'PL'` as
      literals: both are the Premier League by nature, and a division belongs to a
      Competition only by convention — nothing in the schema holds it — so the division
      alone was never the filter it looked like. Spec story 16 is corrected to match.
      The contamination test is `test/competition-context-contamination.test.ts`; its
      docblock records why both leagues are seeded under one `division` and under English
      club names, which is the part of the test that is easiest to undo by tidying._
- [x] A `PD` packet renders every v2 section whose data is present, and no availability
      section exists for a non-`PL` Competition (ADR-0037) — its absence is the recorded
      structural difference, not an error.
      _The branch is on `data.competition`, not a flag: the empty FPL section reads "no
      player snapshot loaded for this Gameweek", which in a league that will never have
      one apologises for a Gap that is not one. The prompt's own "Predict this Premier
      League Fixture." line is untouched — that is ticket 4's frozen per-Competition
      prompt, not this one's.
      A `PD` packet today renders its form lines, records and head-to-head, and states
      that the league table is unavailable — the one section that cannot exist before
      ticket 6 names the Spanish divisions. Every PL rendering is byte-identical, which
      the pinned prompt hash in `test/openrouter-entrant.test.ts` is what proves: the
      frozen v2 context (ADR-0026) may not move under a refactor._
- [x] Team-identity misses keep failing loudly; a name missing from a map costs an alert,
      never silent history loss.
      _Unchanged and deliberately so: the escalation is at the ingest boundary
      (`fetch-season-xg.ts` raises `unknown Understat team name` as a validation issue,
      pinned by `test/fetch-understat-season-xg.test.ts`), and `joinXg` skipping an
      unresolvable row is downstream of it. No fallback was added; ticket 6's maps are the
      next thing to feed it._

## 6 — La Liga's history and xG backfilled

**What to build:** The curation and backfill that make the `PD` packet real: two seasons
of Spanish first- and second-division history and two seasons of Understat xG, behind
reviewed identity maps.

**Blocked by:** 5 — the contamination filters must exist before these rows land.

- [ ] The football-data.co.uk reader takes the Spanish division codes, the division check
      constraint grows in the same change, and the per-file division validation holds.
      _Both backfill writers — `football-data/fetch-season.ts` and
      `understat/fetch-season-xg.ts` — take their Competition explicitly here.
      `migrations/0024` left `historical_matches.competition` and
      `understat_match_xg.competition` defaulting to `'PL'` with the column outside both
      primary keys, so a writer that omits it files Spanish rows under the Premier League
      in silence: no collision, no check, and a contaminated packet that reads normally._
- [ ] Two seasons of first- and second-division history are backfilled, with the second
      division playing the Championship's role for promoted clubs.
      _`build-historical-context.ts` reads its top and second division from the
      `DIVISIONS` map ticket 5 introduced, which has no `PD` entry. Add it here, with the
      same two names the reader stores, or `PD` renders "league table: unavailable" over
      a full backfill._
- [ ] The Understat league is a parameter and two seasons of La Liga xG are backfilled.
- [ ] Both identity maps (source names to football-data names; Understat names to
      football-data names) are reviewed by a human before the backfill runs — a wrong
      mapping, unlike a missing one, fails nothing.
- [ ] Every backfill response lands in raw snapshots and is replayable.

## 7 — La Liga's squad changes

**What to build:** The squad-changes section of the `PD` packet, from the Spanish
transfer list behind a curated club-identity map. Deliberately off ticket 8's blocking
path: the spec allows it to trail into the Season.

**Blocked by:** 5.

- [ ] The transfer list for the Spanish season is fetched and parsed behind a curated
      club map, and an unknown club spelling fails loudly.
- [ ] The squad-changes section appears in the `PD` packet when the data is present.

## 8 — La Liga goes live

**What to build:** The first real La Liga Gameweek: the Competition activated, the live
source verified, the pre-cron checklist run, and ten Entrants. Predictions Locked before
kickoff and stored with their contexts — the write path doing for `PD` what it has done
for `PL` since the Season opened.

**Blocked by:** 2, 3, 4, 5, 6.

- [ ] The day-one live-source checks pass: the three deferred opening Fixtures carry
      usable round numbers, and kickoff timestamps are timezone-sound against the
      published schedule.
- [ ] The `PD` row is inserted and the scheduler picks the Competition up with no
      workflow edit.
- [ ] The pre-cron checklist runs for the new Competition and comes back clean.
- [ ] The first derived deadline is observed, the Gameweek Locks, and every Entrant's
      Prediction with its stored context predates the Lock.
- [ ] If curation slipped past Gameweek 2, the escape hatch was taken as decided —
      launch at Gameweek 3 with the sections that are ready — and the stored contexts
      record exactly what shipped.

## 9 — The five-league price read from Gameweek 1

**What to build:** The number the expansion's remaining gate needs: the real per-Fixture
cost of the match track, read from Premier League Gameweek 1's recorded attempts, and the
five-league projection written down where the gate decision for the other three
Competitions can cite it.

**Blocked by:** None — waits only on Premier League Gameweek 1 settling.

- [ ] Per-Fixture prompt and completion cost is read from the recorded attempts, per
      entrant route.
- [ ] The five-Competition projection is recorded as a report, and the ADR-0035 gate for
      Serie A, the Bundesliga and Ligue 1 cites it.
