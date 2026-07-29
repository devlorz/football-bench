# Spec 0001 — Match track write path

**Status:** ready-for-agent
**Scope:** everything that must exist before the first Gameweek of the 2026/27 Season
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:** [ADR 0001–0015](../adr/)

---

## Problem Statement

Nobody can currently say whether one LLM forecasts football better than another, because
nobody has run them side by side under conditions that would make the answer mean anything.
The claims that circulate are anecdotal: a model got a few results right, someone screenshots
it, and there is no way to tell skill from luck, no record of what the model was told, and no
proof it committed before kick-off rather than after.

Building that record has a hard deadline. Predictions cannot be back-filled — a Base Model
already knows how past Seasons ended, so a Prediction made today about a match played last
year proves nothing. The sample is capped at Fixtures played after the system goes live, and
the 2026/27 Season starts in mid-August. Every Gameweek that passes without a running
pipeline is ten Fixtures gone permanently, and there are only 380 in a Season.

The operator therefore needs the recording half of the benchmark working before the Season
starts — not the scoring, not the leaderboard, just the part that captures Predictions in a
form that can be proven honest later. Everything downstream is deterministic and can be
computed from stored data at any point afterwards. The write path cannot.

## Solution

A scheduled pipeline that, once per Gameweek, builds an identical information packet for
every Fixture, hands it to nine Entrants, validates what comes back, and writes the results
into an append-only store before the Gameweek's deadline passes.

Each Entrant returns both a probability distribution over Home / Draw / Away and a Predicted
Score. Everything the Entrant was shown is stored verbatim and hashed, so a sceptic can later
reconstruct exactly what each Entrant knew. Everything that failed is logged too, with its
cause, so the record shows not only who predicted well but who failed to answer at all.

The Lock is enforced where the data enters the database rather than where it is read, so no
schedule slip, retry, or manual intervention can produce a Prediction that appears to precede
an event it actually followed.

When the pipeline finishes with Fixtures still unpredicted, it says so loudly enough that a
human can intervene while there is still time.

---

## User Stories

### Capturing source data

1. As an operator, I want FPL fixtures, Gameweek deadlines, players, prices and availability
   pulled on a daily schedule, so that the pipeline always has current data without me
   remembering to run anything.
2. As an operator, I want historical results pulled from football-data.co.uk for both the
   Premier League and the Championship, so that promoted sides are not blank rows in the
   context.
3. As an auditor, I want every raw upstream response archived exactly as received, so that
   any figure in the benchmark can be traced back to the bytes it came from.
4. As an operator, I want the archive keyed by a content hash, so that repeated fetches of
   unchanged data do not accumulate duplicates.
5. As an operator, I want the fetch to be idempotent, so that re-running it after a partial
   failure is always safe.
6. As an operator, I want every upstream response archived and then validated against a
   schema on arrival, so that a shape change leaves evidence for re-parsing and fails loudly
   at the boundary rather than silently corrupting context weeks later.
7. As an operator, I want Fixture identity to be the Season plus the FPL id, so that next
   Season's Fixture 1 does not overwrite this Season's.
8. As an operator, I want Gameweek deadlines stored as first-class rows, so that the Lock has
   a single authoritative source rather than being derived at call time.

### Building the context

9. As an auditor, I want every Entrant to receive byte-identical context for a given Fixture,
   so that any difference in their Predictions is attributable to the Base Model.
10. As an auditor, I want the exact text handed to Entrants stored and hashed, so that "they
    all saw the same thing" is a verifiable claim rather than an assurance.
11. As an operator, I want form expressed as a rolling window of the last five matches
    actually played — crossing Season and division boundaries as needed — so that the context
    builder has one definition that works from Gameweek 1 to Gameweek 38.
12. As an operator, I want each match in that window labelled with its Season and division, so
    that an Entrant can discount a Championship result rather than being misled by it.
13. As an operator, I want prior-Season final position included, with Championship position
    and a promoted flag for promoted sides, so that early Gameweeks are not information-free.
14. As an operator, I want goals for and against, home and away splits, and head-to-head
    history included, so that the context matches what a competent human analyst would gather.
