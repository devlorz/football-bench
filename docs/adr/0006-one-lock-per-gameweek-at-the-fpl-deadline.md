# One Lock per Gameweek, at the FPL deadline

Every Prediction for a Gameweek locks at that Gameweek's FPL deadline, regardless of when
the Fixture kicks off. A Monday Fixture is locked on Friday. The original plan locked each
Fixture at its own kick-off, which would have meant three or four prediction runs per
Gameweek.

Locking per Fixture would let a Monday Fixture's context include Saturday's results from the
same Gameweek, so Entrants would hold different information about different Fixtures within
one Gameweek and the Gameweek would stop being a coherent unit of comparison. It also
multiplies the moments where a failed job costs Fixtures permanently.

Predictions for late Fixtures are made on staler information than they could be, but equally
stale for every Entrant, and this benchmark only claims comparisons.

## Consequences

- One `predicted_at` and one context hash per Entrant per Gameweek. Verifying the Lock held
  is a single query.
- The Match and FPL tracks share one Lock, so one run can serve both.
- The run schedule is a main run at deadline minus six hours and a repair run at deadline
  minus two hours which only fills Fixtures that have no Prediction yet — safe because
  Predictions are insert-only and the repair run cannot overwrite.
- The repair run must reuse the main run's stored context verbatim rather than rebuild it.
  Rebuilding would hand late-filled Entrants fresher information than their peers.
