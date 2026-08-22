# Spec 0002 — Match track scoring

**Status:** ready-for-agent
**Scope:** turning stored Predictions and results into a ranked, interval-qualified leaderboard
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:** [ADR 0001–0016](../adr/)
**Predecessor:** [spec 0001](./0001-match-track-write-path.md), complete

---

## Problem Statement

The write path is finished and about to start recording. From mid-August every Gameweek will
add ninety Predictions to a database that has no way to say anything about them. Nobody can
answer the question the benchmark exists for — *is any of these Base Models better at this
than the others?* — and nobody can answer the smaller question an operator needs weekly:
*did last Gameweek go well?*

Worse, the results those Predictions will be judged against are **not being collected at all**.
The FPL fixtures feed carries `finished`, `finished_provisional`, `team_h_score` and
`team_a_score` on every Fixture, and the pipeline ignores all four. `fixtures.result` has never
been written. Predictions are accumulating against outcomes nobody is recording.

There is also a trap waiting. A leaderboard is easy to build and easy to over-read. Rank nine
Entrants by any average and the ordering will look decisive whether or not it means anything —
and the first live evidence says it will not mean much. A rehearsal on real Gameweek 1 data
found all nine Base Models sitting within one to four percentage points of each other's Home
probability, with the most contrarian only three and a half times further from consensus than
the most conformist. A ranking presented without that context would be a confident-looking
number standing on nothing.

## Solution

A deterministic scorer, run daily, that computes every metric from stored data and writes them
to the `scores` table — plus the results ingestion it depends on.

It produces two layers, deliberately kept apart. **Match Points** rank the Entrants and are
legible to anyone: five for an exact Predicted Score, three for the goal difference, two for
the outcome. **Ranked Probability Score** carries every claim, compared as Paired Differences
on the same Fixture with a bootstrap interval and the count of Fixtures behind it.

Neither is published without the other. The rank is what people read; the interval is what
stops the rank from lying.

Everything is a pure function of stored rows. Re-running produces identical output, including
the bootstrap intervals, so a scorer improved in October can be applied to August's Predictions
and give the same answer as it would have then.

---

## User Stories

### Collecting results

1. As an operator, I want the daily fetch to record each Fixture's final score, so that there is
   something to judge Predictions against.
2. As an operator, I want a Fixture treated as scoreable as soon as the feed reports it over —
   `finished` or `finished_provisional`, read as either-or — so that a scoreline reaches the
   Match track at the whistle rather than waiting on bonus points and defensive contributions,
   which a scoreline never depends on. *(Amended 2026-08-22 by ticket 0042: the original
   `finished`-only gate held per-player concerns that do not apply to a scoreline. What still
   waits for FPL's confirmation is the FPL track's per-player points, gated separately on
   `data_checked` — see [ADR-0020](../adr/0020-per-player-gameweek-performance-joins-the-fpl-context-for-2026-27-v2.md),
   which this amendment does not reopen.)*

3. As an operator, I want scoreability decided by what the feed reports rather than by what time
   the job ran, so that an early or delayed run cannot score a Gameweek that has not settled.
4. As an auditor, I want the recorded result to carry the goals for each side and the derived
   outcome, so that every metric can be recomputed from the stored row alone.
5. As an operator, I want a result that changes after it was first recorded — a correction, an
   overturned appeal — to update the stored Fixture and be reflected the next time scoring runs.
6. As an operator, I want a Fixture that is never played to simply never gain a result, so that
   it drops out of every metric for every Entrant equally with no special handling.

### The readable layer

7. As a leaderboard reader, I want each Entrant ranked by total Match Points, so that I can see
   who is ahead without understanding probability scoring.
8. As a leaderboard reader, I want Match Points awarded in exclusive tiers — five for an exact
   Predicted Score, three for the right goal difference, two for the right outcome, zero
   otherwise — so that the scale is simple and cannot double-count.
