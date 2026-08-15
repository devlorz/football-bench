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

- [x] The fetch dispatches per Competition row: `PL` takes the existing path, untouched;
      everything else the football-data.org client, writing the same tables.
      _One `select competition from competitions where competition <> 'PL'` and a loop —
      the same shape ticket 2 gave the scheduler and the scorer, so opening a league is an
      insert in all three places and a branch in none. `src/fpl/fetch-gameweek.ts` is not
      touched by this ticket at all, which is story 7 read literally.
      Each Competition's failure joins the daily fetch's collected `errors` rather than
      throwing where it happens: one league's dead token must not cost another league its
      schedule, and the run still fails loudly at the end.
      **The FPL half is not gated on a `competitions` row, and that is asymmetric with the
      scheduler and the scorer.** Raised by review and left as it is: the FPL fetch is the
      Premier League by nature (ADR-0035), and the convention ticket 2 and ticket 5 settled
      is that a PL-only caller states the literal at its own boundary rather than looking
      itself up — the same reading as `daily-fetch.ts`'s and `fpl-gameweek-context.ts`'s
      `competition = 'PL'` filters. The asymmetry is also protective in the direction that
      matters: the fetch is what creates the Gameweeks the scheduler later walks, so a
      missing row silencing it would leave a record with nothing in it, which is a quieter
      failure than the one the row is there to prevent. Worth revisiting only alongside the
      other PL literals, as one decision._
- [x] A Gameweek with no observed Lock carries `deadline_at` = earliest kickoff minus
      ninety minutes, recomputed every fetch; the derived-deadline rules live in a pure
      module with its own tests.
      _`src/football-data-org/derived-deadline.ts`, one function over
      `(kickoffs, storedDeadline, observedAt)` and no clock, database or schedule of its
      own. It is the only place the Lock's timing is decided._
- [x] The first fetch at or past the deadline performs the Lock; from then the deadline is
      immutable and the Fixture owns the Gameweek it Locked in (ADR-0015), with postponed
      and unscheduled Fixtures handled by the existing machinery (ADR-0013, ADR-0024).
      _"Performs the Lock" here is the Gameweek's deadline ceasing to be recomputed. The
      `locked_in_gw` write stays where it already was — `assignCanonicalLock` on the
      predict path — so this ticket adds no second Lock mechanism; the fetch's only
      `locked_in_gw` is the FPL path's insert-time one, for a Fixture first seen after its
      own Gameweek's Lock had passed.
      **One Locked Gameweek is written anyway**: the one the record has never seen. A
      Competition adopted after its Season began arrives holding played Gameweeks, and
      skipping them left their Fixtures with no Gameweek row to point at — a foreign key
      violation the first test of it found. Its deadline is a fact from birth rather than
      one that moved.
      **A Fixture that already has a result is never given a `locked_in_gw`.** Copying the
      FPL rule whole put every Fixture of a Locked Gameweek into the next open one, which
      on a Competition adopted mid-Season means three matches with published scores queued
      for Entrants to predict: the predict path selects on `coalesce(locked_in_gw, gw)`
      (`predict-gameweek.ts:172`) and asks nothing about the result. The FPL path cannot
      reach the case — its fetch has always started before Gameweek 1 — but ticket 8's
      "launch at Gameweek 3" escape hatch makes it a plan here, so the module that claims
      to support mid-Season adoption has to get it right. A played Fixture keeps
      `locked_in_gw = null` and stays under its own Locked Gameweek: history the context
      reads, work no run picks up, and nothing the scorer attributes. **Found by review**;
      the test that had blessed the old behaviour now asserts the split.
      A Gameweek whose every Fixture is withdrawn keeps its stored deadline, because there
      is no kickoff left to derive one from. Deliberate, and recorded at the code.
      **`migrations/0025` makes the freeze a database rule, not an `if`.** Spec 0016 asks
      for the deadline to be "immutable — enforced the same way `locked_in_gw` is", and
      `locked_in_gw` has had a trigger since 0022 while this had one writer's guard; review
      found the gap. The condition is **not the clock**: "now is past the deadline" depends
      on `now()`, which every replay, rehearsal and Season seed writes against a simulated
      instant instead, and it would refuse the first write of a mid-Season adoption — rows
      Locked on arrival with nothing committed under them. The condition is a Fixture whose
      `locked_in_gw` points at the Gameweek, which is exactly the trace of a commitment: a
      Prediction requires a Locked Fixture (0022) and `assignCanonicalLock` is what sets
      `locked_in_gw` when one is written, so every case where moving the deadline would
      make a stored record false is covered, and the case it leaves movable is the one
      where nothing has committed yet. It composes with 0022: `locked_in_gw` is immutable
      and now so is the instant it was Locked at, so no single `update` can rewrite either
      half of "these Entrants committed before X". Guarded on `is distinct from` like its
      sibling, because every fetch upserts the deadlines it derived and rewriting the same
      value must stay a no-op._
      The withdrawn set is `matchday is null` plus `POSTPONED`, `SUSPENDED` and
      `CANCELLED`, which then take the FPL path's three statements unchanged. Reading the
      status is not optional: football-data.org keeps a postponed match on its old matchday
      with a placeholder date, so a status-blind parser would leave it on the calendar.
      **Those three statements are copied from `src/fpl/fetch-gameweek.ts`, not shared with
      it.** Sharing them would mean editing the FPL path, which story 7 keeps byte-for-byte
      untouched — so the duplication is the cost of that story and is deliberate. Because
      it is a copy, the Premier League's coverage proves nothing about it, and it carries
      its own end-to-end proof: a review found the copy tested only for a Fixture withdrawn
      before its Lock. "a Locked Fixture withdrawn from the schedule keeps its Prediction"
      now walks the whole state machine on `PD` rows — Locked with a stored Prediction,
      withdrawn (kept, `deferred`, `unscheduled`, Prediction retained), withdrawn again
      (idempotent), restored (`unscheduled` clears, `deferred` does not)._
