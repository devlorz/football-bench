# The Free Hit stash is part of Manager State

Every persisted Manager State must be sufficient input to the next pure reducer step. The
existing `manager_states.squad` JSONB therefore always uses one envelope shape containing the
active Squad and `free_hit_stash`. The stash is `null` outside a Free Hit; during a Free Hit it
contains the permanent Squad, its purchase prices, the permanent Team Sheet and bank while the
active Squad is temporary. The reducer restores that stash on the next step without reading an
earlier database row; no migration or history-aware exception to the fold is introduced.

## Consequences

- The Free Hit Gameweek is scored from the active temporary Squad and Team Sheet.
- During that Gameweek the top-level Team Sheet and bank describe the temporary selection;
  the stash preserves the permanent Team Sheet and bank.
- The following step restores the permanent Squad, purchase prices, Team Sheet and bank before
  applying its action. A Roll Over immediately after a Free Hit therefore stands on the
  permanent Team Sheet, not the temporary one.
- Chip inventory and Free Transfers remain in their existing top-level Manager State fields.
  The Free Hit consumes its Chip and the Free Transfer granted for that Gameweek, preserves
  previously banked Free Transfers unchanged, and lets normal accrual resume in the following
  Gameweek up to five; neither value is part of the stash.
