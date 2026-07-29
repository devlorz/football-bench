# Base Model pre-flight — 2026-07-29

Ticket: **Pre-flight: confirm all nine Base Models answer**

The operator script has been run twice against Fixture 1, Arsenal v Coventry City,
2026-08-21 19:00 UTC. Each call pinned its stored provider, disabled fallbacks, and pinned
quantization for open-weight Base Models.

The first run used the tracer Match prompt that existed before historical context was built.
All nine returned a parseable Prediction. That run finalized the previously unpublished
tracer prompt as Prompt Version `match/2026-27-v1`; all nine Entrant rows now name that
version.

## Rich-context revalidation — 2026-07-29 11:07 UTC

Adding the rolling historical dossier materially enlarged the shipping prompt, so the first
run no longer established that all nine Base Models answered the prompt that would run on the
first real Friday. Pre-flight and prediction now share one `buildMatchContext` construction
path, and `matchContext` requires its context argument rather than supplying a placeholder.

The operator reran all nine Base Models against the live 2025/26 Premier League and
Championship data. All nine returned a parseable Prediction. There were no refusals,
transport errors, missing selected-provider metadata, or provider/model substitutions. The
script exited zero. OpenRouter reported 585–4,208 prompt tokens across the nine routes; the
large spread is recorded as gateway telemetry, not interpreted as directly comparable token
counts across Base Models.

The operator supplies `EXPECTED_ENTRANT_COUNT=9` for this roster. The pre-flight refuses to
make an outbound call unless the database contains exactly that configured number of Entrants.
Adding another Entrant changes the roster and this operator configuration, not the pipeline.

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

## FPL-context revalidation — 2026-07-29 11:23–11:27 UTC

Adding prices, availability and absence markers enlarged the shipping prompt again. Migration
`0005_fpl_players.sql` was applied over the deployed `0004` state, then the live FPL bootstrap
was fetched and archived. It produced 563 Season-scoped player rows, including 49 players
whose status was not fully available. Review then caught that a Season-only identity would
overwrite the evidence needed to rebuild an earlier Gameweek. Forward migration
`0006_gameweek_scoped_fpl_players.sql` corrected the identity to
`(Season, Gameweek, FPL id)` and assigned all 563 observed rows to Gameweek 1; subsequent
fetches replace only their own Gameweek partition. A later review found that the Gameweek
label alone did not prove those rows were observed before its Lock. Forward migration
`0007_lock_fpl_player_snapshots.sql` records `observed_at` and adds a database trigger that
rejects a player row observed at or after its Gameweek deadline. The fetch path archives
late upstream bytes and still refreshes Fixtures, but leaves the pre-Lock player partition
unchanged. For the 563 rows predating `observed_at`, the migration timestamp is stored as a
conservative upper bound and the migration fails unless that bound is still pre-Lock. A
second trigger prevents a later deadline correction from moving the Lock across an existing
player snapshot.

Migration `0007` was deployed and a live Gameweek 1 fetch completed at 15:42 UTC. The current
bootstrap contained 564 players; all 564 rows carry the same observed time before the
2026-08-21 17:30 UTC Lock, and both database triggers are active.

The operator checked the generated inputs for Fixture 1 against that snapshot. Arsenal's
section showed Saka, Gabriel, Rice, Gyökeres and Havertz as its five highest-priced players,
plus all three flagged absences: J.Timber, Saliba and White. Coventry City's section showed
Mason-Clark, Torp, Tchaouna, Wright and Onyeka as its five highest-priced players, plus both
flagged absences: Rudoni and Bassette. Fully available players rendered as `available`;
every absence carried chance of playing, news and news-added fields.

The first nine-Entrant run at 11:23–11:25 UTC returned eight parseable Predictions. Gemini
3.1 Pro Preview returned the requested JSON envelope but encoded `score` as an array rather
than the required `{home, away}` object, so the pre-flight correctly exited non-zero with a
schema failure. There were no refusals, transport errors, missing routing metadata or
provider/model substitutions. The raw response was archived rather than discarded.

One confirmation run at 11:25–11:27 UTC passed 9/9 and exited zero. All selected providers
and dated resolved models matched the table above. OpenRouter reported 1,082–6,273 prompt
tokens across the nine routes. Both runs remain part of the evidence: the second establishes
that every Base Model can answer the expanded prompt, while the first records a real
stochastic schema miss that the production Repair loop is designed to handle.

## Contract evidence

Every HTTP-successful response from both runs was archived byte-for-byte in `raw_snapshots`
under an `openrouter-preflight:<base-model>` source. The repository contract fixture remains
a lossless base64 encoding of the first observed GPT-5.6 Sol Pro response:

- fixture: `test/fixtures/openrouter-gpt-5.6-sol-pro-2026-07-29.base64`
- decoded SHA-256: `eabefabef0e95b2d23e79887c8f17c89374a48f36b6edf67d27884b1f29861af`

Replaying that response exposed that successful OpenRouter messages carry
`choices[0].message.refusal: null`. The response contract now admits null refusal metadata
without treating the envelope as a provider failure.

The selected endpoint also provides the dated resolved model while the top-level `model`
field carries the undated request model. Resolved-model extraction therefore prefers
`openrouter_metadata.endpoints.available[].model` from the selected entry. If that field is
absent, the resolved model is unknown rather than being misreported from the top-level alias.
Both the selected provider and selected resolved model are required for a green pre-flight;
missing either field would silently disable an ADR-0009 substitution check. Routing metadata
diagnostics are combined with validation diagnostics rather than replacing them.

## Pre-flight discovery

The first observed responses established two contracts before the successful pinned run:

- OpenRouter emits nullable refusal metadata on successful messages.
- Several Base Models interpreted “Return only JSON” as allowing Markdown code fences.

The frozen Match prompt now states that the first and last characters must be `{` and `}` and
explicitly forbids Markdown/code fences. This is still prompt-only JSON: no constrained
decoding or `response_format` is sent. With that clarification, all nine Base Models produced
parseable output on their pinned routes. The operator and predict paths refuse an Entrant whose
stored Prompt Version differs from `match/2026-27-v1`, so the template cannot drift silently
away from the version named by the roster. A representative populated, cross-Season sample
of the frozen template and context builder is pinned to SHA-256
`ff41fc472cb840ccbe126fdd81444dc3ce4c89a38a6461e3232511c508a2fe47` next to the Prompt
Version constant and verified by a contract test. The pinned construction now includes both
the historical dossier and the FPL-derived player context.

## Reporting boundaries

OpenRouter's structured `choices[0].message.refusal` is reported as a refusal. A refusal
expressed only as ordinary prose has no reliable protocol discriminator, so it is reported as
unparseable instead; it still fails the run and retains the raw successful response body.
Non-2xx response bodies are included in the operator report but are not archived as successful
contract evidence.
