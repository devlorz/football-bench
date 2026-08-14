# Base Model pre-flight, the ten-Entrant roster — 2026-08-15

ADR-0034's roster walked in: the Qwen and Grok seats passed to their successors, Meta's
Muse Spark 1.2 added, and every seat observed answering the production prompt before the
Season's first Lock. This is the fourth report in the series and the first at ten seats;
the three before it (2026-07-29, 2026-08-07, 2026-08-12) are the record the seven carried
seats were entered against.

Decisions: [ADR-0034](../adr/0034-the-roster-refreshes-to-ten-entrants-before-the-first-lock.md).
Steps: [docs/runbooks/a-new-base-model-arrives.md](../runbooks/a-new-base-model-arrives.md).

## The freeze rule holds — v2 is still unused

| Check | Observed |
|---|---|
| Roster before | nine `entrant` rows, all on `match/2026-27-v2` |
| FPL seats before | none — no row at `fpl/2026-27-v2` |
| 2026-27 Gameweek 1 deadline | `2026-08-21T17:30:00Z` |
| Fixture used | 1, Arsenal v Coventry City, kick-off `2026-08-21T19:00:00Z` |

The Fixture is the one all three earlier reports used, so every resolution below is
directly comparable with theirs rather than merely similar.

## What ran first, and what it protected

The deployed schema was four migrations behind: `0018_squad_changes`,
`0019_exhibition_role`, `0020_dashboard_reads_the_fpl_tables` and
`0021_dashboard_reads_the_squad_record` all applied on the day. **0019 is what the road in
needs** — it widens the `models.role` check to admit `'exhibition'`, and without it every
candidate insert below would have been refused by the constraint, at the point where the
outgoing seats were about to be deleted.

`squad_changes` was created by 0018 and therefore empty. A daily fetch was run before any
pre-flight, taking it to 288 rows for 2026-27, because the pre-flight builds the real
Match context: a candidate checked against a prompt announcing "no Squad Change data
stored for this Gameweek" would have been checked against a prompt the Season will never
send.

## Step 1 — each candidate checked alone, before any Entrant row moved

Three temporary `role = 'exhibition'` rows at `match/2026-27-v2`, pre-flighted one at a
time through the door ADR-0032 built. The nine Entrant rows were untouched throughout.

| Candidate | Result | Resolved provider | Resolved model |
|---|---|---|---|
| Qwen3.8 Max | parseable | Alibaba | `qwen/qwen3.8-max-20260803` |
| Grok 4.6 | parseable | xAI | `x-ai/grok-4.6-20260810` |
| Muse Spark 1.2 | **HTTP 403, then parseable** | Meta | `meta/muse-spark-1.2-20260805` |

### Finding — an account gate, not a content policy

Muse Spark's first call never reached Meta. OpenRouter answered HTTP 403:

> This model requires you to complete the following before use: 18+ age confirmation.

with `missing_attestation_types: ["age_18plus"]`, `provider_name: null`, and Meta's
endpoint listed as `available` but `selected: false`. The pre-flight recorded it as
`transport_error`, which is the honest classification: nothing was refused, because
nothing was asked.

This matters beyond the one seat. ADR-0034 flagged Meta's content policy near
betting-adjacent forecasting as unobserved, and a reader who saw a 403 and stopped would
have recorded a refusal that never happened — retiring a seat on evidence about an
account setting. The attestation was completed on the OpenRouter account and the same
call was repeated: `parseable`, no refusal. **Meta's policy is now observed, and it does
not refuse this prompt.**

The gate is account-wide and permanent for the model, so it would have produced a Gap on
every call for the whole Season had it been found after the Lock.

## Step 2 — the roster moved, and the finished ten passes

Two outgoing Entrant rows (`match/qwen3.7-max`, `match/grok-4.5`) and the three temporary
candidate rows were deleted in one statement — `DELETE 5`, no foreign key refused it,
confirming ADR-0034's premise that before the first Lock no stored fact references a seat.
`roster:enter` then wrote ten Match rows, and ten FPL rows were entered by hand at
`fpl/2026-27-v2`, one per Base Model.

Ten calls, Fixture 1, first attempt. **10/10 parseable, `ok: true`.**

| Entrant | Result | Resolved provider | Resolved model |
|---|---|---|---|
| Claude Opus 5 | parseable | Anthropic | `anthropic/claude-opus-5-20260723` |
| DeepSeek V4 Pro | parseable | Novita | `deepseek/deepseek-v4-pro-20260423` |
| Gemini 3.1 Pro Preview | parseable | Google AI Studio | `google/gemini-3.1-pro-preview-20260219` |
| GLM 5.2 | parseable | Z.AI | `z-ai/glm-5.2-20260616` |
| GPT-5.6 Sol Pro | parseable | OpenAI | `openai/gpt-5.6-sol-pro-20260709` |
| **Grok 4.6** | parseable | xAI | `x-ai/grok-4.6-20260810` |
| Kimi K3 | parseable | Moonshot AI | `moonshotai/kimi-k3-20260715` |
| MiniMax M3 | parseable | Minimax | `minimax/minimax-m3-20260531` |
| **Muse Spark 1.2** | parseable | Meta | `meta/muse-spark-1.2-20260805` |
| **Qwen3.8 Max** | parseable | Alibaba | `qwen/qwen3.8-max-20260803` |

Every resolved model equals the `canonicalSlug` the roster of record carries, and every
resolved provider is the display name of the pinned slug. **The seven carried seats
resolved exactly as they did on 2026-08-12** — no vendor moved a snapshot under a stable
name in the interval, which is the one thing pinning an undated name exists to detect.

No run needed repeating. The 2026-08-12 report's Run 1 lost a seat to a stale
quantization pin and needed a second pass; this one did not.

## What is not verified here

- **The FPL track has not started.** Ten seats are entered at `fpl/2026-27-v2` and no
  Manager State exists. The track opens all ten or none, and `manager_states` is
  insert-only, so that step is still ahead and still irreversible.
- **One Fixture, one call per seat.** This says each Base Model answers the Gameweek 1
  prompt in a parseable shape from its pinned provider on this day. It says nothing about
  the other nine Fixtures, about latency under the Season's concurrency, or about how
  often a provider will drop a call across 380 of them.
- **Muse Spark's reasoning cost is unmeasured.** The envelope sets no `max_tokens` and no
  reasoning configuration, by ADR-0034's deliberate rejection of a per-seat envelope. What
  a reasoning model spends per Fixture will first be visible in recorded `attempts` after
  Gameweek 1.
- **Nothing here proves the Season's prompt is good**, only that ten Base Models can read
  it and answer in the shape the validator accepts.
