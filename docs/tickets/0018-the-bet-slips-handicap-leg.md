# Tickets: The Bet Slip's Handicap leg

Two tracer-bullet slices that put a price on hedging: a sixth market read off the same
Predicted Score as the other five, and one rescore that gives every Competition's Bet
Points the same meaning. Source: [spec 0018](../specs/0018-the-bet-slips-handicap-leg.md).
Vocabulary: [CONTEXT.md](../../CONTEXT.md). Decisions:
[ADR-0040](../adr/0040-the-bet-slip-gains-a-handicap-leg-that-pays-only-for-covering.md),
amending [ADR-0023](../adr/0023-a-second-readable-ranking-reads-a-bet-slip-off-the-predicted-score.md).

Two slices and not more, deliberately. The leg and the sentence describing it land
together because a stored row carrying a label that says "five markets" over a six-market
slip is worse than one carrying none — ADR-0023's rule is that a value must not reach a
reader without its qualification, and a wrong qualification breaks it more thoroughly than
a missing one. The isolation proof lands with them because it guards that same change and
would otherwise be a ticket of nothing but tests. The rescore is separate because it is an
act against the live record rather than a change to code, and it must not happen in the
same slice as the code it depends on.

There is nothing to prefactor: the slip is a pure function of a Predicted Score and a
result, and the leg is an addition to it.

---

## 1 — The Handicap leg, and the sentence that describes it

**What to build:** A reader of the Bet Points ranking sees an Entrant that named a decisive
scoreline and got it right out-score one that hedged. A Predicted Score backing neither
side to win by two scores nothing on the new market, whatever the result does — including
when the match really was tight. The qualification sentence beside the ranking describes
the slip that now exists.

**Blocked by:** None — can start immediately.

- [ ] The Bet Slip carries a sixth market, the Handicap at 1.5 goals, read off the
      Predicted Score alone and never off the probabilities.
- [ ] A Predicted Score backs a side by naming it a two-goal win; one with a margin of 0
      or 1 backs nothing.
- [ ] The market is won only when a side was backed and the result covered the same way.
      **The shared value "neither side backed" must never settle as a win** — every other
      leg in the slip is won by equality, so the shape the other legs use is the wrong one
      here.
- [ ] Bet Points run 0–6 per Fixture, and `bet_hit_pct` divides by six markets per settled
      slip with the Handicap present in its per-market breakdown.
- [ ] A Fixture with no result and a Gapped Fixture stay out of the denominator, unchanged.
- [ ] The Bet Points qualification states six markets, keeps the flat-and-oddsless caveat
      and the sentence that only the probability layer supports a claim about skill, and
      replaces the boldness clause with what is now true: the cheap goal-total lines are
      weighed against one market that pays only for naming a decisive result.
- [ ] Four settlement cases are proven through the scorer over a real database — backed and
      covered the same way, backed and covered the other way, hedged against a decisive
      result, hedged against a tight result. The last two score zero and are the behaviour
      the leg exists to produce.
- [ ] A test asserts the stored qualification states six markets, so the label cannot drift
      from the slip.
- [ ] Over one seeded Season, every metric other than `bet_points` and `bet_hit_pct` is
      identical with and without the leg — proving a change to one readable ranking is a
      change to one readable ranking.

## 2 — Every Competition's Bet Points recomputed

**What to build:** Every reader of either leaderboard sees Bet Points that mean the same
thing for the whole Season, rather than five markets before a date and six after it.

**Blocked by:** 1.

- [ ] The rescore is rehearsed before it touches the live record, on the same terms every
      other write against that record is.
- [ ] Every listed Competition is rescored in the same pass. One Season must not hold two
      meanings of `bet_points`, so rescoring one league and not the other is the failure
      this box exists to prevent.
- [ ] The rescore reads only stored Predictions and results: no Prediction is rewritten,
      no Entrant is asked anything again, and no context is rebuilt.
- [ ] Running it twice changes nothing the first run did not, so a partial run is repaired
      by running it again.
- [ ] Match Points and every probability metric are unchanged in the live record
      afterwards, checked rather than assumed.
- [ ] It is recorded — in this ticket — that hit rates fall across the board and that
      figures read before the rescore are not comparable with figures read after. The drop
      is the signal the leg was added to produce.
