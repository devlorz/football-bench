# Jev's first Fixture, and then the Premier League — 2026-09-18

> **Amended 2026-09-18.** This report described one replay, the Premier League's. The
> record holds five. Four more rows — `exhibition-pd/jev-latest`,
> `exhibition-sa/jev-latest`, `exhibition-fl1/jev-latest`, `exhibition-bl1/jev-latest` —
> were created together at 14:11:37.798343Z, after this report's Premier League run, and
> answered between 14:14:27Z and 14:21:00Z. Each was stated and approved separately, as
> ticket 0080's "Past the Premier League" section records; what was missing was this
> report, which is where the operator's own runbook puts the figures. The sections from
> **The four further replays** down are that record, written from the database on
> 2026-09-18. The filename still says "premier-league-replay" because links to it already
> exist; the report no longer does.
>
> The same reading found a Gap this file's Premier League section could not have known
> about, and it refutes a sentence of ADR-0059 — see **The Serie A Gap** below and the
> amendment that Gap put at the head of
> [ADR-0059](../adr/0059-an-exhibition-run-may-answer-through-a-typed-endpoint-instead-of-a-chat-one.md).

Ticket: [0080-jev-answers-its-first-fixture-and-then-a-competition.md](../tickets/0080-jev-answers-its-first-fixture-and-then-a-competition.md).
Decisions: [ADR-0059](../adr/0059-an-exhibition-run-may-answer-through-a-typed-endpoint-instead-of-a-chat-one.md).
Steps: [docs/runbooks/a-new-base-model-arrives.md](../runbooks/a-new-base-model-arrives.md) sections 3 and 6.

## Pre-flight context

| Check | Observed |
|---|---|
| Target seat | `exhibition/jev-latest` (`role = 'exhibition'`) |
| Base Model | `jev-latest` |
| Provider | `typesafe` (sole endpoint, `https://api.typesafe.ai/v1/systemone`) |
| Quantization | `null` |
| Prompt Version | `match/2026-27-v2` |
| Fixture used | 1, Arsenal v Coventry City, kick-off `2026-08-21T19:00:00Z` |
| Pricing | $0.042 / MTok input, output free (from the TypeSafe account) |

## A request-shape bug, not the anticipated 422

The first pre-flight call returned HTTP 422, but not the "`state` does not fit" outcome
ADR-0059 and ticket 0080 both expected. TypeSafe's own schema error named the cause:

```
Input tag 'Choice' found using 'type' does not match any of the expected tags:
<QuestionType.Noul: 'noul'>, <QuestionType.Choice: 'choice'>, <QuestionType.Score: 'score'>,
<QuestionType.BoundingBox: 'bounding_box'>
```

Ticket 0079's `typesafeRequest` sent `"type": "Choice"` (capitalized) for both questions;
TypeSafe's discriminator is lower-case. Nothing in TypeSafe's documentation states the
casing — this was exactly the kind of fact only a real call surfaces. Fixed in
`src/predictions/typesafe-entrant.ts` (both `outcome` and `score` questions now send
`"choice"`) and in the test that had baked in the same wrong guess
(`test/typesafe-entrant.test.ts`). `tsc --noEmit` and the full `typesafe-entrant.test.ts`
suite are clean after the fix. The re-run pre-flight call below is the one this fix
produced.

## Pre-flight observation

A single-model pre-flight targeting `exhibition/jev-latest` ran against Premier League
Fixture 1 (`Arsenal v Coventry City`) under `match/2026-27-v2`. The raw response was
archived byte-for-byte in `raw_snapshots` under `typesafe-preflight:jev-latest`:

```json
{
  "model": "jev-1.13.0",
  "answers": {
    "outcome": {
      "type": "choice",
      "choice": "H",
      "confidence": 1.0,
      "probabilities": { "A": 0.0, "H": 1.0, "D": 0.0 }
    },
    "score": {
      "type": "choice",
      "choice": "3-0",
      "confidence": 0.78,
      "probabilities": {
        "3-0": 0.79, "2-0": 0.11, "4-0": 0.04, "3-1": 0.03, "1-0": 0.01, "4-1": 0.01
        /* the remaining 30 of 36 scorelines answered 0.0 */
      }
    }
  },
  "usage": { "input_tokens": 3212, "output_tokens": 379 }
}
```

