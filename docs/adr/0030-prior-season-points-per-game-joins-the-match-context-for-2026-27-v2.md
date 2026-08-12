# Prior-Season points per game joins the match context for 2026-27-v2

Each club section carries a Prior-Season final position line and, since ADR-0022, its
current-Season aggregates — but nothing that makes two clubs' prior seasons comparable when
one of them played in the Championship. The five-match form window shows a promoted club
beating Championship opposition and says nothing about how hard that season was; "1st in
2025-26 Championship" states a rank, not a rate. One line closes the gap:

> Prior-Season points per game: 1.08 overall, 0.79 home, 1.37 away.

It renders under the final-position line for both clubs, every Gameweek of the Season, two
decimals, computed from the stored `historical_matches` record of the club's own prior
division — the division the sibling line already names. A promoted club therefore shows
Championship figures beside an opponent's Premier League ones, and the cross-division
reading is left to the Entrant, which is the point: ADR-0018 admits raw signals that still
require reasoning, and a rate in a named league is exactly that.

The line ships as an amendment to `match/2026-27-v2` under ADR-0026 — the freeze binds at
first use, and the freeze counts were re-verified at zero across `contexts`, `predictions`
and `attempts` — in the same amendment, SHA re-pin and pre-flight as ADR-0031's section,
before Gameweek 1's Lock.

## Considered options

- **Fading the line once current-Season aggregates thicken** (say GW8) was rejected: the
  sibling final-position line shows all Season, a second rendering doubles what the
  contract test must pin, and deciding when history stops mattering is the Entrant's
  judgment, not the builder's.
- **Goals for and against per game** were rejected: the league table and the ADR-0022
  aggregates already carry per-club goal records; points per game is the one figure
  absent.
- **Normalising Championship figures toward a Premier League scale** was rejected
  outright: a conversion factor is a forecast, and ADR-0018 places every forecast on the
  Reference Line side of the boundary.

## Consequences

- The prompt grows one line per club, every Fixture, all Season.
- The figures describe a finished season and never change; the daily fetch does not touch
  them.
- The motivating example is real: Tottenham's 2025-26 line reads 1.08 overall, 0.79 home,
  1.37 away — an away-better-than-home inversion that neither the final position nor the
  form window states.
