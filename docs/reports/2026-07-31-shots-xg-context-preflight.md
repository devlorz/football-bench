# Base Model pre-flight, shots-and-xG context — 2026-07-31

Ticket: **Freeze match/2026-27-v2 and re-run pre-flight** ([tickets 0004](../tickets/done/0004-shots-and-xg-in-the-match-context.md), [spec 0004](../specs/0004-shots-and-xg-in-the-match-context.md))

Enriching the last-five form lines with shots, shots on target and per-match xG changed the
frozen bytes, so the roster moved to Prompt Version `match/2026-27-v2` (pinned SHA-256
`7b5d0bc1661ab1a5af0d97254425094c99edd2a58168eae9f1a7491cc4216953`) and pre-flight was
re-run against the prompt that will run on the first real Friday.

## Sequence run before pre-flight

1. Migrations `0009_historical_match_shots.sql` and `0010_understat_match_xg.sql` applied to
   the live database.
2. Live daily fetch stored the 2025-26 football-data results with full shot coverage:
   380/380 Premier League and 552/552 Championship rows carry all four shot figures.
3. One-off `fetch:xg-history` ingested 380/380 matches of 2025-26 Premier League xG from
   Understat (raw body archived, 529,950 bytes).
4. The operator re-pointed the nine Entrant rows from `match/2026-27-v1` to
   `match/2026-27-v2` with the scoped UPDATE recorded on the ticket (`UPDATE 9` observed;
   the after-query showed nine entrant rows on v2 and none on v1).
5. The generated inputs for Fixture 1 were built offline through the shared
   `buildMatchContext` path and inspected before any outbound call: Arsenal's form lines
   carried shots, on-target and xG figures ordered home-team-first beside each scoreline;
   Coventry City's Championship form lines carried shots with `xG unavailable` stated
   outright; the head-to-head section stayed score-only and the envelope unchanged.

## Pre-flight runs — Fixture 1, Arsenal v Coventry City, 2026-08-21 19:00 UTC

The first nine-Entrant run returned seven parseable Predictions and exited non-zero:

- **Gemini 3.1 Pro Preview** returned the requested JSON envelope but encoded `probs` and
  `score` as arrays rather than the required `{H, D, A}` / `{home, away}` objects. This is
  the same stochastic schema miss the 2026-07-29 pre-flight recorded on the v1 prompt, so it
  is a known Base Model behaviour, not an effect of the enriched context. The production
  Repair loop exists for exactly this; the miss is expected to cost Gemini occasional
  Repairs during the Season, and Repair counts are themselves a reported result.
- **Kimi K3** failed with an upstream `429` before any provider was selected — transport,
  not content.

The confirmation run passed 9/9 with `ok: true` and no refusals, transport errors, missing
routing metadata or provider/model substitutions. Both runs remain part of the evidence.

| Entrant | Result | Resolved provider | Resolved model |
|---|---|---|---|
| Claude Opus 5 | parseable | Anthropic | `anthropic/claude-opus-5-20260723` |
| DeepSeek V4 Pro | parseable | Novita | `deepseek/deepseek-v4-pro-20260423` |
| Gemini 3.1 Pro Preview | parseable | Google AI Studio | `google/gemini-3.1-pro-preview-20260219` |
| GLM 5.2 | parseable | Z.AI | `z-ai/glm-5.2-20260616` |
| GPT-5.6 Sol Pro | parseable | OpenAI | `openai/gpt-5.6-sol-pro-20260709` |
| Grok 4.5 | parseable | xAI | `x-ai/grok-4.5-20260708` |
| Kimi K3 | parseable | Moonshot AI | `moonshotai/kimi-k3-20260715` |
| MiniMax M3 | parseable | Minimax | `minimax/minimax-m3-20260531` |
| Qwen3.7 Max | parseable | Alibaba | `qwen/qwen3.7-max-20260520` |

Resolved providers and dated models match the 2026-07-29 roster exactly — no substitutions
across the version bump. Every HTTP-successful response was archived byte-for-byte in
`raw_snapshots` under `openrouter-preflight:<base-model>` sources.

## Open watch item — Understat aliases for the promoted sides

The alias check now runs ahead of the not-yet-played skip, but Understat's 2026-27 feed is
still empty (the archived `understat:2026-27:EPL` body is 36 bytes with zero entries), so
the guessed spellings `Coventry` and `Hull` remain unverified. The 2025-26 backfill
validated every other spelling in the mapping. The daily fetch will validate the promoted
sides automatically on the day Understat publishes the 2026-27 fixture list; a wrong guess
surfaces as a loud `xG enrichment unavailable` warning and a validation error naming the
title, degrades the form lines to `xG unavailable`, and never blocks the write path.
