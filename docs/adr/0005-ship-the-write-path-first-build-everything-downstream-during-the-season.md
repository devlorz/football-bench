# Ship the write path first, build everything downstream during the Season

There are roughly two and a half weeks until the first Gameweek, and the scope settled in
ADRs 0001-0004 is larger than the original plan. Rather than cut the design, we cut what has
to exist on day one.

Only the write path is time-critical: fetching, building context, calling the three vendors,
validating, enforcing the Lock, and writing immutable Predictions and raw snapshots. Because
Predictions are immutable and everything downstream is deterministic and re-runnable from
stored data, scoring, Reference Lines, confidence intervals and the dashboard can all be
built after the Season starts and back-filled at no cost. The FPL track is deferred entirely
and joins at whatever Gameweek it is ready.

## Consequences

- A missed Gameweek on the Match track destroys ten Fixtures of sample permanently — the
  scarce resource is calendar time before mid-August, not engineering time overall.
- Deferring the FPL track costs almost nothing, because that track carries one season path
  per Entrant either way; a 33-Gameweek path tells the same story as a 38-Gameweek one, and
  the first Chip set still runs to GW19.
- Snapshotting raw fetch responses and the exact context handed to each Entrant is
  non-negotiable from the first run. It is the one thing that cannot be reconstructed later,
  and it is the first thing that gets dropped under time pressure.
- A shadow-mode rehearsal was rejected: scoring bugs are re-runnable and context bugs hit
  every Entrant equally, so the only unrecoverable failures are a missing Prediction or one
  whose Lock cannot be proven — neither of which a rehearsal prevents.
- The 2026/27 FPL API is not live yet, so the fetch layer is built against last season's
  response shape with time reserved for the shape to have changed.
