# Ticket: A seat that joined later is not expected earlier

**What to build:** a match-track seat entered after a Gameweek's Lock is not expected,
not reported as a Gap and not counted for that Gameweek when it is scored or re-scored,
and is expected from the first Gameweek whose Lock came after its entry. Today the four
Lock-bound sites ask only one of the two questions ADR-0061 says membership is made of:
`isAskedAtLock` reads `withdrawn_at` against the Lock and nothing reads `created_at`, so
a seat that joins the five leagues at Edition 2 and then re-scoring any Edition 1
Gameweek would expect that seat, count it as a Gap on every Fixture, and empty Edition
1's complete case. This has to land before the first `roster:enter` of Edition 2; it
has no effect until then. Source:
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md), *What
the record holds* ("a seat is on Edition N's roster when its `created_at` is at or before
Edition N's first Lock and its `withdrawn_at` is null or later than that Lock").
Decisions it must not bend: ticket 0083's one-definition rule (one predicate, four
Lock-bound sites, no second spelling), ADR-0016 (a Gameweek's Comparison Anchor is chosen
among the seats asked that Gameweek), ADR-0047 (the FPL reads are not touched).

**Blocked by:** None — can start immediately. It does not need the roster ADR: it changes
what a Gameweek expects of a seat that *could* join, and no seat joins until that ADR.

**Status:** drafted, 2026-10-08

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

## Acceptance

- [ ] `isAskedAtLock` holds both halves of ADR-0061's membership and is still the only
      spelling: a grep of the match-track code finds no second comparison of `created_at`
      or `withdrawn_at` against a Lock.
- [ ] With one seat entered one second after Gameweek 1's Lock and before Gameweek 2's:
      scoring or re-scoring Gameweek 1 expects it nowhere — no Gap, no row in the
      complete case, no comparison — and Gameweek 1's rows are byte-identical to a score
      taken before the seat existed; Gameweek 2 expects it.
- [ ] The same seat entered one second *before* Gameweek 1's Lock is expected at
      Gameweek 1 — the boundary is at-or-before, tested on both sides.
- [ ] A dry run of a Gameweek whose Lock has passed builds no call for a seat entered
      after that Lock, and the Gap alert for that Gameweek names it nowhere.
- [ ] The pre-flight's count ignores a seat entered after the target Fixture's Lock.
- [ ] No FPL read changes; the FPL suites pass untouched.
