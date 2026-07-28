# Predictions hold only successes; attempts are logged separately

The `predictions` table holds one row per Entrant per Fixture and every row is a Prediction
that passed validation before its Lock. Failures never appear there. A separate append-only
`attempts` table records every call made to a vendor — successful or not — with the failure
reason, latency, token counts and the raw response.

The obvious alternative, a `status` column on `predictions`, was rejected: it makes every
scoring query depend on remembering a filter, and a forgotten filter corrupts results
silently rather than loudly.

Two of this benchmark's results — Gap rate on the Match track and Repairs needed on the FPL
track — are properties of failures. Without an attempts log they could only be inferred from
missing rows, which counts Gaps but cannot say whether one was a validation failure, a
vendor error or a rate limit.

## Consequences

- Scoring joins `predictions` directly with no conditions, keeping the promise that scoring
  is deterministic and auditable.
- `attempts` is telemetry and is never read by scoring code.
- Fixture identity is `(season, fpl_id)` everywhere, not the bare FPL id, which restarts
  each Season. The context hash lives on `predictions` and on the stored context, not on
  `models` or `scores`.
