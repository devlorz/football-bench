# Tickets: Match track write path

Twelve tracer-bullet slices that build the recording half of the benchmark — everything that
must be live before the first Gameweek of the 2026/27 Season. Source:
[spec 0001](../specs/0001-match-track-write-path.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md). Decisions: [ADR 0001–0015](../adr/).

Work the **frontier**: any ticket whose blockers are all done. After the first two, four
tickets open at once.

This is a greenfield repository, so there is nothing to prefactor and no wide refactor to
sequence as expand–contract. Every ticket is a vertical slice.

---

## Repository, schema and the FPL source

**What to build:** Running the fetch job pulls a Gameweek's Fixtures and deadlines from the
FPL API into a database and archives the response exactly as it arrived. This is the first
half of the pipeline — data going in — and it establishes the outbound-HTTP seam that every
later ticket is tested through.

**Blocked by:** None — can start immediately.

- [x] A local Postgres can be built from migrations covering every table in spec 0001: Entrant rows, Gameweeks, Fixtures, contexts, Predictions, attempts and raw snapshots
- [x] Fixture identity is the Season plus the FPL id, and two Seasons sharing an FPL id coexist without collision
- [x] A Prediction row cannot be updated — the attempt is refused by the database itself, not by application code
- [x] Running fetch stores every Fixture of a Gameweek with its kick-off time, and stores the Gameweek's deadline as its own record
- [x] The raw upstream response is archived byte-for-byte and addressed by a content hash
- [x] An upstream response with an unexpected shape is archived, then fails validation at the boundary, names every offending field, and stores no derived rows
- [x] Outbound HTTP is injectable, and the test suite replays an archived response with no network access
- [x] Tests run against a real Postgres rather than a substitute, so the constraints above are what is being verified

---

## Tracer bullet: a Locked Prediction, end to end

**What to build:** Running the predict job for a Gameweek asks one real Entrant for a
Prediction on every Fixture and stores what comes back — refusing anything that arrives once
the Gameweek's deadline has passed. Context is deliberately minimal here: the two teams and
the kick-off. This is the narrowest complete path through the system.

**Blocked by:** Repository, schema and the FPL source.

- [x] A Prediction carries both a probability distribution over Home / Draw / Away and a Predicted Score
- [x] Probabilities summing to one within tolerance are renormalised; those outside it are rejected, as are negative or non-integer goals
- [x] The context handed to the Entrant is stored and hashed, and a Prediction cannot exist without the stored context that produced it
- [x] Every call is logged whether it succeeded or not, with latency and token counts
- [x] With the clock before the deadline a Prediction is written; at or after it the write is refused and the attempt is still logged
- [x] The insert path sets the Fixture's canonical locked Gameweek before writing a Prediction, and the database refuses a Prediction with no Lock
- [x] The clock is injectable, so the deadline case is tested without waiting
- [x] Running predict twice over the same Gameweek produces no duplicate Predictions

---

## Pre-flight: confirm all nine Base Models answer

**What to build:** A one-shot check that every Base Model on the roster will actually attempt
the task. Probability forecasting on sport sits close to betting and content policy varies
across nine Base Models; discovering a refusal on the first real Friday costs Fixtures that
cannot be recovered.

**Blocked by:** Tracer bullet: a Locked Prediction, end to end.

- [x] Calls all nine Base Models with the real prompt shape against a real Fixture
- [x] Reports for each: parseable output, refusal, or transport error — with the raw body when it fails
- [x] Reports the provider and model the gateway actually resolved for each
- [x] Fails if `resolved_provider` is null for any Base Model, so a broken OpenRouter metadata contract cannot silently disable the ADR-0009 substitution check
- [x] Fails if `resolved_model` is null for any Base Model, so missing endpoint model metadata cannot silently disable ADR-0009 snapshot-swap detection
- [x] Archives at least one byte-exact successful OpenRouter response and replays it in tests, so response-shape contracts come from observed evidence rather than hand-written fakes
- [x] Runs as an operator script rather than as part of CI
- [x] Exits non-zero if any Base Model refuses or cannot produce parseable output

