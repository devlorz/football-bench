# The amended question on the bench — La Liga's Gameweek 1 — 2026-08-19

The run behind [ticket 0020](../tickets/0020-the-match-track-restart.md) slice 3. The
amended Match template ([ADR-0043](../adr/0043-base-rates-xg-rates-and-two-instruction-lines-join-the-restarted-match-versions.md))
was put to the real roster over the six Fixtures La Liga's Gameweek 1 Locked, through
`predict:preview` — archived snapshots into a throwaway cluster, real Base Model calls,
nothing written to the record.

Nothing here is evidence in the benchmark's sense. No answer was scored, no Fixture's
result reached it, and six Fixtures at one run each cannot separate skill from noise. It
is a behavioural read taken while the amendment could still move a sentence cheaply.

## How it was run

```
SEASON=2026-27 FOOTBALL_DATA_SEASON=2025-26 COMPETITION=PD GAMEWEEK=1 \
  npm run predict:preview
```

- Instant: `deadline-6h`, six hours before Gameweek 1's own Lock at
  `2026-08-15T16:00:00Z`, because a bench over a Gameweek already played would otherwise
  answer after its Lock and be refused.
- `FOOTBALL_DATA_SEASON=2025-26` is what production itself was running at that Lock. It
  is also required today: the archive holds a `football_data:2026-27:E0` snapshot whose
  body is football-data.co.uk's 300 page, and the replay fetcher answers 200 to
  everything it holds.
- The rehearsed packet renders `xG unavailable` throughout — the prior Season's xG
  arrives through the `fetch:xg-history` backfill, not the daily fetch a rehearsal
  replays. The base-rates line and the two instruction sentences are rendered in full.

**This run is not repeatable.** The cluster is dropped with the process and Base Models
are not deterministic; running the command again produces different answers. The output
below is the run itself, kept so its numbers can be checked rather than taken on trust.

## What it printed

