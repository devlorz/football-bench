# Ticket: `/overall` sums the club cups with the leagues' Edition 2

**What to build:** `/overall` ranks one total per Base Model across the five leagues'
Edition 2 and every club cup that is Active and scored: `UCL` from its first scored
Gameweek, then `UEL`, then `UECL`. Each cup's body carries Edition 1 and the leagues'
carry Edition 2, and the page still shows a total and not "mixed Editions", because a set
is now the Competitions whose current Edition seats the same roster of record. The
qualification names the set's Competitions as they arrive with the bodies, keeps the
Nations League clause, and gains one frozen line saying what the cups add to a raw sum.
`/edition-1/overall` is unchanged. `UNL` is in no set on either page. Each cup stays its
own view in the switcher as well.

Source: ADR-0063 *The club cups join the leagues' current Edition set* (amended
2026-10-12), ADR-0051 (raw, un-normalised sum; Active and scored), ADR-0061 (Editions),
spec 0028 stories 69–69b.

Decisions it must not bend:
- ADR-0051: the sum is raw and never normalised.
- ADR-0060: `UNL`'s roster is its own.
- ADR-0061 rule 3: the cups' first Edition is numbered 1, and this ticket does not
  renumber it.
- Policy from data: set membership is read off the roster of record, which every reader
  already has. It is never a flag and never a list of codes.

**Blocked by:** 0102 (the caveats and the Edition 1 roster) and 0106 (`UCL` Active).
`UEL` and `UECL` join the sum the day each is Active and scored, with no further code.

**Status:** ready-for-agent

---

## What is already known

- **The league test today is "has no roster caveat"**, and it decides three things: the
  set's Competitions, the switcher's set views, and which bodies the overall view
  receives. The three club cups carry a caveat (ticket 0102), so this ticket replaces
  that test with roster identity: a Competition is in the current set when its current
  Edition's roster of record is the same entrants, by identity, as the set's. The caveat
  goes back to being only what a reader is told.
- **The overall view refuses bodies whose Edition numbers differ** and returns
  `mixed-editions`. That refusal now compares the rosters the bodies were ranked under.
  Two bodies with the same roster and different numbers are summed. Two with different
  rosters are still refused by name, which is the case the refusal exists for (ADR-0061).
- **`/edition-1/overall`** sums the leagues' Edition 1, the Season Roster's ten. No cup's
  Edition 1 seats those ten, so none joins that set, and it renders exactly as it does
  today.
- **The Nations League clause** ("the Nations League is not in it, because its roster is
  not the leagues'") stays and stays true. The set clause names the set's Competitions
  from the bodies, so it grows with the cups and is not rewritten.
- **The new frozen line**, a constant, should say that the three cups' league phases add
  at most 342 Fixtures, start later and end earlier than the leagues' Edition 2, and
  weigh in the raw sum by their Fixture count. Its wording is drafted in this ticket and
  recorded in ADR-0051's third amendment.
- **ADR-0051 gains a third amendment** and CONTEXT.md's *Edition set* entry moves: "the
  Competitions whose current Edition seats the same roster of record", replacing "the
  same-numbered Edition of each league". The *Combined Ranking* entry counts the cups.
- Exhibition Runs follow ADR-0052 as they do today. A cup's Exhibition rows are summed
  on the same terms as a league's.

## Acceptance criteria

- [ ] With `UCL` Active and scored, `/overall` ranks the eight with each total equal to the sum of the five leagues' Edition 2 and `UCL`; the page shows a total, not "mixed Editions".
- [ ] A body with a different roster (`UNL`'s seven, or a hypothetical cup with a seat changed) is still refused or left out by name.
- [ ] `/edition-1/overall` renders byte-for-byte as before.
- [ ] The switcher shows each cup both inside the current set and as its own view; `UNL` only as its own view.
- [ ] The qualification names the set's Competitions from the bodies, keeps the Nations League clause, and carries the new frozen line.
- [ ] ADR-0051's third amendment and CONTEXT.md's *Edition set* and *Combined Ranking* entries are written.
- [ ] The touched dashboard suites pass (`dashboard-competition-view` and the overall view's).
