# Ticket: La Liga Gameweek 6 takes its nine back

**What to build:** the nine matchday-6 La Liga Fixtures that ticket 0065 re-Locked into
Gameweek 5 are predicted on 2026-09-15, the day the first of them is played, instead of
on 2026-09-11 with Gameweek 5. Gameweek 6 becomes their home again with a deadline of
2026-09-15 15:30Z — the earliest of the nine kick-offs minus ninety minutes — and the
scheduler picks it up by that deadline with no change to itself. Gameweek 5 goes back to
being the ten Fixtures matchday 5 actually is. Real Sociedad–Celta stays exactly where
0065 left it: Locked into Gameweek 6, eight Predictions, played on the 3rd. Two things
have to land together for that to hold: a migration that moves the record, and one
carve-out in the football-data.org fetch without which that migration breaks La Liga's
daily fetch permanently. Decisions this touches:
[ADR-0036](../adr/0036-a-new-competitions-schedule-results-and-lock-come-from-football-data-org.md)
(amended again by this ticket — the 2026-09-03 amendment's "What is decided" is reversed
for the nine, and rule 3's breach alert gains its one exception),
[ADR-0015](../adr/0015-a-fixture-owns-its-locked-gameweek.md) (`locked_in_gw` lifted by
hand a second time, inside the migration), migration 0025's frozen deadline (lifted the
same way, for one Gameweek, once). ADR-0013 is not touched this time: the nine have no
Prediction to withdraw.

**Blocked by:** None. But the order inside this ticket is fixed and the clock is short:
the fetch carve-out must be on `main` and pushed before the 2026-09-11 06:00Z `fetch.yml`
run, and the migration must be applied to production before **2026-09-11 11:30Z**, when
Gameweek 5's `main` run selects its work. Applied after that, the nine are predicted
twice or by nobody. Applied before the fetch fix is deployed, the 06:00Z fetch throws for
`PD` and writes nothing.

**Status:** built 2026-09-10 — the fetch carve-out, migration `0041`, their tests, the
ADR-0036 amendment, 0065's back-references and the read-back query are on the branch. Boxes
5, 6 and 8 are the operator's: the rehearsal against a production copy, the merge-then-apply
in order before 2026-09-11 11:30Z, and Gameweek 6's run on 2026-09-15.

---

## What is already known

**The record, read 2026-09-10 08:22Z against production.** `PD`, `2026-27`:

| gw | deadline_at | Fixtures by `coalesce(locked_in_gw, gw)` | kickoffs | runs |
| --: | --- | --: | --- | --- |
| 5 | 2026-09-11 17:30Z | 19 | 09-11 19:00Z – 09-17 19:30Z | none |
| 6 | 2026-09-03 17:30Z | 1 | 09-03 19:00Z | main 11:56Z, fill 15:37Z on 09-03 |
| 7 | 2026-09-18 17:30Z | 10 | 09-18 19:00Z – 09-20 19:00Z | none |

Gameweek 6 also holds: 10 `contexts` rows on the `match` track (one per Fixture, built
2026-09-03 — nine of them for Fixtures that no longer point at it), 330 `scores` rows,
and 145 `squad_changes` / 20 `head_coaches` / 12 `head_coach_changes` all observed
2026-09-03 06:23Z. Predictions: 8, all on Real Sociedad–Celta.

**Why Gameweek 6 and nothing else.** A Lock must precede every kick-off it covers.
Gameweek 7's is 2026-09-18 17:30Z, after all nine are played, and there is no Gameweek
number between 5 and 7. Gameweek 6 is the only home, and its deadline has to move from
the 3rd to the 15th while Real Sociedad–Celta keeps pointing at it — which is exactly
what 0065 said could not be done. It cannot be done by the fetch; it can be done by a
migration that lifts 0025's trigger for one transaction, the way 0037 lifted 0022's.

**What the migration has to touch, and why each.**

- `fixtures.locked_in_gw` on the nine: `5 → 6`. Guarded by
  `fixture_locked_gameweek_is_immutable`; lifted for the transaction as 0037 did.
