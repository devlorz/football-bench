# Base Model pre-flight, GPT-6 Astra and Claude Fable 5.1 — 2026-09-10

Decisions: [ADR-0032](../adr/0032-exhibition-runs-join-the-record-after-the-fact.md).
Steps: [docs/runbooks/a-new-base-model-arrives.md](../runbooks/a-new-base-model-arrives.md) sections 2, 3 and 6.

Both Base Models arrived after ADR-0034's roster cutoff and after the first Lock —
`openai/gpt-6-astra` published 2026-09-03, `anthropic/claude-fable-5.1` 2026-08-31 — so the
door is the Exhibition Run, not the Season Roster. Neither touches an Entrant row.

## Catalog, read before the seats were written

| | GPT-6 Astra | Claude Fable 5.1 |
|---|---|---|
| Base Model | `openai/gpt-6-astra` | `anthropic/claude-fable-5.1` |
| `canonical_slug` | `openai/gpt-6-astra-20260903` | `anthropic/claude-fable-5.1-20260831` |
| Endpoints | OpenAI (`openai`, `openai/flex`, `openai/fast`), Azure (`azure`, `azure/us`) | Anthropic, Azure, Amazon Bedrock, Google Vertex |
| Quantization on every endpoint | `unknown` | `unknown` |
| Pricing (prompt / completion) | $10 / $50 per M | $10 / $50 per M |
| Base Model Class | Frontier (GPT) | Frontier (Claude) |

Successors, not snapshots: each carries a dated `canonical_slug` behind an undated slug that
did not previously exist. `quantization` stays `null` on both seats — every endpoint reports
`unknown`, so a filter would match nothing and the provider pin is the whole of it.

The three OpenAI tags are priced $5/$25 (`openai/flex`), $10/$50 (`openai`) and $20/$100
(`openai/fast`); the seat pins `order: ['openai']` with fallbacks off, and the observation
below says which one answered.

## The seats

Written by hand, `role = 'exhibition'`, at the Premier League's Prompt Version. No migration
and no ADR — ADR-0032 decided this door and the harness takes a `model_id`.

| | |
|---|---|
| `exhibition/gpt-6-astra` | `openai/gpt-6-astra`, provider `openai`, quantization `null`, `match/2026-27-v2` |
| `exhibition/claude-fable-5.1` | `anthropic/claude-fable-5.1`, provider `anthropic`, quantization `null`, `match/2026-27-v2` |

## Pre-flight observation

One single-model pre-flight each, against Premier League Fixture 1 (`Arsenal v Coventry City`,
kick-off `2026-08-21T19:00:00Z`) under `match/2026-27-v2`. Both raw responses are archived
byte-for-byte in `raw_snapshots` under `openrouter-preflight:<base model>`.

```json
{
  "ok": true,
  "results": [
    {
      "modelId": "exhibition/gpt-6-astra",
      "baseModel": "openai/gpt-6-astra",
      "status": "parseable",
      "detail": null,
      "resolvedProvider": "OpenAI",
      "resolvedModel": "openai/gpt-6-astra-20260903",
      "rawBody": null
    }
  ]
}
```

```json
{
  "ok": true,
  "results": [
    {
      "modelId": "exhibition/claude-fable-5.1",
      "baseModel": "anthropic/claude-fable-5.1",
      "status": "parseable",
      "detail": null,
      "resolvedProvider": "Anthropic",
      "resolvedModel": "anthropic/claude-fable-5.1-20260831",
      "rawBody": null
    }
  ]
}
```

## Telemetry and verdict

| From the archived responses | GPT-6 Astra | Claude Fable 5.1 |
|---|---|---|
| Generation | `gen-1789029710-HJi9lrBoMS0Yhz9vw3jy` | `gen-1789029724-nMCnMpn5audiaDxnGzEU` |
| Status | `parseable`, no refusal | `parseable`, no refusal |
| Resolved provider / model | `OpenAI` / `openai/gpt-6-astra-20260903` | `Anthropic` / `anthropic/claude-fable-5.1-20260831` |
| `finish_reason` (native) | `stop` (`completed`) | `stop` (`end_turn`) |
| Completion tokens of the 32,000 ceiling | 245 (0.77%), 31,755 margin | 536 (1.68%), 31,464 margin |
| Reasoning tokens | 88 | 246 |
| Prompt tokens | 2,045 (0 cached, 2,042 cache-write) | 2,826 (0 cached, 2,822 cache-write) |
| Cost of the call | $0.037805 | $0.062115 |

- **Resolution matches the catalog.** Each `resolvedModel` is the `canonical_slug` the catalog
  named, and OpenAI answered on the standard `openai` tag rather than `flex` or `fast`. The
  observation is what the seats' `config` records.
- **Neither refuses probability forecasting**, which was the risk section 3 exists to surface.
- **Truncation risk is low**: both stopped on their own with better than a 31,000-token margin,
  and reasoning tokens are a small fraction of the output — no sign of the GLM 5.3 failure
  where an endpoint could not stop thinking inside the call window.
- **Go verdict:** both are ready for the Premier League Exhibition replay. The replay is 30
  calls each — Gameweeks 1–3, ten played Fixtures apiece — costing roughly $1.15 for Astra and
  $1.85 for Fable at the per-call cost observed here, before any Repair.
