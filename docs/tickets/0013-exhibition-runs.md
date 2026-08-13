# Tickets: Exhibition Runs

Five tracer-bullet slices that let a late-arriving Base Model replay the Season as an
Exhibition Run and appear, labelled, on the scoreboard — Match track first, FPL track
second. Source:
[spec 0013](../specs/0013-exhibition-runs.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md). Decisions: [ADR 0001–0032](../adr/), especially
[ADR-0032](../adr/0032-exhibition-runs-join-the-record-after-the-fact.md).

Work the **frontier**: any ticket whose blockers are all done. Two tickets open immediately —
the Exhibition seat, and the splice, which is a pure function with no dependency on the
schema change.

One migration (the `models.role` check), no new tables, no new seams: scripted answers enter
at the existing outbound-HTTP seam and tests run against a real throwaway Postgres through
the real migration path. The Lock refusal is deliberately absent from the Exhibition path —
writing after the deadline is the feature — and honesty rests instead on `predicted_at` and
`attempted_at` post-dating the deadlines they cover, which is what derives the "ran after
Gameweek N" label downstream.

---

## The Exhibition seat: the role, the blindness proof, and the door in

**What to build:** An operator can add a late-arriving Base Model as one `models` row with
`role = 'exhibition'`, prove it will attempt the task, and prove the official pipeline cannot
see it. This is the whole join path: insert the row, pre-flight it, and demonstrate that
every scheduled job still selects exactly the roster it did before.

**Blocked by:** None — can start immediately.

- [x] A `models` row with `role = 'exhibition'` is storable; `'entrant'` and `'reference'` behave exactly as before, and any other role is still refused
- [x] With an Exhibition row present at the frozen Prompt Version, the predict work query, the scheduled pre-flight roster, the FPL opening's nine-seat check, the FPL run's roster and the Gap alert all return what they returned without it — proven behaviourally, not by convention
- [x] The pre-flight refusal check can target a single Exhibition model by id, calling it with the real prompt shape against a real Fixture and reporting parseable output, refusal or transport error, with the resolved provider and model
- [x] Targeting a model id that is missing or whose role is not `'exhibition'` is refused with a message naming the problem
- [x] Adding the row and pre-flighting it requires no code change beyond this ticket — the door in is data

## Match Exhibition replay, end to end

**What to build:** Running the Exhibition job with a model id replays every Fixture of every
Settled Gameweek that holds a stored context through the production call path, and the
model's Predictions land in the record referencing the very context rows the roster read.
Interrupt it, re-run it, and it finishes the remainder without touching what exists.

**Blocked by:** The Exhibition seat: the role, the blindness proof, and the door in.

- [x] The job takes only a model id and reads identity from its row, refusing an id that is missing or not an Exhibition
- [x] Every covered Fixture's Prediction references the existing shared `contexts` row — same id, same hash — so what the model saw is verifiable against what the roster saw
- [x] Calls go through the production path: OpenRouter with the pinned provider and quantization, fallbacks disabled, the Season's frozen Prompt Version, prompt-only JSON with three Repairs, the same failure taxonomy
- [x] Only Settled Gameweeks are covered, and the job resolves them itself rather than taking a range
- [x] A Fixture the asking has ended on is a recorded Gap — its cause one no Repair addresses, or its last Repair spent — never retried by a later run, alerting nobody
- [x] Re-running asks again only where an ask was left unfinished — a repairable failure with its Repairs unspent — leaving an answered Fixture and a recorded Gap alone, and changing no existing row
- [x] Every call is logged in `attempts` with resolved provider, model, latency, tokens and raw response, under trigger `'manual'`; Exhibition identity is the join to the model's role
- [x] Fixtures fan out concurrently under the existing concurrency bound, and one Fixture failing leaves the rest complete
- [x] An end-to-end pass in a throwaway Postgres with a scripted model proves the slice: Predictions land, a scripted failure becomes a Gap, and a second run is a no-op

## The splice: one Entrant's body, another's Manager State

