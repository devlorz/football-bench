# Spec 0013 — Exhibition Runs

**Status:** ready-for-agent
**Scope:** retrospective runs of late-arriving Base Models over stored contexts — Match track
first, FPL track second
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:** [ADR 0001–0032](../adr/),
especially [ADR-0032](../adr/0032-exhibition-runs-join-the-record-after-the-fact.md)

---

## Problem Statement

Base Models ship all year; the Season starts once. A model released in October cannot join
the Season Roster — the roster is a recorded decision (ADR-0014), the FPL track's seats
committed at its opening, and every Gameweek that passed before the release is gone from its
sample permanently. Today the only options are to wait for next Season or to run the model
ad hoc outside the system, producing exactly the anecdotal screenshots the benchmark was
built to replace: no stored context, no validation, no record of Repairs, no comparability.

The operator wants a third option: run the new model through the same machinery over the
Gameweeks already played, see its numbers next to the roster's, and decide from evidence
whether it belongs in next Season's roster — while never letting those numbers pretend to be
what they cannot be. A model asked about a match it may remember proves recall, not
forecasting (spec 0001), and nothing downstream may forget that.

## Solution

An **Exhibition Run**, as decided in ADR-0032: a `models` row with `role = 'exhibition'`,
run by a new operator-triggered job that takes only the model's id and replays every Settled
Gameweek through the production call path — OpenRouter with pinned provider and
quantization, the Season's frozen Prompt Version, the same validation and three Repairs, a
Gap where the model fails. Its rows land in the same tables as real Entrants' rows, under
its own id.

On the Match track the model is shown the stored context bodies verbatim — the same bytes,
the same hash, the same `context_id` its Predictions then reference. On the FPL track the
run replays sequentially from the track's opening Gameweek, carrying its own Manager State,
and builds each Gameweek's body by splicing its Manager State into the stored body of a real
Entrant, whose shared sections were frozen before that Gameweek's deadline.

Honesty is inherited, not added: `predicted_at` and `attempted_at` post-date the deadlines
they cover, and that stored fact is what derives the "ran after Gameweek N" label wherever
Exhibition results appear. Every scheduled job that reads `models` already filters
`role = 'entrant'`, so the official pipeline is blind to Exhibition rows by construction —
except where it derives the competitors by another route: the FPL run's roster comes from
`manager_states` at the opening Gameweek, and the seat ticket had to teach it the role
(ADR-0032). The readable rankings will
show Exhibition Runs ranked and labelled; the statistical layer — Comparison Anchor,
complete-case intersection, published intervals — never sees them (ADR-0032; already true
of the landed scorer, proven and kept true by the work this spec tickets).

---

## User Stories

### Joining as an Exhibition

1. As an operator, I want to add a late-arriving Base Model by inserting one `models` row
   with `role = 'exhibition'` and its pinned provider and quantization, so that joining as
   an Exhibition passes through the same door as joining the roster.
2. As an operator, I want the Exhibition job to take only a model id and read everything
   else from that row, so that there is exactly one place a model's identity is stated.
3. As an operator, I want the job to refuse a model id whose row is missing or whose role is
   not `'exhibition'`, so that a typo cannot replay the Season as a real Entrant.
4. As an operator, I want the pre-flight refusal check runnable against an Exhibition model
   before its first replay, so that a content-policy refusal surfaces before a Season's
   worth of calls is paid for.
5. As an operator, I want the Exhibition model called at the Season's frozen Prompt Version
   with no way to configure another, so that the only variable is the Base Model
   (ADR-0001).

### Match track replay (phase 1)

6. As an operator, I want the Match Exhibition to cover every Fixture of every Settled
   Gameweek that holds a stored context, so that the model's record spans the same Season
   the roster played.
7. As an analyst, I want the Exhibition model shown the stored context body verbatim, with
   its Prediction referencing the existing `contexts` row, so that a sceptic can verify from
   the hash that it saw exactly what the roster saw.
8. As an operator, I want each call validated and repaired exactly as a real Entrant's —
   same JSON shape, same three Repairs, same failure taxonomy — so that repair behaviour is
   comparable across roles.
9. As an operator, I want a Fixture the asking has ended on — its failure one no Repair
   addresses, or its last Repair spent — recorded as a Gap for the Exhibition model, never
   retried in a later run and never alerting anyone, so that absence is recorded honestly
   and pages nobody.