- [x] A kickoff observed earlier than the current derived deadline raises the loud alert
      and never silently relocks.
      _`KickoffInsideDeadlineError`, thrown before the transaction opens, so an alerted
      fetch writes nothing at all. Two shapes reach it: a kickoff inside a frozen deadline,
      and a recomputation that would land in the past while the Gameweek is still open —
      story 13's "shrink `deadline_at` into the past". Loud is the daily fetch failing,
      which is what opens the issue `fetch.yml` already opens.
      **A Gameweek the record has never seen cannot breach**, deliberately: it has no
      deadline to have moved, and without the exception a Competition adopted mid-Season
      would alert once per Gameweek already played, on a margin nobody was relying on.
      The two comparisons meet exactly: the Lock is `observedAt >= deadline`, so the breach
      is `derived <= observedAt`. A strict `<` left `derived === observedAt` belonging to
      neither — no alert, and a deadline written equal to the instant of writing, a
      zero-second window recorded as a normal one. **Found by review.**_
- [x] A Competition whose source has produced no rows by its first derived deadline fails
      the fetch loudly (the per-Competition stale-source guard).
      _`StaleCompetitionSourceError`, and **stricter than the box**: it fires on any empty
      response, not only one after a deadline. With no rows there is no derived deadline to
      be past, so the box's condition can never be met by the case it is about — and a
      listed Competition is one an operator opened because they want it fetched, against
      leagues that all publish a full schedule before the Season. An empty response is a
      wrong code, a wrong Season or a dead token, every time.
      It counts **what the source sent**, not what survived the withdrawal filter. Counting
      the survivors made a league that postponed everything report "the source produced no
      Fixture; check the Competition code and the token" — sending an operator after a
      fault that was not theirs, on the one day they could least afford it. **Found by
      review.**_
- [ ] Every response is stored in raw snapshots under its own source name, and the parser
      is tested against recorded snapshots.
      _**Half done, and left unticked for the half that is not.** The archiving is real:
      `football_data_org:${season}:${competition}`, written before validation like every
      other source, so a 403 body is still evidence — `test/fetch-football-data-org-`
      `competition.test.ts` proves both.
      The parser is tested against a **constructed** fixture, not recorded bytes: no
      free-tier token exists for this repository yet, and a parser that waited for one
      would be a parser with no test at all. It carries the full documented v4 envelope
      (`filters`, `resultSet`, `competition`, per-match `area`/`season`/`odds`), La Liga's
      opening two matchdays including the two Fixtures ADR-0036 names as already held back
      to late August, and one postponed Fixture. What it pins is the parser against the
      format — it cannot catch the format being wrong, which is exactly what spec story 36
      asks for. **Ticket 8's day-one live-source checks are where the first real response
      is captured; ticking this box is part of that change, not this one.**_