9. As a leaderboard reader, I want **Score %** and **Outcome %** alongside the total, so that I
   can see how a total was earned rather than only its size.
10. As a leaderboard reader, I want per-Gameweek and season-to-date figures, so that I can see
    both form and standing.
11. As a sceptical reader, I want the Match Points ranking labelled as ranking rather than
    evidence, so that I am not invited to conclude more from it than it supports.

### The evidential layer

12. As an analyst, I want Ranked Probability Score computed per Prediction, so that the ordered
    nature of Home / Draw / Away is respected and a near miss is penalised less than a far one.
13. As an analyst, I want Brier computed with a single pinned convention, so that my figures are
    comparable with anyone else's rather than off by a factor of two.
14. As an analyst, I want accuracy from the argmax of the probabilities, so that there is a
    metric requiring no calibration to interpret.
15. As an analyst, I want comparisons expressed as Paired Differences on the same Fixture, so
    that how hard a Fixture was cancels out and only which Entrant forecast it better remains.
16. As an analyst, I want a bootstrap confidence interval on every published comparison, so that
    I can tell a real separation from noise.
17. As an analyst, I want the interval computed identically every time it is recomputed, so that
    the number I quote today is the number the same data gives next month.
18. As an analyst, I want every comparison to show the count of Fixtures behind it, so that a
    narrow interval built on few Fixtures cannot pass as a strong one.
19. As an analyst, I want comparisons computed over the Fixtures where **every** Entrant
    produced a Prediction, so that the leaderboard cannot contradict itself with an intransitive
    ranking.
20. As an analyst, I want one interval against the current Comparison Anchor for every other
    Entrant retained in the Season roster — eight for the current nine Entrants — so that
    testing every pair does not manufacture a separation by chance.
21. As an analyst, I want any comparison outside that declared set marked exploratory, so that a
    figure I went looking for is not read as one the benchmark asserts.
22. As a sceptical reader, I want an interval spanning zero presented as a result rather than a
    failure, and accompanied by the reminder that no Positive Control exists, so that "these are
    close" is never silently upgraded to "this benchmark can tell them apart".

### Behavioural metrics

23. As an operator, I want Gap rate per Entrant per Gameweek, broken down by cause, so that an
    Entrant that fails to answer is visible next to one that answers badly.
24. As an operator, I want the distribution of attempts-to-valid, so that I can see which Base
    Models needed Repairs and how often.
25. As an analyst, I want Coherence — whether an Entrant's most likely outcome agrees with the
    outcome its Predicted Score implies — so that internal consistency is measured rather than
    assumed.
26. As an analyst, I want behavioural metrics reported per Entrant over the Season, so that a
    single bad Gameweek is distinguishable from a persistent weakness.

### Rescheduled Fixtures

27. As an analyst, I want a deferred Fixture's result attributed to the Gameweek that locked its
    Predictions, not the Gameweek it was eventually played in, so that a Gameweek's figures
    describe what its Entrants knew when they committed.
28. As an operator, I want a Gameweek's row to change when a deferred Fixture is finally played
    months later, so that the record completes rather than staying permanently wrong.
29. As an operator, I want the season-to-date aggregate to be the ranked figure, so that a
    Gameweek row changing late does not disturb the standing.

### Reference Lines

30. As an analyst, I want deterministic Reference Lines scored on the same Fixtures as the
    Entrants, so that I can see whether the Base Models beat a trivial rule at all.
31. As an analyst, I want Reference Lines shown on the probability layer only and never ranked,
    so that a non-LLM forecaster cannot appear to win a benchmark it is not competing in.
32. As an analyst, I want Reference Lines back-filled across every Fixture already stored, so
    that they cover the same Season the Entrants do from the first Gameweek.
33. As an analyst, I want the market-odds line, when added, labelled as post-Lock information,
    so that it is read as a reference line rather than a competitor.

### Running it

34. As an operator, I want scoring to run daily on a schedule and also by hand, so that a
    delayed result is picked up without intervention and a correction can be applied at once.
