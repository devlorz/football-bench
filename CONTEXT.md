# Football Benchmark

A benchmark that measures how well LLMs forecast Premier League outcomes, by comparing
LLMs against each other on identical information under a verifiable pre-kickoff lock.

## Language

### Competitors

**Entrant**:
One competitor on the leaderboard — a Base Model paired with a Prompt Version. One row in
the `models` table. Entrants are what the leaderboard ranks.
_Avoid_: model (ambiguous — means Base Model, Entrant, or Prompt Version depending on who's speaking)

**Base Model**:
The underlying LLM an Entrant calls, e.g. Claude Opus 5, GPT-5, Gemini 3 Pro.
_Avoid_: model, LLM

**Prompt Version**:
A frozen (prompt template + context builder) pair. Held constant across all Entrants within
a season so that any difference between them is attributable to the Base Model alone.
_Avoid_: prompt variant, prompt config

**Reference Line**:
A deterministic, non-LLM forecaster (home prior, Elo, market odds) shown alongside Entrants
for orientation. Reference Lines are not ranked and cannot win.
_Avoid_: baseline as a competitor (a Reference Line never competes)

### Forecasting

**Fixture**:
One scheduled Premier League match, unique within a Season.

**Gameweek**:
The FPL-defined round of Fixtures. The unit of prediction batching and of leaderboard updates.
_Avoid_: matchday, round, GW week

**Season**:
One Premier League campaign, e.g. `2026-27`. The outer scope of every identifier — Fixture
and player IDs are only unique within a Season.

**Prediction**:
What one Entrant submits for one Fixture: a probability distribution over Home / Draw / Away
together with a Predicted Score. Immutable once written.

**Predicted Score**:
The exact scoreline an Entrant names for a Fixture. Scored into Match Points; also the basis
for Coherence.

**Match Points**:
The readable score for one Fixture — 5 for an exact Predicted Score, 3 for the right goal
difference, 2 for the right outcome, 0 otherwise. Tiers are exclusive. Ranks the public
leaderboard but supports no claim on its own.

**Coherence**:
Whether an Entrant's most likely outcome under its probabilities matches the outcome its
Predicted Score implies. Saying Home is likeliest and then naming a 1-2 scoreline is
incoherent.

**Lock**:
The instant after which a Prediction for a Fixture is no longer eligible. A Prediction is
only scored if it existed before its Lock. Every Entrant for a Fixture shares the same Lock.

**Gap**:
A Fixture for which an Entrant produced no valid Prediction. Gaps are recorded, never
back-filled, and their rate is itself a reported result.

### Fantasy

**Squad**:
The 15 players an Entrant owns. Persists across Gameweeks and changes only through
Transfers.
_Avoid_: team (means Squad, Team Sheet, or a real Premier League club)

**Team Sheet**:
An Entrant's choices for one Gameweek: which eleven of the Squad start, the order the bench
is used in, and which player is captain and vice-captain.
_Avoid_: lineup, XI

**Manager State**:
Everything an Entrant carries between Gameweeks: its Squad with the price paid for each
player, money in the bank, Free Transfers banked, and Chips not yet spent. Rebuilding it
requires replaying every prior Gameweek.

**Transfer**:
Swapping one owned player for one unowned player. Each Gameweek grants one Free Transfer,
bankable to five; going beyond the banked count costs a Hit.

**Hit**:
The -4 point penalty for a Transfer beyond the banked Free Transfers.

**Chip**:
A single-use modifier to one Gameweek — Wildcard, Free Hit, Triple Captain, or Bench Boost.
Two sets per Season, one per half; the first-half set expires at the GW19 deadline unspent.

**Repair**:
A second chance at a Gameweek action that failed validation, given together with the reason
it failed. Three are allowed. How many an Entrant needs is a recorded result.

**Roll Over**:
What happens when an Entrant's Gameweek action is still illegal after its third Repair —
the action is discarded and the previous Team Sheet stands. Never a score of zero; the
Squad simply goes stale.

**Selling Price**:
What an Entrant receives for a player it owns: what it paid, plus half of any rise since,
rounded down. Distinct from the player's current price, and the reason Manager State must
record purchase prices.

### Scoring

**Paired Difference**:
For one Fixture, the difference between two Entrants' scores on that same Fixture. The unit
of comparison on the leaderboard — it cancels out how hard the Fixture was and leaves only
which Entrant forecast it better.
