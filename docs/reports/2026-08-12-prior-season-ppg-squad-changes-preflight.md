# Base Model pre-flight, prior-Season PPG and Squad Changes — 2026-08-12

Ticket: **Freeze verification: one amendment, one pre-flight** ([tickets 0012](../tickets/0012-prior-season-ppg-and-squad-changes-in-the-match-context.md), [spec 0012](../specs/0012-prior-season-ppg-and-squad-changes-in-the-match-context.md))

Each club's prior-Season rate now rides under its final-position line, and the transfer
window's real squad movement renders as a section of its own. Both landed inside the
existing frozen pair `match/2026-27-v2`, whose pinned SHA-256 moved once, to
`cb518985c6232420cc0a2abf3f4d05a6e988779a1d0871eac05af368e2b6fbbf`.

The run also caught a live routing failure that has nothing to do with either addition and
would have cost an Entrant its first Gameweek. That is the finding at the end, and it is
the reason this report has two pre-flight runs rather than one.

## The freeze rule holds — v2 is still unused

Spec 0012 permits editing a frozen Prompt Version only until its first use. Read against
the live database today, not assumed, and re-read after the runs below:

| Check | Observed |
|---|---|
| `contexts` | 0 rows |
| `predictions` | 0 rows |
| `attempts` | 0 rows |
| Roster | nine `entrant` rows, all on `match/2026-27-v2` |
| 2026-27 Gameweek 1 deadline | `2026-08-21T17:30:00Z` |

The additions therefore ship as an edit to `match/2026-27-v2`, not as `match/2026-27-v3`.

## Where the runs happened, and what that does and does not prove

Unlike its three predecessors, the pre-flight below ran against a **local throwaway
Postgres**, not the live database. Only the freeze counts and the roster above were read
live.

The cluster was not seeded or replayed: it was built by the same three commands the
deployed jobs run, against the same real sources on the same day — `db:migrate` (18/18,
including `0018_squad_changes.sql`), `fetch:history` and `fetch:xg-history`, then the daily
`fetch`. So the prompt bytes below are the bytes a real fetch produces, and the nine calls
are real calls to real providers.

What it does not prove is the live database's own state on the day: that its
`historical_matches` still carries shots, that migration 0018 has been applied to it, and
that a Squad Change partition exists there. **None of those is true today** — migration 0018
is unapplied on live and `origin/main` is three commits behind, so the deployed daily fetch
does not yet know the Wikipedia source at all. Those are deploy steps, not verification
steps, and they remain outstanding before the first Lock.

| Local cluster after the three fetches | Observed |
|---|---|
| `historical_matches` 2025-26 Premier League | 380/380 rows with shots and on target |
| `historical_matches` 2025-26 Championship | 552/552 rows with shots and on target |
| `understat_match_xg` | 380 matches |
| `squad_changes` | 271 rows, 20 clubs, Gameweek 1 partition, observed `2026-08-12T08:45:09Z` |
| Archived page | `wikipedia:squad-changes:summer-2026`, 259005 bytes, `818d2c265d22517af46a15903f74a6c762c059ea4d1d878839cf6c59032bd465` |

## The prompt, as an Entrant will meet it

`npm run context:show` at Gameweek 1, through the shared `buildMatchContext` path, before
any outbound call. All ten Fixtures render, twenty PPG lines and ten Squad Changes sections
— no Fixture is missing either addition.

```
Arsenal
Prior-Season final position: 1st in 2025-26 Premier League; promoted: no.
Prior-Season points per game: 2.24 overall, 2.47 home, 2.00 away.

Coventry City
Prior-Season final position: 1st in 2025-26 Championship; promoted: yes.
Prior-Season points per game: 2.07 overall, 2.39 home, 1.74 away.
```

The promoted club's line carries its real Championship figures beside a Premier League
opponent's, normalised by nothing, with the division named only by the sibling line above.

Arithmetic checked by hand off the emitted bytes against the stored 2025-26 record:
Arsenal 85 points from 38 played (2.237 → 2.24), 47 from 19 at home (2.474 → 2.47), 38 from
19 away (2.00); Coventry 95 from 46 (2.065 → 2.07), 55 from 23 at home (2.391 → 2.39), 40
from 23 away (1.739 → 1.74). Home and away sum to overall in both points and matches for
each club, and both promoted clubs' halves come from a 46-match Championship Season rather
than a 38-match one.

The Squad Changes section, at Brentford v Spurs:

