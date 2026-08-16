# The Bet Slip gains a Handicap leg that pays only for covering

The Bet Slip grows from five markets to six: a Handicap leg at 1.5 goals joins the match
result, the three goal-total lines and both teams to score. Like every other leg it is
read off the one Predicted Score the Entrant committed and nothing else — Entrants are
still never asked a market — and the line is a constant rather than a bookmaker's, because
this pipeline stores no odds and ADR-0023's reasons for refusing them are unchanged.

**The leg pays only for covering.** A Predicted Score backs a side when it has that side
winning by two goals or more; a scoreline that backs neither side has taken no position
and cannot win the leg, whatever the result does. So a 1-1 Prediction scores nothing here
against a 3-0 result, and nothing against a 2-1 result either.

This is the one leg in the slip that can be lost without being wrong, and that asymmetry
is the whole point of adding it. ADR-0023 recorded the flaw it is answering, in its own
words: the slip's flat, oddsless lines mean "conservative low-scoring slips farm the high
over/under lines … Bet Points reward playing the percentages, not boldness". La Liga's
opening Gameweek is what that looks like in the record — nine of ten seats named 1-1 for
Alavés v Getafe, which finished 3-0, and all ten named 1-1 for Sevilla v Rayo, which
finished 2-1. A leg that only pays for naming a decisive winner puts a price on the
caution the rest of the slip rewards.

## Considered Options

- **Two complementary handicap sides (Home −1.5 against Away +1.5)**, settled the way
  every other leg settles — the side the Predicted Score took against the side the result
  took. Rejected because it hands the cautious slip a free point: a 1-1 Prediction reads
  as backing Away +1.5, which wins whenever the away team is not beaten by two, and most
  matches are not. Measured against the two settled Fixtures above it pays the 1-1 slips
  one point and two points respectively — the exact behaviour this leg exists to stop.
- **A three-way margin leg (home / away / neither)**, where a cautious scoreline backs
  `neither` and wins when the match really is tight. Rejected as too generous for what it
  claims: "this will be close" is a real forecast, but it is already carried by the result
  leg and the goal-total lines, and paying for it again is the double counting the slip
  was designed to avoid.
- **A second line at 2.5**, mirroring the three goal-total lines. Rejected for now: nested
  lines measure degrees of confidence on the *same* axis, and one axis of margin against
  three of total is already the balance this slip wants. A second margin line can be added
  later without disturbing the first.
- **A bookmaker's handicap per Fixture.** Rejected on ADR-0023's grounds, unchanged: no
  odds are stored, `reference-odds` is still deferred, and a line taken from a market
  after the Lock would put post-Lock information into a metric read off a pre-Lock
  commitment.

## Consequences

- **The whole Season is rescored, both Competitions together.** The slip is derived, so
  every figure it produces can be recomputed from Predictions and results already stored;
  no Prediction is touched and no Entrant is asked anything again. This is the difference
  between changing the scoring layer and changing a context, which can never be
  back-filled — and it is why the leg may be added mid-Season at all. Rescoring one
  Competition and not the other would leave one Season with two meanings of `bet_points`.
- **`bet_hit_pct` changes underneath its own name.** It is the share of a slip's markets
  that won, so its denominator moves from five to six while the numerator barely moves for
  a cautious slip. Every Entrant's hit rate falls, and the fall is the signal rather than
  a defect. Figures read before the rescore are not comparable with figures read after.
- **`bet_points` moves from 0–5 to 0–6 per Fixture**, and every reader of the ranking —
  the dashboard among them — reads a maximum it never stated.
- **The Bet Points qualification sentence is rewritten**, because it currently says "five
  flat, oddsless markets" and asserts that the slip rewards played percentages over
  boldness. Both halves stop being true. The replacement states six markets and says that
  the cheap goal-total lines are now weighed against one leg that pays only for calling a
  decisive result. The sentence travels with every row a ranking can be read off, for the
  reason ADR-0023 gave: a value must not reach a reader without it.
- **Match Points, the probability metrics and Coherence are untouched.** This changes one
  readable ranking. Whether one Entrant forecasts better than another is still only
  supported by the probability layer's Paired Differences and their interval (ADR-0016).
