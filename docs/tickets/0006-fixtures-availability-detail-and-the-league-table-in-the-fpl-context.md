# Tickets: Fixtures, availability detail and the league table in the FPL context

Three tracer-bullet slices that put the Gameweek's world state into the FPL context
inside the same `fpl/2026-27-v2` freeze spec 0005 introduces. Source:
[spec 0006](../specs/0006-fixtures-availability-detail-and-the-league-table-in-the-fpl-context.md).
Vocabulary: [CONTEXT.md](../../CONTEXT.md). Decisions: [ADR 0001–0021](../adr/), especially
[ADR 0018](../adr/0018-raw-signals-only-in-the-entrant-context.md) and
[ADR 0021](../adr/0021-fixtures-availability-detail-and-the-league-table-join-the-fpl-context-for-2026-27-v2.md).

Work the **frontier**: any ticket whose blockers are all done. The three slices are
independent of one another; every one is gated by spec 0005's opening ticket, because all
of them edit the builder that ticket reshapes and freeze into the Prompt Version it
introduces. Everything lands before the season's first FPL Lock — after the Lock these
additions may only ship as a v3.

---

## The schedule joins the context

**What to build:** An Entrant opening a Gameweek sees a Fixtures section — one raw line
per Fixture with home side, away side and kickoff date, grouped by Gameweek from the
current one through the fifth ahead — read from the fixture rows the pre-deadline fetch
already stores. A Double Gameweek is a club appearing twice, a Blank a club appearing
nowhere; neither is annotated.

**Blocked by:** Spec 0005's opening ticket.

- [x] Each of the six Gameweeks lists its Fixtures in kickoff order, home side first
- [x] A scripted schedule with a Double and a Blank renders as repetition and absence,
      with no annotation of either
- [x] The window truncates silently at the season's final Gameweek
- [x] No difficulty rating or strength marking appears anywhere in the section
- [x] The builder is tested pure; the six-Gameweek read is tested against a real Postgres
- [x] The stored, hashed body carries the section — asserted at the `openFplGameweek` seam

**Known limitation — the Blank is only as honest as the fetch.** A Fixture FPL removes
from the calendar (`event = null`) keeps its stored `gw` and kickoff, so the section still
lists it under a Gameweek it will not be played in, and the Blank it creates never appears.
Neither half is fixable where the schedule is read: a Fixture that was never Locked is left
untouched by the fetch and is indistinguishable from a scheduled one, and `deferred` cannot
stand in for "unscheduled" — it is monotone and also marks a Fixture that legitimately moved
to a new Gameweek, so filtering on it would hide the rearranged Fixture that *creates* a
Double, for the rest of the Season (`test/fetch-fpl-gameweek.test.ts:292` and `:378`). The
fix belongs to the FPL fetch — drop the never-Locked rows FPL has unscheduled, and mark the
Locked ones as unscheduled rather than leaving `deferred` to mean two things — which spec
0006 rules out here ("nothing new is fetched, nothing new is stored"). It needs its own
spec, and must land before the first FPL Lock for stories 3 and 4 to hold.

## The league table joins the context

**What to build:** The same context carries a league table summed from the current
Season's stored Premier League results — played, won, drawn, lost, goals for and against,
points, ordered points then goal difference then goals scored — announcing the date of
the latest result included, and stating plainly when no result exists yet.

**Blocked by:** Spec 0005's opening ticket.

- [ ] The table matches a hand-computed one, including a tie broken by goal difference
      and one broken by goals scored
- [ ] Only current-Season Premier League results contribute; a side appears once it has a
      stored result
- [ ] The coverage line names the latest included result's date
- [ ] With no stored result the table is replaced by a plain announcement — Gameweek 1's
      normal case, tested end to end
- [ ] The summation and the current-Season boundary are tested against a real Postgres
- [ ] The stored, hashed body carries the table — asserted at the `openFplGameweek` seam

## Availability detail rides the pool lines

**What to build:** Each pool line that has any carries FPL's chance-of-playing percentage
and raw news text from the pre-Lock player snapshot, omitted when empty and defined once
in the pool legend, so a 75% doubt and a 25% doubt stop reading as the same word — and a
stored body carrying the new fields still prices transfers.

**Blocked by:** Spec 0005's opening ticket.

- [ ] A flagged player carries percentage and news; an unflagged player carries neither
      field at all
- [ ] A flagged player whose percentage is null carries news alone
- [ ] The legend defines both fields exactly once
- [ ] No invented availability verdict appears — the fields are the snapshot's, verbatim
- [ ] The pool readback prices transfers from a body carrying the new fields while still
      validating the fields it prices from
- [ ] Rendering and omission are tested pure; the round-trip is asserted on a stored v2
      body at the `openFplGameweek` seam