## 4 — Ten seats under a frozen La Liga prompt

**What to build:** The ten Entrants hold seats in a second Competition under
`match-pd/2026-27-v1` — one shared template rendered with the Competition's name, frozen
with its own hash — while the Premier League's version is untouched in text, hash and
seats.

**Blocked by:** 1.

- [x] One template whose only variable is the Competition's name; each Competition's
      rendered text is a frozen constant with a sha over the rendered form.
      _`MATCH_PROMPTS` in `src/predictions/openrouter-entrant.ts`, one entry per
      Competition holding its version, its sha and the one word the template varies by —
      the same single-edit shape `competitions` and `DIVISIONS` already have. `matchContext`
      takes the Competition and renders the name; there is no second wording to keep in
      step.
      **The sha is over a fully rendered context, not over the template.** That is the
      mechanism that already exists — `MATCH_PROMPT_SHA256` has always pinned one whole
      rendered packet, not the template alone — and a hash over the template would have
      pinned the one part of the prompt no test was in danger of losing. The consequence is
      recorded at the code: `PD`'s hash moves once ticket 6 names the Spanish divisions and
      the league table stops reading "unavailable". That is legitimate rather than a break
      of ADR-0026 — the freeze binds at first use (ADR-0038) and nothing predicts under
      `match-pd/2026-27-v1` until ticket 8._
- [x] A render test proves each Competition's text differs from the Premier League's
      rendering by exactly the Competition name.
      _`test/openrouter-entrant.test.ts`, over one history string shared by both renderings
      so the template is the only thing under test: `PD`'s rendering must equal `PL`'s with
      "Premier League" replaced by "La Liga", character for character. Story 38 read
      mechanically — comparing two frozen constants that look alike would have proved
      nothing about the template they came from. `replaceAll` and not `replace`, so a
      template naming the league twice fails rather than passing on its first occurrence.
      **A Competition's name has two sources rendering into one packet** — this one and
      `divisionsOf`'s top-division name in `build-historical-context.ts` — and they agree
      invisibly today because the Premier League spells the same in both. Ticket 6 is where
      they can part: Spanish divisions named "LaLiga" or "Primera División" would have one
      packet calling one league two things, with the frozen sha holding the disagreement in
      place. A test now asserts they agree for every Competition that has both. **Found by
      review.**_
- [x] The `PL` prompt constants are byte-for-byte untouched (ADR-0026).
      _Both `export const` lines are the same bytes, and `MATCH_PROMPTS.PL` refers to them
      rather than restating them, so there is no second copy to drift. The pinned hash test
      passing unchanged is what proves the rendering did not move under the refactor._
- [x] Ten seats per active Competition are entered through the existing roster machinery,
      and the Season-prefix validation on version strings carries the Competition.
      _`enterSeasonRoster` takes the Competition and reads its version from
      `matchPromptOf`; `enterActiveCompetitionRosters` loops the `competitions` table, which
      is the shape the scheduler, the scorer and the daily fetch already take, so opening a
      league is the insert plus one `MATCH_PROMPTS` entry. One transaction per Competition,
      so a league whose Prompt Version has not been frozen fails by name and leaves the
      leagues already seated seated — and the refusal names which ones those were, since an
      operator reading only the error would otherwise not know whether any landed. **Found
      by review.**
      `seatPrefixOf` reads the seat prefix off the version having refused two things: a
      version that is not this Season's, and one that is not the **match track's**. The
      second was missing at first, on the reasoning that the version is the Competition's by
      having been looked up by it — but the same change gave that segment a new job, as the
      seat id the upsert keys on, so a `MATCH_PROMPTS` entry beginning `fpl/` would have
      built ten `fpl/…` ids and overwritten the FPL track's seats in silence. Story 25
      *extends* the Season-prefix rule to carry the Competition; extending is not dropping
      the half it already had. **Found by review.** It is exported so both refusals can be
      walked into — neither is reachable through `MATCH_PROMPTS` as it stands.
      **A seat's `models` id carries the Competition too** — `match-pd/claude-opus-5` beside
      `match/claude-opus-5` — because `id` is the primary key and ADR-0038 grows ten rows
      per Competition. The prefix is the Prompt Version's own leading segment, so the seat
      and the version cannot name different leagues, and the Premier League's ten ids do not
      move. It is **not** a Track and is not named one: a Track is `match` or `fpl`
      (CONTEXT.md) and ADR-0035 refused representing a Competition as one. **Found by
      review.** `test/competition-coexistence.test.ts` seats one tracer per Competition for the
      same reason and normalises the id out of its disjointness assertion.
      The three Reference Lines stay one row each for every Competition, recorded at the
      code: a Reference Line is asked nothing, so its Prompt Version selects no seat and
      every read of it goes by id._