- `gameweeks.deadline_at` for Gameweek 6: `2026-09-03 17:30Z → 2026-09-15 15:30Z`,
  computed off the record as the nine's earliest `kickoff_at` minus ninety minutes and
  asserted equal to that instant. Guarded by `gameweek_deadline_is_immutable_once_committed`
  (0025); lifted the same way. The four `gameweek_deadline_preserves_*_lock` triggers
  (0007, 0018, 0032, 0033) are not lifted and pass on their own: they refuse only a
  deadline moved to *before* a stored observation, and every Gameweek 6 observation is
  from 2026-09-03 06:23Z.
- The nine stale `contexts` rows under Gameweek 6: deleted. The `main` run stores a
  context with `on conflict do nothing` and reads back whatever the row holds, so
  leaving them means the nine are predicted on 2026-09-15 from a packet built on
  2026-09-03 — the staleness this whole detour exists to remove. Nothing references
  them: `attempts` never did, and the Predictions that did were withdrawn by 0037. Real
  Sociedad–Celta's context stays.
- `prediction_runs` for `PD` Gameweek 6, both `main` and `fill`: deleted. The scheduler
  skips a Gameweek whose run row is completed, and re-running Gameweek 6 is the point.
  Its `attempts` ledger — 150 rows, 129 on the nine — is untouched; the 2026-09-15 run adds
  its own on top, so a reader of the ledger sees Gameweek 6 called twice, twelve days
  apart, and the migration's comment is where that reader finds out why.
- `scores` for Gameweek 6: untouched. Scoring recomputes every Gameweek over the
  Predictions standing at the time and upserts, so the nine join Gameweek 6's rows once
  they are predicted and settled.

**Where the fetch breaks without the carve-out, precisely.** A match the record holds
Locked is never excluded from its Gameweek's kickoff list by `isPastKickoffForKnownGameweek`,
and a `FINISHED` match is still `scheduled` (only postponed, suspended and cancelled are
withdrawn). Real Sociedad–Celta therefore joins Gameweek 6's kickoffs every day. With the
deadline at 09-15 15:30Z and that kickoff at 09-03 19:00Z, `deriveDeadline` reports the
Gameweek `breachedBy` it, the fetch throws `KickoffInsideDeadlineError` and writes nothing
for `PD` — the daily fetch isolates the failure per Competition, so the other four leagues
carry on, but La Liga's schedule, results and every later deadline stop landing, and they
stop for the rest of the Season, because Real Sociedad–Celta never stops being Locked
into 6. The breach alert is right in general and wrong here: the promise it guards is
that a Prediction precedes its kick-off, and Real Sociedad–Celta's eight all did.

**What is not built.** No per-Fixture Lock, no change to the scheduler, no change to
`deriveDeadline`, no change to migration 0037 (its comment is true of the day it was
written and `schema_migrations` keeps it from running again). No `deferred` flag on
anything: nothing moved after a Lock it was predicted under.

**What it costs, stated.** Nothing in Base Model calls: the nine's ~90 calls move from
2026-09-11 to 2026-09-15 and Gameweek 5's run shrinks back to ~100. What is spent is a
second recorded exception to two immutability rules within a fortnight of the first,
and one narrowing of the fetch's breach alert (below). What is bought is four days of
freshness on nine Fixtures: predicted zero to two days before kick-off instead of four to
six.

## Acceptance

- [x] **The fetch does not count a Locked, settled Fixture against its Gameweek's
      deadline.** When building the kickoffs a Gameweek's deadline is derived and
      breach-tested over, a match that is both already Locked (`locked_in_gw` stored) and
      settled at the source (`FINISHED` or `AWARDED`) is left out. A Gameweek whose every
      Fixture is settled is then absent from the derivation and keeps its stored deadline,
      which is the existing, documented behaviour for an emptied Gameweek. The test builds
      Gameweek 6 as production will hold it — stored deadline 2026-09-15 15:30Z, one
      Locked `FINISHED` match kicked off 2026-09-03 19:00Z, nine Locked `TIMED` matches
      from 2026-09-15 17:00Z — and asserts the fetch neither throws nor rewrites the
      deadline. The existing breach test, a Locked `TIMED` match moved inside its
      deadline, still throws.
