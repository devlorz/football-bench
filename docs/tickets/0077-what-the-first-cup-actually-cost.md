# Ticket: What the first cup actually cost

**What to build:** after the first `UNL` Gameweek settles, the per-Fixture price is read
off real `attempts` rows and replaces ADR-0057's $47 ceiling, in the price report and in
the ADR's banner, the way ticket 0061 did for the Bundesliga. Source:
[spec 0027](../specs/0027-the-nations-league-opens.md) story 50. Decisions:
[ADR-0057](../adr/0057-the-nations-league-opens-as-the-first-cup-on-sources-nobody-documents.md)
("a ceiling to be re-read"), [ticket 0046](0046-the-price-per-fixture-is-out-of-date.md)
(a rate goes stale the moment the packet moves).

**Blocked by:** 0076 — and by the calendar: the first `UNL` Gameweek has to have been
predicted and settled, which is no earlier than 2026-09-26 and, if the activation misses
Gameweeks 1 and 2, no earlier than 2026-10-03.

**Status:** ready-for-agent

---

## What is already known

**The ceiling is Ligue 1's rate over a packet that is smaller than Ligue 1's.** 156 ×
$0.3003 = $46.85. The `UNL` packet carries five results a side and no league table, so
the true rate is expected below every league's; the number is unknown until read.

**The read is ticket 0061's.** Prompt and completion tokens per seat per Fixture off
`attempts`, the OpenRouter price per seat, the blended per-Fixture figure and the
per-Season projection, in the price report's own table alongside the five leagues; the
ADR gets a one-line banner naming the measured figure and the date; the standing
commitment across six Competitions is restated.

## Acceptance

- [ ] The per-Fixture rate for `UNL` is read off `attempts` rows of a settled Gameweek
      and recorded in the price report with the seat-level breakdown the other
      Competitions have.
- [ ] ADR-0057 carries a banner with the measured rate, the date, and the revised
      per-Season figure; the six-Competition standing commitment is restated.
- [ ] No Base Model is reached by this ticket; it reads the record only.
