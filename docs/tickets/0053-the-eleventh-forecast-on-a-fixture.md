# Ticket: The eleventh forecast on a Fixture, and the ten that stay ten

**What to build:** A reader looking at a played Fixture sees what the Exhibition Run forecast
for it beside the ten Entrants' forecasts, labelled and caveated. A Fixture it has not
answered — one still to be played, or one its replay Gapped — carries the same ten slots it
carries today, and the Exhibition Run is simply absent from it. Its presence is the signal:
it appears exactly where it answered, so a played Fixture without its row reads as the Gap it
is. Source: [spec 0026](../specs/0026-exhibition-runs-reach-the-remaining-surfaces.md).
Decision: [ADR-0052](../adr/0052-an-exhibition-run-shows-up-wherever-it-answered.md).

**Blocked by:**
[0052](0052-the-record-behind-an-exhibition-runs-rank.md) — the shared row-selection condition
lands there, and a second copy of it here is the thing that ticket exists to prevent.

**Status:** ready-for-agent

---

## What is already known

**The ten-slot invariant is the reason for the conditional row.** That page holds the same ten
seats in the same order on every Fixture on purpose, and the comment saying so names what it
buys: it is what makes a Gap a slot rather than a shorter list. An empty slot there means one
thing — this seat was asked before the Lock and did not answer. An Exhibition Run on an
unplayed Fixture was never asked and by construction cannot be until the match is over, so
giving it a slot would spend the page's only signal for a Gap on something that is not one, on
every unplayed Fixture of every league, for a row that is not competing.

**So the row is appended, never blank.** The roster's ten stay first and in id order; an
Exhibition slot joins a Fixture only where a Prediction exists. A third "not yet run" state was
considered and rejected — it invents a state on every Fixture row in four leagues to say "this
is not a Gap", which is what absence already says.

**Ligue 1 is where the negative case is real.** Its Exhibition Run answered four of six played
Fixtures: two calls returned HTTP 429, `rate_limit` is no Repair's business, and the asking
ended there. Those two Fixtures are the live example of a played Fixture that must carry ten
slots and not eleven.

**The end-to-end assertion belongs here**, because this is the ticket after which all three
surfaces exist and one reader's journey crosses them.

## Acceptance

- [ ] A played Fixture the Exhibition Run answered carries its forecast as an eleventh slot,
      after the roster's ten, which keep their order
- [ ] A Fixture the Exhibition Run has not answered carries exactly the ten slots it carries
      today — whether the Fixture is unplayed or was played and Gapped
- [ ] The Exhibition slot carries the "ran after Gameweek N" label, and the body carries the
      recall-versus-skill caveat exactly when such a slot is in it
- [ ] The endpoint selects its rows through the condition ticket 0052 shared, not a copy
- [ ] With no Exhibition Run seated, the body is byte-identical to what it answers today
- [ ] Every roster figure on the page is identical with the Exhibition rows present and absent
- [ ] One end-to-end pass proves a reader's journey: a Competition with an Exhibition Run that
      answered some Fixtures and not others returns the same row, under the same label, from
      the leaderboard, the Fixture page and the record — and returns no eleventh slot on the
      Fixtures it Gapped
