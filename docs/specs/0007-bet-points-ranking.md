# Spec 0007 — Bet Points ranking

**Status:** ready-for-agent
**Scope:** a second readable ranking on the match track, reading each Prediction as a Bet Slip
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:** [ADR 0001–0022](../adr/)
**Predecessor:** [spec 0002](./0002-match-track-scoring.md) — results ingestion, the `score`
job, and every convention this spec inherits

---

## Problem Statement

Match Points award in exclusive tiers — 5 / 3 / 2 / 0 — and the tiers are blunt at the bottom.
An Entrant that predicted 2-1 in a match that finished 0-0 scores zero, exactly as if it had
predicted 4-3, yet the two scorelines say very different things about the match: one called a
low-scoring game and missed only the winner; the other imagined a shootout. The readable layer
has no way to show that difference, and the probability layer that could show it is deliberately
illegible to a casual reader.

There is also a natural question the leaderboard cannot currently answer, even though every
reader will ask it: *if you had bet these predictions, how would you have done?* Each Predicted
Score implies a position on the markets a bettor actually plays — the result, the goal totals,
both teams to score — and nothing reads those positions out.

## Solution

A second readable ranking, **Bet Points**, computed by the same daily `score` job from the same
stored rows. Each Prediction's Predicted Score is read as a five-market **Bet Slip** — match
result (win / draw / lose), over/under 2.5, over/under 3.5, over/under 4.5, and both teams to
score — and every settled Fixture awards one point per market the slip got right, zero to five.

Every leg of the slip, including the result leg, derives from the one scoreline the Entrant
committed. Stakes are flat and oddsless. The ranked figure is the season-to-date total, exactly
as with Match Points, with a hit rate alongside showing how the total was earned.

The ranking is readable-only (ADR-0022). It publishes no declared intervals of its own — the
benchmark's evidence remains the probability layer of spec 0002 — and it is labelled as ranking,
never as evidence. Like everything downstream of the write path, it is a pure function of stored
rows: re-running produces identical output, and the first run back-fills every settled Fixture
already stored.

---

## User Stories

### The Bet Slip

1. As a leaderboard reader, I want each Prediction read as a five-market Bet Slip — result,
   over/under 2.5, over/under 3.5, over/under 4.5, and both teams to score — so that I can see
   how the scoreline an Entrant named would have fared as bets.
2. As a leaderboard reader, I want every leg of the slip derived from the Predicted Score alone,
   so that one slip is one decision and can never contradict itself.
3. As an analyst, I want the result leg read from the Predicted Score rather than the
   probabilities, so that the slip stays disjoint from the argmax `accuracy` metric and an
   Entrant's incoherence remains measured by Coherence rather than leaking into the slip.
4. As a leaderboard reader, I want one point per correct market with no odds weighting, so that
   the score is legible — "four legs out of five" — without my needing to know what any price
   was.
5. As a sceptical reader, I want the flat-stake caveat stated where the ranking is described —
   conservative low-scoring slips collect the high over/under lines cheaply — so that I read
   Bet Points as rewarding played percentages, not boldness.

### The ranking

6. As a leaderboard reader, I want Entrants ranked by season-to-date total Bet Points, so that
   the second ranking works exactly like the first and one explanation covers both.
7. As a leaderboard reader, I want **Bet hit %** alongside the total — markets won over markets
   bet — so that I can see how a total was earned rather than only its size.
8. As a leaderboard reader, I want per-Gameweek and season-to-date figures, so that I can see
   both form and standing.
9. As an analyst, I want the per-market breakdown retained per Fixture, so that I can see which
   legs an Entrant wins and loses, not merely how many.
10. As a sceptical reader, I want the Bet Points ranking labelled as ranking rather than
    evidence, so that I am not invited to conclude more from it than it supports.
11. As an analyst, I want every published figure to carry its count of Fixtures, so that a
    figure built on few Fixtures cannot pass as a strong one.
12. As an analyst, I want no declared comparison intervals on Bet Points, and any interval
    someone computes on it labelled exploratory, so that the declared comparison set of
    ADR-0016 is not multiplied by a metric correlated with one it already covers.

### Gaps and absences

