# Gameweek 1 predicted twice — the v2 amendment's effect on what Entrants say — 2026-08-12

Companion to the same day's
[pre-flight](./2026-08-12-prior-season-ppg-squad-changes-preflight.md)
([tickets 0012](../tickets/done/0012-prior-season-ppg-and-squad-changes-in-the-match-context.md),
[spec 0012](../specs/0012-prior-season-ppg-and-squad-changes-in-the-match-context.md)).
The pre-flight proved the amended context parses on all nine seats; this asks the next
question — **what the additions actually change in the Predictions** — by running the whole
of Gameweek 1 once on each side of the amendment and comparing the 180 answers.

Nothing here is evidence in the benchmark's sense. No Fixture has a result, so nothing is
scored, nothing ranks, and no claim about forecasting skill survives contact with this
report. It is a behavioural look at how nine Base Models respond to two new sections of
context, taken while the amendment could still be looked at in isolation — before the
Season starts and the two prompt states stop being comparable on level ground.

## The two runs

Both are full `predict` runs over the real Gameweek 1 schedule (ten Fixtures, deadline
`2026-08-21T17:30:00Z`), on local databases built from the real sources. Neither touched
the live database.

| | Before | After |
|---|---|---|
| Context | `match/2026-27-v2` before the amendment | with prior-Season PPG and Squad Changes |
| Context size, GW1 | 3,255–5,360 bytes | 4,358–6,825 bytes |
| History behind it | `fetch:history` + `fetch:xg-history`, 2025-26 | same, plus the Squad Change partition |
| Predictions | 90 — all nine seats, all ten Fixtures | 90 |

The before-run is also where the
[pre-flight's routing finding](./2026-08-12-prior-season-ppg-squad-changes-preflight.md)
first bit in anger: Kimi and Qwen Gapped all ten Fixtures on their stale pins
(`No endpoints found`) and were filled after unpinning. The fill resolved to the very same
dated snapshots the pins had named, which is what makes the comparison below whole.

**Same seats, same snapshots, verified.** The two databases name their seats differently
(`claude/v1` versus `match/claude-opus-5`), so sameness was read from
`attempts.resolved_model` rather than assumed: all nine seats resolved to identical dated
snapshots on both runs — `anthropic/claude-opus-5-20260723` through
`qwen/qwen3.7-max-20260520` — at the same providers. The prompt bytes are the only
deliberate difference between the runs.

## What moved

Movement is total variation distance per Prediction —
`TV = ½(|ΔH| + |ΔD| + |ΔA|)`, the share of probability that changed sides — plus whether
the Predicted Score changed and whether the argmax Outcome flipped.

**Overall: mean TV 0.039 · Predicted Score changed on 32/90 · Outcome flipped on 7/90.**
About four points of probability moved per Fixture on average. The amendment nudges, it
does not upend.

### Per Entrant — sensitivity to the new sections varies fourfold

| Entrant | mean TV | max TV | score changed | Outcome flips |
|---|---|---|---|---|
| Qwen3.7 Max | 0.073 | 0.240 | 3/10 | 2 |
| GLM 5.2 | 0.055 | 0.100 | 5/10 | 0 |
| DeepSeek V4 Pro | 0.047 | 0.120 | 6/10 | 1 |
| MiniMax M3 | 0.042 | 0.100 | 2/10 | 1 |
| GPT-5.6 Sol Pro | 0.037 | 0.080 | 5/10 | 1 |
| Kimi K3 | 0.035 | 0.140 | 3/10 | 1 |
| Gemini 3.1 Pro Preview | 0.030 | 0.080 | 2/10 | 1 |
| Claude Opus 5 | 0.023 | 0.060 | 4/10 | 0 |
| Grok 4.5 | 0.013 | 0.050 | 2/10 | 0 |

Qwen moved most — over five times Grok's mean, including the single largest move of the
comparison. Grok barely acknowledged the additions.

### Per Fixture — the close games moved, the foregone ones did not

Mean TV across the nine seats:

| | | |
|---|---|---|
| Brentford v Spurs **0.066** | Everton v Crystal Palace 0.036 | Brighton v Aston Villa 0.029 |
| Fulham v Chelsea **0.060** | Arsenal v Coventry City 0.034 | Nott'm Forest v Leeds 0.023 |
| Ipswich v Sunderland **0.057** | Hull City v Man Utd 0.032 | Man City v Bournemouth **0.019** |

This is the pattern that makes the comparison worth recording. The three most-moved
Fixtures are the closest calls on the card, where a PPG line or a summer's squad movement
plausibly carries real weight; the least moved is Man City v Bournemouth, where no
amount of transfer news was going to change anyone's mind. Pure run-to-run noise has no
reason to organise itself by fixture difficulty.

### The largest single moves

| TV | Seat | Fixture | H/D/A before → after | Score |
|---|---|---|---|---|
| 0.24 | Qwen | Newcastle v Liverpool | 0.22/0.24/0.54 → 0.43/0.27/0.30 | 1-2 → 2-1 **flip** |
| 0.15 | Qwen | Brentford v Spurs | 0.55/0.23/0.22 → 0.40/0.28/0.32 | 2-1 → 2-1 |
| 0.14 | Qwen | Fulham v Chelsea | 0.38/0.27/0.35 → 0.24/0.27/0.49 | 2-1 → 1-2 **flip** |
| 0.14 | Kimi | Ipswich v Sunderland | 0.27/0.26/0.47 → 0.40/0.27/0.33 | 1-2 → 2-1 **flip** |
| 0.12 | DeepSeek | Fulham v Chelsea | 0.30/0.40/0.30 → 0.40/0.28/0.32 | 1-1 → 2-1 **flip** |

Qwen reversing Newcastle v Liverpool wholesale — a 0.54 Away collapsing to 0.30 — is the
move most worth a look at the two rationales side by side.

## What this does not show

- **One run per side.** These Base Models are stochastic at the same prompt, so an unknown
  share of every number above is run-to-run noise. The 0.039 is a ceiling on the
  amendment's effect, not an estimate of it; only the fixture-difficulty pattern argues
  that it is not all noise. Two runs per side would separate the two, and were not worth
  another $8 today.
- **Nothing about accuracy.** Whether the moved Predictions are *better* is a question the
  Season answers, one settled Gameweek at a time, in the probability layer.
- **Nothing about the live database.** Both runs are local experiments. The deploy steps
  the pre-flight names — migration 0018, the fetch that knows the Wikipedia source, the
  repins — remain outstanding on live, ahead of the first Lock on 2026-08-21.