15. As an operator, I want the five highest-priced players per team included with position,
    price and status, so that summer squad changes reach the Entrant through a reliable source
    rather than through pre-season friendlies.
16. As an operator, I want every player whose status is not fully available included in full —
    with chance of playing, the news text, and when that news was added — so that a key
    absence outside the top five is never invisible.
17. As an operator, I want absent data written out explicitly — "no prior meeting", "promoted,
    no top-flight data" — so that an intentional blank and a broken context builder never look
    the same.
18. As an operator, I want a fully fit player's null chance-of-playing mapped to available
    rather than unknown, so that the context does not report the entire league as doubtful.
19. As an auditor, I want context built once per Gameweek and reused, so that Entrants filled
    in on a later run are not handed fresher information than their peers.

### Configuring Entrants

20. As an operator, I want each Entrant stored as a row carrying its Base Model, pinned
    provider, pinned quantization and Prompt Version, so that adding a tenth Entrant is a row
    rather than a code change.
21. As an operator, I want Base Model identifiers version-pinned to a dated snapshot, so that a
    vendor swapping the model behind a stable name does not silently contaminate the Season.
22. As an operator, I want every request pinned to one provider with fallbacks disabled, so
    that an open-weight Base Model is never served at a different quantization from one week
    to the next.
23. As an auditor, I want the provider and model the gateway actually resolved recorded on
    every call, so that a silent substitution is detectable after the fact.
24. As an operator, I want the Prompt Version frozen for the Season, so that the difficulty of
    the task does not change while it is being measured.

### Getting Predictions

25. As an operator, I want every Entrant asked for both a probability distribution and a
    Predicted Score in a single call, so that the readable leaderboard and the evidential layer
    come from one commitment rather than two.
26. As an auditor, I want no Entrant given constrained decoding or any other capability its
    peers lack, so that failure rates measure the Base Model rather than the gateway's feature
    coverage.
27. As an operator, I want output validated for schema, probabilities within range and summing
    to one within tolerance, and non-negative integer goals, so that malformed output never
    reaches the store.
28. As an operator, I want probabilities that sum to one within tolerance renormalised and
    those outside it rejected, so that rounding is forgiven and guessing is not.
29. As an operator, I want an Entrant that fails validation told exactly what was wrong and
    given up to three Repairs, so that self-correction is measured rather than assumed.
30. As an auditor, I want the validator's messages fixed for the Season, so that the task does
    not quietly get easier partway through.
31. As an operator, I want an Entrant that still fails after its third Repair to leave a Gap
    rather than a placeholder, so that "did not answer" never masquerades as a Prediction.
32. As an operator, I want every call logged whether it succeeded or not — with cause, latency,
    token counts and the raw response — so that a Gap can be explained rather than merely
    counted.
33. As an operator, I want the number of Repairs an Entrant needed recorded alongside its
    Prediction, so that instruction-following is a measurement rather than an impression.
34. As an operator, I want a refusal distinguished from a schema failure in the log, so that a
    Base Model declining the task on content-policy grounds is visible immediately.

### Enforcing the Lock

35. As an auditor, I want every Prediction for a Gameweek locked at that Gameweek's deadline
    regardless of when its Fixture kicks off, so that verifying the Lock held is one query
    rather than a per-Fixture argument.
36. As an auditor, I want the Lock enforced where Predictions are written, not only where they
    are read, so that a late Prediction cannot exist in the store at all.
37. As an auditor, I want Predictions to be insert-only, so that no re-run can replace an
    existing Prediction and re-rolling until the answer improves is structurally impossible.
38. As an operator, I want a late call still recorded in the attempt log while being refused
    entry to the Prediction store, so that I can diagnose what happened without corrupting the
    record.

### Running the job

39. As an operator, I want a main run six hours before the deadline, so that there is room to
    react when something breaks.
40. As an operator, I want a second run two hours before the deadline that fills only Fixtures
    with no Prediction, so that a transient outage does not cost a Gameweek.
41. As an operator, I want to trigger that fill manually at any point before the deadline, so
    that I can close Gaps I notice myself.
42. As an operator, I want an alert when a run finishes with Gaps outstanding, so that I learn
    about them while I can still act rather than when scoring runs on Monday.