13. As an operator, I want a Gap treated as an unplaced slip — no Bet Points row contributes,
    and the season-to-date total silently forfeits up to five points — so that absence is
    punished in the total the same way Match Points punishes it.
14. As an analyst, I want Bet hit % divided by markets actually bet, never by markets an absent
    slip would have contained, so that the rate measures accuracy while the total absorbs
    absence, rather than both measuring a blend.
15. As an analyst, I want Reference Lines excluded from Bet Points entirely, so that a
    forecaster that names no scoreline cannot hold a score derived from one.

### Results, corrections and rescheduling

16. As an operator, I want Bet Points computed only for Fixtures whose result the feed reports
    `finished`, under exactly the gate spec 0002 pinned, so that the two readable rankings can
    never disagree about which Fixtures count.
17. As an operator, I want a corrected result to change Bet Points on the next scoring run, so
    that the ranking tracks the record rather than the first version of it.
18. As an analyst, I want a deferred Fixture's Bet Points attributed to the Gameweek that
    locked its Prediction, so that attribution follows the Lock exactly as it does everywhere
    else.
19. As an operator, I want a late-settling deferred Fixture to update its historical Gameweek
    row and every season-to-date snapshot from that Gameweek forward, so that the record
    completes rather than staying permanently wrong.

### Running it

20. As an operator, I want Bet Points computed by the same daily `score` job spec 0002
    establishes, so that there is one scorer to schedule, alert on, and re-run by hand.
21. As an operator, I want re-running to produce identical rows rather than duplicates, so that
    running it twice is always safe.
22. As an operator, I want the first run to back-fill Bet Points across every settled Fixture
    already stored, so that the ranking covers the Season from its first Gameweek without a
    special back-fill mode.
23. As an auditor, I want every stored figure to name the Season, Gameweek, Entrant, track and
    metric, so that any number on the ranking can be traced to the row that produced it.
24. As an auditor, I want the per-Fixture slip retained alongside each aggregate, so that a
    surprising total can be drilled into without recomputing.

### Proving it

25. As a reviewer, I want every leg's settlement verified against values computed by hand,
    including a slip that wins all five legs and one that loses all five, so that a
    plausible-looking implementation cannot pass on plausibility alone.
26. As a reviewer, I want the totals-line arithmetic proven on integer totals against the .5
    lines, so that no push or boundary case is silently invented where none can exist.
27. As a reviewer, I want the scorer exercised against the archived Gameweek the dry run uses,
    so that Bet Points are proven on real stored data before being trusted on live data.

---

## Implementation Decisions

### Settlement rules — the whole spec in one table

For a Prediction with Predicted Score `h`–`a` and a settled result with goals `H`–`A`:

| Leg | Slip position | Wins when |
|---|---|---|
| Result | sign of `h − a` | matches sign of `H − A` |
| O/U 2.5 | `h + a` vs 2.5 | `H + A` falls the same side |
| O/U 3.5 | `h + a` vs 3.5 | `H + A` falls the same side |
| O/U 4.5 | `h + a` vs 4.5 | `H + A` falls the same side |
| BTTS | `h > 0 and a > 0` | matches `H > 0 and A > 0` |

Goal totals are integers and every line is a half, so no leg can push. Bet Points for the
Fixture is the count of winning legs, 0–5. The result leg never reads `probs` (ADR-0022);
`probs` plays no part anywhere in this spec.

### One ranking convention, inherited whole

Ranking by season-to-date total, `finished`-gated scoreability, attribution by the Fixture's
locked Gameweek, corrections picked up on the next run, idempotent upserts, determinism, and
the no-network rule are all spec 0002's decisions applied unchanged. This spec adds no
variation to any of them; where behaviour is in doubt, 0002's answer is the answer.

### Storage

No migration. Two metrics join the `scores` table on the match track, each with its
season-to-date twin under the existing suffix convention:

- `bet_points` — sum of winning legs across the Gameweek's scoreable Fixtures; `n` is the
  Fixture count; `detail` holds the per-Fixture slips: each leg's position, the result it
  settled against, and won/lost.
- `bet_hit_pct` — markets won over markets bet, where markets bet is five times the Fixtures
  with a Prediction and a settled result. Gaps never enter the denominator.

Per-market season hit rates live inside `detail` rather than as rows. Metric names are text,
so promoting one to a row later needs no migration — it should not be done speculatively.