---

## Nine Entrants, pinned, concurrent, independently failing

**What to build:** A Gameweek run collects a Prediction from each of the nine Entrants for
every Fixture, calling them in parallel, with every request pinned to a single provider so an
open-weight Base Model is never quietly served at a different quantization from one week to
the next.

**Blocked by:** Tracer bullet: a Locked Prediction, end to end.

- [x] Each Entrant is a row carrying its Base Model, pinned provider, pinned quantization and Prompt Version, so adding a tenth needs no code change
- [x] Every request pins its provider with fallbacks disabled, and pins quantization for open-weight Base Models
- [x] The provider and model the gateway resolved are recorded against every call, so a silent substitution is detectable afterwards
- [x] Calls fan out concurrently within a rate limit and a full Gameweek completes in minutes
- [x] One Entrant failing every call still leaves the other eight with complete Predictions
- [x] All nine Entrants for a given Fixture reference the same stored context

---

## Repairs, Gaps and failure causes

**What to build:** An Entrant that returns unusable output is told exactly what was wrong and
given three chances to fix it. One that still fails leaves a recorded Gap rather than a
Prediction — and the record says why, so a Gap can be explained rather than merely counted.

**Blocked by:** Nine Entrants, pinned, concurrent, independently failing.

- [x] A validation failure produces a fixed message naming the problem, which is sent back to the Entrant
- [x] Up to three Repairs are attempted, and the number used is recorded alongside the resulting Prediction
- [x] A failure after the third Repair produces no Prediction, and the log explains every attempt
- [x] Failure causes are distinguished from one another: schema, probability sum, refusal, provider, timeout, rate limit
- [x] The Gap count and each Gap's cause for a Gameweek can be read from stored data alone
- [x] Validator messages live in one place, so changing them is a deliberate and visible edit rather than a drift

---

## Migration runner and shared schema application

**What to build:** The schema can change after it has been deployed. A new migration file is
applied once, recorded, and never re-applied, and the same code that migrates the real
database builds the one every test runs against — so adding a table reaches the tests without
editing each test file.

Until now the schema has been edited in place in a single file, which was correct while
nothing was deployed. The next two tickets both need tables that do not exist yet, and the
first deploy is imminent, so this is the last moment the change costs nothing.

**Blocked by:** Repository, schema and the FPL source.

- [x] A migration the database has already recorded is never applied a second time
- [x] Migrations are applied in filename order, and the runner reports which ones it applied
- [x] Each migration and the record of it share one transaction, so a crash between them cannot leave the schema changed but unrecorded
- [x] A migration that fails part-way leaves no table and no record, so re-running retries exactly that file
- [x] Two runners starting together apply each migration exactly once
- [x] Tests and the migrate CLI build the schema through the same code path

---

## Historical results and the rolling cross-season form window

**What to build:** Entrants see each side's last five matches actually played, crossing Season
and division boundaries as needed, so Gameweek 1 is not information-free and promoted sides
are not blank rows. One definition of form that works from Gameweek 1 to Gameweek 38, with no
special-case path that runs once a year and is never exercised.

**Blocked by:** Migration runner and shared schema application.

- [x] Premier League and Championship historical results are fetched and archived like any other source
- [x] The form window is always the last five matches played, whatever the Season or division
- [x] Every match in the window is labelled with its Season and division, so a lower-division result can be discounted rather than mistaken
- [x] Prior-Season final position is included, and promoted sides carry their Championship position with a promoted flag
- [x] Goals for and against, home and away splits, and head-to-head history appear in the context
- [x] A Gameweek 1 context contains a full window produced by the same code path as a Gameweek 38 context
- [x] Where no data exists — no prior meeting, no top-flight history — the context says so in words

---

## FPL-derived context: prices, availability and absence markers

**What to build:** Entrants see who is expensive and who is missing. Opening prices carry the
summer's squad changes through a source that is reliable and already fetched, and every
flagged absence is shown rather than only those belonging to expensive players.

**Blocked by:** Migration runner and shared schema application.

