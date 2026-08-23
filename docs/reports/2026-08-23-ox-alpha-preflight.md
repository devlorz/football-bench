# Base Model pre-flight, Ox Alpha (`stealth/ox-alpha`) — 2026-08-23

Ticket: [0049-the-seat-that-answers-before-it-replays.md](../tickets/0049-the-seat-that-answers-before-it-replays.md).
Decisions: [ADR-0032](../adr/0032-exhibition-runs-join-the-record-after-the-fact.md).
Steps: [docs/runbooks/a-new-base-model-arrives.md](../runbooks/a-new-base-model-arrives.md) sections 2, 3 and 6.

## Pre-flight context

| Check | Observed |
|---|---|
| Target seat | `exhibition/ox-alpha` (`role = 'exhibition'`) |
| Base Model | `stealth/ox-alpha` |
| Provider | `stealth` (sole endpoint, First-party) |
| Quantization | `null` (pinned by sole endpoint) |
| Prompt Version | `match/2026-27-v2` |
| Fixture used | 1, Arsenal v Coventry City, kick-off `2026-08-21T19:00:00Z` |
| Pricing | $0.00 / $0.00 |

## Pre-flight observation

A single-model pre-flight targeting `exhibition/ox-alpha` ran against Premier League Fixture 1 (`Arsenal v Coventry City`) under `match/2026-27-v2`. The raw response was archived byte-for-byte in `raw_snapshots` under `openrouter-preflight:stealth/ox-alpha`.

```json
{
  "ok": true,
  "fixture": {
    "season": "2026-27",
    "fplId": 1,
    "gameweek": 1,
    "homeTeam": "Arsenal",
    "awayTeam": "Coventry City",
    "kickoffAt": "2026-08-21T19:00:00.000Z"
  },
  "results": [
    {
      "modelId": "exhibition/ox-alpha",
      "baseModel": "stealth/ox-alpha",
      "status": "parseable",
      "detail": null,
      "resolvedProvider": "Stealth",
      "resolvedModel": "stealth/ox-alpha",
      "rawBody": null
    }
  ]
}
```

## Telemetry and verdict

From the archived response (`raw_snapshots` payload `gen-1787483773-GsVGFOUUKLrUEfx1zPtc`):

- **Status:** `parseable` (`ok: true`), no refusal.
- **Resolved provider / model:** `Stealth` / `stealth/ox-alpha`.
- **Output ceiling measurement:** `finish_reason: stop`, **1,112 completion tokens** (`completion_tokens_details.reasoning_tokens: 0`) out of the 32,000 ceiling (3.48% utilization, 30,888 tokens margin). Prompt: 1,953 tokens (64 cached).
- **Go verdict:** `stealth/ox-alpha` answers cleanly on the production prompt path with low observed truncation risk (30,888-token measured margin on Fixture 1). Ready for the Exhibition replay.
