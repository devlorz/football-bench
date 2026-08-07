# A Prompt Version no context has used may still be amended

A Prompt Version is a frozen pair, and ADR 0017's discipline is that whatever was
recorded under a version's hash stays attributable to it. This ADR records the boundary
of that discipline: the freeze binds at first use, not at merge. `fpl/2026-27-v2` has
been merged, spec-complete and closed for weeks — and no production context has ever
been stored under its hash, because the FPL track has not opened. Text nothing has been
recorded against can still be corrected, and one correction earns it: the season's dry
opening showed two Base Models independently burning four to five Repair turns on the
identical misreading — that an opening Squad arrives through the Team Sheet rather than
through `transfers_in`. An ambiguity every reader trips over equally is noise, not the
signal the track exists to measure. So the opening line of the Manager State section
grows one sentence before the season's first Lock:

> Squad: none yet — this is your opening Squad. Buy all fifteen players through
> transfers_in; transfers_out stays empty.

## Considered options

- **Waiting for a v3** was rejected: v2's first use is still ahead, so waiting converts a
  free correction into a season of predictable Repair spend — every future seat that
  opens a Squad pays the same avoidable turns, at ~26k input tokens each.
- **A permanent rule line shown every Gameweek** was rejected: the confusion is
  opening-specific, the builder already branches on the empty Squad, and the sentence
  belongs exactly where the two confused models were reading when they misread.
- **Leaving it to the Repair loop** was rejected: Repairs exist to measure how a Base
  Model recovers from its own failures, not to route every Entrant through the same
  ambiguity toll. Paired Differences lose nothing by removing a cost all seats paid
  alike.