- [x] The five highest-priced players per team appear with position, price and status
- [x] Every player whose status is not fully available appears — with chance of playing, the news text and when that news was added — not only those in the top five
- [x] A fully fit player's absent chance-of-playing value renders as available, never as unknown
- [x] No field is ever silently empty; absent data is written out explicitly
- [x] The built context for a Fixture is readable by a person and can be checked by eye against the real league table

---

## Daily fetch, idempotent, with snapshot dedup

**What to build:** The pipeline keeps itself fed without anyone touching it, and re-running is
always safe. A shape change upstream stops the pipeline loudly at the boundary instead of
surfacing weeks later as strange context.

**Blocked by:** Historical results and the rolling cross-season form window.

- [ ] Fetch runs daily on a schedule and can also be triggered by hand
- [ ] Re-running over unchanged data creates no duplicate rows and no duplicate snapshot
- [ ] A partially failed run is recovered by simply running it again
- [ ] Both sources validate their response shape and fail loudly rather than storing partial data

---

## Rescheduled and deferred Fixtures

**What to build:** A Fixture that moves after its Predictions were locked keeps them — the
Lock held, and the Predictions are equally stale for every Entrant. A Fixture that appears too
late to be predicted in its own Gameweek attaches to the next one that can still take it,
rather than becoming a Gap for everybody.

**Blocked by:** Tracer bullet: a Locked Prediction, end to end.

**Known constraint:** The current fetch only upserts Fixtures whose upstream `event` equals
the requested Gameweek. A Fixture moved out remains on its previous `gw` until the destination
Gameweek is fetched; this ticket must make that reconciliation explicit.

- [ ] A Fixture postponed after its Gameweek's deadline keeps its Predictions and is marked deferred
- [ ] Its result is attributed to the Gameweek that locked the Prediction, not the Gameweek it was eventually played in
- [ ] A Fixture inserted into a Gameweek whose deadline has already passed attaches to the next open Gameweek and is predicted there
- [ ] A Fixture that is never played is simply never scored, with no special handling anywhere
- [ ] Moving a Fixture never produces a second Prediction for it

---

## Scheduled runs, manual fill and context reuse

**What to build:** Predictions are collected twice before every deadline without anyone
acting, an operator can close remaining Gaps by hand while time remains, and nothing any later
run does can change a Prediction already made. Filling a Gap late must not hand that Entrant
fresher information than its peers received.

**Blocked by:** Repairs, Gaps and failure causes.

- [ ] Predict runs automatically six hours and again two hours before the Gameweek deadline
- [ ] An operator can trigger a fill manually at any point before the deadline
- [ ] Later runs write only for Fixtures that have no Prediction
- [ ] Later runs load the stored context rather than rebuilding it, so a late-filled Entrant references the same context as everyone else
- [ ] Repeated runs cannot replace an existing Prediction, however many times they are triggered
- [ ] A manual run after the deadline writes nothing and is still logged

---

## Gap alerting

**What to build:** When a run finishes with Fixtures still unpredicted, the operator finds out
while there is still time to act — not when scoring runs on Monday.

**Blocked by:** Scheduled runs, manual fill and context reuse.

- [ ] A run finishing with Gaps raises an alert; a run finishing clean is silent
- [ ] The alert names the Entrant, the Fixtures affected and the cause of each Gap
- [ ] The alert states how long remains before the deadline, so the operator can judge whether intervening is worth it

---

## Dry run against an archived Gameweek

**What to build:** The whole path can be exercised against a past Gameweek's archived data, so
the pipeline is proven — and its contexts read by a human — before any real deadline exists.

**Blocked by:** Historical results and the rolling cross-season form window · FPL-derived
context: prices, availability and absence markers · Scheduled runs, manual fill and context
reuse.

- [ ] The full path runs against archived snapshots with no live network calls
- [ ] The clock can be set to any chosen point relative to the archived Gameweek's deadline, including after it
- [ ] Results land in a throwaway database and leave real data untouched
- [ ] Contexts produced by the run can be printed for human review
