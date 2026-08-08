# Tickets: Match track scoring

Nine tracer-bullet slices that turn stored Predictions and settled results into a ranked,
interval-qualified Match track record. Source:
[spec 0002](../specs/0002-match-track-scoring.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md). Decisions: [ADR 0001–0016](../adr/).

Work the **frontier**: any ticket whose blockers are all done. Results ingestion and
operational-behaviour reporting can begin independently; probability scoring follows the
readable scoring slice.

The existing `scores` table is the integration point, so this work needs no migration or wide
refactor. Results ingestion continues through the existing outbound-HTTP seam; scoring itself
reads stored rows only, and the clock is used only for `scored_at`.

Across every ticket, the base metric name means one Gameweek and the corresponding
`_season_to_date` metric means the cumulative snapshot using data through that same Gameweek.
This convention applies to readable, evidential and behavioural metrics.

---

## Store settled and corrected Fixture results

**What to build:** The existing FPL fetch records a Fixture's final score once the upstream
feed declares it settled, giving the scorer a durable outcome to read. A later correction
replaces that result so the next scoring run can recompute from the corrected evidence.

**Blocked by:** None — can start immediately.

- [x] The FPL fixtures boundary validates `finished`, `finished_provisional`, `team_h_score` and `team_a_score`, and an invalid response is archived before derived writes are refused
- [x] A Fixture gains no result until the feed reports `finished`; `finished_provisional` alone never makes a Fixture scoreable
- [x] A settled Fixture stores its Home and Away goals together with the derived `H`, `D` or `A` outcome
- [x] A changed settled score updates the existing Fixture result rather than creating another Fixture or refusing the correction
- [x] A Fixture that is never declared finished remains without a result and needs no special state
- [x] Both daily and Gameweek-specific fetches produce the same result behaviour and remain idempotent
- [x] Tests exercise provisional-only, `finished` with both flags true, and corrected results against real Postgres, treating the pinned `finished` semantics as the contract rather than claiming the current all-unfinished archive proves it

---

## Score the readable Match Points layer

**What to build:** Running the scorer turns settled Fixture results and immutable Predictions
into the readable Match Points record for every Entrant, both for the locked Gameweek and
season to date. The stored breakdown makes every aggregate auditable and recomputation safe.

**Blocked by:** Store settled and corrected Fixture results.

- [x] Exact Predicted Scores earn 5 Match Points, correct goal differences with a different score earn 3, correct outcomes with a different goal difference earn 2, and misses earn 0
- [x] The four exclusive Match Points cases are verified against values computed by hand rather than by restating the implementation
- [x] Every Entrant with a Prediction on a settled Fixture receives Match Points, Score % and Outcome % for that Gameweek under the base metric names. An Entrant that Gapped every scoreable Fixture of a Gameweek receives none of the three: Score % over no Fixtures is not zero, and a stored zero would read as a forecast that got everything wrong — which is the distinction `gap_rate` exists to keep
- [x] Each Gameweek also stores cumulative snapshots through that Gameweek under explicit `_season_to_date` metric names, so per-Gameweek and cumulative rows coexist without a sentinel Gameweek or migration
- [x] Every aggregate carries its Fixture count and a per-Fixture breakdown sufficient to explain the value without recomputing it
- [x] A Fixture with no settled result contributes nothing; a Gameweek with no settled results produces no zero-valued scoring rows
- [x] A deferred Fixture contributes to `locked_in_gw`, not the Gameweek in which it was eventually played
- [x] A result correction changes the affected Gameweek and recomputes `_season_to_date` snapshots from that locked Gameweek through the latest scored Gameweek
- [x] Re-running upserts the same logical rows without duplicates, while the injected clock affects only `scored_at`
- [x] Stored rows name the Season, Gameweek, Entrant, Match track and metric, and identify Match Points as the ranking layer rather than statistical evidence
- [x] The scorer reads stored database rows only and makes no outbound network call

---

## Score probability accuracy and Coherence

**What to build:** The same scoring run writes the evidential per-Entrant metrics and
Coherence alongside Match Points, so a readable rank is accompanied by measures that preserve
the forecast's probability information and internal consistency.

**Blocked by:** Score the readable Match Points layer.