35. As an operator, I want re-running to produce identical rows rather than duplicates, so that
    running it twice is always safe.
36. As an operator, I want scoring to make no network calls beyond the database, so that it
    cannot be affected by an upstream outage and can be trusted to be reproducible.
37. As an operator, I want a Gameweek with no settled results to be skipped silently rather than
    scored as zero, so that an unplayed Gameweek is distinguishable from a badly forecast one.
38. As an operator, I want a scoring failure to raise the same kind of alert as the other jobs,
    so that a silent scorer is not mistaken for a scorer with nothing to do.
39. As an auditor, I want every stored metric to name the Season, Gameweek, Entrant, track and
    metric, so that any figure on the leaderboard can be traced to the row that produced it.
40. As an auditor, I want the per-Fixture breakdown retained alongside each aggregate, so that a
    surprising total can be drilled into without recomputing.

### Proving it

41. As a reviewer, I want every metric verified against values computed by hand, so that a
    plausible-looking implementation cannot pass on plausibility alone.
42. As a reviewer, I want the scorer exercised against the archived Gameweek the dry run already
    uses, so that it is proven on real stored data before it is trusted on live data.
43. As an operator, I want to score a Gameweek whose results I have fabricated in a throwaway
    database, so that I can see what a full leaderboard looks like before one exists.
44. As a reviewer, I want the bootstrap's determinism asserted, not assumed, so that the claim
    that scoring is re-runnable is checked rather than described.

---

## Implementation Decisions

### Results ingestion belongs here, not in the fetch ticket

The FPL fetch gains the four fields it currently discards. The decision of *when* a result may
be scored is read from `finished` or `finished_provisional`, either-or: a scoreline is settled
the moment the feed reports the match over by either flag, since neither bonus points nor
defensive contributions — the only things `finished` alone was still waiting on — can move a
scoreline. `finished_provisional` may remain true after `finished` turns true, so the two flags
are never combined as an `and not` gate. This is a scoring judgement specified here even though
the write happens in the fetch path.

What still waits for FPL's own confirmation is the FPL track's per-player points, gated
separately on `data_checked`; that gate is untouched by this amendment and stands on
[ADR-0020](../adr/0020-per-player-gameweek-performance-joins-the-fpl-context-for-2026-27-v2.md)
exactly as written.

`fixtures.result` is populated as `{ home_goals, away_goals, outcome }` where outcome is `H`,
`D` or `A` derived at write time. Storing the derived outcome rather than computing it on read
means every metric reads one shape and the derivation is done once.

A result may be **updated** — corrections happen. This is the one place the write path is not
insert-only, and it is safe because scoring is idempotent: a corrected result simply produces
different scores on the next run.

### Two layers, never merged

| Layer | Metrics | Role |
|---|---|---|
| Readable | Match Points, Score %, Outcome % | ranks the leaderboard |
| Evidential | RPS, Brier, accuracy, Paired Differences with intervals | carries every claim |

Match Points tiers are **exclusive**: 5 / 3 / 2 / 0. The three nest strictly — an exact score
implies the goal difference implies the outcome — so cumulative scoring would only rescale.

Brier is pinned as `Σ_i (p_i − o_i)²` over the three outcomes, unnormalised, range [0, 2].
Published variants differ by a factor of two; this one is fixed so figures are comparable.

RPS is pinned as the mean squared error of the cumulative distribution over ordered `H`, `D`,
`A` — divided by the two cumulative terms, range [0, 1]. This is the football-forecasting
convention the 0.201 figure in ADR-0012 is quoted under.

Accuracy and Coherence use the same deterministic argmax convention: when probabilities tie,
the first maximum in canonical `H`, `D`, `A` order wins. The rule is arbitrary but pinned; a
database or runtime iteration order must never decide it.

### The bootstrap is seeded from its own inputs

Resampling is deterministic: the seed is derived from a hash of the Paired Differences being
resampled, so the same data always yields the same interval and no RNG is injected. 10,000
resamples, 95% interval, percentile method.

