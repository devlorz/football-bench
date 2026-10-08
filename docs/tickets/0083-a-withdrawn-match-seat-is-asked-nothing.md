# Ticket: A withdrawn match seat is asked nothing

**What to build:** a match-track seat stamped `withdrawn_at` is not called, not expected
and not reported as a Gap for any Gameweek whose Lock is at or after the stamp, and is
still counted, scored and ranked for every Gameweek whose Lock came before it. Today the
match predict path, the Gap alert, the scorer's expected roster, the pre-flight and the
roster module's identity check all select a Competition's seats by Prompt Version alone;
a seat merely stamped would go on being called and paid for while the leaderboard hid
it. This is the gap ADR-0060 named and ADR-0061 makes load-bearing. Source:
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md), *What
the record holds*. Decisions it must not bend:
[ADR-0047](../adr/0047-three-seats-leave-the-fpl-track-before-its-first-lock.md)
(`withdrawn_at` dates the departure and leaves the row, its attempts and its contexts
where they are; the FPL reads already filter it and are not touched),
[ADR-0016](../adr/0016-each-snapshot-publishes-against-one-comparison-anchor.md) (a
Gameweek's Comparison Anchor is chosen among the seats that were asked that Gameweek).

**Blocked by:** None — can start immediately. It does not need the Editions table: the
comparison is between the stamp and the Gameweek's Lock, both of which the record holds.

**Status:** drafted, 2026-09-22; done 2026-10-07 (no migration; code only)

---

## What is already known

**The comparison is against the Gameweek's Lock, not against "now".** A seat withdrawn
at Edition 2's first Lock played every Gameweek of Edition 1; re-scoring an Edition 1
Gameweek after the stamp must still expect it. So every site compares
`withdrawn_at` with the Gameweek's `deadline_at`: asked if the stamp is null or later
than the Lock. Filtering on "withdrawn_at is null" alone — the FPL track's filter — would
be right for the predict path and wrong for the scorer, and the scorer is the one that
runs again.

**Five sites, one predicate.** The predict path's roster and its work list, the Gap
alert, the scorer's expected roster, the pre-flight's count, and the roster module's
"a stored seat the roster no longer names" check. One SQL fragment or one helper, not
five spellings, so the sixth site cannot get it subtly different. *(2026-10-07: four
Lock-bound sites share the predicate; the roster module asks "stamped at all" instead,
see Acceptance.)*

**The roster module's refusal changes meaning slightly.** Today a stored seat under the
Competition's version that the roster does not name is refused as "the record
disagrees". After this ticket a stored seat that is *withdrawn* and not named is the
expected shape of an Edition boundary and is not a disagreement; a stored seat that is
*standing* and not named still is.

**The dashboard is not this ticket.** Its seat CTE learns the Edition in ticket 0084 and
reads withdrawn seats within their Edition there. Until then a withdrawn seat keeps
appearing on the current page with a frozen total, which is acceptable only because no
match seat is withdrawn before the second ADR (ADR-0061, *What this ADR does not
decide*).

## Acceptance

- [x] With one seat stamped at a Gameweek's Lock, a dry run of that Gameweek builds no
      call for it, records no attempt, and the Gap alert names it nowhere; a dry run of the
      Gameweek before still calls it.
- [x] The scorer's expected roster for a Gameweek before the stamp includes the seat and
      for a Gameweek at or after it does not; re-scoring the earlier Gameweek after the
      stamp leaves its rows byte-for-byte as before.
- [x] The pre-flight's `EXPECTED_ENTRANT_COUNT` is checked against standing seats only.
- [x] `roster:enter` accepts a Competition whose stored seats include a withdrawn one the
      roster no longer names, and still refuses a standing one.
- [x] The predicate is one definition; a test proves each of the four Lock-bound sites
      (predict path, Gap alert, scorer, pre-flight) uses it by stamping a seat one second
      before and one second after a Lock. The roster module has no Lock to compare
      against: `roster:enter` runs before the stamp's Lock arrives, so it asks only
      whether a seat is stamped at all, and its own test covers that.
- [x] No FPL read changes; the FPL suites pass untouched.

## Evidence, 2026-10-07

- `test/match-withdrawal.test.ts`, 4 tests, each red before its site changed: the predict
  path and Gap alert (seats stamped 1s before, at, and 1s after the Lock; only the
  unstamped and the after seat are called, attempted and Gapped), the scorer (GW1 rows
  byte-identical when re-scored after a stamp between GW1 and GW2; GW2 expects only the
  standing seats), the pre-flight count (3 rows, 2 standing, refused as "found 2"), and
  `roster:enter` (withdrawn and unnamed passes, standing and unnamed is refused).
- Mutating `askedAt`'s `>` to `>=` fails the at-the-Lock seat; restored.
- 29 targeted files (every suite importing a touched function, the FPL suites,
  `fpl-withdrawal-filter`): 470 passed, 2 failed in `test/seed-season.test.ts` ("already
  holds editions"). Both fail identically on HEAD `09a8c61` in a clean worktree, from
  migration 0048's seeded rows, not this change.
- Follow-ups: ADR-0061's membership rule amended to "later than" (2026-10-08, `1132d01`);
  ticket 0084 records the scorer's frozen cumulative rows for a withdrawn seat.
- Second review, 2026-10-08: the helper is renamed `isAskedAtLock`; its three
  `gameweeks` joins are inner, since a missing row would otherwise collapse the
  predicate to `withdrawn_at is null` without a word. The roster guard is shared with
  `enterFplRoster`, so the FPL door also accepts a withdrawn seat its roster no longer
  names: unreachable today (the FPL roster of record still names every stored FPL seat)
  and the same meaning on both tracks, a stamp being a departure on purpose. No FPL read
  changes.
- **Gap found 2026-10-08, closed by ticket 0096:** the dry run's archive carries no
  `withdrawn_at`, so a replayed Gameweek kept asking a seat production would not. No
  production seat is stamped yet, so nothing was mis-replayed; the archive learns both
  dates in 0096.
