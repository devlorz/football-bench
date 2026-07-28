# Cross-vendor Entrants with a frozen Prompt Version

The benchmark compares LLMs against each other, not against deterministic forecasters, so
the only thing that may vary between Entrants is the Base Model. We take Entrants from
three vendors (Anthropic, OpenAI, Google) and hold a single Prompt Version — template plus
context builder — frozen for the whole Season. Varying the prompt and the Base Model at the
same time would confound the two and make every Paired Difference uninterpretable.

Two Entrants from the same vendor family sit close enough that a Season's 380 Fixtures may
not resolve them; cross-vendor spread is the widest we can get without adding leagues.

## Consequences

- Changing the Prompt Version mid-Season invalidates the Season's comparisons. Prompt work
  is deferred to a later phase, run as a separate Season-scoped experiment.
- One Entrant is designated a Positive Control (a deliberately weaker Base Model). If the
  leaderboard cannot separate it from the strongest Entrant by roughly GW5, the benchmark
  is not resolving anything and the metric — not the models — is what needs attention.
- Three vendors means three prediction APIs to integrate and three independent failure
  modes in the predict job.
