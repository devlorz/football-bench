# A second readable ranking reads a Bet Slip off the Predicted Score

The match track gains a second readable ranking framed as a bettor: each Prediction's
Predicted Score is read as a five-market Bet Slip — match result, over/under 2.5, 3.5 and
4.5 goals, and both teams to score — and Bet Points award one point per market the result
settles in the Entrant's favour. Entrants are never asked these markets; every leg of the
slip, including the result leg, is derived from the one scoreline the Entrant committed,
so the slip can never contradict itself and stays disjoint from the argmax `accuracy`
metric. Stakes are flat and oddsless: no odds are stored (`reference-odds` is deferred),
and a hit-rate ranking that anyone can recompute is worth more to the readable layer than
a payout model standing on data the pipeline does not collect.

## Considered Options

- **Result leg from the `probs` argmax** — closer to how a bettor actually backs a result,
  rejected because the slip could then disagree with its own scoreline legs, it duplicates
  `accuracy`, and it drags the canonical tie-break rule into a readable metric. An
  Entrant's incoherence is already measured by Coherence; it should not leak into the slip.
- **Odds-weighted payouts** — more faithful to betting, rejected for now because it makes
  this work depend on odds ingestion that does not exist and on post-Lock information. The
  flat-stake choice is the recorded caveat: conservative low-scoring slips farm the high
  over/under lines (under 4.5 lands in roughly nine Fixtures of ten), so Bet Points reward
  playing the percentages, not boldness.
- **A declared evidential layer of its own** — rejected under ADR-0016: Bet Points derive
  from the same Predicted Scores as Match Points, so another set of declared intervals
  would multiply comparisons without adding information. The ranking is readable-only,
  labelled as ranking, carries its `n`, and any interval computed on it is exploratory.

## Consequences

- Reference Lines cannot hold Bet Points: they produce probabilities only, so there is no
  scoreline to read a slip from. This falls out of the data rather than being a rule.
- A Gap is an unplaced slip. The season-to-date total — the ranked figure, as with Match
  Points — silently forfeits up to five points, while `bet_hit_pct` divides only by
  markets actually bet, so the rate measures accuracy and the total absorbs absence.
- Bet Points and Match Points will correlate strongly; both read the same scoreline. The
  slip's value is the partial credit the exclusive 5/3/2/0 tiers cannot give — two slips
  scoring zero Match Points can still differ on every over/under and BTTS leg.
