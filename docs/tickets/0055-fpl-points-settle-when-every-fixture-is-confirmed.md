# Ticket: FPL points settle when every Fixture is confirmed, not when the event is checked

**What to build:** A Gameweek's per-player points are stored, and the Gameweek scored, as soon
as every Fixture in it reports `finished` — FPL's own per-Fixture statement that bonus is
final — rather than waiting for the event-level `data_checked`. A Gameweek FPL has checked
still settles, so the two are read as either-or. Source:
[spec 0003](../specs/0003-fpl-track.md) stories 2 and 3, the first of which this ticket amends
and the second of which it keeps. Decisions:
[ADR-0053](../adr/0053-fpl-points-settle-when-every-fixture-is-confirmed.md).

This is [ticket 0042](0042-a-scoreline-settles-at-the-whistle.md)'s reasoning applied to the
track that ticket deliberately left alone — with the stricter flag, for the reason given below.

**Blocked by:** None — can start immediately. Gameweek 1's record is missing from the FPL
leaderboard for as long as this stands, and every Gameweek after it arrives late the same way.

**Status:** ready-for-agent

---

## What is already known

At 2026-08-25T09:20Z — four days after Gameweek 1's Lock at 2026-08-21T17:30Z, and thirteen
hours after its last Fixture kicked off at 2026-08-24T19:00Z — the FPL feed reported:

| Where | Field | Value |
| --- | --- | --- |
| `fixtures/?event=1`, all ten | `finished` | `true` |
| `fixtures/?event=1`, all ten | `finished_provisional` | `true` |
| `events[1]` | `finished` | `false` |
| `events[1]` | `data_checked` | `false` |
| `events[1]` | `is_current` | `true` |
| `event/1/live/` | players with minutes | 310 of 610 |
| `event/1/live/` | players with `bonus` above zero | 32 — roughly three per Fixture |

**Both event-level flags lag; the per-Fixture ones are current.** The bonus is already in the
live payload, so what `data_checked` is still waiting on is not a number any Entrant's Squad
is scored from. This is the same lag [ticket 0042](0042-a-scoreline-settles-at-the-whistle.md)
recorded on 2026-08-22 one level down, at `fixtures[].finished`.

What a reader saw meanwhile: the FPL leaderboard with `fromGw` and `throughGw` null and every
Entrant's total blank, and the Squads page reporting Gameweek 1 locked and unsettled, with all
seven Entrants' Team Sheets standing and no points beside them.

**`finished` and not `finished_provisional`, and the difference is the whole point.** Ticket
0042 reads the two as either-or because bonus cannot move a scoreline. It can move a player's
total, so this track takes the later of the two flags: `finished_provisional` is the match
over, `finished` is the match over with bonus confirmed. The two predicates must be written so
that a reader of one is told the other exists and why it differs, or they will be collapsed
into one the next time somebody tidies.

**Row presence stays the record of settlement.** Migration 0011 fixes that absence of rows for
a Gameweek is how an unchecked Gameweek is told from one in which everybody scored zero, and
three readers depend on it and ask nothing else: FPL scoring, the Entrant context's Settled
windows, and the Squads page's settled flag. This ticket changes **when the rows are written**
and nothing about what they mean — no provisional state, no second flag, no schema change, and
nothing downstream learns a new concept.

**`data_checked` stays accepted, which is what keeps the rehearsal a rehearsal.** The rehearsal
harness states settlement by flipping `data_checked` on an archived bootstrap and touching
nothing else; an either-or predicate leaves it, the dry run and the Exhibition replay working
unchanged. Dropping `data_checked` would mean teaching all three to synthesise Fixture flags.

**The Fixtures payload is already in hand.** The daily fetch parses the full Fixtures list in
the same run, before it decides which Gameweeks settled, so the new predicate costs no request
and reads nothing the fetch was not already reading.

**A late correction is not a new case.** The points row is deliberately mutable — migration
0011 says so in as many words, "FPL may correct a checked Gameweek" — the fetch upserts, and
the scorer refolds every published Gameweek at or after the one that moved. What FPL's final
check adds over confirmed bonus is a correction path this system already has.

**Two traps to pin rather than discover.** A Gameweek with no Fixtures listed must not settle,
and an `every` over an empty list says it does. An unscheduled Fixture leaves its Gameweek by
carrying a null event (spec 0009, ADR-0024), so it drops out of the list rather than blocking
its old Gameweek forever — no Fixture in the current Season carries one yet, so that path has
a test and no observation behind it.

**Not in this ticket.** The daily fetch polls once a day at 06:00Z, so FPL's lag is compounded
by up to a further twenty-four hours before a settled Gameweek is noticed. That is a cadence
question, worth its own ticket, and it would not have published Gameweek 1 on its own.

## Acceptance

- [ ] A Gameweek whose Fixtures all report `finished` stores its per-player points and is
      scored by one ordinary daily fetch, with no manual step and no backfill: Gameweek 1 of
      2026-27 reaches the FPL leaderboard, and its Squads page reads settled with points
      beside all seven Team Sheets.
- [x] A Gameweek FPL reports `data_checked` settles whatever its Fixtures say. The rehearsal,
      the dry run and the Exhibition replay, which state settlement that way against archived
      bytes, pass unchanged.
- [x] A Gameweek in play settles nothing: a Fixture that is `finished_provisional` and not
      `finished` leaves its Gameweek unsettled, so a bonus still to be awarded is never stored
      as a zero and corrected afterwards.
- [x] A Gameweek the feed lists no Fixture for does not settle.
- [x] A Fixture the feed has unscheduled does not hold its former Gameweek unsettled.
- [x] The test pinning that unchecked data creates no scoreable rows is amended rather than
      deleted, and gains the case this ticket turns over: unchecked at the event, confirmed at
      every Fixture, scoreable.
- [x] Spec 0003 story 2 is amended so the record and the code agree, and story 3 — settled-ness
      read from the feed rather than inferred from the clock — is still true of what replaces
      it. The amendment names the Match track's looser predicate and why this one is stricter.
- [x] An ADR records the decision and what it gives up: FPL's final data check, in exchange for
      a Gameweek that publishes when the numbers it publishes have stopped moving. It states
      that the Entrant context follows the same gate, so ADR-0020's rule — a Gameweek that has
      not settled is announced as absent, never estimated — reads the same before and after.
- [x] Migration 0011's comment names the gate the rows are now written under, so the table
      still explains itself to whoever reads it next.