This is what makes ADR-0005's claim — that scoring is re-runnable and back-fillable — true
rather than aspirational. An interval that moved on every recomputation would quietly break it.

### Comparisons are complete-case and pre-declared

Paired Differences are computed over Fixtures where **every** Entrant produced a Prediction
(ADR-0011). Pairwise deletion is rejected: it permits intransitive rankings, and a leaderboard
that can contradict itself is unusable as a public artifact.

Each cumulative Gameweek snapshot publishes one interval against its **Comparison Anchor** for
every other Entrant retained in the Season roster — eight comparisons with the current nine
Entrants (ADR-0016). The snapshot at Gameweek N selects its anchor using only scoreable
Fixtures attributed to `locked_in_gw <= N`: highest Match Points, then lower RPS, then Entrant
id, without breaking the Match Points tie itself. A deferred Fixture may update its historical
snapshot when it settles; data attributed to Gameweek N+1 cannot. Any other pair may be
computed but is labelled exploratory.

The stored declared set for each recomputed cumulative Gameweek snapshot is replaced atomically
on every scoring run. Once the transaction commits that snapshot contains one row per
non-anchor Season-roster Entrant and every row names the same Comparison Anchor. A row against
a former anchor must not survive a leader change within that snapshot; earlier Gameweek
snapshots remain historical records.

Every published figure carries its `n`.

### Attribution follows the Lock, not the calendar

A deferred Fixture scores into the Gameweek recorded in `fixtures.locked_in_gw`, not the one it
was played in (ADR-0013). A Gameweek row therefore changes when a deferred Fixture completes
months later; this is correct, and the ranked figure is the season-to-date aggregate rather than
any single Gameweek.

Note the ordering dependency ADR-0013 records: `deferred` is materialised by the FPL fetch, so
the fetch must complete before the scorer reads it. The specified 06:00 fetch and 10:00 score
jobs provide this ordering; the score workflow created by this work must establish it.

### Storage

`scores` already exists and needs no migration: `(model_id, season, gw, track, metric)` with
`value`, `n`, `detail` and `scored_at`. Metric names are lower-case identifiers —
`match_points`, `score_pct`, `outcome_pct`, `rps`, `brier`, `accuracy`, `coherence`,
`gap_rate`, `attempts_to_valid`. Per-Fixture breakdowns live in `detail` so an aggregate can
be drilled into.

The two behavioural rows are taken over the Fixtures their Lock owns rather than over the ones
an Entrant answered, so `n` is the Lock's Fixture count and a Fixture nobody played still
counts. Both are written for every Entrant of the roster, including one with no successful
Prediction at all — that Entrant gets no readable row, and these are what say it was absent
rather than wrong.

A Gap is attributed to the cause the last failing attempt recorded, which is the rule the live
Gap alert already reports by: the Repairs before it are what the Gap survived on the way, and
the row that left it missing is what it is down to. A Gap with no attempt row at all is
`unattempted` and not a cause, because a Base Model that refused four times and a run that
never reached one are different failures and only one of them is the Base Model's. That
distinction holds in both rows: `attempts_to_valid` carries the FPL track's `0`–`3`-and-
`failed` distribution with `unattempted` beside it rather than folded into `failed`, since a
single bucket over both would report a Base Model's failure rate as the share of Fixtures it
was never asked about. Its value is the mean over the Predictions that reached valid, which is
`n` less those two buckets; an Entrant that reached none of them gets no `attempts_to_valid`
row, since a mean over nothing is not zero and a stored zero would read as an Entrant that
answered first time every time.

A published comparison is one such row, stored under
`rps_paired_difference_season_to_date` against the non-anchor Entrant's `model_id`, with the
anchor named in `detail`. It has no per-Gameweek counterpart: a comparison is a statement
about the Season through a Gameweek, and one Gameweek's ten Fixtures cannot support one. The
Paired Difference is signed as the Entrant's RPS less the anchor's, so — RPS being a loss —
a positive value is the anchor forecasting better.