- [x] Ranked Probability Score is computed over ordered Home, Draw and Away outcomes and is verified against hand-computed examples
- [x] Brier is the pinned unnormalised three-outcome sum with range `[0, 2]`, including a hand-computed test that would fail if it were silently halved
- [x] Accuracy compares the probability argmax with the settled outcome
- [x] Coherence compares that argmax with the outcome implied by the Entrant's Predicted Score. Coherence needs no result, so it is reported over every Prediction the Gameweek's Lock owns and carries its own `n`
- [x] Accuracy and Coherence resolve tied maxima by the first outcome in canonical `H`, `D`, `A` order, including `0.40 / 0.40 / 0.20` resolving to Home
- [x] RPS, Brier, accuracy and Coherence are stored under base per-Gameweek metrics and `_season_to_date` cumulative metrics with `n` and auditable per-Fixture detail
- [x] Unsettled Fixtures are absent from outcome-dependent metrics without being counted as failures
- [x] Deferred attribution, result correction and idempotent recomputation behave exactly as they do for Match Points
- [x] Metric functions are deterministic pure functions and introduce no clock, network or random-number seam

---

## Publish deterministic comparisons against the Comparison Anchor

**What to build:** The scorer qualifies each cumulative snapshot's Comparison Anchor by
comparing its RPS with every other retained Entrant on the identical complete-case Fixture
set. Every published comparison includes a deterministic interval and the sample size behind
it.

**Blocked by:** Score probability accuracy and Coherence.

- [x] A comparison includes only Fixtures on which every Entrant retained in the Season roster produced a Prediction, so one retained Entrant's Gap removes that Fixture from every published comparison
- [x] Reference Lines do not participate in the complete-case Entrant intersection
- [x] Paired Differences are formed Fixture by Fixture on the shared set before they are aggregated
- [x] The Comparison Anchor for the snapshot at Gameweek N is selected using only scoreable Fixtures whose `locked_in_gw` is at most N: highest Match Points, then lower RPS and Entrant id for a tie; a later-settled deferred Fixture may update that snapshot, but Gameweek N+1 data never can
- [x] The published set contains one comparison against the snapshot's Comparison Anchor for every other Entrant retained in the Season roster — eight with the current nine-Entrant roster
- [ ] Any other requested pair is marked exploratory — nothing can request one yet, so nothing computes or labels one; this waits for whatever first asks
- [x] One scoring transaction removes or invalidates comparisons outside the new declared set for every cumulative Gameweek snapshot it recomputes, leaving one row per non-anchor Season-roster Entrant and no stale row
- [x] A test recomputes the same snapshot after the Comparison Anchor changes and proves the former anchor's stale comparison row is gone
- [x] Every comparison stores its mean Paired Difference, Fixture count, 95% interval and enough detail to identify both Entrants and the Fixtures used
- [x] The interval uses 10,000 percentile-bootstrap resamples and a seed derived from a hash of the ordered comparison inputs
- [x] Separate invocations over identical inputs produce byte-identical interval values and details without an injected random-number generator
- [x] A comparison whose interval spans zero is stored as a valid result and carries the no-Positive-Control qualification rather than being treated as a scoring failure
- [x] Hand-computed Paired Differences and a deliberately gapped complete-case example verify the selection and sign convention

---

## Report Gaps and attempts-to-valid

**What to build:** A database-only reporting pass records how reliably every Entrant answered,
separating an absent Prediction from a bad forecast and showing how many Repairs were needed
before each valid Prediction.

**Blocked by:** None — can start immediately.

- [x] Gap rate is stored for every Entrant under `gap_rate` per Gameweek and `gap_rate_season_to_date` cumulatively through that Gameweek, including Entrants with no successful Prediction
- [x] Gap detail breaks missing Predictions down by the stored failure cause rather than reporting only a total
- [x] Attempts-to-valid is reported as the distribution of 0, 1, 2, 3 and failed Repairs using stored attempts and Predictions
- [x] Each aggregate retains the Fixture-level evidence needed to trace a Gap or Repair count to its attempts
- [x] Behavioural metrics are computed from all Fixtures owned by the relevant Lock and do not depend on whether a result has settled
- [x] A re-run over unchanged attempts and Predictions produces identical values and no duplicate rows
- [x] Tests cover a clean Entrant, a repaired Prediction, mixed failure causes and a Fixture that remains a Gap

---

## Add Home and Uniform Reference Lines

**What to build:** Deterministic Home and Uniform Reference Lines are evaluated over the
Fixtures the Season's Locks own whenever scoring runs and scored on the same probability layer
as Entrants, giving readers two trivial rules for orientation without turning either into a
competitor.

**Blocked by:** Score probability accuracy and Coherence.

