# Ticket: What the fifth league actually cost

**What to build:** the Bundesliga's own per-Fixture rate, read off real `attempts` rows
rather than borrowed from the league it most resembles — and the record corrected wherever
it still says four. Source:
[ADR-0054](../adr/0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md), which commits
$91.89 as an explicit projection and requires this read. Decisions: ADR-0054,
[ADR-0051](../adr/0051-a-combined-ranking-sums-the-leagues-and-publishes-what-that-costs.md).

**Blocked by:** 0060 — there is nothing to read until a Bundesliga Gameweek has settled.

**Status:** ready-for-agent

---

## What is already known

**This is the same read [ticket 0046](0046-the-price-per-fixture-is-out-of-date.md)
had to make, and the reason it exists in advance.** ADR-0049 spent a rate that had gone
stale before the decision that cited it, because nothing re-measured it between the report
and the spend. ADR-0054's $91.89 is Ligue 1's measured $0.3003 applied to 306 Fixtures —
the nearest analogue by shape, not a Bundesliga measurement — and it stands only until this
runs.

The comparison worth stating alongside it: the four-league blended rate would have said
$87.82 and Serie A's cheapest $82.47, so the projection's spread across defensible rates is
roughly ten dollars a Season. Whether the real rate lands inside it is the question.

**What still says four.** The combined ranking needs no code change — its arithmetic keeps
whatever leagues are Active and scored, its "Leagues covered" stat is computed, and its
qualification says "every league covered here". What names a number is ADR-0051's prose and
several code comments, and they become wrong the Gameweek the Bundesliga is first scored.

## Acceptance

- [ ] The Bundesliga's per-Fixture rate is read from real `attempts` rows under
      `match-bl1/2026-27-v1`, with the query beside the value.
- [ ] The Season projection and the five-Competition standing total are restated from it,
      and ADR-0054 carries an amendment banner saying what moved and what did not.
- [ ] ADR-0051's prose and the code comments that name four leagues say five, or stop
      naming a number.
- [ ] `/overall` is read with five leagues in the sum and its qualification checked against
      what the page now does.
