# Tickets: Prior-Season points per game and Squad Changes in the match context

Four tracer-bullet slices delivering
[spec 0012](../specs/0012-prior-season-ppg-and-squad-changes-in-the-match-context.md):
each club's prior-Season rate and the transfer window's real squad movement inside
`match/2026-27-v2`, before the 2026/27 Season's first Lock — 2026-08-21 17:30 UTC.
Vocabulary: [CONTEXT.md](../../CONTEXT.md), note **Squad Change**. Decisions:
[ADR 0030](../adr/0030-prior-season-points-per-game-joins-the-match-context-for-2026-27-v2.md),
[ADR 0031](../adr/0031-squad-changes-join-the-match-context-for-2026-27-v2.md).

Work the **frontier**: any ticket whose blockers are all done. Tickets 1 and 2 are
independent; ticket 3 waits on 2 alone; ticket 4 waits on 1 and 3.

## 1. The PPG line rides the prior-Season lines

**What to build:** An Entrant reading a match context sees, under each club's
prior-Season final position line, one new line every Gameweek of the Season:
`Prior-Season points per game: 1.08 overall, 0.79 home, 1.37 away.` — two decimals,
computed at render time from the stored prior-Season rows of the division the sibling
line already names. A promoted club shows its real Championship figures beside an
opponent's Premier League ones, never normalised and never blank. Nothing new is
fetched or stored.

**Blocked by:** None — can start immediately.

- [x] Both club sections carry the line, every Gameweek, under the final-position line
- [x] Figures verified against hand-computed rates from the stored 2025-26 record by
      exact-string assertions at the pure context-builder seam, per the existing
      historical-context test prior art
- [x] A promoted club's line is verified to carry its Championship figures, with the
      division named only by the sibling line above
- [x] No query, migration or fetch changes; no rate is stored anywhere

## 2. The Squad Change pipeline: fetch, archive, store

**What to build:** On a day when any upcoming deadline sits inside the render gate —
at most 21 days after a window's frozen close (`2026-09-01`, `2027-02-02`) — the daily
fetch pulls the window's Wikipedia transfer-list page as raw wikitext, archives the
response byte-for-byte under a window-scoped source, and parses permanent transfers
and loans into Squad Change rows — player, counterpart club, fee verbatim, loan flag —
for the twenty Premier League clubs, resolved through a pinned club-name alias table.
Rows land in a Gameweek partition stamped with when they were observed, guarded by the
database itself exactly as the FPL player snapshots are. The gate lives here as a pure
function of deadline against the frozen constants, because the fetch is its first
consumer.

**Blocked by:** None — can start immediately.

- [ ] A local fetch stores the upcoming Gameweek's Squad Change partition and archives
      the page bytes; re-fetching replaces only that partition
- [ ] The parser's fixture is a real archived copy of the page, pinned by checksum, and
      parsing it yields the five Spurs Signings with their stated fees — two of them
      `free` — and Departures including a labelled loan
- [ ] An unknown club spelling fails the fetch with a validation error naming the
      spelling, before anything is stored — the Understat alias precedent
- [ ] A row observed at or after its Gameweek's Lock is refused by the database, and a
      deadline correction cannot move a Lock across an existing partition — both
      asserted at the schema seam the way the FPL snapshot triggers are
- [ ] Days outside the gate fetch nothing and touch no stored Squad Change row

## 3. The Squad Changes section renders

**What to build:** An Entrant reading a match context inside the render gate sees, after
the FPL-derived player context, a Squad Changes section — one block per club, `In:` and
`Out:` lines ordered by fee descending with `free`/`undisclosed` after and ties by
date, `(loan)` where the record says so, `none recorded` for a club without movement,
and a stated absence when data is missing. Outside the gate the section is absent.
Every Squad Change of the window is visible whenever the section renders — a June
Signing as visible at the gate's last Gameweek as at its first.

**Blocked by:** Ticket 2.

- [ ] Every rendering shape asserted by exact string at the pure context-builder seam:
      ordering, the loan label, `none recorded`, the stated absence, and the section's
      absence outside the gate
- [ ] The gate pinned by arithmetic against the stored deadlines: Gameweek 5 in and 6
      out, Gameweek 26 in and 27 out, and Gameweek 19's one-day winter section
      asserted as correct behaviour
- [ ] Membership carries no recency test — a Signing dated at the window's open renders
      at the gate's last Gameweek
- [ ] Missing Squad Change data degrades the context to its stated absence and blocks
      no Prediction

## 4. Freeze verification: one amendment, one pre-flight

**What to build:** The amendment ritual of specs 0004 and 0007, once, for both
additions together. The freeze counts are re-read live immediately before merge and
are zero, the pinned SHA moves once to cover the final text of both additions, the
contract test pins the new construction, pre-flight runs 9/9 `ok: true` against the
live database, and the run is recorded as a dated report beside its predecessors.
Document numbers 0012, 0030 and 0031 are re-checked for collisions at merge, per the
0016/0017 precedent.

**Blocked by:** Tickets 1 and 3.

- [ ] `contexts`, `predictions` and `attempts` re-verified zero on the live database
      immediately before merge — or the work ships as a v3, not an edit
- [ ] The pinned SHA moves exactly once, with the contract test asserting the new pair
- [ ] Pre-flight 9/9 parseable, `ok: true`, no substitutions, before the first Lock
- [ ] A dated report in the reports directory records both runs' roster resolution and
      the freeze counts, in the style of its predecessors
- [ ] The per-call token cost of the additions is read from recorded attempts after
      Gameweek 1 — measured, not estimated