## Telemetry and verdict

- **Status:** `parseable` (`ok: true`), HTTP 200, no refusal.
- **Resolved provider / model:** `typesafe` / `jev-1.13.0`.
- **Outcome distribution:** Home win 1.0, Draw 0.0, Away win 0.0 — a confident, resolved
  call rather than a flat or missing one.
- **Score distribution:** 36 scorelines returned, mass concentrated on `3-0` (0.79) with
  the rest of the probability on nearby, plausible scorelines (`2-0`, `4-0`, `3-1`,
  `1-0`, `4-1`) and 30 of 36 lines at 0.0 — a shaped distribution, not degenerate.
- **`usage`:** 3,212 input tokens, 379 output tokens.
- **Latency:** under 10 seconds, observed wall-clock on the operator's terminal (this
  codebase does not instrument pre-flight latency — see the `attempts`-table method in
  [the five-minute-window report](2026-08-20-latency-under-the-five-minute-window.md),
  which does not apply here since pre-flight writes no `attempts` row).
- **Price:** $0.042/MTok input, output free (TypeSafe account dashboard). At 3,212 input
  tokens, one call costs **≈$0.000135**. The account's own per-call spend read
  `<$0.01` for the day, consistent with this.
- **Go verdict:** none of the three stop conditions fired — not a 401, not a 422 on
  `state` (the one 422 seen was the request-shape bug above, now fixed), and a
  parseable answer with usable `usage`. Ready for the replay.

## The replay permission request

Stated to the operator before any replay call was made: 40 played Premier League
Fixtures with a stored `match`-track context (the exact count `replay-match-exhibition.ts`
resolves at call time, read via `select count(*) from fixtures f join contexts c on ...
where f.competition = 'PL' and f.season = '2026-27' and f.result is not null`), 40 calls,
no Repair chain behind any of them, and a derived total of **$0.005–$0.01** at the
observed per-call rate. The operator confirmed. The replay ran:

```bash
EXHIBITION_MODEL_ID=exhibition/jev-latest COMPETITION=PL npm run exhibition:replay
```

## Replay outcome

```
exhibition/jev-latest covered Gameweeks 1, 2, 3, 4 of the 2026-27 Match track.
```

- **Predictions written:** 40. **Attempts:** 40. **Errored attempts:** 0 — every Fixture
  answered on the first attempt, no Repair, no Gap.
- **Match Points scoring:** run separately (`COMPETITION=PL npm run match:score`, a free,
  local computation — no Base Model call) since a replay writes Predictions but does not
  score them. Before: `matchPoints: 0, betPoints: 0, n: 0`. After: `matchPoints: 52,
  betPoints: 157, n: 40`.

## Surface check

Read directly off `handleDashboardRequest`'s `/api/pl/leaderboard` response against the
production database (the same function `src/dashboard/worker.ts` serves in production;
`src/cli/dev-api.ts` is its local-development wiring):

- `exhibition/jev-latest` appears in `entrants` with `"exhibition": { "ranAfterGw": 4 }`
  and `n: 40` — the "ran after Gameweek N" label the ticket asked for.
- The leaderboard body's `typesafeCaveat` field is present (`"This Exhibition Run was
  asked through a typed endpoint, not the chat prompt every other seat answers. Its
  Repair count and its rationale mean nothing here."`) — `typesafeCaveatField` in
  `read-api.ts` sets it whenever any row on the page is a typesafe Exhibition row, which
  `exhibition/jev-latest` now is.
- Its Repair count is 0, matching the "means nothing here" caveat rather than
  contradicting it.
