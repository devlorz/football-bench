# Tickets: Competition expansion

Nine tracer-bullet slices that take the match track from one league to five — the
Competition dimension, a second schedule source with a derived Lock, a Competition-scoped
context, per-Competition seats, and La Liga live. Source:
[spec 0015](../specs/0015-competition-expansion.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md). Decisions: [ADR 0034–0037](../adr/).

Work the **frontier**: after ticket 1, four tickets open at once (2, 3, 4, 5). Ticket 9
waits on an external event — Premier League Gameweek 1 settling — and on nothing here.

One note on shape: ticket 1 is this set's wide refactor, and it is deliberately **not**
sequenced as expand–contract. ADR-0034 chose a single rehearsed pass: carrying two schemas
side by side through the most deadline-critical week of the Season is a larger risk than
one migration proven green on a temporary Postgres first. The rehearsal is the safety, and
the rollout windows in ADR-0034 are the rule for when the pass may run.

---

## 1 — The Competition dimension migration

**What to build:** A developer runs the migrations against a seeded Premier League record
and gets the same record back, relabelled: every keyed table carries `competition = 'PL'`,
nothing else about any row has changed, and the whole test suite is green. This is the
gate for everything else in the set, and its deadline is the Premier League Gameweek 1
Lock.

**Blocked by:** None — can start immediately.

- [ ] A `competitions` table lists the active Competitions per Season, with `PL` as its
      first row.
- [ ] The seven keyed tables — gameweeks, fixtures, contexts, predictions, attempts,
      prediction runs, scores — key by `(competition, season, …)`, foreign keys included.
- [ ] Existing rows are backfilled `PL` with no other value changed; the migration test
      seeds a scored Premier League record, migrates it, and proves every Prediction,
      context and score readable and identical.
- [ ] The Fixture id column carries its source-native name (`fixture_id`), everywhere it
      appears, including the contexts uniqueness expression.
- [ ] Both Lock triggers — a Prediction requires a Locked Fixture, a Locked Gameweek is
      immutable — are recreated against the new keys and proven still enforcing.
- [ ] The full migration rehearses green on a temporary Postgres before it may touch the
      live database, and the ADR-0034 rollout windows are honoured when it does.

## 2 — Two Competitions through one scheduler and scorer

**What to build:** Two Competitions sharing a Season, Gameweek numbers and Fixture ids
flow through the real scheduled-prediction and scoring entry points in one run, and every
row each produces — runs, contexts, Predictions, scores — lands disjoint. This is the
coexistence proof spec 0015 requires before any La Liga row reaches the live database.

**Blocked by:** 1.

- [ ] The scheduler is one loop under the existing advisory lock, walking the active
      Competitions read from the database — adding a Competition is an insert, not a
      workflow edit.
- [ ] Two Competitions due in the same run are both processed, with disjoint prediction
      run rows — the overwrite the old key made possible is proven dead.
- [ ] The scorer is scoped by `(competition, season)` and derives its Gameweek list per
      Competition; scores rows land disjoint and each leaderboard reads only its own.
- [ ] The coexistence test drives the same entry points the crons call, over a temporary
      Postgres, and is green before ticket 8 may begin.

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

## 4 — Nine seats under a frozen La Liga prompt

**What to build:** The nine Entrants hold seats in a second Competition under
`match-pd/2026-27-v1` — one shared template rendered with the Competition's name, frozen
with its own hash — while the Premier League's version is untouched in text, hash and
seats.

**Blocked by:** 1.

- [ ] One template whose only variable is the Competition's name; each Competition's
      rendered text is a frozen constant with a sha over the rendered form.
- [ ] A render test proves each Competition's text differs from the Premier League's
      rendering by exactly the Competition name.
- [ ] The `PL` prompt constants are byte-for-byte untouched (ADR-0026).
- [ ] Nine seats per active Competition are entered through the existing roster machinery,
      and the Season-prefix validation on version strings carries the Competition.
- [ ] Prediction runs, fill runs and gap alerts operate per Competition through their
      existing Prompt Version filters, unchanged.

## 5 — A Competition-scoped context

**What to build:** The match context builder, asked for a Competition, assembles that
Competition's packet and can be proven to contain only that Competition's data — closing
the two date-only queries before any second league's rows can land in their tables.

**Blocked by:** 1.

- [ ] Every context builder takes the Competition it is building for.
- [ ] The historical-matches and xG reads filter by Competition; a contamination test
      seeds two leagues' rows and proves each packet contains only its own, both
      directions.
- [ ] A `PD` packet renders every v2 section whose data is present, and no availability
      section exists for a non-`PL` Competition (ADR-0036) — its absence is the recorded
      structural difference, not an error.
- [ ] Team-identity misses keep failing loudly; a name missing from a map costs an alert,
      never silent history loss.

## 6 — La Liga's history and xG backfilled

**What to build:** The curation and backfill that make the `PD` packet real: two seasons
of Spanish first- and second-division history and two seasons of Understat xG, behind
reviewed identity maps.

**Blocked by:** 5 — the contamination filters must exist before these rows land.

- [ ] The football-data.co.uk reader takes the Spanish division codes, the division check
      constraint grows in the same change, and the per-file division validation holds.
- [ ] Two seasons of first- and second-division history are backfilled, with the second
      division playing the Championship's role for promoted clubs.
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
source verified, the pre-cron checklist run, and nine Entrants' Predictions Locked before
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
- [ ] The five-Competition projection is recorded as a report, and the ADR-0034 gate for
      Serie A, the Bundesliga and Ligue 1 cites it.
