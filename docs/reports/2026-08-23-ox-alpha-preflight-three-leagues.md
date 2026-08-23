# Base Model pre-flight, Ox Alpha (`stealth/ox-alpha`) across La Liga, Serie A and Ligue 1 — 2026-08-23

Ticket: [0051-the-other-three-leagues-walk-the-same-door.md](../tickets/0051-the-other-three-leagues-walk-the-same-door.md).
Decisions: [ADR-0032](../adr/0032-exhibition-runs-join-the-record-after-the-fact.md),
[ADR-0038](../adr/0038-one-prompt-template-one-prompt-version-per-competition.md).
Steps: [docs/runbooks/a-new-base-model-arrives.md](../runbooks/a-new-base-model-arrives.md) section 3.
The Premier League's own pre-flight is
[2026-08-23-ox-alpha-preflight.md](2026-08-23-ox-alpha-preflight.md).

Three leagues in one document because one Base Model was checked three times in
one sitting. What differs between the runs is the Competition's Prompt Version
and the Fixture; the row, the provider pin and the call path are the Premier
League's, unchanged.

## The rows

| Competition | Seat | Prompt Version |
|---|---|---|
| `PD` | `exhibition-pd/ox-alpha` | `match-pd/2026-27-v2` |
| `SA` | `exhibition-sa/ox-alpha` | `match-sa/2026-27-v1` |
| `FL1` | `exhibition-fl1/ox-alpha` | `match-fl1/2026-27-v1` |

Every other column is the Premier League row's: base model `stealth/ox-alpha`,
provider `stealth`, quantization null, role `exhibition`, and a `config`
carrying `First-party`, `canonical_slug` and the 2026-08-23 catalog date.

## Observations

Each run reported `ok: true`, `status: parseable`, no refusal, and resolved
`Stealth` / `stealth/ox-alpha`. Telemetry is read from the response archived in
`raw_snapshots` under `openrouter-preflight:stealth/ox-alpha`.

| Competition | Fixture | Generation | `finish_reason` | Prompt | Completion | Reasoning | Cost |
|---|---|---|---|---|---|---|---|
| `PD` | 564638, Rayo Vallecano de Madrid v Deportivo Alavés (GW2) | `gen-1787490194-WMLdfaVOPAmYci4mCvGX` | `stop` | 2,051 | 3,154 | 0 | $0.00 |
| `SA` | 558629, Udinese Calcio v Como 1907 (GW1) | `gen-1787492572-26QUwCg7HiG84T46MuxM` | `stop` | 1,612 | 2,688 | 0 | $0.00 |
| `FL1` | 559711, Le Mans FC v Stade Brestois 29 (GW1) | `gen-1787492774-tImnFNjOTLDb0Bwb0sIh` | `stop` | 1,308 | 1,562 | 0 | $0.00 |

The largest of the three used 3,154 of the 32,000-token output ceiling, under
10%.

**`reasoning_tokens` is zero on every call, and that is the answer to a
question ticket 0049 left open.** The catalog advertises `reasoning` and
`reasoning_effort` support, and one pre-flight reporting no reasoning could
have been that call rather than that model. It is the model: across all four
pre-flights and all nineteen answered Fixtures of the four replays,
`completion_tokens_details.reasoning_tokens` is `0`. Ox Alpha writes longer and
shorter answers, not more and less reasoning — the same shape `qwen/qwen3.8-max`
shows. The ceiling risk 0049 flagged is therefore lower than the flag implied,
and what holds the real margin on this benchmark is `deepseek/deepseek-v4-pro`
at 23,216 completion tokens, of which 23,075 were reasoning.

## One defect found, in the check rather than in the model

The Ligue 1 pre-flight refused before it reached OpenRouter:

```
Error: COMPETITION must be a Competition code such as PL or PD
```

`readCompetition` shaped the variable as `^[A-Z]{2,3}$`, and two of the five
codes the `competition_code` domain names end in a digit. `BL1` and `FL1` were
refused by their own names — not only for an Exhibition Run, but for every
pre-flight and every preview aimed at those leagues, while the scheduled
prediction, fetch and scoring jobs took them without complaint. The shape now
admits a trailing digit and points at the domain as the authority on which
codes exist; the suite pins both digit-bearing codes.

## Verdict

Go, on all three. Each answered cleanly on its own league's frozen prompt with
no truncation risk observed, and the replays that followed are recorded in
ticket 0051.
