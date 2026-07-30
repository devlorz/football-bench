# Each snapshot publishes against one Comparison Anchor

Nine Entrants create 36 possible pairs, enough for an all-pairs leaderboard to manufacture
spurious separations. Each cumulative Gameweek snapshot therefore publishes one complete-case
RPS comparison against its Comparison Anchor for every other Entrant retained in the Season
roster — eight comparisons with the current nine Entrants. The snapshot at Gameweek N selects
its anchor using only scoreable Fixtures attributed to `locked_in_gw <= N`: highest Match
Points, then lower RPS, then Entrant id. A later-settled deferred Fixture may update that
snapshot; data attributed to Gameweek N+1 cannot. Other pairs may be computed only as
exploratory results labelled as such. This gives the comparison policy recorded as a
consequence of ADR-0014 its own decision and persistence semantics.

## Consequences

- Selecting an anchor does not break a tie in the Match Points ranking; it only chooses the
  common reference for the declared comparison set.
- Each scoring run atomically replaces the published comparison set for every cumulative
  Gameweek snapshot it recomputes. After it commits each snapshot has one row per non-anchor
  Entrant in that Season's roster, all naming one anchor, so a former anchor's row cannot
  survive a leader change within that snapshot. Earlier Gameweek snapshots remain as
  historical records.
- Every comparison carries its Fixture count and interval. A wide interval or one spanning
  zero is a result, not a scoring failure.
