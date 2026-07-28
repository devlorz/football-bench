# Two output layers: points for the leaderboard, probabilities for the evidence

Each Match track Prediction carries both a probability distribution over Home/Draw/Away and
a Predicted Score. One call, one context, one Lock. The public leaderboard ranks Entrants by
Match Points scored from the Predicted Score; the probabilities carry every claim the
benchmark actually makes.

Match Points alone would not support a claim. Exact-score hit rate tops out near 12% even
for a forecaster that knows both sides' true scoring rates, so the point scheme quantises a
rich forecast into four levels and lets the rarest, most random of them dominate the
variance. Separating two Base Models on Match Points needs on the order of a thousand or
more Fixtures — several Seasons — against roughly 125 for RPS on Paired Differences.

Match Points are kept anyway because "580 points to 545" is legible to anyone and "0.198 to
0.201 RPS" is not, and a benchmark nobody can read is a benchmark nobody checks.

## Consequences

- Two leaderboard layers. Rank by Match Points; the Paired Difference intervals on RPS state
  whether that rank is distinguishable from noise. Neither is published without the other.
- Match Points tiers are exclusive, not cumulative: exact score 5, correct goal difference 3,
  correct outcome 2, otherwise 0. The three nest strictly, so cumulative scoring would only
  rescale.
- The weight on an exact score is a dial between legibility and noise. At 5 it contributes
  about a third of the average score and over half the variance. Lowering it would steady the
  ranking; it is kept because the ranking is the readable layer, not the evidential one.
- Coherence — whether the argmax of an Entrant's probabilities agrees with the outcome its
  Predicted Score implies — is measurable for free and is a real signal of internal
  consistency.
- Reference Lines produce probabilities but no scoreline, so they appear on the RPS layer
  only and never on the points leaderboard. They were never ranked in any case.
