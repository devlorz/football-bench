# Ticket: The Nations League's base rates count the Season's own settled Fixtures

**What to build:** the `UNL` packet's base-rates line counts the Season's settled
Nations League Fixtures beside the dataset's internationals, so "to this Lock" is true
without waiting for the dataset to catch up. The same merge the recent-internationals
section already makes, applied to the one line that does not make it.

**Blocked by:** the next `UNL` Prompt Version. `match-unl/2026-27-v1` was first used at
the Gameweek 1 Lock (2026-09-24), so under ADR-0026 its rendering is frozen. This
change moves the rendering and the pin with it, so it lands only with a new version, for
example at the Edition boundary ADR-0061 describes. It is never a mid-Edition amendment.

**Status:** needs-triage — worth doing with the next version, not worth a version of its
own.

---

## What is already known

**The line, and that it is right by its own definition.** Checked on 2026-09-27 against
the Gameweek 2 packet: "internationals in every competition at a home venue,
2024-06-01 to this Lock, 576 matches: home wins 47.7%, draws 21.5%, away wins 30.7%,
2.92 goals per match."

It was recomputed outside the codebase from martj42's `results.csv` of that day, with the
fifty-four sides taken from the recorded UEFA schedule and the two spelling maps applied,
using the same filter:

- either side is one of the fifty-four;
- played from 2024-06-01 and before the Lock's UTC day;
- not at a neutral venue;
- a score recorded.

Every figure matched.

**What it leaves out.** The line reads `international_results` alone. The recent-form
lines merge in the Season's settled Fixtures from the UEFA feed; this line does not. The
dataset's newest relevant row on 2026-09-27 was 2026-07-19, so the Gameweek 1 results
(eight in the league phase's first round) are absent. As a result:

- Gameweek 1's and Gameweek 2's packets carried the same 576 matches.
- "to this Lock" really means "to the dataset's latest row".

**How much it matters.** Little today. Eight of 576 moves no share by a percentage point.
The dataset lags by days to weeks, so the gap closes on its own. The Season's results
already reach an Entrant through the recent-form lines and the group table. The case
for doing it is that the line should say what it counts.

## Acceptance

- [ ] The base-rates line counts the dataset's internationals and this Season's `UNL`
      Fixtures settled before the Lock, each match once. A Fixture the dataset also holds
      is counted from the record, keyed as the recent-form merge keys it, including a
      kickoff that falls on the next UTC day.
- [ ] A Fixture at a neutral venue is still left out. This Season's league phase is
      played home and away, but the Finals are not, and the record must know which is
      which before it can count one.
- [ ] A test pins a packet in which the dataset lags the record and one in which it has
      caught up, and both give the same line.
- [ ] Lands under the new `UNL` Prompt Version with its pin read from the render, never
      as an amendment to `match-unl/2026-27-v1`.

## What this ticket does not do

- **The leagues' base rates.** They are the prior Season's closed record (ADR-0043) and
  do not move with the Lock.
- **Change which competitions or dates the line covers.**