- [x] `reference-home` and `reference-uniform` exist as Reference Line rows rather than Entrants
- [x] The Home line emits `[0.44, 0.28, 0.28]` and the Uniform line emits `[1/3, 1/3, 1/3]` deterministically for every Fixture the Lock owns — a Fixture with no Lock belongs to no Gameweek and so has no snapshot to be scored under
- [x] Both lines are evaluated in memory from stored Fixture fields whenever scoring needs their probabilities
- [x] Settled Fixtures contribute RPS, Brier and accuracy on the same outcome set used for Entrants, with `n` and per-Fixture detail
- [x] Reference Line probabilities and per-Fixture contributions are retained only in `scores.detail`; no `predictions` row is created
- [x] Reference Lines produce no Predicted Score, Match Points, leaderboard rank, Gap rate or attempts-to-valid
- [x] Running the scorer over old Fixtures or in a different batch shape produces identical Reference Line scores
- [x] Tests verify the probabilities and resulting metrics against hand-computed values

---

## Add the Elo Reference Line

**What to build:** A deterministic Elo Reference Line replays stored historical results in
chronological order, forecasts each Fixture using only information available before it, and
joins the probability layer without entering the Entrant ranking.

**Blocked by:** Add Home and Uniform Reference Lines.

- [x] Elo uses `K=20`, a Home advantage of `+60` and the pinned logistic mapping, seeded from the prior Season
- [x] Each forecast is produced from ratings as they stood before that Fixture's result, so a result cannot leak into its own prediction
- [x] Historical results and current-Season Fixtures are replayed deterministically in a stable chronological order
- [x] The Elo path is replayed in memory during every scoring run and writes no `predictions` row
- [x] Scoring old Fixtures supplies the back-fill, and a corrected earlier result deterministically recomputes every downstream rating and affected score
- [x] Settled Fixtures produce RPS, Brier and accuracy with `n` and per-Fixture forecast detail
- [x] `reference-elo` is a Reference Line, produces no Predicted Score or Match Points, and never participates in the leaderboard or Entrant complete-case intersection
- [x] Tests use a short sequence with ratings and probabilities calculated independently by hand

---

## Rehearse the complete scorer on the archived Gameweek

**What to build:** An operator can fabricate settled outcomes for the archived Gameweek in a
throwaway Postgres and run the complete scorer, seeing the same full scoring record that the
first live Gameweek will produce without touching live data or making a network call.

**Blocked by:** Publish deterministic comparisons against the Comparison Anchor · Report Gaps and
attempts-to-valid · Add the Elo Reference Line.

- [x] The rehearsal builds its database through the production migration path and loads the archived Gameweek and Predictions already used by the dry run
- [x] Fabricated Fixture results remain confined to the throwaway database and the configured live database is never opened for writes
- [x] The rehearsal cannot reach the network and refuses any dependency that is not satisfied by archived or stored data
- [x] One run produces Match Points, probability metrics, Comparison Anchor comparisons, behavioural metrics and all three Reference Lines
- [x] The output includes every Entrant and enough per-Fixture detail for a reviewer to inspect a surprising total
- [x] Expected metric values and row counts are asserted rather than accepted because the output looks plausible
- [x] A second run with the same injected clock leaves row counts, values, sample sizes, intervals and details unchanged
- [x] The operator command exits non-zero when the full expected scoring record is not produced

---

## Run scoring daily with failure alerting

**What to build:** Scoring runs every day after the fetch has materialised results and deferred
state, can be started by hand after a correction, and raises an actionable issue when the job
fails. An ordinary day with nothing scoreable remains silent.

**Blocked by:** Rehearse the complete scorer on the archived Gameweek.

- [x] A score command runs the complete Match track scorer for the configured Season and can be invoked locally or by the workflow
- [x] The new score workflow establishes the specified daily 10:00 UTC run after the existing 06:00 UTC fetch, preserving the ordering dependency for deferred Fixtures
- [x] A manual dispatch runs the same scoring path and can immediately apply a corrected result
- [x] The workflow pins its dependencies, uses a scoring concurrency group and applies the same database configuration conventions as the existing jobs
- [x] A Gameweek with no settled result is skipped successfully and emits no misleading zero score or failure alert
- [x] Repeated scheduled and manual runs are safe and cannot duplicate scoring rows
- [x] A workflow failure opens or comments on one scoring-failure issue, links the failed run and uses the configured assignee when present
- [x] Failure reporting reuses the shared open-or-comment boundary and is tested at the `gh` process boundary rather than inferred from YAML text
- [x] Workflow configuration and the operator command are tested without contacting the live database
