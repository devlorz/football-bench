# Six Entrants, frontier and open-weight, all through OpenRouter

The Match track runs six Entrants: three frontier Base Models (Claude, GPT, Gemini) and
three open-weight ones (Kimi, GLM, DeepSeek). Every call goes through OpenRouter rather than
each vendor's own API, so the predict job has one client, one credential and one error
surface — which is what makes the write path buildable before the first Gameweek.

No Positive Control is included. ADR 0008 expected one to carry the weight of proving the
setup can resolve anything; that expectation is knowingly dropped here.

## Consequences

- A confidence interval spanning zero between two Entrants is ambiguous: it cannot
  distinguish "these Base Models are genuinely close" from "this setup resolves nothing."
  No result in this benchmark can rule out the second reading.
- OpenRouter is a single point of failure for every Entrant at once. A vendor outage would
  have cost one Entrant; an OpenRouter outage across both the main and fill runs costs the
  whole Gameweek — ten Fixtures, permanently.
- Every request pins its provider (`provider.order` with one slug, `allow_fallbacks: false`,
  an explicit `quantizations` filter). Without pinning, OpenRouter may serve an open-weight
  Base Model at a different quantization from week to week, which measures the host rather
  than the model. A pinned provider that is unavailable produces a Gap, which is the honest
  outcome.
- The resolved provider and model version returned in each response are recorded in
  `attempts`, so a vendor swapping a snapshot underneath a stable model name is detectable
  after the fact.
