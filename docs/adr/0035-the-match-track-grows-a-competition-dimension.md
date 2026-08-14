# The match track grows a Competition dimension

The match track expands beyond the Premier League — La Liga first, then Serie A, the
Bundesliga and Ligue 1. Each Competition is a separate benchmark with its own leaderboard:
the question stays "which Base Model forecasts this league best", asked once per league,
and no combined cross-league ranking is published. Comparing an Entrant across leagues is a
read-path exercise a future reader can run precisely because every row is labelled.

Every table keyed by `(season, …)` gains a `competition` column in the same key —
`gameweeks`, `fixtures`, `contexts`, `predictions`, `attempts`, `prediction_runs`,
`scores` — in one migration, applied in one pass. Without it the second league's rows are
not new rows but silent overwrites: La Liga's round 5 and Premier League Gameweek 5 are the
same `(season, gw)` today, and `prediction_runs`' upsert would replace one league's run
record with the other's without an error. Existing rows backfill `competition = 'PL'`.

Competition codes are football-data.org's — `PL`, `PD`, `SA`, `BL1`, `FL1` — matching the
schedule source chosen in ADR-0036 rather than inventing a house vocabulary. `fixtures.fpl_id`
is renamed to `fixture_id`, holding each source's native id (FPL's for `PL`,
football-data.org's elsewhere), unique within `(competition, season)`; the name stops lying
the day a second source writes it. The `track` check keeps its two values — `track` says
what kind of game is being played (match or fpl), `competition` says where — encoding both
facts in one string would be a flag where a column already answers.

One deployment runs every Competition. The scheduler stays a single loop under the existing
advisory lock, walking every Competition with work due; the league list is data, so adding a
Competition is an insert, not a workflow edit. This also never triggers the lock's
silent-skip mode, where a second concurrent runner sees an empty work list and reports
success.

## Considered Options

- **A separate deployment per league** — nearly zero schema change, since the current
  system is accidentally a one-league system already, and zero risk to the running Premier
  League record. Rejected: operations multiply per league (databases, migrations, secrets,
  monitoring), the dashboard would fetch N read APIs, and merging the records later means
  doing this migration anyway with more history to carry.
- **Growing the `track` vocabulary (`match-pd`, `match-sa`)** — rejected; it smuggles the
  Competition into a string every reader must parse, and every `track = 'match'` filter in
  the scorer and dashboard would silently stop matching.

## Consequences

- The migration touches every primary key in one pass and is rehearsed on a temporary
  Postgres before it goes anywhere near the live record. If the rehearsal is green before
  the Premier League Gameweek 1 Lock (2026-08-21T17:30Z), it applies before it and La Liga
  targets its own Gameweek 2 (22–23 August); if not, it applies after Gameweek 1 settles
  and La Liga starts at Gameweek 3. It is never applied inside a Lock window or while
  Predictions are in flight.
- It also waits for ADR-0034's roster refresh to finish rather than straddling it. That
  refresh runs in the same days under a harder cutoff (2026-08-19), and its pre-flights
  write `attempts` — one of the tables this migration rekeys. Roster first, migration
  after, La Liga last.
- Serie A, the Bundesliga and Ligue 1 open only after (1) La Liga completes one full
  fetch → Lock → predict → score cycle and (2) the real per-Fixture cost, read from Premier
  League Gameweek 1 `attempts`, is acceptable at five leagues' volume. Gameweeks those
  leagues lose while gated are gone permanently, and that is the accepted price.
- `scores`, leaderboards and the read API filter by Competition everywhere they filter by
  track today. The dashboard grows a Competition dimension in a later ADR; nothing here
  decides its shape.
- CONTEXT.md's Language updates: **Competition** enters the vocabulary, and Fixture,
  Season and Gameweek generalise — a Gameweek keeps its name and its _Avoid: matchday_,
  meaning the FPL-defined round for `PL` and the source-defined round elsewhere.
- The FPL track is untouched. It is Premier League by nature, not by accident.