The base metric name stores that Gameweek's value. A cumulative snapshot through that
Gameweek uses the explicit `_season_to_date` suffix — for example `match_points` and
`match_points_season_to_date` coexist at the same `gw`. This avoids a sentinel Gameweek and
keeps the existing foreign key valid. A late deferred result or correction recomputes
season-to-date snapshots from its locked Gameweek through the latest scored Gameweek.

Ordinary writes are upserts keyed on the primary key, so a re-run replaces rather than
duplicates. The declared comparison set is the exception: it is replaced as one set so rows
against a former Comparison Anchor cannot remain.

### Reference Lines

`reference-home`, `reference-uniform` and `reference-elo` are `models` rows with
`role = 'reference'` and produce probabilities from stored Fixtures alone. They are scored on
the probability layer and excluded from the Match Points ranking, since they name no scoreline
(ADR-0001, ADR-0012). The scorer creates the rows it needs rather than a Season setting them
up, because their definition is the constant in the scorer and nothing else reads them.

Reference Line forecasts are computed in memory whenever scoring runs. They never create
`predictions` rows. Their per-Fixture probabilities and contributions live in `scores.detail`;
the aggregate lives in `scores.value`.

They are forecast over the Fixtures the Season's Locks own, which is the Fixture list every
other Match figure is taken over. A Fixture with no Lock is not scored for anyone: it belongs
to no Gameweek yet, so there is no snapshot for a line's score of it to be written under.
Running the scorer over old Fixtures is the back-fill path. Elo is replayed from stored history
on every run, so a corrected earlier result deterministically changes every affected later
forecast.

Elo's rules are pinned so a reader can check one by hand. Every club starts at 1500; the prior
Season's stored results seed it, both divisions counting, so a promoted club carries the form
it was promoted on rather than starting level with a club that survived. `K = 20`, the Home
side is credited `+60`, and the expectation is the logistic `E = 1 / (1 + 10^(−d/400))`.
Ratings key on football-data.co.uk's club identity, which is what the history is stored under.

That expectation is one number covering three outcomes, so the split into them is pinned as
well: the draw holds the Home line's recalibrated `0.28`, and the rest follows from `E` being
`H + D/2` by definition — `H = E − 0.14` and `A = 1 − 0.28 − H`, each clamped into its share
where the rating gap would send it past. This adds one assumption to what Elo said instead of
fitting a second model beside it; a Reference Line whose constants were fitted would stop
being the thing a reader orients by. The draw therefore does not narrow as the gap widens, as
it does in reality, and ratings are not regressed toward 1500 between Seasons. Both are
deferred rather than decided: each needs its own pinned constant and its own recalibration.

`reference-odds` is deferred — it requires odds columns from football-data.co.uk that the
current fetch discards, and it is post-Lock information shown as a line only.

### Running it

A `score` job runs daily and by hand, mirroring the shape the other two workflows established:
pinned secrets and variables, a concurrency group, and issue-based failure alerting using the
shared open-or-comment script.

---

## Testing Decisions

### What makes a good test here

A metric test states an input and the value a person computed for it by hand. It does not
restate the implementation in a second form — a test that recomputes RPS with the same formula
proves only that the formula was typed twice. Hand-computed expectations are the point.

Behavioural tests assert what a reader of the leaderboard could check: that a Fixture with no
settled result contributes nothing, that a deferred Fixture scores into its locked Gameweek,
that re-running changes no row.

### Seams — two, both existing

**Outbound HTTP**, used only by results ingestion through the FPL fetch that already owns that
seam. **The clock**, used only for `scored_at` — never for deciding what is scoreable, which is
read from `finished` or `finished_provisional` in stored data.

The scorer makes no network calls, so it introduces no seam. Metric functions are pure and need
none. The bootstrap is seeded from its inputs rather than from an injected RNG, so determinism
is a property of the function instead of a property of the test setup.

