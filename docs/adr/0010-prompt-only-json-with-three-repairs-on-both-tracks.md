# Prompt-only JSON, with three Repairs on both tracks

No request sends `response_format`. Every Entrant is asked for JSON in the prompt and nothing
constrains its decoding. Invalid output earns three Repairs on both tracks, aligning the
Match track with the FPL track's rule from ADR 0004.

Structured output support on OpenRouter varies by Base Model and by serving provider, so
enabling it where available would give some Entrants guaranteed-valid JSON and leave others
to manage on their own. Gap rate would then measure which Entrants the gateway happens to
support well, not how reliably each Base Model follows instructions.

Enabling it for everyone and dropping Base Models that cannot comply was also rejected: it
narrows the roster, and it drives Gap rate and Repairs to zero for every Entrant, deleting
two of the few metrics this benchmark can actually resolve.

## Consequences

- Malformed output is a measurement, not an accident to be engineered away. Fixtures lost to
  formatting rather than forecasting are a real and reported failure mode.
- Attempts-to-valid has one definition across both tracks: 0/1/2/3/failed.
- The original one-retry rule was written when predictions went through a Batch API and a
  retry cost a day. Synchronous calls make retries nearly free, so the limit is now set by
  what keeps the metric informative rather than by what it costs.
