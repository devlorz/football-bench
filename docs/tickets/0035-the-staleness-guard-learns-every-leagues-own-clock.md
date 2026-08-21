# Ticket: The staleness guard learns every league's own clock

**What to build:** the football-data.co.uk staleness guard stops being the Premier
League's alone — every listed Competition gets its own, dated from its own Gameweek 1
deadline and asking whether its own feed is live — and the `FOOTBALL_DATA_SEASON`
advance check grows to all eight files. The one piece of new machinery in this
expansion, owed since spec 0016's ticket 8 recorded it as "the first thing to write for
Serie A". Source: [spec 0024](../specs/0024-serie-a-and-ligue-1-open.md), stories
17–19. Decisions:
[ADR-0049](../adr/0049-serie-a-and-ligue-1-open-the-bundesliga-waits-on-hands-not-money.md),
[ADR-0036](../adr/0036-a-new-competitions-schedule-results-and-lock-come-from-football-data-org.md)
(whose consequence — "applied per Competition" — this finally implements).

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] A listed Competition whose football-data.co.uk feed has produced no current-Season
      rows once its own Gameweek 1 deadline passes fails the fetch loudly, by name —
      each league against its own clock, not the Premier League's.
- [ ] One league's staleness is collected as that Competition's error without costing
      another league its fetch — the same collected-errors shape the per-Competition
      fetch already has — and the run still fails loudly at the end.
- [ ] The guard's behaviour is driven at the daily-fetch seam over a temporary Postgres,
      the way the existing stale-source guards are: one league stale, the other league's
      day still lands.
- [ ] The pre-cron checklist's advance check requires eight `200`s — `I1`, `I2`, `F1`,
      `F2` join `E0`, `E1`, `SP1`, `SP2` — and its one-variable-many-leagues note names
      four leagues instead of two.
