# Tickets: Bet Points ranking

Two tracer-bullet slices that read every Prediction's Predicted Score as a five-market Bet
Slip and rank the Entrants by Bet Points, the match track's second readable ranking. Source:
[spec 0008](../../specs/0008-bet-points-ranking.md). Vocabulary:
[CONTEXT.md](../../../CONTEXT.md). Decisions: [ADR 0001–0023](../../adr/), especially
[ADR-0023](../../adr/0023-a-second-readable-ranking-reads-a-bet-slip-off-the-predicted-score.md).

Work the **frontier**: any ticket whose blockers are all done. Both tickets sit downstream of
spec 0002's tickets — results ingestion and the readable scoring slice must land before the
first ticket here opens.

This work adds no migration, no new seam and no new job. Settlement is a pure function of the
stored Predicted Score and the stored result; the rows join the existing `scores` table
through the scorer spec 0002 builds, and the base metric name / `_season_to_date` suffix
convention applies unchanged.

---

## Settle the Bet Slip into Bet Points

**What to build:** Running the scorer reads each Prediction's Predicted Score as a five-market
Bet Slip — result, over/under 2.5, 3.5 and 4.5, both teams to score — and writes Bet Points
and Bet hit % for every Entrant, per Gameweek and season-to-date, so the second readable
ranking exists end to end. The first run back-fills every settled Fixture already stored.

**Blocked by:** spec 0002's "Store settled and corrected Fixture results" and "Score the
readable Match Points layer" (the scorer these metrics join).

- [x] Every leg of the slip, including the result leg, derives from the Predicted Score alone; `probs` is read nowhere, and an incoherent Prediction settles by its scoreline
- [x] A settled Fixture awards one point per winning leg, zero to five, verified against hand-computed slips including a five-leg win, a five-leg loss and the 0-0 conservative slip
- [x] Integer goal totals settle against the .5 lines with no push or boundary case
- [x] `bet_points` rows carry the Fixture count as `n` and the per-Fixture slips — each leg's position, what it settled against, won or lost — in `detail`
- [x] `bet_hit_pct` divides markets won by markets actually bet: five times the Fixtures with a Prediction and a settled result, never counting Gaps or unsettled Fixtures
- [x] A Gap contributes no slip anywhere; the season-to-date total silently forfeits it and no row is invented
- [x] Only Fixtures the feed reports `finished` settle a slip, under exactly the gate the Match Points scorer uses, and a corrected result changes Bet Points on the next run
- [x] A deferred Fixture's slip scores into the Gameweek that locked its Prediction, and a late-settling deferred Fixture updates its historical Gameweek row and every season-to-date snapshot from that Gameweek forward
- [x] Reference Lines gain no Bet Points rows
- [x] Re-running changes no row, and the first run over already-stored history is the back-fill
- [x] Tests state hand-computed expectations against real Postgres and never recompute the settlement rule in a second form

## Prove Bet Points on the archived Gameweek

**What to build:** The end-to-end rehearsal that already proves the Match track scorer also
proves Bet Points: a throwaway Postgres built through the real migration path scores the
archived Gameweek, and the Bet Points totals, hit rates and per-Fixture slips match values a
person computed by hand.

**Blocked by:** "Settle the Bet Slip into Bet Points" and spec 0002's "Rehearse the complete
scorer on the archived Gameweek" (the harness this pass extends).

- [x] The rehearsal pass produces `bet_points` and `bet_hit_pct` rows, per Gameweek and season-to-date, for every Entrant with Predictions in the archived Gameweek
- [x] At least one Entrant's full Gameweek — every slip, the total and the hit rate — is asserted against hand-computed values
- [x] The ranking the rows imply is derivable from stored data alone, every figure carrying its `n`
- [x] Running the rehearsal twice produces identical rows both times