**What to build:** A pure function that takes a stored FPL context body and a Manager State
and returns the body that Gameweek would have shown a seat holding that state — the shared
sections untouched and frozen, only the Manager State block replaced. Proven by equality:
spliced output is bit-identical to what the builder itself produces for the same state and
shared inputs.

**Blocked by:** None — can start immediately.

- [x] Splicing a donor body with a Manager State yields exactly the body `buildFplTrackContext` renders for that state and the donor's shared inputs, byte for byte
- [x] The Chip-availability line reflects the spliced-in state, never the donor's
- [x] The carried-state transformation the builder applies — including the Free Hit reversion — is applied identically before rendering
- [x] The pool block, schedule, league table and performance sections are byte-identical to the donor's
- [x] A donor body whose structure the splice does not recognise is refused loudly rather than patched approximately

## FPL Exhibition replay, sequential from the opening

**What to build:** Running the Exhibition job on the FPL track plays the new model's one
season path under full rules: from the real track's opening Gameweek and opening Manager
State, each Settled Gameweek in order — spliced context in, action out, validated, repaired,
rolled over when still illegal — with the resulting Manager State carried to the next
Gameweek and the whole chain resumable.

**Blocked by:** The Exhibition seat: the role, the blindness proof, and the door in · The
splice: one Entrant's body, another's Manager State.

- [x] The replay starts at the Gameweek the real track opened at, from the same opening Manager State, and refuses to run where the track never started
- [x] Each Gameweek's donor is the stored context of the real Entrant with the lowest id for that Gameweek, and the spliced body is stored as the Exhibition model's own per-Entrant context row, hashed like every other
- [x] Purchase prices are read from the stored text as the pipeline reads them for real Entrants, and Selling Prices derive from the purchase prices in the Exhibition model's own carried state
- [x] Each action is validated with up to three Repairs and rolls over when still illegal, and the resulting Manager State is stored before the next Gameweek is attempted
- [x] Gameweeks are replayed strictly in order — the chain never skips, and a missing link stops the run rather than inventing a state to bridge it
- [x] The replay stops at the last Settled Gameweek, and re-running resumes from the stored chain rather than restarting
- [x] An end-to-end pass over several Gameweeks with a scripted model proves the slice: the Manager State chain carries bank and purchase prices correctly through a Transfer, a scripted illegal action consumes Repairs and rolls over, and a second run resumes instead of repeating

## Exhibition on the scoreboard: scored, labelled, never statistical

**What to build:** The dashboard shows Exhibition Runs, and the scorer is proven around
them. The scorer's per-Entrant loop already writes readable metrics for any model holding
Predictions and computes its statistical layer over the roster alone — this ticket pins
both facts with tests rather than convention. The read API is where the code changes: the
readable Match Points and Bet Points tables show the Exhibition Run ranked among the
Entrants under a "ran after Gameweek N" label, and every statistical figure the dashboard
publishes is provably identical with the Exhibition present and absent.

Ranked *among* the Entrants means the Exhibition Run takes a position in the readable table,
so an Exhibition Run leading a column moves the rank number shown beside every Entrant and
the bar each one is drawn against. That is the comparison story 26 asks for, and it is what
the last box below does *not* cover: what must not move is what the API publishes — the
figures, the Entrants' order among themselves, the intervals and the Gap rates.

**Blocked by:** Match Exhibition replay, end to end.

- [x] The scorer writes the readable metrics — Match Points, Bet Points and their season-to-date twins — for Exhibition Predictions under the same conventions as the roster's, idempotently
- [x] Comparison Anchor selection, the complete-case intersection and the published intervals read from the roster alone: with an Exhibition Run leading Match Points, the Anchor is unchanged, and an Exhibition Gap removes no Fixture from anybody's intersection
- [x] The readable rankings show the Exhibition Run ranked among Entrants, carrying a label whose Gameweek is derived from its stored `predicted_at` timestamps against the Gameweek deadlines, never asserted from configuration
- [x] The recall-versus-skill caveat appears wherever the Exhibition Run is described
- [x] Every roster figure — scores, rankings among Entrants, intervals, Gap rates — is byte-identical with and without the Exhibition rows present, proven behaviourally