43. As an operator, I want the alert to name the Entrant, the Fixtures and the cause, so that I
    know whether intervening is worth attempting.
44. As an operator, I want calls to the nine Entrants issued concurrently with sane rate
    limiting, so that a full Gameweek completes in minutes.
45. As an operator, I want one Entrant's failure not to abort the run, so that eight working
    Entrants still get recorded.

### Handling schedule changes

46. As an operator, I want a Fixture postponed after its Predictions were locked to keep them,
    so that work already committed is not discarded for a reason that has nothing to do with
    forecasting.
47. As an operator, I want a deferred Fixture attributed to the Gameweek its Prediction was
    locked in and flagged as deferred, so that the record reflects what each Entrant knew when
    it committed.
48. As an operator, I want a Fixture inserted into a Gameweek whose deadline has already passed
    to attach to the next open Gameweek, so that it gets predicted rather than becoming a Gap
    for everyone.
49. As an operator, I want a Fixture that is never played to simply never be scored, so that
    cancellations need no special handling.

### Before going live

50. As an operator, I want every Base Model called with a real prompt before the first
    Gameweek, so that a Base Model that refuses probability forecasting is discovered in
    July rather than on a Friday night in August.
51. As an operator, I want the built context for a handful of Fixtures readable by eye and
    checkable against the real league table, so that a context builder feeding garbage all
    Season is caught once rather than never.
52. As an operator, I want the pipeline runnable against a past Gameweek's archived snapshots,
    so that I can exercise the whole path before any real deadline exists.

---

## Implementation Decisions

### Shape

Three scheduled workflows against one Postgres database, no long-running services. This spec
covers `fetch` and `predict`. `score` is built later from stored data (ADR-0005).

| Workflow | Schedule | In scope here |
|---|---|---|
| `fetch` | daily 06:00 UTC | yes |
| `predict` | deadline −6h, deadline −2h, manual dispatch | yes |
| `score` | daily 10:00 UTC | no — see Out of Scope |

### Modules

- **Source clients** — one per upstream (FPL, football-data.co.uk), each archiving the raw
  body before validating the fields this pipeline consumes. A validation failure preserves
  the evidence but writes no derived rows.
- **Snapshot store** — content-addressed archive of raw upstream responses. Doubles as the
  fixture source for tests.
- **Context builder** — pure function from database rows to the text handed to an Entrant.
  Takes no clock and performs no I/O; it is given the Gameweek and the data as of that
  Gameweek. Emits explicit markers for absent data and never an empty field.
- **Entrant client** — one OpenRouter client for all nine Entrants, parameterised by the
  Entrant row. Applies provider pinning per call and returns the resolved provider and model
  alongside the body.
- **Validator** — schema, probability range and sum, integer goals. Returns either a parsed
  Prediction or a fixed, Season-stable failure message suitable for feeding back.
- **Repair loop** — orchestrates up to three re-asks with the validator's message, logging
  every attempt.
- **Lock guard** — sits in the write path. Rejects any Prediction whose Gameweek deadline has
  passed, using the injected clock.
- **Predict orchestrator** — resolves the Gameweek, builds or loads context, fans out across
  Entrants and Fixtures, writes results, emits the Gap alert.

### Contracts

Entrant output, requested in the prompt with no `response_format` (ADR-0010):

```jsonc
{
  "fixture_id": 12345,
  "probs": { "H": 0.60, "D": 0.24, "A": 0.16 },  // in [0,1], sums to 1 ± 0.001
  "score":  { "home": 2, "away": 1 },            // non-negative integers
  "rationale": "..."                             // stored, never scored
}
```

Attempt failure kinds, which are also the values recorded against a Gap:
`schema`, `probs_sum`, `refusal`, `provider`, `timeout`, `rate_limit`, `deadline`.

Provider pinning, applied to every call (ADR-0009):

```jsonc
{ "provider": { "order": ["<slug>"], "allow_fallbacks": false, "quantizations": ["<level>"] } }
```

`quantizations` is omitted for Base Models served first-party.

### Schema

Fixture identity is `(season, fpl_id)` throughout; FPL ids restart each Season.

