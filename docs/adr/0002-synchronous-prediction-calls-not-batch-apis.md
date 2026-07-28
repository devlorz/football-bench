# Synchronous prediction calls, not Batch APIs

The predict job calls each vendor's ordinary synchronous API rather than its Batch API,
despite the 50% batch discount. Every vendor's batch SLA is "within 24 hours", which does
not fit inside the gap between a prediction run and a Friday-evening Lock, and cannot be
polled to completion inside a single GitHub Actions job.

The discount is worth roughly $20-40 across a Season. The risk it buys is that a slow
vendor queue produces Gaps for an entire Gameweek at once — missingness correlated with the
vendor rather than spread at random, which biases that Entrant's mean without making the
leaderboard look broken.

## Consequences

- A prediction run is ~30 synchronous calls and completes in about a minute, so it can be
  scheduled close to the Lock instead of a day ahead.
- `predicted_at` is unambiguous: request and response are seconds apart, so there is no
  question of whether the Lock applies to submission or completion.
- Vendor rate limits, not batch queues, are the throughput constraint.