### What is deliberately absent

- **No odds.** Flat stakes are the recorded decision (ADR-0022); odds-weighted payouts wait
  on odds ingestion that does not exist and would be post-Lock information besides.
- **No declared intervals.** Bet Points derive from the same Predicted Scores as Match
  Points; a second declared set would multiply comparisons without adding information
  (ADR-0016). Readable-only, labelled, carrying `n`.
- **No Reference Line rows.** Reference Lines produce probabilities only. With no Predicted
  Score there is no slip; the exclusion falls out of the data rather than being a rule.
- **No new seams.** Settlement is a pure function of two stored shapes. The only seams remain
  spec 0002's: outbound HTTP owned by the fetch, and the clock used for `scored_at` alone.

---

## Testing Decisions

### What makes a good test here

The same discipline as spec 0002: a settlement test states a Predicted Score, a result, and
the five won/lost verdicts a person derived by hand — it never recomputes the rule in a second
form. Behavioural tests assert what a reader could check: a Gap contributes nothing anywhere,
a deferred Fixture scores into its locked Gameweek, re-running changes no row.

### What gets tested

- **Every leg by hand**, including: a five-leg win, a five-leg loss, the 0-0 slip (draw,
  three unders, BTTS no — the conservative slip the flat-stake caveat describes), a slip that
  wins only unders, and a draw predicted with the wrong scoreline.
- **The result leg ignores `probs`** — an incoherent Prediction settles by its scoreline.
- **Totals against the lines** — integer totals either side of 2.5, 3.5 and 4.5, asserting
  no boundary case exists.
- **Hit % denominator** — a Gameweek with a Gap divides by legs actually bet; an unsettled
  Fixture joins no denominator.
- **Gap forfeiture** — the season-to-date total of an Entrant with a Gap reflects the missing
  slip; no row is invented.
- **Deferred attribution and late settlement** — the locked Gameweek's row and every later
  season-to-date snapshot update when a deferred Fixture finally settles.
- **Idempotency** — scoring twice leaves row count and every value unchanged.
- **No Reference Line rows** — a scoring run writes no `bet_points` for `role = 'reference'`.
- **An end-to-end pass over the archived Gameweek**, alongside spec 0002's, in a throwaway
  Postgres built through the same migration path the real database uses.

### Prior art

Everything follows spec 0002's shapes, which follow the write path's: database-enforced
invariants in the schema tests, orchestration against a real Postgres, pure functions tested
as pure functions, and an end-to-end dry-run pass in a throwaway cluster. Settlement tests
belong beside the other metric tests, not in a new shape.

---

## Out of Scope

- **Odds-weighted payouts** and any odds ingestion. Recorded as the rejected alternative in
  ADR-0022; becomes its own work if `reference-odds` ever lands.
- **The leaderboard, dashboard and read API.** This spec writes `scores`; nothing renders them.
- **Any change to spec 0002's metrics, comparisons or job shape.** Bet Points join the run;
  they alter nothing already in it.
- **Any change to the write path.** No new fields, no new markets asked of Entrants.
- **Declared comparison intervals on Bet Points**, per ADR-0016 and ADR-0022.
- **The FPL track.**

---

## Further Notes

**Bet Points and Match Points will correlate strongly — by design.** Both read the same
scoreline. The slip's value is partial credit where the exclusive tiers give none: two slips
scoring zero Match Points can still differ on every over/under and BTTS leg. If the two
rankings ever order Entrants very differently, that is itself worth a look, not a bug in
either.

**The conservative-slip bias is real and published, not corrected.** Under 4.5 lands in
roughly nine Fixtures of ten; an Entrant that always names 1-0 farms the high lines. The
flat-stake decision accepts this and says it out loud (ADR-0022). The correction — prices —
is exactly the deferred odds work.

**The rehearsal data suggests the slips will separate less than the tiers do.** Spec 0002's
rehearsal found nine Entrants naming 3-0, 3-1 and 2-0 on the same Fixture — scorelines that
Match Points splits five-against-two but whose slips differ by at most the 3.5 line. Where
Match Points overstates a difference the probability layer calls negligible, Bet Points will
often understate it. Reading the two side by side is the point.
