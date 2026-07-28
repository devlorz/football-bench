# A Fixture owns its locked Gameweek

A Fixture has one Lock shared by every Entrant, so `fixtures.locked_in_gw` is the canonical
Gameweek whose deadline locked its Predictions. `predictions` does not repeat the Gameweek:
doing so would duplicate one fact across nine rows, permit Entrants on the same Fixture to
disagree, and leave an all-Gap Fixture with no record of which Gameweek owned it.

## Consequences

- Once set, a Fixture's locked Gameweek is immutable even if its scheduled Gameweek changes.
- The database refuses a Prediction until its Fixture has a locked Gameweek, so every
  Prediction has a path to one authoritative deadline.
- Scoring attributes a Prediction through its Fixture's locked Gameweek.
- Every Gameweek reference has a database foreign key to `gameweeks`; a Lock cannot point to
  a deadline that does not exist.
