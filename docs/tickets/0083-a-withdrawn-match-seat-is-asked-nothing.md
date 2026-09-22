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

**Status:** drafted, 2026-09-22

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
five spellings, so the sixth site cannot get it subtly different.

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

- [ ] With one seat stamped at a Gameweek's Lock, a dry run of that Gameweek builds no
      call for it, records no attempt, and the Gap alert names it nowhere; a dry run of the
      Gameweek before still calls it.
- [ ] The scorer's expected roster for a Gameweek before the stamp includes the seat and
      for a Gameweek at or after it does not; re-scoring the earlier Gameweek after the
      stamp leaves its rows byte-for-byte as before.
- [ ] The pre-flight's `EXPECTED_ENTRANT_COUNT` is checked against standing seats only.
- [ ] `roster:enter` accepts a Competition whose stored seats include a withdrawn one the
      roster no longer names, and still refuses a standing one.
- [ ] The predicate is one definition; a test proves each of the five sites uses it by
      stamping a seat one second before and one second after a Lock.
- [ ] No FPL read changes; the FPL suites pass untouched.