- `matchRoster` in `score-match-gameweek.ts` selects `role = 'entrant'` for the Comparison
  Anchor and every complete case (ADR-0032's mechanism, exercised unchanged by
  ticket 0079's tests) — `exhibition/jev-latest` is `role = 'exhibition'`, so it is
  excluded from the Comparison Anchor, the complete-case intersection and every interval
  by the same construction every other Exhibition row already relies on. No new code
  path was needed for this row, and none was added.

## What ADR-0059 asked to learn

- **Price:** $0.042/MTok input, output free — cheap enough that the 40-call replay cost
  a fraction of a cent.
- **Rate limit:** not hit at 40 sequential calls; unknown above that.
- **Does the stored context fit `state`:** yes — the Premier League's `match/2026-27-v2`
  context (the same one every other seat reads) sent whole, no truncation, no 422 on
  size at any of the 41 calls made (1 pre-flight + 40 replay).

---

## The four further replays

Written from the database on 2026-09-18, after the fact. No contemporaneous note of these
runs exists.

| Row | Prompt Version | Created | First answer | Last answer |
|---|---|---|---|---|
| `exhibition/jev-latest` (PL) | `match/2026-27-v2` | 13:49:14.827958Z | 13:56:43.755Z | 13:56:54.023Z |
| `exhibition-pd/jev-latest` | `match-pd/2026-27-v2` | 14:11:37.798343Z | 14:14:27.466Z | 14:14:43.412Z |
| `exhibition-sa/jev-latest` | `match-sa/2026-27-v1` | 14:11:37.798343Z | 14:20:17.540Z | 14:20:31.059Z |
| `exhibition-fl1/jev-latest` | `match-fl1/2026-27-v1` | 14:11:37.798343Z | 14:20:36.311Z | 14:20:47.715Z |
| `exhibition-bl1/jev-latest` | `match-bl1/2026-27-v1` | 14:11:37.798343Z | 14:20:52.353Z | 14:21:00.220Z |

The four later rows share one `created_at` to the microsecond, so they were inserted by a
single statement. Each names its own Competition's frozen Prompt Version, which is what
ADR-0038 requires and what would have refused a row seated under the wrong one. Ticket
0080's "Past the Premier League" section records that each of the four was stated and
approved separately, and carries two findings from running them that belong there rather
than here: the id prefix a combined-ranking row needs, and the retired La Liga Gameweek
the replay never reached.

**What they cost.** Output is a constant 379 tokens per call in every Competition, the
two Choice questions having 3 and 36 options and no prose to write; input varies with the
Competition's context length.

| Competition | Calls | Input tokens | Output tokens | Cost at $0.042/MTok |
|---|---|---|---|---|
| PL | 40 | 185,812 | 15,160 | $0.0078 |
| PD | 53 | 170,861 | 20,087 | $0.0072 |
| SA | 40 | 140,857 | 15,160 | $0.0059 |
| FL1 | 36 | 117,118 | 13,644 | $0.0049 |
| BL1 | 27 | 90,935 | 10,233 | $0.0038 |
| **Total** | **196** | **705,583** | **74,284** | **$0.0296** |

The pre-flight's three unknowns are answered the same way at five Competitions as at one:
no 422 on `state` size at any of the 197 calls made, no rate limit reached at 53
sequential calls, and a total spend of three cents.

## The five-Competition record

Read from `scores` at each Competition's latest scored Gameweek.

| Competition | Through GW | n | Match Points | Bet Points | Bet hit % | RPS | Coherence |
|---|---|---|---|---|---|---|---|
| PL | 5 | 40 | 52 | 157 | 0.5607 | 0.2336 | 0.8250 |
| PD | 7 | 53 | 61 | 201 | 0.5418 | 0.2798 | 0.8868 |
| SA | 5 | 39 | 74 | 165 | 0.6044 | 0.2047 | 0.9487 |
| FL1 | 5 | 36 | 53 | 137 | 0.5437 | 0.2482 | 0.8889 |
| BL1 | 4 | 27 | 32 | 107 | 0.5661 | 0.2704 | 1.0000 |
| **Total** | | **195** | **272** | **767** | **0.5619** | | |

195 Predictions from 196 calls: the missing one is the Serie A Gap below.

**Coherence is the figure worth stopping on.** It is the share of Fixtures where the
likeliest outcome by `probs` agrees with the outcome the Predicted Score implies, and
every chat seat writes both out of one JSON answer. This wire asks two independent Choice
questions (ADR-0059's mapping), so nothing makes them agree, and they disagree in seven of
forty Premier League Fixtures. That is a property of the mapping, not of the Base Model,
and it is the second thing after the Repair count that a reader must not compare across
wires.

## The Serie A Gap

**Fixture 558617, Udinese Calcio v SS Lazio, Gameweek 3, kick-off 2026-09-07T18:45:00Z.**
One attempt, `attempt_no` 0, `ok = false`:

| Field | Value |
|---|---|
| `error_kind` | `probs_sum` |
| `error_detail` | Probabilities H, D and A must sum to 1 within ±0.001. |
| `resolved_provider` | `typesafe` |
| `latency_ms` | 388 |
| `tokens_in` / `tokens_out` | 3,745 / 379 |
| `attempted_at` | 2026-09-18T14:20:25.569Z |

The stored context was shown: `contexts` row 265, 5,968 bytes, the bytes every Serie A
seat read. So Jev was asked the Fixture and its own `probabilities` map came back
unsummable. It is not a transport fault, not a 422 on size, and not a Fixture the replay
passed over.

**Why it became permanent.** `probs_sum` is one of the two `REPAIRABLE_KINDS`: a chat
seat answering this way is Repaired up to three times. The typed wire skips Repairs, and
ADR-0059's decision 3 justified that skip with the claim that a typed reply "cannot be
malformed JSON or fail to sum to 1". This call is that claim's counterexample, so the one
bad distribution ended the Fixture on the first attempt. An Exhibition Gap alerts nobody
by construction (ADR-0032), which is why nothing surfaced it until the record was read by
hand four hours later. ADR-0059 now carries the amendment; whether this wire should get a
Repair of its own is left open there.

## What the probability layer says

ADR-0012 holds that a claim about one Base Model forecasting better than another rests on
the probability layer alone. Jev's Premier League RPS, against the whole board at
Gameweek 5:

| Seat | RPS | n |
|---|---|---|
| `moonshotai/kimi-k3` (best Entrant) | 0.1918 | 40 |
| `anthropic/claude-opus-5` (worst Entrant) | 0.1981 | 40 |
| `reference-elo` | 0.2153 | 40 |
| `reference-uniform` | 0.2194 | 40 |
| `reference-home` | 0.2270 | 40 |
| **`jev-latest`** | **0.2336** | **40** |

**Last of seventeen rows, behind every Entrant, every Exhibition Run and all three
Reference Lines — including the uniform one.** A seat that answered 1/3, 1/3, 1/3 to every
Fixture would have scored better. The pre-flight's answer shows why: Jev returned
`{"H": 1.0, "D": 0.0, "A": 0.0}` with confidence 1.0, and RPS punishes a confident wrong
call far harder than a hedged one. Its scoreline implied the right outcome in 19 of 40
Premier League Fixtures.

This is the figure that belongs beside the Bet Points ranking, where the same Predictions
place `jev-latest` second on the combined board. Bet Points count seven flat, oddsless
markets read off one named scoreline and never read `probs` at all (ADR-0023), so the two
rankings are reading different properties of the same answer, and only one of them is
evidence.

## The combined ranking

On `/overall` at 196 Fixtures, `jev-latest` stands second on Bet Points with 767 against
Claude Opus 5's 783, and holds 272 Match Points against that seat's 332.

Three readings keep the second place in proportion, all taken 2026-09-18:

- **It is not a coverage artifact.** Jev settled 195 Fixtures; the Entrants settled 196
  to 202. It covers fewer, not more, so the count is not flattered by never having
  Gapped — the one Gap it has is above.
- **Its rate is second too, and inside the noise.** Bet hit 0.5619 against Opus 5's
  0.5743. The spread across all fifteen seats runs 0.5174 to 0.5743, and with seven legs
  read off one scoreline the independent unit is the Fixture, not the leg: at n = 195 one
  standard deviation is about 3.5 points of percentage, so the whole field sits within
  roughly one of another.
- **The lead is in the goal-total family, and it is calibration rather than
  discrimination.** Per-market rates over the same population, computed from the
  Predictions by `betSlip`'s own rules:

  | Market | Jev | Best Entrant | Jev's rank of 11 |
  |---|---|---|---|
  | result | 0.492 | 0.531 (Opus 5) | 5 |
  | over/under 1.5 | **0.759** | 0.750 (Muse Spark) | **1** |
  | over/under 2.5 | 0.554 | 0.612 (Opus 5) | 3 |
  | over/under 3.5 | **0.621** | 0.612 (Opus 5) | **1** |
  | over/under 4.5 | **0.764** | 0.760 | **1** |
  | both teams to score | **0.615** | 0.607 (Opus 5) | **1** |
  | handicap 1.5 | 0.128 | 0.149 (Gemini 3.1 Pro) | 3 |

  An earlier draft of this section said the lead was one market, both teams to score.
  That was read off the Premier League alone and does not survive the other four: Jev
  tops four of the seven. What the four have in common is that they are decided by how
  many goals a seat expects, not by which match it is.

- **Why those four.** The Fixtures averaged 3.07 goals. Jev's Predicted Scores average
  2.75, the closest of any seat; every Entrant sits between 1.99 and 2.46, and Jev names
  a total of 0 or 1 in 2.1% of Fixtures where the Entrants do in 7.1% to 21.9%. The 1.5,
  3.5 and 4.5 lines are decided by the extremes, so a seat that rarely names a very low
  total wins them almost automatically. The two markets that need one match told from
  another — the result leg and the 2.5 line, which sits nearest the median total — are
  the two where Jev is behind Opus 5, by 3.9 and 5.8 points of percentage. Its lead on
  both teams to score is 0.8 points, about one and a half Fixtures in 195.

  This is the frozen Bet Points qualification's own warning, measured: the cheap
  goal-total lines are weighed against markets that are not, and a less biased goal
  expectation is enough to carry four of seven.

So the same Predictions that rank second on a board the project's own frozen
qualification calls "not evidence" rank last on the board that is. Nothing here
distinguishes recall from skill either — Match Points of 272 over 195 Fixtures rule out a
Base Model reading its own memory of the scorelines, which is the one thing a low number
here can honestly be said to show.

## Addendum, 2026-09-22: four more readings of the same Predictions

Read from production on 2026-09-22, over every Fixture Jev has answered that has a result
and sits in a locked Gameweek: 244 across the five Competitions, up from 195 above. No
Base Model was called; everything below is a local computation over `predictions`,
`fixtures.result` and the archived `attempts.raw_response`. The script is a scratch file
and is not in the repository; the queries and the arithmetic are described beside each
table so the numbers can be re-derived.

**1. The mapping is not the cause.** ADR-0059's wire asks two Choice questions, and the
stored `probs` come from the outcome one. Jev's archived reply also carries a
probability per scoreline for the second question, so an outcome distribution can be
derived from it by summing the mass of every `H`, `D` and `A` scoreline. RPS of the
same 244 Fixtures under each:

| Competition | n | RPS, stored `probs` | RPS, derived from scorelines | RPS, uniform |
|---|---:|---:|---:|---:|
| PL | 50 | 0.2727 | 0.2536 | 0.2244 |
| PD | 63 | 0.2804 | 0.2738 | 0.2381 |
| SA | 50 | 0.2181 | 0.2148 | 0.2478 |
| FL1 | 45 | 0.2617 | 0.2609 | 0.2296 |
| BL1 | 36 | 0.2758 | 0.2724 | 0.2454 |
| **All** | **244** | **0.2619** | **0.2550** | **0.2368** |

The derived distribution is a little better and still behind uniform in four
Competitions of five. The two questions also agree with each other: the argmax
outcome matches in 214 of 244, and the scoreline Choice is the top of the scoreline
distribution in 241 of 244. So the loss on this layer is the Base Model's own reading
of the Fixture, not a property of asking it twice.

**2. Calibration.** Fixtures bucketed by the largest stored probability, with the hit
rate of that argmax beside the pooled figure for the eleven Entrants over their 2,625
settled Predictions:

| Largest probability | Jev n | Jev mean confidence | Jev hit rate | Entrants pooled hit rate |
|---|---:|---:|---:|---:|
| below 0.45 | 13 | 0.407 | 0.462 | 0.375 |
| 0.45 to 0.59 | 52 | 0.528 | 0.385 | 0.491 |
| 0.60 to 0.79 | 56 | 0.691 | 0.357 | 0.782 |
| 0.80 to 0.99 | 89 | 0.917 | 0.472 | 0.927 |
| exactly 1.00 | 34 | 1.000 | 0.882 | no Entrant answers 1.00 |

This corrects the guess made above under "What the probability layer says". The
confidence-1.0 answers are not where the score is lost: 34 of them land at 88%. The loss
is the 89 Fixtures answered at 0.80 to 0.99, where Jev is right in fewer than half, on a
band where the Entrants are right in more than nine of ten. Every band from 0.45 upward
is over-confident by a wide margin, and the ordering is barely monotone.

**3. The current RPS board, all five Competitions.** Mean RPS over each seat's settled
Predictions, best first. Exhibition rows are marked; three of them cover a handful of
Fixtures and are listed for completeness only.

| Seat | n | RPS |
|---|---:|---:|
| `glm-5.2` (entrant, La Liga only) | 6 | 0.1669 |
| `claude-fable-5.1` (exhibition) | 30 | 0.1880 |
| `gpt-6-astra` (exhibition) | 65 | 0.1961 |
| `ox-alpha` (exhibition) | 35 | 0.1972 |
| `claude-opus-5` | 250 | 0.2015 |
| `kimi-k3` | 248 | 0.2024 |
| `gemini-3.1-pro-preview` | 248 | 0.2025 |
| `minimax-m3` | 250 | 0.2028 |
| `muse-spark-1.2` | 250 | 0.2032 |
| `grok-4.6` | 250 | 0.2039 |
| `deepseek-v4-pro` | 250 | 0.2039 |
| `gpt-5.6-sol-pro` | 250 | 0.2040 |
| `qwen3.8-max` | 249 | 0.2046 |
| `glm-5.3` | 244 | 0.2046 |
| **`jev-latest`** (exhibition) | **244** | **0.2619** |

Last in every Competition and last overall. The eleven full-coverage Entrants span
0.2015 to 0.2046, a spread of 0.003; Jev sits 0.06 behind the group. The Serie A
figure, 0.2181, is its only one better than uniform.

**4. A paired interval against the best full-coverage Entrant.** Per-Fixture RPS
differences, Jev minus `claude-opus-5`, over the 244 Fixtures both settled, through the
project's own `bootstrapInterval` (10,000 percentile resamples, 95%, seeded from the
differences). Exploratory: the `role` filter keeps Exhibition rows out of every declared
interval, and this one is computed the same way for a reader, not published.

| Difference | n | Mean | 95% interval |
|---|---:|---:|---|
| Jev stored `probs` minus Opus 5 | 244 | +0.0593 | [0.0334, 0.0849] |
| Jev derived minus Opus 5 | 244 | +0.0523 | [0.0271, 0.0791] |

Positive is Jev worse; neither interval reaches zero. The gap on the probability
layer is not noise at this sample, under either reading of Jev's answer.

**What this adds to the reading above.** The second place on Bet Points stands as
explained: a less biased goal expectation carrying four goal-total markets. On the
layer ADR-0012 says evidence rests on, the same Predictions are last of fifteen, behind
uniform, and behind the best Entrant by an interval that excludes zero. The cause is
over-confidence in the 0.80 to 0.99 band, not the confidence-1.0 answers and not the
two-question mapping, which is a reason to leave ADR-0059's open Repair question where
it is: a Repair would recover the one Serie A Gap and change nothing here.