- [x] The seats are the Season Roster that stood at the Season's first Lock; a later
      Competition is not a door for a Base Model that missed ADR-0034's cutoff.
      _The guard compares whole Entrant identities against `SEASON_ROSTER`, field for field,
      rather than counting seats (story 39). Two doors, not one: a **swap** keeps the count,
      and a **transplant** keeps the count *and* the ids — the same id and name over a
      different `baseModel`, `provider`, `quantization` or `canonicalSlug`, which is what a
      `models` row actually sends on the wire. A guard on ids alone let the second one
      through, and a Competition opening after the first Lock is exactly where a Base Model
      that missed the cutoff would arrive. **The id-only version was found by review**; both
      shapes now have a test.
      The message names the failing seat's position and the fields that disagree rather than
      its id — under a transplant the id is the roster's, and naming it would say a seat is
      not itself. It names the Competition too, since the seating is now per Competition and
      "the roster" alone would not say which one was refused.
      **That guard alone is still the constant compared with itself, so it is not the
      first-Lock rule.** `SEASON_ROSTER` is editable; an edit that kept the ids reads
      identically on both sides of the comparison, and a Competition seated afterwards would
      get the new Base Model while re-running an already-seated one would rewrite its stored
      identity through the upsert. **Found by review, twice — the second time on the fix for
      the first.** The record of what stood at the Season's first Lock is the **stored
      seats**, not a constant in a file, so `refuseARosterTheRecordDisagreesWith` reads every
      Competition's Match seats from `models` and refuses a roster that disagrees with them:
      a Base Model swapped in behind a stored seat, and a stored seat the roster no longer
      names. Every Competition's seats and not this one's, because the ten are one roster
      across the leagues (ADR-0038) — the Premier League's stored seats are what La Liga's
      are checked against.
      `catalogCheckedAt` is the one field outside the identity, deliberately: ADR-0009's
      per-seat check moves whenever an operator looks again, and refusing that would make
      the guard a reason not to look. Three tests drive the drift through the stored rows
      rather than through the argument, which is the only way the cross-deployment case is
      reachable at all._
- [x] Prediction runs, fill runs and gap alerts operate per Competition through their
      existing Prompt Version filters, unchanged.
      _The filters are unchanged; what they are given is the Competition's version.
      `predict-gameweek.ts` (both queries — the roster read and the work query, so a fill
      run is covered by the same change as a main run) and `gap-alert.ts`.
      **`matchRoster` too, which the box does not name.** Ticket 2 scoped the scorer by
      Competition when there was one Prompt Version to read; with two, the Premier League's
      ten would have been the roster of every league — emptying every La Liga complete case
      (ADR-0011) and dropping `gap_rate` and `attempts_to_valid` from its scores, which is
      how the coexistence test found it. Leaving it for a later ticket would have shipped a
      scorer that silently reports a Competition as unscored.
      `read-api.ts`, `preflight-base-models.ts` and `seed-season.ts` keep the `PL` literal:
      each is the Premier League by nature and states the literal at its own boundary, the
      convention tickets 2, 3 and 5 settled._

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

