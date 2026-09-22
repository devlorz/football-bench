# Ticket: The Nations League seats seven

**What to build:** `roster:enter` for `UNL` under `match-unl/2026-27-v1` writes seven
seats — the Season Roster less DeepSeek V4 Pro, MiniMax M3 and Qwen3.8 Max — and every
league still seats ten; the cup's leaderboard page carries the frozen sentence ADR-0060
requires, saying its field was cut by the leagues' standings, and draws a seven-row
skeleton rather than a ten-row one. Nothing here inserts the `competitions` row, enters a
seat on production or reaches a Base Model: ticket 0076 stays the operator's ticket and
this one makes its `roster:enter` step possible. Source:
[ADR-0060](../adr/0060-three-seats-sit-out-the-nations-league-before-its-first-lock.md).
Decisions it must not bend:
[ADR-0034](../adr/0034-the-roster-refreshes-to-ten-entrants-before-the-first-lock.md)
(the roster is checked as whole identities, not a count — the cut is by name and the
seven that remain are still compared field for field),
[ADR-0047](../adr/0047-three-seats-leave-the-fpl-track-before-its-first-lock.md) (a
per-track, per-Competition roster is a fact about that Competition's rows only),
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md) (the
cup is its own Edition 1; nothing here is an Edition boundary).

**Blocked by:** None — can start immediately. It spends nothing.

**Status:** drafted, 2026-09-22

---

## What is already known

**The cut is a named exclusion, derived, not a second roster.** `FPL_WITHDRAWALS` is the
pattern: a list of ids each carrying the ground it left on, and a size computed as
`SEASON_ROSTER.length` minus the list's length so that no constant can describe a roster
that does not exist. The match track gets the same shape keyed by Competition — `UNL`
names three, every league names none — and the entry door seats the Season Roster minus
that Competition's exclusions. The three are *never entered* for the cup, so they have
no `match-unl/…` row, no `withdrawn_at`, and no way to be called: the `withdrawn_at`
filter ADR-0060 asked for is a different ticket (0083) and is not what keeps these three
off the cup.

**The identity check still runs over the seven.** ADR-0034's refusal of a swap or a
transplant compares every field of every seat against the Season Roster; the exclusion
removes three entries from *both* sides of that comparison and changes nothing about how
the rest are compared. A roster that names an exclusion the Season Roster does not hold
is refused by name.

**Everything downstream reads what is stored and needs no edit.** The scorer's expected
roster, the Gap alert, the dry-run's archive and the Comparison Anchor's N−1 all read the
Competition's stored seats. The pre-flight's count is `EXPECTED_ENTRANT_COUNT` from the
environment, set to 7 for the cup by the operator; the runbook line saying so is this
ticket's.

**The dashboard has two spots that assume ten.** The competition page's loading skeleton
draws `SEASON_ROSTER_SIZE` rows, and the page's qualification block says nothing about
who is absent. ADR-0060 requires the page to say the field was cut by the leagues'
standings; that sentence is a frozen constant (ADR-frozen text is a constant, never a
row), served for `UNL` only and placed beside the two stored qualifications the way the
retired-Gameweek caveat is. The skeleton reads the Competition's roster size.

## Acceptance

- [ ] `enterSeasonRoster(db, "UNL", "2026-27")` writes exactly seven rows under
      `match-unl/2026-27-v1`, none of them the three named; the same call for each of the
      five leagues still writes ten. Tests hold both and hold that an exclusion naming an
      id the Season Roster lacks is refused by name.
- [ ] The exclusion list carries, per id, the ground ADR-0060 states — standing, not cost
      or reliability — and the cup's roster size is derived from it, not written.
- [ ] `/api/unl/leaderboard` carries the frozen sentence and no league's does; the `/unl`
      page renders it beside the two qualifications, and its skeleton has seven rows. The
      dashboard test suite holds the sentence's bytes.
- [ ] The opening-a-Competition runbook's cup column says `EXPECTED_ENTRANT_COUNT=7` for
      the pre-flight and names this ticket.
- [ ] Ticket 0076's `roster:enter` step is annotated to point here; its remaining boxes
      (the person's map review, the insert, the dry-run) are untouched.
- [ ] Nothing in this ticket inserts a `competitions` row, writes to production or reaches
      a Base Model.
