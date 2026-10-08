# Ticket: A seat that joined later is not expected earlier

**What to build:** a match-track seat entered after a Gameweek's Lock is not expected,
not reported as a Gap and not counted for that Gameweek when it is scored or re-scored,
and is expected from the first Gameweek whose Lock came after its entry. Today the four
Lock-bound sites ask only one of the two questions ADR-0061 says membership is made of:
`isAskedAtLock` reads `withdrawn_at` against the Lock and nothing reads `created_at`, so
a seat that joins the five leagues at Edition 2 and then re-scoring any Edition 1
Gameweek would expect that seat, count it as a Gap on every Fixture, and empty Edition
1's complete case. This has to land before the first `roster:enter` of Edition 2. *It is
not true that it has no effect until then* (corrected 2026-10-08, by the first attempt):
`models.created_at` defaults to `now()`, so every path that enters a seat and then
replays a Gameweek whose Lock has passed — the dry run, the scoring rehearsal, and some
sixty test fixtures — would find no seat asked at all. See *The archive and the test
fixture* below. Source:
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md), *What
the record holds* ("a seat is on Edition N's roster when its `created_at` is at or before
Edition N's first Lock and its `withdrawn_at` is null or later than that Lock").
Decisions it must not bend: ticket 0083's one-definition rule (one predicate, four
Lock-bound sites, no second spelling), ADR-0016 (a Gameweek's Comparison Anchor is chosen
among the seats asked that Gameweek), ADR-0047 (the FPL reads are not touched).

**Blocked by:** None — can start immediately. It does not need the roster ADR: it changes
what a Gameweek expects of a seat that *could* join, and no seat joins until that ADR.

**Status:** drafted, 2026-10-08; done 2026-10-08 (no migration; code only)

---

## What is already known

**The predicate grows its other half, in place.** `isAskedAtLock(seat, lock)` becomes
"entered at or before the Lock, and not withdrawn at or before it" — `created_at <= lock`
joined to what it already says. Same helper, same four call sites, so this is the forced
simultaneous edit the one-definition rule was written for, and no site may spell its own
version. The name still fits: a seat is asked at a Lock exactly when both halves hold.

**`created_at` is the date of entry, by design.** ADR-0061 chose it over a new column
(*Q25* of the grilling that produced the ADR), on the operational condition that a joining
seat's row is written by `roster:enter` before the Edition's first Lock. The pre-flight's
temporary `candidate/…` row is a different id and is deleted; it never becomes the seat.
Nothing here adds a column.

