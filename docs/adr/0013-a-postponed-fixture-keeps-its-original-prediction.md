# A postponed Fixture keeps its original Prediction

When a Fixture is postponed after its Gameweek's deadline and replayed months later, the
Predictions locked at that deadline stand and are scored when the match is finally played.
They are not voided and not re-predicted.

Those Predictions satisfy the only integrity requirement there is — they preceded the Lock,
and indeed both kick-off dates. They rest on months-old information, but equally so for every
Entrant, since all six predicted at the same deadline, so Paired Differences are untouched.

Re-predicting was rejected. It would mean two Predictions for one Fixture, which needs a new
key dimension and then a rule for which one counts — a rule that would be arbitrary however
it was written, traded for accuracy nobody can measure. It also breaks the insert-only rule
that makes manual re-runs safe.

## Consequences

- The result is attributed to the Gameweek the Prediction was locked in, not the Gameweek it
  was played in, and flagged `deferred` so the dashboard can show it. A Gameweek's row
  therefore changes months later, which is fine — scoring is idempotent and re-runnable, and
  the ranking is on the season-to-date aggregate.
- A Fixture inserted into a Gameweek whose deadline has already passed attaches to the next
  Gameweek still open, rather than becoming a Gap for everyone.
- A Fixture never played is simply never scored and drops out for every Entrant equally. No
  special handling.