| Table | Holds | Key property |
|---|---|---|
| `models` | one row per Entrant: Base Model, pinned provider, pinned quantization, Prompt Version, role | adding an Entrant is a row |
| `gameweeks` | Gameweek deadlines | the single source for the Lock |
| `fixtures` | Fixture, its scheduled Gameweek, canonical locked Gameweek, kick-off, result, deferred flag | keyed `(season, fpl_id)`; locked Gameweek is immutable once set |
| `contexts` | the exact text handed to Entrants, plus its hash | one row per Gameweek per Fixture; reused by later runs |
| `predictions` | successes only — probabilities, Predicted Score, context reference, Repairs used | insert-only, keyed `(model_id, season, fpl_id)` |
| `attempts` | every call, successful or not — cause, resolved provider and model, latency, tokens, raw body, trigger | append-only; never read by scoring |
| `raw_snapshots` | upstream responses as received | content-hashed; first and latest observation retained |

Full DDL is in [the spec](../../football-benchmark-spec.md) §4. Integrity properties are
enforced by the database rather than by application code:

- `predictions` has no update path. The primary key is what makes a manual re-run unable to
  replace an existing Prediction (ADR-0011).
- `predictions` has a foreign key to `contexts`, so a Prediction can never exist without the
  stored record of what produced it.
- A Prediction insert is refused until its Fixture has a canonical locked Gameweek, so every
  stored Prediction resolves to one authoritative deadline (ADR-0015).
- Every Gameweek reference has a foreign key to `gameweeks`, and context identity is constrained
  so Match contexts have a Fixture while FPL contexts do not.

### Interactions

- The fill run and any manual run **load** the stored context by `(season, gw, track,
  fpl_id)` rather than rebuilding it. Rebuilding would hand late-filled Entrants fresher
  information (ADR-0006).
- The Lock guard follows the Fixture's canonical locked Gameweek to `gameweeks.deadline_at`
  and compares it with the injected clock. No other component consults time (ADR-0015).
- The orchestrator treats each `(Entrant, Fixture)` as independent. One failing Entrant does
  not abort the Gameweek; one Fixture's transport, provider or validation failure does not
  abort the Entrant.
- Outbound HTTP requests time out after 120 seconds by default. The resulting `TimeoutError`
  is logged as `timeout`, freeing the worker rather than waiting for the HTTP client's
  longer internal timeout.
- A database persistence failure does abort the job. Once the attempt ledger cannot be
  committed, continuing would issue unrecorded calls and violate the audit trail; the safe
  recovery is to restore persistence and re-run the idempotent job.
- `predicted_at` captures when the successful synchronous response arrives, before the
  serialised database write. The Lock therefore applies to completion of the Entrant call,
  even when concurrent responses queue briefly for persistence (ADR-0002).

---

## Testing Decisions

### What makes a good test here

A test asserts what a sceptic could check from outside: that a Prediction exists, that it
precedes its deadline, that two Entrants received identical context, that a Gap carries a
cause. It does not assert that the context builder called a particular helper, or that the
repair loop used a particular retry structure. Internals are expected to move; the integrity
properties are not.

Test data comes from archived real responses rather than hand-written fixtures. The snapshot
store this system already requires is the fixture source, so tests exercise shapes that
actually occurred rather than shapes someone imagined.

The first byte-exact OpenRouter response becomes available only during the real-call
pre-flight. That ticket must archive a successful response and replace the hand-scripted
gateway envelope in contract tests; until then, those tests follow the documented
`openrouter_metadata` shape and are not treated as canonical response fixtures.

### Seams — two, agreed

**Outbound HTTP.** One injectable fetcher covering FPL, football-data.co.uk and OpenRouter. In
tests it replays archived snapshots and scripted Entrant responses. This is the outermost
boundary — above it there is only cron — so a single seam covers every external dependency.

**The clock.** An injectable now. Unavoidable: the Lock is the system's central invariant and
it is time-based.

**The database is deliberately not a seam.** Tests run against a real Postgres. Several
integrity rules *are* database constraints — insert-only behaviour, the `(season, fpl_id)`
key, the foreign key from `predictions` to `contexts`. ADR-0011 claims manual re-runs are safe
by construction rather than by discipline; that construction is a primary key, and only a real
database demonstrates it holds.

