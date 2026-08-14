# Tickets: the roster refreshes to ten Entrants

Four slices that take the codebase from ADR-0014's nine to ADR-0034's ten: a prefactor
that gives the rehearsal's world a falling price, the atomic move of everything the
roster size guards, the dashboard skeleton, and the tests that prove the road in refuses
its half-done states. Source: [spec 0015](../specs/0015-the-roster-refreshes-to-ten-entrants.md).
Vocabulary: [CONTEXT.md](../../CONTEXT.md). Decisions: [ADR 0001–0034](../adr/), especially
[ADR-0034](../adr/0034-the-roster-refreshes-to-ten-entrants-before-the-first-lock.md).

The size guard couples on purpose: the roster constant, its declared size and the
rehearsal's seat script must move together or the guards fire — which is why the second
slice is atomic and the first exists to keep it small. The road-in tickets change no
behaviour; they prove the loudness the spec's Further Notes warns an implementer not to
relax.

---

## A price falls in the rehearsal's world

**What to build:** The rehearsal's replayed world contains a player whose price has fallen
since a seat bought him, named and asserted, with all nine current seats leaving him
untouched. This is the prefactor that makes the faller seat a script rather than a data
expedition: the fall exists, nobody trades on it yet, and every existing expectation holds
to the point.

**Blocked by:** None — can start immediately.

- [x] A named player's price is lower in a later rehearsed Gameweek than the price a seat
      paid for him
- [x] No existing seat buys or sells that player, and every existing seat's expectations
      pass unchanged
- [x] The fall is asserted by the rehearsal suite, so a future edit that flattens the
      price is caught here and not by the faller's arithmetic going quietly right

## Ten seats of record

**What to build:** The roster of record holds ADR-0034's ten — the Qwen and Grok
successions, Muse Spark 1.2 as a first-party seat — and everything the size is
load-bearing for moves in the same change: the declared size, the tenth rehearsal seat
("faller", selling the fallen player at his lower current price with no half-rise), and
the prose that still says nine or cites ADR-0014 as the size in force. One command against
a local database enters ten seats; the rehearsal runs and verifies ten.

**Blocked by:** "A price falls in the rehearsal's world".

- [x] Entering the roster writes ten Entrant rows at the frozen Prompt Version, and
      re-entering is idempotent
- [x] A roster constant whose length disagrees with the declared size is refused at the
      entry door
- [x] The DeepSeek and Gemini seats are byte-for-byte the seats of ADR-0014's roster
- [x] Muse Spark 1.2 and Grok 4.6 carry a provider pin and no quantization; Qwen3.8 Max
      carries its predecessor's single-endpoint justification in place
- [x] The faller seat's bank after selling proves the Selling Price of a fallen player is
      his lower current price, and the rehearsal verifier counts ten seats
- [x] No comment or docstring in the changed modules states nine as the size in force

## The skeleton holds ten rows

**What to build:** The leaderboard's loading state renders ten placeholder rows, so the
page does not move when the real ten land — the one dashboard change the refresh needs,
because every other surface reads the roster from the data.

**Blocked by:** "Ten seats of record".

- [x] The loading skeleton renders exactly as many rows as the Season Roster holds
- [x] The comment beside it still explains why the count is fixed rather than guessed

## The road in is loud

**What to build:** Proof that the operator's path from nine to ten cannot be walked half
way in silence: a full pre-flight against a table still holding the outgoing seats is
refused by count, one holding fewer than ten likewise, and a temporary Exhibition row is
checked alone through the door ADR-0032 built — while an Entrant row through that same
door is refused by role. No production behaviour changes; the tickets before this one
made the states possible, this one pins them down.

**Blocked by:** None — can start immediately.

- [ ] A roster pre-flight expecting ten refuses a table holding eleven or twelve Entrant
      rows at the frozen Prompt Version, naming both numbers
- [ ] A roster pre-flight expecting ten refuses a table holding nine
- [ ] A single temporary `role = 'exhibition'` row is pre-flighted alone, touching no
      Entrant row
- [ ] An Entrant row aimed at the Exhibition door is refused by role, so a typo cannot
      check the wrong thing
