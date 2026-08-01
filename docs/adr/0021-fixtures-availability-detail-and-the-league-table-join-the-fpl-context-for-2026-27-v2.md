# Fixtures, availability detail and the league table join the FPL context for 2026-27-v2

ADR 0020 gave the pool per-player performance, but the Entrant still cannot see the world
those players play in: not who a player faces this Gameweek or whether he plays at home,
not whether a Blank or Double Gameweek is coming when a Chip is being weighed, not whether
"doubtful" means 75% or 25%, not how strong the opponent behind a Fixture is. Before the
season's first FPL Lock, the context gains three additions, shipping inside the same
frozen Prompt Version `fpl/2026-27-v2` — nothing has yet been recorded under v2's hash, so
the constant still changes once and the freeze carries spec 0005's windows and these
additions together:

- **Fixtures**, as a raw schedule of the current Gameweek and the five after it: home
  team, away team, kickoff date, one line per Fixture. A team with two lines in a
  Gameweek has a Double; a team with none has a Blank; neither is annotated, both are
  facts an Entrant reads off the list.
- **Availability detail** on each pool line that has any: FPL's
  `chance_of_playing_next_round` and the raw `news` text, omitted when empty, following
  v2's zero-omission convention.
- **The league table**, summed from the final results already stored in
  `historical_matches`: played, won, drawn, lost, goals for and against, points, in rule
  order. The table announces the date of the latest result it includes, so the stored
  text explains its own coverage.

Each addition holds ADR 0018's raw-signals line rather than bending it. The schedule is a
fact of the calendar; FPL's Fixture Difficulty Rating and team strength ratings — the
digested versions of the same information — stay out, as ADR 0018 already names them. The
league table is summation of recorded results, the same aggregation-not-digestion line ADR
0018 drew for the stat windows; Elo and any other rating stay on the Reference Line side.
`chance_of_playing_next_round` is admitted because it is the source signal behind the
`status` letter the context has shown since v1 — FPL derives `doubtful` from exactly this
percentage, so v1 was already showing a coarsened copy of it — and because it reports on
an *input* to the Entrant's decision, not a forecast of the points the Entrant is asked to
optimise, the same test that admits per-match xG.

## Considered options

- **Amending ADR 0020 or widening spec 0005** was rejected. ADR 0020 is merged with a
  self-contained argument about performance stats, and spec 0005 declares itself "v1 plus
  performance, not a rewrite"; a decision record that grows after merge stops being a
  record. This ADR pairs with its own spec (0006), which lands after spec 0005 and before
  the first Lock.
- **This Gameweek's Fixtures only** was rejected: Team Sheet decisions need only the
  current Gameweek, but Transfers and Chips are bets on the schedule ahead, and a context
  that hides the approaching Blank or Double turns Chip timing into a coin toss. **The
  whole remaining season** was rejected the way ADR 0019 rejected deeper Understat
  history: a horizon beyond the next few Gameweeks has nowhere to appear in a decision
  made now and was judged dead data. Six Gameweeks — this one and five ahead — covers the
  planning window.
- **Computing the table from FPL's own fixtures endpoint** (which carries scores) was
  rejected: it would widen the FPL fetch, the `fixtures` table and a new summation path,
  all to duplicate final results `historical_matches` already holds and the Match track
  already sums into a table for its own context. The cross-track read is accepted and is
  this ADR's one deliberate coupling: the FPL context now depends on the football-data
  results fetch having run recently, and the announced coverage date is what keeps a
  stale table honest instead of silent.
- **Tying the table's cutoff to Settled Gameweeks**, as spec 0005's stat windows do, was
  rejected. `historical_matches` is keyed by date, not Gameweek; mapping results into
  Gameweeks buys no audit value — the context is stored and hashed once, and the
  announced latest-result date already states the coverage — at the price of a mapping
  that lags reality across every midweek round.
- **Admitting the `news` text while excluding the percentage** (on the argument that a
  percentage estimate is digested) was rejected as incoherent: v1 already ships the
  percentage's coarsened derivative as `status`, so excluding the source while showing
  the derivative protects nothing.
- The token cost of the additions is small against ADR 0020's ~18k: roughly sixty
  fixture lines, twenty table lines, and news text on the few dozen flagged players.
  Per spec 0003's standing rule, the real figure is read from `attempts.tokens_in`
  after the first Gameweek, not estimated.
