# Tickets: the Bet Slip's Handicap leg and fourth goal-total line

Two tracer-bullet slices that put a price on hedging. The slip grows from five markets to
seven, and one rescore gives every Competition's Bet Points the same meaning. Source:
[spec 0018](../specs/0018-the-bet-slips-handicap-leg.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md). Decisions:
[ADR-0040](../adr/0040-the-bet-slip-gains-a-handicap-leg-that-pays-only-for-covering.md),
amending [ADR-0023](../adr/0023-a-second-readable-ranking-reads-a-bet-slip-off-the-predicted-score.md).

Two slices and not more, deliberately. The legs and the sentence describing them land
together, because a stored row labelled "five markets" over a seven-market slip is worse
than a row with no label. ADR-0023's rule is that a value must not reach a reader without
its qualification, and a wrong qualification breaks that rule harder than a missing one.
The isolation proof lands with them because it guards the same change and would otherwise
be a ticket of nothing but tests. The rescore is separate because it acts on the live
record rather than on code, and it must not share a slice with the code it depends on.

There is nothing to prefactor. The slip is a pure function of a Predicted Score and a
result, and both new legs are additions to it.

## What changed since this ticket was written

**The slip gains two markets, not one.** Over/under 1.5 joins the three goal-total lines
alongside the Handicap. Bet Points run 0 to 7.

**Read this before building it.** Over/under 1.5 is the cheapest line on the board for the
scoreline most Entrants name, and it pulls against the Handicap leg sitting beside it.
Counted over the 3,145 matches stored for 2025-26:

| Line | Lands for the popular side |
| --- | ---: |
| over 1.5 | 74.1% |
| over 2.5 | 50.1% |
| under 3.5 | 73.6% |
| under 4.5 | 88.1% |
| margin over 1.5 (the Handicap) | 32.4% |

A 1-1 Prediction takes over 1.5 and collects it three times in four. That is the behaviour
ADR-0023 named when it recorded that the slip rewards played percentages over boldness,
and ADR-0040 exists to answer. Only the 2.5 line splits anywhere near evenly. Adding 1.5
buys resolution at the bottom of the range, where a 1-0 or 0-0 Prediction now costs
something, and it pays the cautious 1-1 slip another cheap point on the way. Both effects
are real. The ticket records them rather than choosing between them.

**Three documents still say six markets** and have to follow this one: ADR-0040, spec 0018,
and CONTEXT.md's Bet Slip and Bet Points entries. None of them mentions over/under 1.5,
which is a decision no ADR has recorded yet.

**The rescore covers four leagues, not two.** ADR-0049 opened Serie A and Ligue 1, so
`competitions` lists PL, PD, SA and FL1, with the Bundesliga waiting. The record holds 180
Bet Points rows across three scored leagues today, against the dozens this ticket assumed.

**A second reader appeared.** ADR-0051 publishes a combined ranking at `/overall` as the
raw sum of each Entrant's season-to-date Match Points and Bet Points over every scored
Competition. A rescore that reaches some leagues and not others no longer skews one table.
It publishes a sum whose parts were counted by different rules.

---

## 1 — The Handicap leg, the 1.5 line, and the sentence that describes them

**What to build:** A reader of the Bet Points ranking sees an Entrant that named a decisive
scoreline and got it right out-score one that hedged. A Predicted Score backing neither
side to win by two scores nothing on the Handicap, whatever the result does, including
when the match really was tight. The qualification sentence beside the ranking describes
the slip that now exists.

**Blocked by:** None. Can start immediately.

- [x] The Bet Slip carries a Handicap at 1.5 goals, read off the Predicted Score alone and
      never off the probabilities.
- [x] A Predicted Score backs a side by naming it a two-goal win. One with a margin of 0 or
      1 backs nothing.
- [x] The Handicap is won only when a side was backed and the result covered the same way.
      **The shared value "neither side backed" must never settle as a win.** Every other
      leg is won by equality, so the shape the other legs use is the wrong one here.
- [x] The goal-total lines become 1.5, 2.5, 3.5 and 4.5. The 1.5 line settles the way the
      other three do, with no special case: the line is a half and goals are integers, so
      no leg pushes.
- [x] Bet Points run 0 to 7 per Fixture. `bet_hit_pct` divides by seven markets per settled
      slip, with the Handicap and the 1.5 line both present in its per-market breakdown.
- [x] A Fixture with no result and a Gapped Fixture stay out of the denominator, unchanged.
- [x] The Bet Points qualification states seven markets. It keeps the flat-and-oddsless
      caveat and the sentence that only the probability layer supports a claim about
      forecasting skill. It replaces the boldness clause with what is now true: the cheap
      goal-total lines, over 1.5 among them, are weighed against one market that pays only
      for naming a decisive result.
- [x] Four Handicap settlement cases are proven through the scorer over a real database.
      Backed and covered the same way. Backed and covered the other way. Hedged against a
      decisive result. Hedged against a tight result. The last two score zero, and they are
      the behaviour the leg exists to produce.
- [x] One case proves the 1.5 line settles both ways, since a Prediction of 0-0 or 1-0 is
      the only kind that takes the under and the suite has not needed one before.