- [x] **The narrowing is recorded.** A breach the fetch first observes after the Fixture
      is settled — a match moved earlier than its Lock and played before the next daily
      fetch — is no longer alerted by the fetch. The record still shows it (`predicted_at`
      against `kickoff_at`); nothing shouts. ADR-0036 rule 3 and its first Consequence
      say so in the amendment below, in those words, rather than the exception being
      found in a test name.
- [x] **Migration `0041`**, one transaction, in this order: assert `now()` is before
      2026-09-11 11:30Z; select the nine by the record — `competition = 'PD'`,
      `season = '2026-27'`, `locked_in_gw = 5`, `gw = 6` — into a temp table and assert
      exactly nine, with exactly one `PD` Fixture at `locked_in_gw = 6`; assert none of the
      nine has a `result`, is `unscheduled`, or has any Prediction; compute the new deadline
      as their earliest `kickoff_at` minus ninety minutes and assert it is
      `2026-09-15T15:30:00Z`; lift `fixture_locked_gameweek_is_immutable` and
      `gameweek_deadline_is_immutable_once_committed`; delete the nine's Gameweek 6
      `contexts`; delete `prediction_runs` for `PD` Gameweek 6; re-point the nine and
      write the deadline; restore both triggers. Every instant is written as an explicit
      UTC literal, for the reason 0037's comment gives. An empty database is let through
      as a no-op exactly as 0037 is, so a fresh clone and the suite still migrate from
      scratch. Covered by `test/migrations.test.ts` in the shape 0037's tests take.
      > Built with one departure from the order written above, and it is this box that was
      > wrong rather than the SQL: the select and the empty-database no-op come *before* the
      > `now()` guard, exactly as 0037 orders them. They have to. Past the cutoff a fresh
      > clone and every suite run still have to migrate, and they can only be let through by
      > a no-op that is decided before the clock is consulted. Guard order among the
      > guards that do apply is as written, and all of them precede either
      > `disable trigger`.
      > Also built with one lock this box does not name: `predictions`, share-locked
      > alongside `fixtures` and `gameweeks` because the new Prediction guard reads that
      > table and Gameweek 5's Lock is live while this runs, so the guard could otherwise be
      > raced by a `main` or `fill` run rather than merely satisfied.
- [x] **The migration's header comment tells the whole story**, in the voice of 0025's
      and 0037's: why 0065 chose 5, what changed to make 6 possible, why the carve-out in
      the fetch is what makes it possible, which two rules are lifted and that both are
      restored inside the transaction, what the `attempts` ledger will look like, and the
      cost paragraph above.
