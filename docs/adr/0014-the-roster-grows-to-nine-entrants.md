# The roster grows to nine Entrants

Grok, Qwen and MiniMax join the six of ADR-0009, giving three frontier Base Models (Claude,
GPT, Gemini), one more first-party (Grok) and five open-weight (Kimi, GLM, DeepSeek, Qwen,
MiniMax). All still run through OpenRouter with their provider and quantization pinned.

## Consequences

- Cost rises to roughly $3-4 per Gameweek on the Match track, about $130 for a Season. Not a
  constraint.
- The complete-case intersection shrinks. At a 2% Gap rate per Entrant, the share of Fixtures
  where all nine produced a Prediction falls from about 89% to about 83%, costing roughly
  twenty Fixtures across a Season and widening every interval by around 3%. Real, and modest.
- Blocked Gaps matter more than scattered ones. If each Entrant has a 2% chance of losing a
  whole Gameweek to its pinned provider, the chance that *some* Entrant does rises to about
  17% per Gameweek — roughly six Gameweeks a Season where the intersection loses everything.
  This is the cost of ADR-0011's complete-case rule, and it grows with the roster.
- Nine Entrants make 36 pairs. Testing all of them would produce one or two spurious
  separations by chance alone. The leaderboard therefore publishes intervals **against the
  current leader only** — eight comparisons, declared in advance — and any other pair is an
  exploratory look, labelled as such.
- The pre-flight refusal check now covers nine Base Models. Probability forecasting sits near
  betting, and content policy varies more across this roster than across the original three.