- [x] A test asserts the stored qualification states seven markets, so the label cannot
      drift from the slip. **Scope, found in slice 2:** this test covers the row the
      scorer writes and nothing else. The market list also lived, hardcoded, in two
      dashboard footnotes this slice never touched — the guarantee above is narrower than
      it reads; see slice 2's note on the footnote bug it found.
- [x] Over one seeded Season, every metric other than `bet_points` and `bet_hit_pct` is
      identical with and without the new legs, proving a change to one readable ranking is
      a change to one readable ranking.

## 2 — Every Competition's Bet Points recomputed

**What to build:** Every reader of every leaderboard, the combined one included, sees Bet
Points that mean the same thing for the whole Season, rather than five markets before a
date and seven after it.

**Blocked by:** 1.

- [x] The rescore is rehearsed before it touches the live record, on the same terms as
      every other write against that record. A full copy of the live database was pulled
      into a throwaway Postgres (the `pg_dump`-into-throwaway-cluster shape `db:rehearse`
      already uses) and `scoreMatchCompetitions` was run against the copy. All 180 Bet
      Points-family rows were rewritten (the new qualification sentence touches `detail`
      on every one — see the corrected note below on what "rewritten" does and does not
      prove); every other metric came back byte-identical; a second run against the
      rehearsed copy changed nothing further.
- [x] Every listed Competition is rescored in the same pass. `main` was pushed to
      `origin/main` first (it had been sitting unpushed), then the existing `score.yml`
      workflow was dispatched by hand — the same mechanism the workflow already documents
      for applying a corrected result. It scored PL, PD, SA and FL1 in one run (SA's
      Gameweek 1 was locked but not yet kicked off, so it has no settled Fixture to score
      yet — expected, not a gap).
- [x] `/overall` is checked after the rescore, not only the per-league tables. Loaded live:
      the combined ranking sums PL, PD and FL1 (`n = 4 fixtures · PL 1 · PD 2 · FL1 1`),
      SA correctly excluded since nothing is scored there yet, and Claude Opus 5's total of
      20 Bet Points matches 7 (PL) + 9 (PD) + 4 (FL1) read off the per-league APIs.
- [x] The rescore reads only stored Predictions and results. No Prediction is rewritten, no
      Entrant is asked anything again, and no context is rebuilt. True by construction —
      `scoreMatchCompetitions` and everything under it only ever selects from `fixtures`,
      `predictions` and `attempts`, and writes only to `scores`.
- [x] Running it twice changes nothing the first run did not, so a partial run is repaired
      by running it again. Proved in the rehearsal above, and already covered by
      `test/score-match-season.test.ts`'s idempotency tests.
- [x] Match Points and every probability metric are unchanged in the live record
      afterwards, checked rather than assumed. Queried directly post-rescore: every
      non-bet metric — `match_points`, `score_pct`, `outcome_pct`, `rps`, `brier`,
      `accuracy`, `coherence`, `gap_rate`, `attempts_to_valid`, and all their
      season-to-date twins — carries a `scored_at` from before the run, meaning
      `storeMetric`'s own `is distinct from` guard left every one of those rows
      untouched. (Every `bet_points`/`bet_hit_pct` row also carries a fresh `scored_at`,
      but that alone is not evidence its *value* moved — see below.)
- [x] It is recorded here that hit rates move for most Entrants, that the size of the move
      differs by Entrant, and that figures read before the rescore cannot be compared with
      figures read after. A cautious slip gains the over 1.5 line and loses the Handicap. A
      bold one gains both. That gap between them is the signal the change was made to
      produce.

      **Corrected after review:** an earlier draft of this note claimed every Bet
      Points-family row changed value, reasoning from `scored_at` alone. That reasoning is
      wrong — `storeMetric` refreshes `scored_at` when `value`, `n` **or** `detail` differs,
      and slice 1's new `BET_POINTS_QUALIFICATION` sentence lives in `detail` and changed
      for every row, so every row was rewritten whether its point count moved or not.
      `scored_at` moving is evidence of a write, not evidence of a value change.

      Recomputed properly, from the per-market breakdown each `bet_points` row already
      carries in its own `detail.fixtures[].slip`: of the 40 non-cumulative `bet_points`
      rows in the live record, 39 changed raw value and exactly one did not —
      `match-pd/2026-27-v2/qwen3.8-max`, PD Gameweek 2, stayed at 6, having won neither of
      the two newly added markets anywhere in that row. For `bet_hit_pct`, 4 of the 40
      rows carry an unchanged rate: the four Premier League Gameweek 1 seats
      (`claude-opus-5`, `gemini-3.1-pro-preview`, `kimi-k3`, `minimax-m3`) that landed a
      perfect slip both before and after — 5 of 5 and 7 of 7 both read 100%, which is a
      property of a perfect slip, not of the two schemes agreeing.

**Verifying this while the rescore was fresh surfaced a separate bug, now fixed:**
`dashboard/src/pages/overall.astro` and `dashboard/src/pages/[competition].astro` both
carried a static "Bet Points." footnote still naming five markets — result, over/under 2.5,
3.5 and 4.5, both teams to score — with no mention of the 1.5 line or the Handicap. The
stored qualification (`betPointsQualification`, read from the row the scorer wrote) was
already correct; this was a second, hardcoded copy of the same fact that slice 1 missed.
Both files now read the seven-market list. Not yet deployed — the dashboard has its own
deploy step (`deploy-dashboard.yml`, by hand), separate from this rescore.
