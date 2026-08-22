# Tickets: the Bet Slip's Handicap leg and fourth goal-total line

Two tracer-bullet slices that put a price on hedging. The slip grows from five markets to
seven, and one rescore gives every Competition's Bet Points the same meaning. Source:
[spec 0018](../specs/0018-the-bet-slips-handicap-leg.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md). Decisions:
[ADR-0040](../adr/0040-the-bet-slip-gains-a-handicap-leg-that-pays-only-for-covering.md),
amending [ADR-0023](../adr/0023-a-second-readable-ranking-reads-a-bet-slip-off-the-predicted-score.md).

Two slices and not more, deliberately. The legs and the sentence describing them land
together, because a stored row labelled "five markets" over a seven-market slip is worse
than a row with no label. ADR-0023's rule is that a value must not reach a reader without
its qualification, and a wrong qualification breaks that rule harder than a missing one.
The isolation proof lands with them because it guards the same change and would otherwise
be a ticket of nothing but tests. The rescore is separate because it acts on the live
record rather than on code, and it must not share a slice with the code it depends on.

There is nothing to prefactor. The slip is a pure function of a Predicted Score and a
result, and both new legs are additions to it.

## What changed since this ticket was written

**The slip gains two markets, not one.** Over/under 1.5 joins the three goal-total lines
alongside the Handicap. Bet Points run 0 to 7.

**Read this before building it.** Over/under 1.5 is the cheapest line on the board for the
scoreline most Entrants name, and it pulls against the Handicap leg sitting beside it.
Counted over the 3,145 matches stored for 2025-26:

| Line | Lands for the popular side |
| --- | ---: |
| over 1.5 | 74.1% |
| over 2.5 | 50.1% |
| under 3.5 | 73.6% |
| under 4.5 | 88.1% |
| margin over 1.5 (the Handicap) | 32.4% |

A 1-1 Prediction takes over 1.5 and collects it three times in four. That is the behaviour
ADR-0023 named when it recorded that the slip rewards played percentages over boldness,
and ADR-0040 exists to answer. Only the 2.5 line splits anywhere near evenly. Adding 1.5
buys resolution at the bottom of the range, where a 1-0 or 0-0 Prediction now costs
something, and it pays the cautious 1-1 slip another cheap point on the way. Both effects
are real. The ticket records them rather than choosing between them.

**Three documents still say six markets** and have to follow this one: ADR-0040, spec 0018,
and CONTEXT.md's Bet Slip and Bet Points entries. None of them mentions over/under 1.5,
which is a decision no ADR has recorded yet.

**The rescore covers four leagues, not two.** ADR-0049 opened Serie A and Ligue 1, so
`competitions` lists PL, PD, SA and FL1, with the Bundesliga waiting. The record holds 180
Bet Points rows across three scored leagues today, against the dozens this ticket assumed.

**A second reader appeared.** ADR-0051 publishes a combined ranking at `/overall` as the
raw sum of each Entrant's season-to-date Match Points and Bet Points over every scored
Competition. A rescore that reaches some leagues and not others no longer skews one table.
It publishes a sum whose parts were counted by different rules.

---

## 1 — The Handicap leg, the 1.5 line, and the sentence that describes them

**What to build:** A reader of the Bet Points ranking sees an Entrant that named a decisive
scoreline and got it right out-score one that hedged. A Predicted Score backing neither
side to win by two scores nothing on the Handicap, whatever the result does, including
when the match really was tight. The qualification sentence beside the ranking describes
the slip that now exists.

**Blocked by:** None. Can start immediately.

- [ ] The Bet Slip carries a Handicap at 1.5 goals, read off the Predicted Score alone and
      never off the probabilities.
- [ ] A Predicted Score backs a side by naming it a two-goal win. One with a margin of 0 or
      1 backs nothing.
- [ ] The Handicap is won only when a side was backed and the result covered the same way.
      **The shared value "neither side backed" must never settle as a win.** Every other
      leg is won by equality, so the shape the other legs use is the wrong one here.
- [ ] The goal-total lines become 1.5, 2.5, 3.5 and 4.5. The 1.5 line settles the way the
      other three do, with no special case: the line is a half and goals are integers, so
      no leg pushes.
- [ ] Bet Points run 0 to 7 per Fixture. `bet_hit_pct` divides by seven markets per settled
      slip, with the Handicap and the 1.5 line both present in its per-market breakdown.
- [ ] A Fixture with no result and a Gapped Fixture stay out of the denominator, unchanged.
- [ ] The Bet Points qualification states seven markets. It keeps the flat-and-oddsless
      caveat and the sentence that only the probability layer supports a claim about
      forecasting skill. It replaces the boldness clause with what is now true: the cheap
      goal-total lines, over 1.5 among them, are weighed against one market that pays only
      for naming a decisive result.
- [ ] Four Handicap settlement cases are proven through the scorer over a real database.
      Backed and covered the same way. Backed and covered the other way. Hedged against a
      decisive result. Hedged against a tight result. The last two score zero, and they are
      the behaviour the leg exists to produce.
- [ ] One case proves the 1.5 line settles both ways, since a Prediction of 0-0 or 1-0 is
      the only kind that takes the under and the suite has not needed one before.
- [ ] A test asserts the stored qualification states seven markets, so the label cannot
      drift from the slip.
- [ ] Over one seeded Season, every metric other than `bet_points` and `bet_hit_pct` is
      identical with and without the new legs, proving a change to one readable ranking is
      a change to one readable ranking.

## 2 — Every Competition's Bet Points recomputed

**What to build:** Every reader of every leaderboard, the combined one included, sees Bet
Points that mean the same thing for the whole Season, rather than five markets before a
date and seven after it.

**Blocked by:** 1.

- [ ] The rescore is rehearsed before it touches the live record, on the same terms as
      every other write against that record.
- [ ] Every listed Competition is rescored in the same pass. PL, PD, SA and FL1 today, and
      whichever leagues `competitions` lists on the day it runs.
- [ ] `/overall` is checked after the rescore, not only the per-league tables. It sums Bet
      Points across leagues (ADR-0051), so a pass that reaches three leagues of four
      publishes a sum whose parts were counted by different rules.
- [ ] The rescore reads only stored Predictions and results. No Prediction is rewritten, no
      Entrant is asked anything again, and no context is rebuilt.
- [ ] Running it twice changes nothing the first run did not, so a partial run is repaired
      by running it again.
- [ ] Match Points and every probability metric are unchanged in the live record
      afterwards, checked rather than assumed.
- [ ] It is recorded here that hit rates move for everyone, that the direction differs by
      Entrant, and that figures read before the rescore cannot be compared with figures
      read after. A cautious slip gains the over 1.5 line and loses the Handicap. A bold
      one gains both. That spread is the signal the change was made to produce.
