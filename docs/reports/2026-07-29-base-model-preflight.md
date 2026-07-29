# Base Model pre-flight — 2026-07-29

Ticket: **Pre-flight: confirm all nine Base Models answer**

The operator script called all nine Base Models through OpenRouter with the Match prompt for
Fixture 1, Arsenal v Coventry City, 2026-08-21 19:00 UTC. Each call pinned its stored provider,
disabled fallbacks, and pinned quantization for open-weight Base Models.

All nine returned a parseable Prediction. There were no refusals, transport errors, missing
selected-provider metadata, or provider/model substitutions. The script exited zero.

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

## Contract evidence

Every HTTP-successful response was archived byte-for-byte in `raw_snapshots` under an
`openrouter-preflight:<base-model>` source. The repository contract fixture is a lossless
base64 encoding of the observed GPT-5.6 Sol Pro response:

- fixture: `test/fixtures/openrouter-gpt-5.6-sol-pro-2026-07-29.base64`
- decoded SHA-256: `eabefabef0e95b2d23e79887c8f17c89374a48f36b6edf67d27884b1f29861af`

Replaying that response exposed that successful OpenRouter messages carry
`choices[0].message.refusal: null`. The response contract now admits null refusal metadata
without treating the envelope as a provider failure.

The selected endpoint also provides the dated resolved model while the top-level `model`
field carries the undated request model. Resolved-model extraction therefore prefers
`openrouter_metadata.endpoints.available[].model` from the selected entry. If that field is
absent, the resolved model is unknown rather than being misreported from the top-level alias.

## Pre-flight discovery

The first observed responses established two contracts before the successful pinned run:

- OpenRouter emits nullable refusal metadata on successful messages.
- Several Base Models interpreted “Return only JSON” as allowing Markdown code fences.

The frozen Match prompt now states that the first and last characters must be `{` and `}` and
explicitly forbids Markdown/code fences. This is still prompt-only JSON: no constrained
decoding or `response_format` is sent. With that clarification, all nine Base Models produced
parseable output on their pinned routes.
