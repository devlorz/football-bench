# Ticket: La Liga Gameweek 6's nine early Predictions are withdrawn

**What to build:** one migration that withdraws the ninety Predictions made on 2026-09-03
for the nine matchday-6 La Liga Fixtures played 15–17 September, and re-Locks those nine
into Gameweek 5, whose deadline — 2026-09-11 17:30Z — is the latest Lock that still
precedes their kick-offs. Real Sociedad–Celta, the one Fixture that was actually brought
forward to the 3rd, keeps its Lock and its ten Predictions untouched. Gameweek 6 is left
holding that one Fixture; Gameweek 5 becomes a Double Gameweek of twenty. Decisions this
touches:
[ADR-0036](../adr/0036-a-new-competitions-schedule-results-and-lock-come-from-football-data-org.md)
(the 2026-09-03 amendment records this reversal and what it costs),
[ADR-0013](../adr/0013-a-postponed-fixture-keeps-its-original-prediction.md) (whose
insert-only rule this is the one recorded exception to),
[ADR-0015](../adr/0015-a-fixture-owns-its-locked-gameweek.md) (the immutability of
`locked_in_gw`, lifted once, by hand, inside the migration and restored by it).

**Blocked by:** None. The migration must be applied to production **before 2026-09-11
11:30Z**, the moment Gameweek 5's `main` run is due — after that the run has already
selected its work and the nine would be predicted by nobody. Ticket 0064 is not a
precondition: with the nine re-Locked into 5 by this migration, the fetch's label-grouped
deadline derivation reads Gameweek 5's deadline off label-5 kickoffs and Gameweek 6's off
label-6 kickoffs, both of which are already what the record holds, and writes nothing.

**Status:** open

---

## What is already known

**Which rows.** Read 2026-09-03 against production. `fixtures` for `PD`, `2026-27`,
`locked_in_gw = 6`: ten rows. One kicks off 2026-09-03 19:00Z (Real Sociedad–Celta,
`fixture_id` to be read off the record at migration time, not typed from memory). Nine
kick off 2026-09-15 17:00Z through 2026-09-17 19:30Z. `predictions` joined to those nine:
90 rows, ten seats each. `attempts` for `PD` gw 6 track `match`: 150 rows across all ten
Fixtures, of which 135 belong to the nine — those stay.

**Why Gameweek 5 and not 4 or 6.** The nine need a Lock that precedes their kick-offs and
a run that has not happened yet. Gameweek 6's deadline is frozen at 2026-09-03 17:30Z by
migration 0025 for as long as any Fixture points at it, and Real Sociedad–Celta must keep
pointing at it — its Prediction was made under that Lock and it has been played. Gameweek
4 Locks 2026-09-04 17:30Z, eleven days before the nine, which reproduces most of the
staleness this ticket exists to remove. Gameweek 5 Locks 2026-09-11 17:30Z, four to six
days before them: the latest open Lock that precedes every one of the nine kick-offs, and
the same answer ticket 0064's attachment rule gives for a Fixture whose own label has
already Locked.

**Why moving the moved Fixture instead was rejected.** The alternative — re-Lock Real
Sociedad–Celta into Gameweek 4 and derive Gameweek 4's deadline over it, which is what
ticket 0064 would have done had it been in place — was priced on 2026-09-03 at 16:13Z:
Gameweek 4's deadline would become 2026-09-03 17:30Z, seventy-seven minutes away, its
`main` run already six hours overdue by the scheduler's arithmetic, and past 17:30Z the
scheduler would never select Gameweek 4 at all (`deadline_at > now` fails and no
`prediction_runs` row exists to rescue it). Ten Fixtures would become Gaps to save nine.
Declined.

**What the triggers permit.** `fixture_locked_gameweek_is_immutable` (0022) refuses any
change to a non-null `locked_in_gw`, so the nine cannot be re-pointed while it stands; the
migration disables it on `fixtures` for the duration of its own transaction and re-enables
it before commit. `gameweek_deadline_is_immutable_once_committed` (0025) is not touched:
no deadline changes. `prediction_requires_locked_fixture` (0022) is not touched: nothing
is inserted. **Correction found while implementing:** deleting from `predictions` *is*
guarded — `predictions_are_immutable` (0001, `before update or delete`) refuses it. The
migration disables that trigger on `predictions` too, for the same span, and re-enables it
before commit.

**What the scheduler will do.** `prediction_runs` has `PD` gw 6 `main` and `fill`
completed and no row for gw 5. Nothing is reset: Gameweek 6's runs did happen and did
produce the one Prediction that survives. Gameweek 5's `main` fires at 2026-09-11 11:30Z
and selects work by `coalesce(locked_in_gw, gw) = 5`, which after this migration is twenty
Fixtures. Every reader downstream — scoring, the gap alert, the dashboard's Gameweek
range and fixtures listing — already attributes by `locked_in_gw` and needs no change.

