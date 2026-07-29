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

- [x] Fetch runs daily on a schedule and can also be triggered by hand
- [x] Re-running over unchanged data creates no duplicate rows and no duplicate snapshot
- [x] A partially failed run is recovered by simply running it again
- [x] Both sources validate their response shape and fail loudly rather than storing partial data

The daily FPL fetch assigns the bootstrap player snapshot to the unique event marked
`is_next`. An existing stored deadline remains authoritative once it has passed: a later
upstream deadline cannot reopen that player partition. With no next event, the year-round
job still archives and validates both FPL responses but does not invent a Gameweek label.

Deployment applies migrations deliberately before enabling the workflow. Repository
variables `SEASON` and `FOOTBALL_DATA_SEASON` use `YYYY-YY` (for example `2026-27`, not
football-data's `2627` URL form); `FOOTBALL_DATA_SEASON` advances to the current Season when
that feed becomes available. Once the Season's Gameweek 1 deadline passes, zero stored
matches for `SEASON` fails the job, so leaving the variable on the prior Season cannot
silently starve context. Failed runs open or update a GitHub issue assigned to
`FETCH_ALERT_ASSIGNEE` when that repository variable is configured.

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

- [x] A Fixture postponed after its Gameweek's deadline keeps its Predictions and is marked deferred
- [x] A deferred Fixture records the Gameweek that locked it as the canonical owner, so scoring attributes the result there rather than to the Gameweek it was played in (ADR-0013)
- [x] A Fixture inserted into a Gameweek whose deadline has already passed attaches to the next open Gameweek and is predicted there
- [x] A Fixture that is never played needs no special handling: it carries no result and no code path treats it differently (ADR-0013)
- [x] Moving a Fixture never produces a second Prediction for it

The all-event daily fetch reconciles a locked Fixture as soon as FPL either removes its
Gameweek or assigns a different one. Its scheduled `gw` and kick-off follow FPL once known,
while `locked_in_gw` remains the immutable owner used by prediction and eventual scoring.
A newly seen Fixture assigned to a closed Gameweek keeps that scheduled `gw` but receives
the earliest still-open Gameweek as its canonical Lock; a Gameweek-specific manual fetch
stores that Lock's deadline before inserting the Fixture.

`deferred` is eventually consistent across the Lock: a move fetched before the deadline is
not deferred until the first successful fetch at or after the deadline. The 06:00 UTC fetch
must therefore complete before the 10:00 UTC scorer or any dashboard snapshot that relies on
the flag. The flag is monotone once set, including when FPL later restores the Fixture to its
locked Gameweek; consumers read it as "was deferred after the Lock" (ADR-0013).

This slice guarantees the inputs, not the arithmetic. It records the canonical `locked_in_gw`
and `deferred` values immutably, which is the half that cannot be corrected later — a scorer
written in October can be rewritten, but a Fixture whose Lock was recorded wrongly in August
cannot be re-locked. What the scorer must then do with those values is stated in ADR-0013 and
becomes acceptance criteria of the scoring tickets, which are written once scoring is specced
after the Season starts (ADR-0005).

---

## Scheduled runs, manual fill and context reuse

**What to build:** Predictions are collected twice before every deadline without anyone
acting, an operator can close remaining Gaps by hand while time remains, and nothing any later
run does can change a Prediction already made. Filling a Gap late must not hand that Entrant
fresher information than its peers received.

**Blocked by:** Repairs, Gaps and failure causes.

- [x] Predict runs automatically six hours and again two hours before the Gameweek deadline
- [x] After the main context exists, an operator can trigger a fill manually at any point before the deadline
- [x] Later runs write only for Fixtures that have no Prediction
- [x] Later runs load the stored context rather than rebuilding it, so a late-filled Entrant references the same context as everyone else
- [x] Repeated runs cannot replace an existing Prediction, however many times they are triggered
- [x] A manual run after the deadline writes nothing and is still logged

GitHub Actions polls every fifteen minutes because its static cron cannot follow deadlines
stored in Postgres. The scheduler derives the main and Fill times from
`gameweeks.deadline_at`; `prediction_runs` records completion so delayed polls catch up,
completed runs do not repeat, and a run aborted by persistence failure is retried. A run
claimed before the Lock is retried after the Lock if necessary, producing recorded
`deadline` attempts instead of an abandoned operational row. The workflow and a Postgres
advisory lock serialise scheduler invocations.

The deployment assumes a public GitHub repository while fifteen-minute polling is enabled.
At the GitHub plan limits reviewed on 2026-07-30, standard runners for a public repository
consume no metered Actions minutes while a private repository includes 2,000 minutes per
month. Roughly 2,920 monthly polls would plausibly exhaust that private allowance. Public
scheduled workflows can be disabled after 60 days without repository activity, so
re-enabling every scheduled workflow before the pre-Season rehearsal is a recurring operator
chore.

A Fill, including a manual fill, requires the context stored by the main run and fails before
calling an Entrant if that context is absent. Both paths select only missing Predictions.
The Prediction primary key remains the final protection against replacement.

---

## Gap alerting

**What to build:** The operator receives two distinct signals: a Gap alert when a completed
run leaves Fixtures unpredicted, and a workflow-failure alert when the job never reaches a Gap
report. Neither signal should depend on noticing one red run in a noisy Actions history.

**Blocked by:** Scheduled runs, manual fill and context reuse.

- [x] A run finishing with Gaps raises an alert; a run finishing clean is silent
- [x] The alert names the Entrant, the Fixtures affected and the cause of each Gap
- [x] The alert states how long remains before the deadline, so the operator can judge whether intervening is worth it
- [x] A predict workflow failure opens or updates a distinct GitHub issue even when orchestration never completes
- [x] The workflow-failure issue links the failed run, uses the daily-fetch open-or-comment pattern, and assigns `PREDICT_ALERT_ASSIGNEE` when configured

After every successfully completed main, Fill or manual run, the Prediction path reads
remaining Gaps back from stored Entrants, Fixtures, Predictions and attempts. The report uses
the latest recorded failed attempt as each cause and includes the injected-clock interval to
the Lock, read after the stored-data query completes. Each completed scheduled run is emitted
before the scheduler starts later due work, so a later run failing cannot suppress an earlier
alert. The report is printed for operators and emitted as a GitHub Actions warning annotation;
when no Gaps remain, no alert is emitted. An unexplained Gap fails the job rather than silently
omitting its cause.

Failures outside that completed-run path are handled only by the workflow boundary. Either
the scheduled or manual job failing opens the distinct `Prediction workflow is failing`
issue, or comments on its existing open instance, with a link to the failed run.
`PREDICT_ALERT_ASSIGNEE` is optional and is applied only when the issue is first opened.
The workflow invokes a separately tested reporter script so issue creation and comment
behaviour are exercised at the `gh` process boundary rather than asserted from YAML text.

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