- [x] **Rehearsed on a copy before it is applied**, by hand, the way 0065's was: `pg_dump
      --schema=public --exclude-table-data=raw_snapshots` of production restored locally,
      `0041` applied to the copy alone, and read off the copy: `locked_in_gw` over the ten
      matchday-6 Fixtures is `6 → 10`; Gameweek 5 holds 10 Fixtures and Gameweek 6 holds
      10; Gameweek 6's deadline is `2026-09-15 15:30Z` and Gameweek 5's is unchanged;
      `contexts` for Gameweek 6 is 1 row, Real Sociedad–Celta's; `prediction_runs` has no
      `PD` Gameweek 6 row; Predictions are 8, all Real Sociedad–Celta's; `attempts` for
      Gameweek 6 is 150; both lifted triggers read `O` in `pg_trigger`. Then the fixed fetch
      is run against the copy with the archived football-data.org response and writes
      nothing for Gameweek 6 and throws nothing. `db:rehearse` is not the tool, for the
      reason 0065 records. Readings pasted here with their timestamp.
      > The readings are written as `docs/queries/0068-box-5-and-6-readings.sql`, one file for
      > this box and the next, because a rehearsal checked differently from the real apply has
      > not rehearsed the real apply. The `pg_dump` itself is the operator's: it is denied to
      > the session by the auto-mode classifier. The fetch half is already asserted in the
      > suite against the archived response — there is no replay flag on `npm run fetch`, and
      > none was built.

      **Run 2026-09-10 on `football_bench_0041`, a `pg_dump --no-owner --no-privileges
      --schema=public --exclude-table-data=raw_snapshots` copy of production restored into
      the local cluster** (the copy's empty `public` schema has to be dropped first, or the
      dump's own `create schema public` refuses). Before the apply the copy held
      `schema_migrations` at `0040`, matchday 6 at `locked_in_gw` `5 → 9`, `6 → 1`, and
      151 attempts under Gameweek 6. `DATABASE_URL=<copy> npm run db:migrate` printed
      `Applied 1: 0041_la_liga_gameweek_6_takes_its_nine_back.sql` at 2026-09-10 11:32:41Z.
      Read off the copy at **2026-09-10 11:32:46Z** with the readings query, session
      timezone UTC:

      | reading | value |
      | --- | --- |
      | matchday 6 `locked_in_gw = 6` / still `= 5` | 10 / 0 |
      | Fixtures by `coalesce(locked_in_gw, gw)`, Gameweek 5 / 6 | 10 / 10 |
      | Gameweek 5 / 6 deadline | `2026-09-11 17:30Z` / `2026-09-15 15:30Z` |
      | `contexts` for Gameweek 6 | 1 |
      | `prediction_runs` for Gameweek 6 | 0 |
      | matchday 6 Predictions, all on `564682` | **9**, not 8 |
      | `attempts` for Gameweek 6 | **151**, not 150 |
      | `pg_trigger.tgenabled`, both lifted triggers | `O` |
      | `schema_migrations` head | `0041…`, `0040…` beneath |

      The two bold readings are not 0041's doing: the copy held 151 attempts and 9
      Predictions on Real Sociedad–Celta *before* the apply, and the same after. The extra
      row of each is one Exhibition Run, `exhibition-pd/gpt-6-astra`, pre-flighted at
      2026-09-10 09:22Z (the Premier League Exhibition pre-flight of the same morning) —
      answered after every deadline by construction (ADR-0032), and not a Match Entrant, so
      not what 0037 withdrew or what this box counts. The readings query's expectations
      are corrected to 9 and 151 with that reason beside them, and its total-Predictions
      column is scoped to matchday 6 — as first written it counted every PD Prediction,
      Gameweeks 1 to 4 included, and read 448 against an expected 8. Copy dropped
      afterwards.
- [ ] **Landed in the right order, and each step read back.** (1) The fetch carve-out is
      merged to `main` and pushed to `origin` — checked, not assumed; `origin/main` has
      drifted before — before 2026-09-11 06:00Z. (2) `npm run db:migrate` against the
      pooler, then the rehearsal's readings repeated on production and pasted here with
      their timestamp. (3) The 2026-09-11 06:00Z `fetch.yml` run completes green for `PD`
      and its log shows Gameweek 6 neither rewritten nor refused. All three before
      2026-09-11 11:30Z.
- [x] **ADR-0036 is amended, dated 2026-09-10, by this ticket.** The banner says what the
      2026-09-03 amendment decided for the nine and that this reverses it; why Gameweek 6
      was closed to them on the 3rd and open on the 10th; the carve-out as a rule, added
      to rule 3 and the first Consequence, with the narrowing stated; and the cost
      paragraph above. The 2026-09-03 amendment is not edited — it was true when written.
      > This box asks for two things that cannot both be done: rule 3 lives *inside* the
      > 2026-09-03 amendment, which the last sentence forbids editing. "Not edited" won given
      > that it is the stated principle and the more conservative reading, so the carve-out is
      > stated in full in the new 2026-09-10 banner — naming rule 3 and quoting what it now
      > carves out — plus one clause on the first Consequence, which is ADR body text and not
      > part of any amendment. The cost: rule 3's own four numbered lines do not mention the
      > exception, so a reader who reads only the 2026-09-03 amendment will not find it. The
      > new banner sits above that one, which is the order a reader meets them in.
- [x] **Ticket 0065 points here.** Its Status line and its open box "Gameweek 5 runs with
      nineteen" record that the nine were moved on by this ticket and that Gameweek 5 ran
      with ten. Its read-back query gets a sibling for Gameweek 6's run on 2026-09-15,
      and its own expectation of nineteen is corrected to ten.
- [ ] **Gameweek 6 runs with nine on 2026-09-15.** The `main` run fires at 09:30Z and
      `fill` at 13:30Z; the attempt count is ~90 and every one of the nine has a
      Prediction from every seat, or a gap alert naming which does not. Real
      Sociedad–Celta is not called: its kick-off has passed and the work query refuses it.
      Recorded here after the run, with the run's cost read off `usage`.