- [x] The football-data.co.uk reader takes the Spanish division codes, the division check
      constraint grows in the same change, and the per-file division validation holds.
      _Both backfill writers — `football-data/fetch-season.ts` and
      `understat/fetch-season-xg.ts` — take their Competition explicitly here.
      `migrations/0024` put `historical_matches.competition` and
      `understat_match_xg.competition` outside both primary keys and **dropped the `'PL'`
      default it had used to relabel the existing rows**. So the database does catch a
      writer that says nothing — not null, no default, a loud failure. What it cannot
      catch is a writer that says the *wrong* Competition, because the column joins no key:
      the row lands with no collision, no check, and a packet that reads normally. That is
      what the explicit argument is for, and the `COMPETITION = "PL"` constant these
      writers used to hold was exactly the wrong-and-stated form of it.
      (This note read "left … defaulting to `'PL'` … so a writer that omits it files
      Spanish rows silently", which describes 0024's first two statements and not its last
      two, and names the wrong mechanism. The same wrong reasoning had been copied into
      `src/cli/config.ts` and its test. **Found by review** — twice, the second time for
      the correction to the first.)_

      _`migrations/0026` grows the check to four names. Not a lookup table: nothing joins
      to a division, so a table would buy a foreign key and cost a second place to edit
      per league. `HISTORICAL_COMPETITION` is required with no default for both backfill
      CLIs, for the same reason 0024 dropped the column default — the unsaid Competition
      is the one mistake nothing downstream can catch._

      _**The per-file `Div` check turns out to be load bearing right now, not in theory.**
      football-data.co.uk has published no 2026-27 file yet — `spainm.php` and
      `englandm.php` both list 2025-26 as their latest — and its Apache MultiViews answers
      a request for a file it does not have by redirecting to a near-miss name: `2627/SP1.csv`
      → `2627/P1.csv` (**the Portuguese first division**), `2627/E0.csv` → `2627/EC.csv`.
      `nodeHttpFetcher` is `fetch`, which follows the redirect, so the response is a 200
      carrying another country's league. Every row fails `row.N.Div: expected SP1` and the
      fetch refuses. `test/fetch-football-data-season.test.ts` now drives exactly that shape.
      Two consequences: `FOOTBALL_DATA_SEASON` must stay `2025-26` until the files appear,
      which is what `StaleFootballDataSeasonError` already says; and `PD`'s 2026-27 history
      arrives through the daily fetch when they do, not through a backfill._

      _`daily-fetch.ts` keeps the `PL` literal on both history sources. Nothing predicts
      under `PD` until ticket 8, so there is no stale Spanish table to leave behind yet —
      **ticket 8 turns the two calls into a loop over the listed Competitions**, which is
      also where the canned Spanish responses `test/daily-fetch.test.ts` would need belong._
- [ ] The prior Season's first- and second-division history is backfilled, with the second
      division playing the Championship's role for promoted clubs; the current Season
      follows from the daily fetch, which closes this box in ticket 8.
      _Acceptance text amended, and the box put back. It read "Two seasons … are
      backfilled", which the notes below then contradicted by recording one. ADR-0037's
      scope is "two seasons … **mirroring what the Premier League context reads today**",
      and what the Premier League reads today is one backfilled Season plus a current one
      the daily fetch keeps — so two Seasons was never two backfills. The amendment names
      the two halves instead of counting them, and the second half is genuinely not
      ticket 6's to do: football-data.co.uk has published no 2026-27 file for any league,
      and the daily fetch holds the `PL` literal until ticket 8. **Found by review.**_
      _`build-historical-context.ts` reads its top and second division from the
      `DIVISIONS` map ticket 5 introduced, which has no `PD` entry. Add it here, with the
      same two names the reader stores, or `PD` renders "league table: unavailable" over
      a full backfill._

      _The `PD` entry is added: `SP1` → "La Liga", `SP2` → "Segunda División". "La Liga"
      and not "LaLiga" or "Primera División" because `test/openrouter-entrant.test.ts`
      requires it to equal `MATCH_PROMPTS.PD.competitionName`. **`MATCH_PROMPTS.PD.sha256`
      is re-pinned** to `b11a86bc…` — the move ticket 4 wrote itself down expecting, now
      that the table reads "no result has been played yet this Season" rather than stating
      it is unavailable. The rendering was read before it was pinned. The remaining work
      is operational: `HISTORICAL_COMPETITION=PD HISTORICAL_SEASON=2025-26 npm run
      fetch:history` against a database that has taken `0022`–`0026`._

      _**Run.** `0022`–`0026` applied to the deployed database on 2026-08-15, by the
      runbook: all four preconditions read clean (ten seats at `match/2026-27-v2`, no
      attempt ever recorded, no open run, no Lock window), `db:rehearse` green over a copy
      of the real record — 38 Gameweeks and 380 Fixtures relabelled and otherwise
      identical — then `db:migrate`. `competitions` still holds the single `PL` row, so
      nothing about the schedule moved. The runbook's §4 schema diff comes back clean:
      the only lines the deployed `public` schema holds beyond the repository's are
      `schema_migrations` (the runner's own table, never a migration's) and Supabase's
      platform grants and default privileges. No table, constraint, index, trigger or
      domain differs. The backfill stored **380 La Liga and 462 Segunda
      División rows** for 2025-26, beside the Premier League's 380 and 552._

      _**One Season, not two, and that is the same two the Premier League has.** `PL`'s
      stored history is 2025-26 alone; its 2026-27 arrives through the daily fetch. `PD`
      now matches it exactly. Going deeper would have been worse than incomplete — a
      Competition with 2024-25 history that the Premier League lacks is a benchmark whose
      leagues are asked the same question over different amounts of past. `PD`'s 2026-27
      is blocked twice over: football-data.co.uk has published no 2026-27 file at all yet,
      and the daily fetch holds the `PL` literal until ticket 8._