Everything between the two seams — context builder, validator, repair loop, Lock guard,
orchestrator, write rules — is exercised as real code.

### What gets tested

**One full-Gameweek integration test** carries most of the weight. Archived FPL and
football-data snapshots, scripted responses for nine Entrants covering valid output, output
that is malformed then repaired successfully, and output that fails all three Repairs, plus a
clock advanced across the deadline mid-run. Asserts:

- every valid Prediction is stored with the correct Gameweek, context reference and Repair
  count;
- every Gap is absent from `predictions` and present in `attempts` with a cause;
- all nine Entrants reference the same context row per Fixture;
- a write attempted after the deadline is refused and still logged;
- a second run fills only empty slots and loads rather than rebuilds context;
- a re-run cannot replace an existing Prediction.

**Pure-function tests, no seam required:**

- Context builder — given fixed rows, produces a stable snapshot, including the Gameweek 1
  cold-start case, a promoted side with only Championship history, and a fixture pair with no
  prior meeting. Asserts explicit absence markers, never empty fields, and that a fit player's
  null chance-of-playing renders as available.
- Validator — accepts good output; renormalises probabilities within tolerance; rejects
  outside it; rejects negative or non-integer goals; produces the exact Season-stable message
  for each failure kind.
- Lock guard — given a deadline and a clock, admits before and refuses at and after.

**Source client tests** at the HTTP seam: a valid archived response parses; a response with a
changed shape fails schema validation loudly rather than yielding partial data; re-fetching
identical content does not duplicate a snapshot.

**A pre-flight check**, run as a script rather than in CI, calling all nine Base Models with a
real prompt to confirm none refuses the task and all can produce parseable output.

### Prior art

None. This is a greenfield repository containing only documents. Every convention established
here — the two seams, real-Postgres tests, snapshots-as-fixtures — is prior art for what comes
next, and later specs should follow it rather than introduce a third seam.

---

## Out of Scope

- **Scoring.** Match Points, Score %, Outcome %, RPS, Brier, accuracy, Coherence, and
  bootstrap Paired Difference intervals. All computable from stored data afterwards.
- **The leaderboard, dashboard and read API.** Nothing downstream of the database.
- **Reference Lines.** Deterministic, back-fillable from stored Fixtures at any time.
- **The entire FPL track.** Manager State replay, the full-rules validator, the Chip state
  machine, Squad and Team Sheet prompts, FPL points. Joins at whatever Gameweek it is ready
  (ADR-0003, ADR-0005).
- **A sparse context arm.** One context arm this Season (ADR-0008).
- **A Positive Control.** Knowingly omitted (ADR-0009, ADR-0014).
- **Prompt engineering.** The Prompt Version is written once and frozen; iterating on it is a
  separate experiment in a later Season.
- **Additional leagues, community Entrants, Understat xG.**

---

## Further Notes

**The deadline is external and immovable.** Slipping this work does not delay the benchmark,
it shrinks it. Ten Fixtures per Gameweek, unrecoverable.

**The context builder is where a silent failure would live.** If it emits wrong form data all
Season, every Entrant receives the same wrong data, comparisons remain valid, intervals look
healthy, and nothing anywhere reports a problem — while every absolute figure is worthless.
This is why absent data is written out explicitly, why the built context is stored, and why
story 51 asks for human eyes on a few Gameweek 1 contexts. It is the one failure mode the
system cannot detect on its own.

**Missingness that correlates with a provider is the quiet threat.** A scattered Gap costs
one Fixture. A blocked Gap — one Entrant losing an entire Gameweek to a pinned provider —
removes that Gameweek from every comparison under the complete-case rule. With nine Entrants
this is expected in roughly one Gameweek in six (ADR-0014), which is what makes the manual
fill and the Gap alert load-bearing rather than convenient.

**Content policy is an unknown until tested.** Probability forecasting on sporting events sits
near betting, and policy varies across a nine-Base-Model roster. Story 50 exists because
discovering a refusal during the first real run costs Fixtures that cannot be recovered.