10. As an operator, I want a Fixture left mid-ask — a repairable failure with its Repairs
    unspent — asked again from the top as a new ask, so that a crashed or interrupted run is
    resumed by running it again.
11. As an auditor, I want every call logged in `attempts` with its resolved provider, model
    version, latency, tokens and raw response, so that an Exhibition attempt is as traceable
    as a real one.
12. As an operator, I want the job to run Fixtures concurrently under the existing
    concurrency bound, so that a Season replay finishes in hours, not days.

### FPL track replay (phase 2)

13. As an operator, I want the FPL Exhibition to start at the Gameweek the real track opened
    at, from the same opening Manager State, so that the Exhibition plays the same game from
    the same start line.
14. As an operator, I want each Gameweek's context built by splicing the Exhibition model's
    Manager State into the stored body of the real Entrant with the lowest id for that
    Gameweek, so that every shared section is the one frozen before that deadline rather
    than a reconstruction.
15. As an analyst, I want the "Chips you can play this Gameweek" line recomputed from the
    Exhibition model's own state during the splice, so that the body never offers a Chip the
    state forbids.
16. As an analyst, I want the pool block left untouched by the splice, so that purchase
    prices are read from the text on record exactly as they are for real Entrants.
17. As an operator, I want Selling Prices computed from the purchase prices in the
    Exhibition model's own carried state, so that its budget follows the same halved-rise
    rule as everyone else's.
18. As an operator, I want each Gameweek's action validated, repaired up to three times, and
    rolled over when still illegal, with the resulting Manager State stored before the next
    Gameweek is attempted, so that the replay is one sequential season path under full
    rules.
18a. As an operator, I want an opening Gameweek whose Repairs are all spent to store nothing
    and stop the run, so that a Roll Over never commits an empty Squad — there is no Team
    Sheet standing to roll onto at an opening, and `manager_states` is insert-only, so the
    Exhibition model would carry no players for the rest of the Season on account
    of one Gameweek's four bad answers.
19. As an operator, I want the spliced body stored as the Exhibition model's own per-Entrant
    context row, so that what it was shown is on record with a hash like everything else.
20. As an operator, I want the replay to stop at the last Settled Gameweek and to resume
    from its stored Manager State chain when re-run, so that the Exhibition catches up as
    the Season settles.
21. As an operator, I want the replay to refuse to skip a Gameweek in the chain, so that no
    Manager State is ever invented to bridge one.

### Isolation from the official pipeline

22. As an operator, I want every scheduled job — predict, fill, Gap alert, FPL start, FPL
    run, preflight — to keep selecting `role = 'entrant'` only, so that an Exhibition row
    can never be called, counted, paged about, or seated by the official pipeline.
23. As an operator, I want the FPL track's nine-seat opening check and the roster-size
    reads unaffected by Exhibition rows, so that adding an Exhibition changes no official
    number.
24. As an analyst, I want Exhibition Gaps excluded from the Gap alert and from any official
    Gap-rate figure, so that the roster's operational record stays the roster's.

### Labelling and the statistical layer

25. As a sceptical reader, I want every Exhibition figure labelled "ran after Gameweek N",
    with N derived from the stored `predicted_at` timestamps against the Gameweek
    deadlines, so that the label is computed from tamper-evident data rather than asserted.
26. As a leaderboard reader, I want Exhibition Runs ranked in the readable Match Points and
    Bet Points tables alongside the roster, carrying their label, so that the comparison I
    asked for is one table, honestly annotated.
27. As an analyst, I want Exhibition rows excluded from Comparison Anchor selection, the
    complete-case intersection, and the eight published intervals, so that a model that may
    remember the results can never become the reference everyone is measured against nor
    shrink the roster's shared sample.
28. As a sceptical reader, I want the recall-versus-skill caveat stated wherever Exhibition
    results are described, so that no reader mistakes a replay for a forecast.

### Proving it

29. As a reviewer, I want a schema test proving `role = 'exhibition'` is storable and that
    the official jobs' entrant queries return no Exhibition rows, so that the isolation is
    enforced by evidence rather than by convention.
30. As a reviewer, I want the splice proven equal to the builder's own output for the same
    Manager State and shared inputs, so that a spliced body is bit-identical to the body the
    pipeline would have built for that seat.