```
Squad changes since 2 Feb 2026:

Spurs
In: Sandro Tonali (from Newcastle United, £92.5m), Mateus Fernandes (from West Ham United, £85m), Jan Paul van Hecke (from Brighton & Hove Albion, £52m), Andy Robertson (from Liverpool, free), Marcos Senesi (from Bournemouth, free), Martin Dúbravka (from Burnley, free)
Out: Luka Vušković (to Brighton & Hove Albion, £46m), Will Lankshear (to Middlesbrough, £10m), Tynan Thompson (to Manchester United, £8m), Manor Solomon (to West Ham United, £5m), Alejo Véliz (to Bahia, undisclosed), Matthew Craig (to Port Vale, free), Pele Arganese-McDermott (to Crawley Town, free), Alfie Devine (to Preston North End, undisclosed), Radu Drăgușin (to Fiorentina) (loan), Yusuf Akhamrich (to Leyton Orient) (loan), Reiss-Alexander Russell-Denny (to Bristol Rovers) (loan)
```

Six Signings, three of them free — the count the archived page states and the ticket
records as a deliberate departure from the spec's example block of five. The three fee
Signings are £92.5m + £85m + £52m = £229.5m, which is ADR 0031's figure unchanged. Fees
descend, `free` and `undisclosed` follow the amounts, `(loan)` sits after the counterpart
rather than in the fee slot, and the counterpart renders as stored — `Newcastle United`,
not `Newcastle`, the second recorded departure.

One shape the section can take is absent from these bytes: every one of the twenty clubs
has movement in this window, so `none recorded` renders nowhere in the real prompt. It is
covered by exact-string assertion at the builder seam and by nothing here.

## Run 1 — the roster as it stood

Nine calls, Fixture 1, Arsenal v Coventry City. **8/9 parseable, `ok: false`.** Repeated
once, identically, before anything was changed.

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
| **Qwen3.7 Max** | **transport_error** | — | — |

Every resolved provider and dated model is identical to the 2026-07-31 and 2026-08-07
pre-flights. No substitution came with the context change.

## Finding — a stale quantization pin had taken a seat off the board

Qwen3.7 Max returned HTTP 404, and the archived body says why:

```
No endpoints found for the request with quantization: fp8
endpoints.available: [{ "provider": "Alibaba", "model": "qwen/qwen3.7-max-20260520" }]
```

OpenRouter lists exactly one endpoint for `qwen/qwen3.7-max`, Alibaba's, and its published
quantization now reads `unknown`. The roster pinned `fp8`, checked against the catalogue on
2026-07-29. The label moved underneath the pin, so the filter matched nothing.

Established rather than assumed, before anything was edited:

- The model is still listed, and `…/endpoints` returns the single Alibaba endpoint serving
  `qwen/qwen3.7-max-20260520` — the canonical slug the roster already records.
- The same envelope with the same `provider.order` and the full Gameweek 1 context, minus
  the `quantizations` filter, answers 200.
- The 404 reproduced on both runs. It is not transient.
- The other eight seats were re-checked the same way. Every remaining pin — `fp8` for
  DeepSeek V4 Pro at Novita, GLM 5.2 at Z.AI and MiniMax M3 at Minimax, `mxfp4` for Kimi K3
  at Moonshot AI — still matches its provider's published label. Qwen is alone.
- The live database carries the same `fp8` pin, so this was a live failure waiting for the
  first Lock, not an artefact of the local cluster.

**The fix is one field.** `match/qwen3.7-max` now pins no quantization, and
`CATALOG_CHECKED_AT` moves to today. This is not a weakening of ADR 0009, whose reason for
pinning is that OpenRouter may otherwise serve an open-weight Base Model at a different
precision from week to week: where a Base Model has a single endpoint, the provider pin
already fixes what the quantization pin was there to fix. The seat should be pinned again
the day a second endpoint appears. `test/season-roster.test.ts` still asserts that every
open-weight seat is pinned and nothing else is, with this one seat named as the exception
and the reason recorded beside it.

Nothing about this touches the two additions, the frozen text or the pinned SHA.

## Run 2 — after the pin

Same nine calls, same Fixture, same context bytes. **9/9 parseable, `ok: true`.** No
refusals, no transport errors, no missing routing metadata, and no substitutions: every
resolved provider and dated model is unchanged from the table above, with Qwen3.7 Max now
resolving to Alibaba and `qwen/qwen3.7-max-20260520` — the slug the roster pins.

Gemini 3.1 Pro Preview returned the object-shaped `probs` and `score` on both runs. The
stochastic array-shaped miss the 2026-07-29 and 2026-07-31 pre-flights recorded did not
recur, but it remains a known Base Model behaviour the Repair loop covers, not something
these runs rule out.

Every HTTP-successful response was archived byte-for-byte in the throwaway cluster and went
with it. Nothing was archived on the live database by this report's runs.

## What is not verified here

The per-call token cost of the two additions. Ticket 0012's fifth box reads it from
recorded `attempts` **after** Gameweek 1, measured rather than estimated, and no attempt
exists yet — `attempts` is one of the three counts certified zero above. It stays open until
the Gameweek exists.