Tests run against a real Postgres, as everything else does.

### What gets tested

- **Every metric against hand-computed values**, including the boundary cases: an exact
  Predicted Score, a correct goal difference with the wrong score, a correct outcome with the
  wrong goal difference, and a miss.
- **Brier's pinned convention**, so a future refactor cannot silently halve it.
- **Argmax ties**, so accuracy and Coherence use canonical `H`, `D`, `A` order rather than an
  incidental query or object order.
- **The bootstrap is deterministic** — the same inputs produce a byte-identical interval across
  separate invocations.
- **Complete-case selection** — an Entrant with a Gap removes that Fixture from every
  comparison, not only from its own.
- **Comparison Anchor replacement** — recomputing the same cumulative snapshot after its
  anchor changes removes the former declared row and leaves one row per non-anchor Entrant
  retained in the Season roster, all naming the new anchor.
- **Deferred attribution** — a Fixture locked in one Gameweek and played in another scores into
  the first.
- **Idempotency** — scoring twice leaves the row count and every value unchanged.
- **Results ingestion** — `finished_provisional` alone is scoreable, a Fixture still in play
  (neither flag true) is not, `finished` is scoreable whether or not `finished_provisional` has
  caught up, and a changed score updates the stored Fixture.
- **Observed FPL semantics** — the result logic can be built before the Season from the pinned
  `finished` contract and explicit boundary cases. After the first matchday, one live fixtures
  response containing completed matches is archived and pinned as a regression fixture. The
  existing pre-Season archive has only `finished = false` / `finished_provisional = false` and
  cannot prove the transition semantics; the dated verification is an operating action, not
  an implementation blocker.
- **An end-to-end pass over the archived Gameweek**, following the dry run's pattern of a
  throwaway Postgres built through the same migration path the real database uses.

### Prior art

The write path establishes all of it: `test/schema.test.ts` for database-enforced invariants,
`test/predict-gameweek.test.ts` for orchestration against a real Postgres, `test/gap-alert.test.ts`
for a pure formatter, and `test/run-dry-run.test.ts` for an end-to-end pass in a throwaway
cluster. Follow those rather than introducing a new shape.

---

## Out of Scope

- **The FPL track** — Manager State replay, Chips, Squad validation, FPL points. Fully designed
  in ADR-0003 and ADR-0004, and a separate spec.
- **The leaderboard, dashboard and read API.** This spec writes `scores`; nothing renders them.
- **`reference-odds`.** Needs odds columns the fetch currently discards.
- **Any change to the write path** beyond adding result fields to the FPL fetch.
- **Combining the two tracks into a single ranking**, which the architecture spec forbids.

---

## Further Notes

**The first live evidence says the intervals will be wide.** A rehearsal against real Gameweek 1
data — nine Base Models, ten Fixtures, real calls into a throwaway database — produced Home
probabilities within 0.06 to 0.16 of each other per Fixture, and mean deviation from the room's
median between 0.012 and 0.043. At that spread the season mean Paired Difference is plausibly
under 0.005, which the design analysis put at 125 to 780 Fixtures to resolve against a Season of
380.

This is not a reason to build the scorer differently. It is the reason the interval must be
published beside the rank from the first Gameweek rather than added once the numbers disappoint.

**Match Points will separate the Entrants more than RPS does, and less meaningfully.** The same
rehearsal produced identical probabilities but Predicted Scores of 3-0, 3-1 and 2-0 on one
Fixture. If the result is 3-0, four Entrants take five points and five take two — a large gap
from a difference the probability layer says is negligible. ADR-0012 anticipated exactly this;
the scorer should make it visible rather than smooth it away.

**Coherence may be the most resolvable signal available.** Where accuracy separates Base Models
by fractions of a percent, the rehearsal showed a threefold spread in how far each strays from
consensus. Whether that is worth promoting to a headline metric is a decision for after the
first real Gameweeks, but the data to make it will exist from the first scoring run.