31. As a reviewer, I want an end-to-end Match Exhibition pass in a throwaway Postgres with a
    scripted model, asserting Predictions reference pre-existing context rows, so that the
    replay is proven on real machinery before it is trusted with a real model.
32. As a reviewer, I want an end-to-end FPL Exhibition pass over several Gameweeks with a
    scripted model, asserting the Manager State chain, a Repair, and a Roll Over, so that
    the sequential path is proven under the rules it claims to play by.

---

## Implementation Decisions

### Storage: one migration, no new tables

The `models.role` check widens to admit `'exhibition'`. Nothing else changes shape:
Exhibition Predictions, attempts, Manager States and FPL contexts use the existing tables
under the Exhibition model's id. Match Predictions reference the existing shared `contexts`
rows; FPL contexts are written per-Entrant as migration 0013 already requires. The
immutability triggers and the locked-Fixture trigger apply as-is — every replayed Fixture is
long since locked.

`attempts.trigger` reuses `'manual'`; an attempt's Exhibition identity is its join to
`models.role`, and a second marker saying the same thing would be a second place to
disagree.

### The job

One new operator-triggered entry point per the established job-config conventions, reading
`DATABASE_URL`, `SEASON`, the OpenRouter key, a concurrency bound, and the Exhibition
model's id. It resolves the covered Gameweeks itself — Settled ones only — rather than
taking a range. Phase 1 implements the Match track; phase 2 adds the FPL track behind a
track argument, replaying from the recorded starting Gameweek of the real track.

The FPL track reads that same entry point's variables but swaps the concurrency bound for
the call timeout the FPL prompt needs (spec 0010): a season path is replayed in order, each
Gameweek's context carrying the Squad the one before it left, so there is never a second
call to bound. The two tracks hold separate replay locks, because what two runs would
collide over is one track's record and neither track's is the other's.

Settled is read off the record, never off the clock (CONTEXT.md), and on the Match track the
record is `fixtures.result` — the same thing scoring reads. A Gameweek is covered when it
holds stored Match contexts and every Fixture locked into it either has a result or has left
that Gameweek. `deferred` marks having left it, monotonically, and is set on every Locked
Fixture the feed withdraws (ADR-0024); waiting for one to come back would leave its Gameweek
unreplayable for the rest of the Season, and nothing is lost by not waiting, because coverage
is decided per Fixture and resolved again on every run. The FPL track reads its own
Settled-ness from stored per-player points, as its context builder already does.

Within a covered Gameweek the replay calls only Fixtures that were played and whose Lock
already belongs to that Gameweek. A result is the whole of "was played": `deferred` says the
Fixture left the Gameweek it was locked into, never that it went unplayed, so a withdrawal
FPL rescheduled — played, scored, answered by the roster under the same Lock — is replayed
like any other, and skipping it would leave the Exhibition short of a Fixture everyone else
has. The Lock is read, never assigned: the shared call path fills
an absent one in, and a run months after the fact must not be what decides which Gameweek a
Fixture was locked into (ADR-0013).

One replay runs at a time, under an advisory lock, and a second refuses rather than returning
quietly — two runs would select the same unanswered Fixtures and pay for the same calls.

Both phases are resumable by re-running: the Match side asks again where an ask was left
unfinished; the FPL side continues from the last stored Manager State. Neither retries a
recorded Gap — within a Gameweek the run's own Repairs are the only retries, as on the
official tracks. What a recorded Gap is, the Match side reads off the ledger rather than
assuming: an attempt whose cause no Repair addresses, or one that spent the last Repair. A
Fixture a crash left mid-Repair is neither, so the next run asks it again from the top —
a new ask with its own three Repairs, as the Fill re-asks any Fixture it finds unanswered,
rather than a continuation rebuilt out of the interrupted conversation. Three Repairs
therefore bound one ask and not a Season, and the ledger shows a crash as a second attempt
sequence beside the first.

### The splice (phase 2)

A pure function from a donor body and a Manager State to a new body. It replaces the
heading-delimited `Your Manager State` block, recomputes the Chip-availability line from the
state, applies the same carried-state transformation the builder applies, and touches
nothing else. Donor selection is deterministic: the stored FPL context of the lowest
Entrant id for that Gameweek. Rebuilding shared sections from `raw_snapshots` is rejected
(ADR-0032): the donor body is the ground truth; the snapshot timeline is content-hash keyed
and lossy for oscillating values.

