# Raw signals only in the Entrant context

The benchmark's goal is to separate Base Models, not to build the most accurate forecaster.
A digested forecast in the context — market odds, an Elo rating, FPL's strength ratings, a
Poisson λ — is an answer an Entrant can parrot, and every Entrant parroting the same answer
collapses the Paired Differences the benchmark exists to measure. ADR 0008 already warns
that rich context pushes Entrants together; pre-digested forecasts are the extreme of that
direction. So the Entrant context carries only raw signals that still require reasoning —
results, form, availability, shots, per-match xG — and every digested forecast lives on the
other side of the line as a Reference Line, where the spec already places `reference-odds`,
`reference-elo` and `reference-home`.

## Consequences

- Odds columns are parsed from football-data.co.uk for `reference-odds`, yet deliberately
  withheld from the context. To a reader of the fetch code this looks like an oversight; it
  is the point of this ADR.
- Per-match xG is admitted (a model's estimate of one past match, still requiring
  synthesis); the Understat service's `getMatchLambdas` output is not (a forecast of the
  Fixture being predicted).
- The exclusion holds even where it costs accuracy. An Entrant that would beat the market
  by reading it stays blind to it; how far Entrants trail the market is exactly what the
  `reference-odds` line is for.
