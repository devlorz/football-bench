# Illegal Gameweek actions get three Repairs, then Roll Over

Real FPL has no notion of an illegal submission — its interface prevents one — so the
benchmark has to invent the rule, and the rule chosen decides what the FPL track measures.

When an Entrant submits a Gameweek action that fails validation, the validator's reason is
sent back and the Entrant is asked to fix it, up to three times. If the third Repair still
fails, the Gameweek Rolls Over: the action is discarded and the previous Team Sheet stands,
with Free Transfers accruing normally.

Repairs are the sharpest signal this track produces. Attempts-to-legal is recorded per
Gameweek as 0/1/2/3/failed, giving 38 graded observations per Entrant per Season — where
cumulative points give one. One attempt would only ever yield pass or fail; many attempts
would let every Entrant succeed and erase the difference between them.

Rolling Over is preferred to scoring zero because zero is a punishment large enough to drown
out every other signal, while a stale Squad degrades gradually — injured players stay,
fixtures worsen — which is the hole the track exists to watch Entrants climb out of.

A Roll Over needs a previous Team Sheet, and an opening Gameweek has none. Where the third
Repair fails at an opening, nothing is stored and the run stops: the empty Squad is not a
Team Sheet to stand on, and `manager_states` is insert-only, so committing it would leave
the Exhibition Run with no players for the rest of the Season on account of one Gameweek's
four answers. The official track never reaches this — an opening is `startFplTrack`'s, which
commits all nine or none and lets the operator try again — so the case belongs to the
Exhibition Run, which opens alone (ADR-0032).

## Consequences

- Validator messages are part of the experiment. Their wording and level of detail must be
  frozen for the Season; making them more specific mid-Season changes the difficulty of the
  task while it is being measured.
- Partial application of a mixed legal/illegal action is rejected: applying transfers in
  order until one fails makes the outcome depend on an arbitrary ordering rule.
- A Repair loop is not information leakage. The message describes only the Entrant's own
  Squad, and every Entrant is held to the same rule.