### Calls

The production entrant call path, unchanged: OpenRouter, `provider.order` with one slug,
`allow_fallbacks: false`, explicit quantizations, prompt-only JSON, three Repairs
(ADR-0009, ADR-0010). No Exhibition-specific request shape exists.

### Scoring and the dashboard

The scorer (spec 0002) and the dashboard's read API (spec 0011) both exist, and they sit on
opposite sides of the line this spec cares about. The scorer's per-Entrant metric loop
writes rows for any model holding Predictions, while its Anchor, intersection and declared
intervals are computed over the roster alone — so an Exhibition Run is scored readably and
excluded statistically the day its Predictions land, and this spec's work there is proof,
not change. The read API selects the roster, so the extension is the surface: the readable
tables show Exhibition Runs ranked with their "ran after Gameweek N" label, while every
statistical figure keeps selecting from the roster — that exclusion is recorded in ADR-0032
and restated here so no surface can claim ignorance of it.

---

## Testing Decisions

### What makes a good test here

Tests assert what an auditor could check from the tables: which rows exist, what they
reference, what the official jobs can see. No test inspects how the job schedules its calls.
Scripted model answers stand in for OpenRouter at the same seam every other test uses;
nothing mocks the database.

### What gets tested

- **The role migration** — an `'exhibition'` row stores; the schema test's entrant queries
  (predict, FPL start, Gap alert) return no Exhibition rows.
- **The splice as a pure function** — spliced output equals the builder's output for the
  same state and shared inputs; the Chip line reflects the state, not the donor; the pool
  block is byte-identical to the donor's.
- **Match replay end-to-end** in a throwaway Postgres — Predictions land for every
  contexted Fixture, reference pre-existing `contexts` rows, record attempts; a scripted
  failure becomes a Gap; re-running attempts only the Gap-free remainder and changes no
  existing row.
- **FPL replay end-to-end** over several Gameweeks — the Manager State chain carries
  purchase prices and bank correctly, a scripted illegal action consumes Repairs and rolls
  over, the spliced context is stored under the Exhibition id, and a re-run resumes from
  the chain rather than restarting.
- **Isolation behaviourally** — with an Exhibition row present, the official predict work
  query yields no work for it and the Gap alert counts nothing for it.

### Prior art

The write path's shapes throughout: schema invariants in the schema tests, orchestration
against a real throwaway Postgres via the real migration path, scripted entrant answers as
in the prediction and FPL run tests, pure functions tested as pure functions as with
`applyGameweekAction` and `scoreTeamSheet`, and sequential-replay fixtures as in the FPL
rehearsal machinery.

---

## Out of Scope

- **Any change to the statistical layer's arithmetic.** The Anchor, the intersection and
  the intervals keep selecting from the roster alone; this spec adds an exclusion, never a
  participant.
- **Any new metric or ranking.** Exhibition Runs join the readable tables that exist; they
  bring nothing of their own to read.
- **Promoting an Exhibition to an Entrant**, removing one, or any roster change. A new
  Season and a new ADR are that path.
- **Rebuilding FPL shared sections from `raw_snapshots`.** Rejected in ADR-0032.
- **Replaying unsettled Gameweeks**, any Prompt Version other than the Season's frozen one,
  and any batch or non-production call path.
- **Scheduling.** Exhibition Runs are operator-triggered only; nothing recurs.

---

## Further Notes

**The numbers cannot separate recall from skill, and the spec leans into saying so rather
than softening it.** The label, the caveat, and the statistical exclusion are the same
decision stated three ways. If an Exhibition model tops the readable table, the correct
reading is "interesting, now wait for next Season" — and next Season's clean sample is the
actual test this feature exists to justify paying for.

**The splice couples to the frozen Prompt Version's rendered structure.** That is
acceptable precisely because the Prompt Version is frozen (ADR-0001, ADR-0026); a future
version that changes the Manager State block's delimiting must revisit the splice, and
ADR-0032 says so.

**Cost is roster-scale, once.** A full Match replay is roughly one Entrant-Season
(~$15 at ADR-0014's figures); the FPL replay is larger per prompt but sequential and
single-seat. Neither justifies a budget control beyond the existing concurrency bound.