- [ ] The Understat league is a parameter and the prior Season's La Liga xG is backfilled;
      the current Season follows from the daily fetch, which closes this box in ticket 8.
      _Amended and put back for the same reason as the history box above, and caught by
      applying that finding rather than by being told twice: this said "two seasons" and
      was ticked over one. The parameter half is done and the 2025-26 half is stored;
      2026-27 is not fetchable at all yet — `getLeagueData/La_liga/2026` returns an empty
      `dates` — so the two boxes close together, in ticket 8, or neither honestly does._
      _The parameter is in: `UNDERSTAT_LEAGUES` maps `PD` → `La_liga`, and the URL, the
      Referer, the snapshot source name and the stored `competition` move together or the
      fetch refuses. The 2025-26 backfill is the operational half. **2026-27 is not
      fetchable yet** — `getLeagueData/La_liga/2026` answers with an empty `dates`._

      _**Run.** 380 rows across all twenty clubs, every Understat name resolved — the map
      was derived from these exact feeds, so a miss would have meant the derivation was
      wrong. Checked further than "it stored": **379 of the 380 join a stored result**,
      against the Premier League's 380 of 380. The one that does not is a source
      disagreement rather than a mapping fault — football-data.co.uk dates Valencia vs
      Oviedo 2025-09-30, Understat kicks it off 2025-09-29T19:00Z. Left alone. The join
      is by date and resolved name with **deliberately no fallback** (`joinXg`), and a
      day's tolerance to rescue one line in 380 would be exactly the fallback that
      docblock refuses; the line reads "xG unavailable", which is what that state is for._