```
────────────────────────────────────────────────────────────────────────────
Club Atlético de Madrid v Málaga CF   (Home spread 0.15 across 9)
────────────────────────────────────────────────────────────────────────────
Entrant                        H     D     A   score  repairs
Claude Opus 5               0.74  0.17  0.09   2-0      0
DeepSeek V4 Pro             0.68  0.19  0.13   2-0      0
GLM 5.2                     0.74  0.19  0.07   2-0      0
GPT-5.6 Sol Pro             0.71  0.18  0.11   2-0      0
Grok 4.6                    0.62  0.24  0.14   2-0      0
Kimi K3                     0.72  0.18  0.10   2-0      0
MiniMax M3                  0.77  0.14  0.09   2-0      0
Muse Spark 1.2              0.68  0.20  0.12   2-0      0
Qwen3.8 Max                 0.62  0.22  0.16   2-0      0

────────────────────────────────────────────────────────────────────────────
Real Racing Club de Santander v Villarreal CF   (Home spread 0.14 across 9)
────────────────────────────────────────────────────────────────────────────
Entrant                        H     D     A   score  repairs
Claude Opus 5               0.28  0.26  0.46   1-2      0
DeepSeek V4 Pro             0.28  0.25  0.47   1-2      0
GLM 5.2                     0.18  0.22  0.60   1-2      0
GPT-5.6 Sol Pro             0.32  0.27  0.41   1-1      0
Gemini 3.1 Pro Preview      0.23  0.25  0.52   1-2      3
Grok 4.6                    0.22  0.26  0.52   1-2      0
MiniMax M3                  0.27  0.28  0.45   1-2      0
Muse Spark 1.2              0.30  0.27  0.43   1-2      0
Qwen3.8 Max                 0.25  0.26  0.49   1-2      0

────────────────────────────────────────────────────────────────────────────
RCD Espanyol de Barcelona v Levante UD   (Home spread 0.09 across 8)
────────────────────────────────────────────────────────────────────────────
Entrant                        H     D     A   score  repairs
Claude Opus 5               0.52  0.26  0.22   1-0      0
GLM 5.2                     0.48  0.29  0.23   1-0      0
GPT-5.6 Sol Pro             0.49  0.29  0.22   1-0      0
Gemini 3.1 Pro Preview      0.52  0.26  0.22   1-0      3
Grok 4.6                    0.52  0.27  0.21   1-0      0
Kimi K3                     0.51  0.25  0.24   1-0      0
MiniMax M3                  0.52  0.26  0.22   1-0      0
Muse Spark 1.2              0.43  0.28  0.28   1-1      0

────────────────────────────────────────────────────────────────────────────
Sevilla FC v Rayo Vallecano de Madrid   (Home spread 0.08 across 8)
────────────────────────────────────────────────────────────────────────────
Entrant                        H     D     A   score  repairs
Claude Opus 5               0.37  0.28  0.35   1-1      0
GLM 5.2                     0.40  0.29  0.31   1-1      0
GPT-5.6 Sol Pro             0.42  0.29  0.29   1-1      0
Grok 4.6                    0.41  0.28  0.31   1-1      0
Kimi K3                     0.44  0.28  0.28   1-0      0
MiniMax M3                  0.45  0.29  0.26   1-1      0
Muse Spark 1.2              0.41  0.28  0.30   1-1      0
Qwen3.8 Max                 0.38  0.30  0.32   1-1      0

────────────────────────────────────────────────────────────────────────────
Deportivo Alavés v Getafe CF   (Home spread 0.07 across 8)
────────────────────────────────────────────────────────────────────────────
Entrant                        H     D     A   score  repairs
Claude Opus 5               0.40  0.29  0.31   1-1      0
DeepSeek V4 Pro             0.34  0.28  0.39   0-1      0
GLM 5.2                     0.41  0.27  0.32   1-1      0
GPT-5.6 Sol Pro             0.39  0.30  0.31   1-1      0
Grok 4.6                    0.37  0.30  0.33   1-1      0
Kimi K3                     0.41  0.28  0.31   1-1      0
MiniMax M3                  0.39  0.29  0.32   1-1      0
Muse Spark 1.2              0.39  0.28  0.33   1-1      0

────────────────────────────────────────────────────────────────────────────
RC Deportivo La Coruña v Elche CF   (Home spread 0.11 across 8)
────────────────────────────────────────────────────────────────────────────
Entrant                        H     D     A   score  repairs
Claude Opus 5               0.44  0.28  0.28   1-1      0
GLM 5.2                     0.54  0.26  0.20   2-1      0
GPT-5.6 Sol Pro             0.49  0.29  0.22   1-0      0
Grok 4.6                    0.55  0.25  0.20   1-0      0
Kimi K3                     0.48  0.27  0.25   1-0      0
MiniMax M3                  0.50  0.27  0.23   1-0      0
Muse Spark 1.2              0.46  0.27  0.27   1-0      0
Qwen3.8 Max                 0.45  0.28  0.27   1-0      0

────────────────────────────────────────────────────────────────────────────
Forecasts 50   Gaps 10   342s   tokens 115630 in / 115579 out

Prediction Gaps remain for PD 2026-27 Gameweek 1.
6h 0m remain before the Lock at 2026-08-15T16:00:00.000Z.
- DeepSeek V4 Pro: Fixture 564632, RCD Espanyol de Barcelona v Levante UD — timeout
- DeepSeek V4 Pro: Fixture 564633, Sevilla FC v Rayo Vallecano de Madrid — timeout
- DeepSeek V4 Pro: Fixture 564635, RC Deportivo La Coruña v Elche CF — timeout
- Gemini 3.1 Pro Preview: Fixture 564628, Club Atlético de Madrid v Málaga CF — schema
- Gemini 3.1 Pro Preview: Fixture 564633, Sevilla FC v Rayo Vallecano de Madrid — schema
- Gemini 3.1 Pro Preview: Fixture 564634, Deportivo Alavés v Getafe CF — schema
- Gemini 3.1 Pro Preview: Fixture 564635, RC Deportivo La Coruña v Elche CF — schema
- Kimi K3: Fixture 564629, Real Racing Club de Santander v Villarreal CF — timeout
- Qwen3.8 Max: Fixture 564632, RCD Espanyol de Barcelona v Levante UD — timeout
- Qwen3.8 Max: Fixture 564634, Deportivo Alavés v Getafe CF — timeout
```