**The scorer is the site that matters.** The predict path and the Gap alert run at the
current Lock, where every stored seat's `created_at` is already in the past, so the new
half is a no-op there and the tests prove it stays one. The scorer re-runs over old
Gameweeks (ticket 0083's byte-identity test is the precedent), and it is the scorer's
expected roster, Gap rate, attempts-to-valid and comparisons that a late seat would
corrupt backwards.

**The dashboard is not this ticket.** Ticket 0084's seat CTE derives membership from the
same two dates; it should call the same helper rather than restate it, and that is 0084's
acceptance to hold, not this ticket's.

**The FPL track has no joiners** (ADR-0047 made its roster irreversible once started) and
its reads are untouched.

**The archive and the test fixture (found 2026-10-08).** Two places enter seats after
the Lock they are about to be asked at, and both are this ticket's to fix:

- *The dry run's archive* carries a seat's identity but neither of its dates, so
  `seedEntrants` writes every replayed seat with `created_at = now()` — and, since
  ticket 0083, without the `withdrawn_at` production holds, so the dry run has gone on
  asking withdrawn seats. The archive carries both dates and the seed writes them. The
  `withdrawn_at` half is a gap 0083 left and is closed here because it is the same three
  lines.
- *The test fixture* — `resetSchema` applies the real migrations, so every test seat is
  entered at `now()` against deadlines in August 2026, and a Lock-bound `created_at` empties
  roughly sixty tests. The seed already states its answer as `SEED_ENTERED_AT`, thirty days
  before the first deadline; the fixture states the same one as `TEST_ENTERED_AT` and sets
  it as the column's default after the migrations run. This is the one deliberate place the
  test schema differs from production's, said so in the fixture's comment beside the
  statement. Two kinds of test opt back to `now()` by writing `created_at` themselves: this
  ticket's own boundary tests, and one test in the roster suite that proves `roster:enter`
  stamps a real entry time, so production's default is still exercised somewhere.

## Acceptance

- [x] The dry run's archive carries each seat's `created_at` and `withdrawn_at`, and a
      replayed Gameweek asks exactly the seats production would have asked at that Lock;
      the existing dry-run suite holds it, including a withdrawn seat that is not asked.
- [x] `TEST_ENTERED_AT` is the test schema's one documented divergence from production,
      set in the fixture with its reason beside it; the roster suite proves `roster:enter`
      stamps a real entry time; this ticket's boundary tests set `created_at` explicitly.
- [x] `isAskedAtLock` holds both halves of ADR-0061's membership and is still the only
      spelling: a grep of the match-track code finds no second comparison of `created_at`
      or `withdrawn_at` against a Lock.
- [x] With one seat entered one second after Gameweek 1's Lock and before Gameweek 2's:
      scoring or re-scoring Gameweek 1 expects it nowhere — no Gap, no row in the
      complete case, no comparison — and Gameweek 1's rows are byte-identical to a score
      taken before the seat existed; Gameweek 2 expects it.
- [x] The same seat entered one second *before* Gameweek 1's Lock is expected at
      Gameweek 1 — the boundary is at-or-before, tested on both sides.
- [x] A dry run of a Gameweek whose Lock has passed builds no call for a seat entered
      after that Lock, and the Gap alert for that Gameweek names it nowhere.
- [x] The pre-flight's count ignores a seat entered after the target Fixture's Lock.
- [x] No FPL read changes; the FPL suites pass untouched.

## Evidence, 2026-10-08

- `isAskedAtLock` reads `created_at <= lock` beside the `withdrawn_at` half. A grep of
  `src` and `dashboard/src` for `created_at` or `withdrawn_at` compared with `<` or `>`
  finds that helper and nothing else.
- `test/match-late-entry.test.ts` has 4 tests. Every seat in it states its `created_at`,
  using a seat entered 1s before the Lock and one entered 1s after:
  - The scorer: re-scoring GW1 after the late entry leaves GW1's rows byte-identical,
    and GW2 expects the seat.
  - At-or-before: a seat entered 1s before the Lock is expected at GW1.
  - The predict path and Gap alert: only the standing seat and the before seat are
    called and Gapped.
  - The pre-flight count: refused as "found 2".
- Removing `created_at <=` from the helper turns three of the four red. The at-or-before
  test passes either way, as it should. The bytes were restored afterwards.
- `roster:enter` writes `created_at = now()` explicitly and does not move it on a
  re-entry. The new test "stamps each seat with the instant it was entered" in
  `test/season-roster.test.ts` was red against the column default before that change.
- The archive carries both dates (`load-archive.ts`), and `seedEntrants` writes them.
  `test/dry-run-archive.test.ts` reads both dates back. A new `run-dry-run` test archives
  three seats: `sol`, a seat that joined after GW1's Lock, and a seat withdrawn before it.
  Only `sol` is attempted, and the alert still holds 9 Gaps. Both tests were red before
  the change.
- `TEST_ENTERED_AT` (`2000-01-01T00:00:00Z`) is set by `resetSchema` as the default of
  `models.created_at`, with its reason beside it. The archive fixtures in
  `expected-dry-run-outcome`, `preview-gameweek` and `rehearse-scoring` gained the two
  fields the type now requires.
- `tsc --noEmit`: no errors.
- 49 targeted files, covering every suite that touches the four sites, the dry run,
  rehearsals, the roster, `resetSchema`, and `fpl-withdrawal-filter`: 689 passed and 2
  failed. Both failures are in `test/seed-season.test.ts` ("The seed needs an empty
  database"), which is ticket 0095's known pre-existing pair.
- All 23 FPL suites: 412 passed. No FPL file changed.
- Review, 2026-10-08:
  - CONTEXT.md's Season Roster now states both halves of membership.
  - The dry-run test names the Gapped seats (only `sol`) instead of counting them.
  - `upsertSeats` is shared with `startFplTrack`, so FPL seats are now also written
    with an explicit `now()`. That is the same value production's column default
    gives, and no FPL read changed.