- [ ] Both identity maps (source names to football-data names; Understat names to
      football-data names) are reviewed by a human before the backfill runs — a wrong
      mapping, unlike a missing one, fails nothing.
      _**The Understat half is reviewed and approved (2026-08-15). The review happened
      after its backfill ran, not before, which is the order the box asks for and not the
      order it went in** — recorded rather than smoothed over, because the box's
      requirement is about sequence and the sequence is what slipped. Nothing was riding on
      it: the fetch is an idempotent upsert, so an amended map is a re-run, and the map had
      already been checked two ways that a transcription could not have survived (see
      below). The other half is reviewed before anything is written, in ticket 8._

      _The **Understat → football-data** map gains La Liga's 2025-26 twenty, derived rather
      than transcribed: every key is a `title` in `getLeagueData/La_liga/2025` and every
      value a `HomeTeam` in `mmz4281/2526/SP1.csv`, and the two sets are each exactly
      twenty with nothing left over on either side. The 2026-27 promoted three are
      deliberately absent — Understat lists no 2026-27 match yet — and arrive as
      `unknown Understat team name` at the pre-cron checklist's fetch, which is the
      failure this map exists to make._

      _What the human review was actually asked to decide, since "read twenty lines and
      say yes" is not a control: twelve of the twenty are the same string on both sides
      and cannot be wrong. Eight are not — `Athletic Club`→`Ath Bilbao`,
      `Atletico Madrid`→`Ath Madrid`, `Celta Vigo`→`Celta`, `Espanyol`→`Espanol`,
      `Rayo Vallecano`→`Vallecano`, `Real Betis`→`Betis`, `Real Oviedo`→`Oviedo`,
      `Real Sociedad`→`Sociedad` — and of those the pair that could be swapped and still
      read plausibly is the two `Ath`s. **The join rate is what rules a swap out**: the
      join keys on `(date, home, away)`, so a swapped pair misaligns every fixture of both
      clubs and would show as tens of missing joins, not one. 379 of 380 is not a number a
      mis-mapped club can produce. So the review's real question was the one a machine
      cannot answer — whether these twenty are La Liga's 2025-26 clubs at all — and the
      answer was yes._

      _**The map is keyed by Competition, after a first pass that made it one flat map and
      argued for it.** The argument was backwards. Understat's club names are globally
      unique, so a flat map resolves every club correctly — and resolves a club from the
      wrong league just as correctly. `UNDERSTAT_LEAGUES` is a slug this codebase picks, so
      one wrong character fetches another league's feed under this Competition's name;
      every club would resolve, and the writer's `on conflict (season,
      understat_match_id)` — a key `competition` sits outside by 0024's deliberate choice —
      would not add rows but collide with the other league's and set
      `competition = excluded.competition` across all of them. A Season of another
      Competition's xG, relabelled away, silently. Scoped, the same mistake resolves
      nothing and raises on the first match. This is the structural check the
      football-data reader already had in its per-file `Div` test, and the first pass
      built it on one source while removing the equivalent from the other in the same
      commit. Net-neutral in lines. `test/fetch-understat-season-xg.test.ts` drives the
      whole shape: the English feed stored as `PL`, then offered to a `PD` fetch, refused,
      with the Premier League's row still `PL` afterwards. **Found by review.**_

      _The **source → football-data** map is not drafted, and cannot honestly be. For `PD`
      the source is football-data.org, whose club names are the long official ones
      ("Club Atlético de Madrid") while `historical_matches` holds "Ath Madrid"; without
      the map every La Liga club's history section reads "none in stored data" over a
      complete backfill. The real names need the real response, and
      `test/fixtures/football-data-org-2026-27-PD.json.gz` is still ticket 3's constructed
      fixture — it carries twelve of twenty clubs, and mapping from it would be a guess
      wearing a fixture's clothes. **This half is blocked on ticket 8's `FOOTBALL_DATA_ORG_TOKEN`
      and its captured first real response**, which ticket 8 already owes; it must be
      drafted and reviewed before `PD` predicts, not after._
- [x] Every backfill response lands in raw snapshots and is replayable.
      _Landed: `football_data:2025-26:SP1` and `:SP2`, and `understat:2025-26:La_liga`,
      each the whole response and archived before anything was read from it._

      _Replayable took a fix, and this box is what found it. Both places that translate a
      football-data source matched `([A-Z]\d)` — **two characters, so `SP1` matched
      neither**. `createArchiveReplayFetcher` answered "no archived snapshot source is
      known" for bytes it was holding, and `rehearsalArchive` left a Spanish snapshot
      filed under the Season it was archived from rather than the one being rehearsed.
      Both now read `([A-Z]{1,2}\d)`. Worth noting the failure was silent in the direction
      that matters: the snapshots were being stored correctly all along, and only a dry
      run that tried to replay them would ever have said so._

      _Understat had no mapping either, which the first pass at this note waved off as a
      pre-existing Premier League gap. It is not a defence: the box says **every** backfill
      response, and `PD`'s Understat response was not replayable whoever else's also was
      not. `archiveSource` now maps `getLeagueData/<league>/<year>`, translating the
      opening year Understat addresses a Season by into the `2025-26` form its snapshot is
      archived under — the same translation the football-data URL already needed.
      **Found by review.**_

      _The miss was invisible by construction, which is the part worth keeping: an
      unreachable Understat is a reported outcome and not a failure (ADR-0019), so every
      dry run replayed every source but this one, degraded silently to "xG unavailable" on
      every form line, and still described itself as exercising the whole write path
      against archived snapshots. The rehearsed context and the production context differed
      and nothing in the run said so. No existing test moved when the mapping landed — the
      archives they replay hold no Understat snapshot — so two now cover it directly._

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
- [ ] The football-data.org club names are mapped to football-data.co.uk's and reviewed,
      from the captured real response — ticket 6's second identity map, which could not
      honestly be drafted without it. Until it exists every La Liga club's history section
      reads "none in stored data" over a complete backfill, and nothing fails.
- [ ] The daily fetch's two history sources become a loop over the listed Competitions,
      which is also what closes **ticket 6's history and xG boxes**: their prior Season is
      backfilled and their current Season arrives here. Both hold the `PL` literal today, which ticket 6
      was right to leave — but from the moment `PD` is live its backfilled table would
      otherwise never move again.
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
