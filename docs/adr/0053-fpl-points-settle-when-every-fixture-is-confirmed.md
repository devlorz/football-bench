# FPL points settle when every Fixture is confirmed

The FPL track originally gated a Gameweek's points settlement on `events[].data_checked`. In
practice, FPL's event-level `data_checked` flag lags hours after every Fixture in the Gameweek has
finished (and days after its opening match), even when live player points and bonus are already
present and static in the payload (observed at Gameweek 1, where `data_checked` remained false
thirteen hours after the final whistle with bonus already awarded). During this lag, the FPL
leaderboard sat blank and Squads pages showed locked Gameweeks as unsettled with no points.

A Gameweek's per-player points now settle and are scored as soon as every scheduled Fixture in
that Gameweek reports `finished`, or when FPL reports `data_checked` (read as either-or).

## Considered options

- **Waiting on `data_checked` alone** was rejected because it introduces unnecessary delays to
  leaderboard and Squads publishing while waiting on an event flag that changes no player scores
  once bonus is confirmed.
- **Using the Match track's `isOver` (`finished || finished_provisional`)** was rejected.
  Ticket 0042 / spec 0002 allows provisional results for scorelines because bonus points cannot
  move match scores. However, bonus points do move a player's points total, so the FPL track
  must wait for `finished` (confirmed bonus) on every match before scoring. A Fixture that is
  only `finished_provisional` leaves the Gameweek unsettled so bonus is not stored as zero and
  corrected later.
- **Dropping `data_checked` entirely** was rejected because the rehearsal harness, dry run, and
  Exhibition replays state settlement by flipping `data_checked` on archived byte snapshots.
  Retaining `data_checked` as an alternate condition keeps those test harnesses working without
  synthesising per-Fixture flags.
- **Provisional player points in the Entrant context** remains rejected. ADR-0020's rule stands:
  a Gameweek that has not settled is announced as absent, never estimated. The Entrant context
  follows the exact same gate (row presence in `fpl_player_points`), which now populates when all
  Fixtures reach `finished` rather than waiting on `data_checked`.

## Consequences

- **Late corrections**: The points table (`fpl_player_points`) remains mutable (migration 0011).
  If FPL issues a post-check correction, the daily fetch upserts player points and the scorer
  refolds subsequent Gameweeks using the existing correction path.