**What it costs, stated.** $1.71 already spent on the ninety withdrawn Predictions (the
nine Fixtures' share of Gameweek 6's $1.91) is sunk. Gameweek 5's run grows from ~100 to
~200 calls, roughly $1.7 more on 2026-09-11 — a run the operator authorises the same way
as any other. The `attempts` ledger keeps 135 rows for gw 6 whose Predictions no longer
exist; a reader of the ledger will see a Gameweek where nine Fixtures were called ten
times each and none of the calls stand. The migration's own comment is where that reader
finds out why.

## Acceptance

- [x] **Migration `0037`**, one transaction, in this order: disable
      `fixture_locked_gameweek_is_immutable` on `fixtures`; delete from `predictions` where
      `competition = 'PD'`, `season = '2026-27'` and `fixture_id` is one of the nine; set
      `locked_in_gw = 5` and `updated_at = now()` on those nine; re-enable the trigger. The
      nine are selected by the record — `locked_in_gw = 6` and `kickoff_at > '2026-09-04'`
      — never by a typed list of ids. Real Sociedad–Celta is excluded by that predicate,
      and the migration asserts, before it writes, that exactly nine rows match and exactly
      one row does not. **Written as `kickoff_at > '2026-09-04T00:00:00Z'`, not the bare
      date**: this session's shell defaults to `Asia/Bangkok` (UTC+7), and a bare
      `'2026-09-04'` literal resolves at that zone's midnight — `2026-09-03T17:00:00Z`,
      which is *before* Real Sociedad–Celta's own 19:00Z kickoff and would have moved all
      ten. Caught by `test/migrations.test.ts`, not by inspection. Also disables
      `predictions_are_immutable` — see the correction above. Empty-database callers (a
      fresh clone, every other test in the suite) are let through as a no-op rather than
      held to the nine-and-one shape, so this migration does not break `applyMigrations`
      run from scratch anywhere but the deployed database.
- [x] **The migration refuses to run late.** It raises if `now() >= '2026-09-11T11:30:00Z'`,
      because after Gameweek 5's `main` run has started the nine would be re-Locked into a
      Gameweek nobody will predict. It also raises if any of the nine already has a
      `prediction_runs`-visible reason not to move: a `result`, or `unscheduled = true`.
      Covered by `test/migrations.test.ts` ("refuses to withdraw a fixture that already has
      a result"); the late-run branch is a plain `if` guarding an early `raise` and was not
      given a dedicated test — faking `now()` inside a real Postgres session was judged not
      worth it for that shape of check.
- [x] **The migration's header comment tells the whole story** in the voice of 0025's:
      what was brought forward, what the label-grouped deadline did, why nine and not ten,
      why 5, and that this is the one recorded exception to ADR-0013's insert-only rule
      and to 0022's immutability — lifted inside this transaction and restored by it.
- [ ] **Rehearsed before it is applied.** **This box's original wording described a tool
      that cannot pass.** `npm run db:rehearse` (`src/db/rehearse-migration.ts`) raises
      whenever a compared table's row count differs from its pre-migration snapshot by even
      one row (`missing > 0 or extra > 0`, line ~150) — the invariant it exists to prove is
      "a migration moves the record, it does not rewrite it." This migration deletes ninety
      `predictions` rows and rewrites nine `fixtures` rows on purpose; `db:rehearse` will
      raise on it every time, correctly, and no seeding fixes that — the tool's job and this
      migration's job are opposites. Corrected criterion: `pg_dump` a copy of production
      (same mechanism `db:rehearse` already uses internally), apply `0037` to the copy by
      hand, and read the following off the copy directly — no generic invariant to satisfy:
      ten Predictions remain, all on Real Sociedad–Celta (`fixture_id` read off the record,
      not typed from memory); nine Fixtures point at `locked_in_gw = 5` and one points at
      `6`; `attempts` still holds 150 rows, untouched; both `fixture_locked_gameweek_is_
      immutable` (on `fixtures`) and `predictions_are_immutable` (on `predictions`) are
      enabled; and both Gameweeks' deadlines are unchanged — `5` at 2026-09-11 17:30Z, `6`
      at 2026-09-03 17:30Z. **Not run this session** — even the `pg_dump` step was blocked by the
      auto-mode classifier as a production-touching command; needs the operator to run it
      directly (or grant Bash permission for it). In its place, `test/migrations.test.ts`
      gained a dedicated test seeding the same shape (two seats, not ten, over the same ten
      Fixtures) and asserting the same five outcomes against a local throwaway Postgres —
      it passes, but it is a synthetic record, not the live one; the copy-of-production
      rehearsal against real row shapes and counts (ninety Predictions, 150 attempts) is
      still outstanding.
- [ ] **Applied to production and read back.** After `npm run db:migrate` against the
      pooler: the same five assertions, read from production and pasted into this ticket
      with their timestamp. `schema_migrations` lists `0037`.
- [ ] **Gameweek 5 runs with twenty.** On 2026-09-11 the `main` run's attempt count for
      `PD` gw 5 is ~200 and every one of the nine has a Prediction from every seat, or a
      gap alert naming which does not. Recorded here after the run.
- [x] **ADR-0036's amendment already says this.** Its "What is decided" paragraph records
      the withdrawal, the re-Lock into 5 and the cost; this ticket does not edit it again.
