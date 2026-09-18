# An Exhibition Run may answer through a typed endpoint instead of a chat one

> Status: proposed, 2026-09-18. No code, no row and no call exists yet.

**TypeSafe's Jev (`jev-latest`) may enter the Match track as an Exhibition Run, called
at `https://api.typesafe.ai/v1/systemone` rather than through OpenRouter, shown the
same stored context bytes as every real seat, and answering with typed probabilities
that the harness turns into a Prediction before the same validation every seat faces.**
It cannot enter the FPL track, and the row is labelled as the first seat that did not
answer a chat prompt.

Vocabulary: [CONTEXT.md](../../CONTEXT.md). This departs from
[ADR-0009](0009-six-entrants-frontier-and-open-weight-all-through-openrouter.md) (every
seat through OpenRouter) and narrows
[ADR-0032](0032-exhibition-runs-join-the-record-after-the-fact.md) ("the exact production
path — OpenRouter"), on one row, for one reason stated below.

## What was found, read 2026-09-18

Jev is not a chat model. The docs at `docs.typesafe.ai` describe a "System One" model:
a request carries a `state` (string, object or array of text) and a map of typed
`questions`, and the answer to each question is a distribution, not prose. Three
question types exist:

- **Choice** — options as a `criteria` map (up to 255), answered with `choice`,
  `probabilities` summing to 1, and `confidence`.
- **Score** — 2–10 ordered levels, answered with a fractional `score`, per-level
  `probabilities` and `confidence`.
- **Noul** — one yes/no, answered with a probability.

Auth is `Authorization: Bearer $TYPESAFE_API_KEY`; the reply carries `usage` with
`input_tokens` and `output_tokens`; errors are HTTP 401/422/429/529. **Pricing, rate
limits and the maximum size of `state` are not documented.** There is no OpenAI-compatible
endpoint, and the model is not listed on OpenRouter, so the door ADR-0032 opened — insert
a row, run `exhibition:replay` — refuses it at the first call: the attempt engine builds
every request in `openRouterRequest` and reads every reply with `parseOpenRouterResponse`.

What the Match track asks of a seat (`validate-prediction.ts`) maps onto those types
almost exactly:

| Field the schema requires | Jev question | What comes back |
| --- | --- | --- |
| `probs.H`, `probs.D`, `probs.A` | one Choice over `H`, `D`, `A` | a distribution that already sums to 1 |
| `score.home`, `score.away` | one Choice over the 36 scorelines `0-0` … `5-5` | the argmax scoreline |
| `rationale` | none — Jev writes no text | the empty string |
| `fixture_id` | none — the harness knows it | copied from the call |

The FPL track asks for a squad, transfers, captaincy and a chip under a rulebook; that is
not a question any of the three types can hold, so the FPL half of ADR-0032 does not
apply.

## The decision

1. **One row, `role = 'exhibition'`, `provider = 'typesafe'`, `base_model =
   'jev-latest'`, `quantization` null.** The provider column already names who serves a
   seat; here it also names which wire the attempt engine speaks, and the engine reads
   that off the row, not off a flag or an environment variable. Every other row keeps
   its byte-for-byte OpenRouter envelope.
2. **The engine grows a second request builder and parser beside the OpenRouter pair**,
   chosen by `provider`. The request sends `contexts.body` — the same bytes the real
   seats read, unchanged, hash and all — as `state`, and the two Choice questions above.
   The reply is rendered into the prediction JSON the schema expects and handed to
   `validatePrediction` like any other answer. Everything after that point is untouched:
   the attempt row, its telemetry (`tokensIn`/`tokensOut` from `usage`, resolved
   provider `typesafe`, resolved model from the reply's `model`), the Lock read off the
   role, scoring, the "ran after Gameweek N" label.
3. **Repairs never fire for this row, and that is recorded, not hidden.** A typed reply
   cannot be malformed JSON or fail to sum to 1, so the seat's Repair count is zero by
   construction rather than by merit. The dashboard's Repair figures for it are shown as
   they are; the caveat below says why they mean nothing here.
4. **The seat's `rationale` is the empty string**, never a sentence the harness composed
   from `confidence`. A rationale the seat did not write would be the harness speaking
   in the seat's name.
5. **The pre-flight takes the same door.** `EXHIBITION_MODEL_ID` aimed at this row runs
   the same builder, so the runbook's section 3 check stays the first call ever made, and
   the first call is the one that surfaces a 401, a 422 on `state` size, or a price.
6. **A second key, `TYPESAFE_API_KEY`, is required by the replay and the pre-flight only
   when the named row's provider is `typesafe`**, read the way `OPENROUTER_API_KEY` is.
   The scheduled prediction run never reads it: no Entrant or Shadow row may name this
   provider, and the roster entry refuses one.
7. **Nothing is spent until the operator says so.** The call count of a replay is one per
   played Fixture in the named Competition, with no Repair chain behind it; the price per
   call is unknown until TypeSafe states it. Both numbers go in the request for
   permission, per the project's rule on paid runs.

## What this changes about the comparison, and what it does not

**Does not change.** The seat reads exactly the stored context bytes at the
Competition's frozen Prompt Version. Its Predictions are scored by the same RPS, Match
Points and Bet Points, land in the same tables, and carry the same "ran after Gameweek N"
label. It is excluded from the Comparison Anchor, the complete-case intersection and every
interval by the `role` filter that already excludes every Exhibition Run.

**Changes.** ADR-0001 holds that the only thing permitted to vary between seats is the
Base Model. This row varies two more things: the *wire* (a typed endpoint, not a chat
completion) and the *question* (two Choices, not "return only JSON with probs, score and
rationale"). The last five lines of every stored context — the JSON instructions and the
two ADR-0043 sentences — are still sent, because the bytes are the bytes, but the seat is
not asked to obey them; it is asked the two Choices. A reader comparing Jev's RPS with a
chat seat's is therefore comparing a Base Model *and* a way of asking, and the surface
must say so. This is the same class of admission ADR-0032 already makes about recall:
accepted, labelled, and never netted out.

**Why accept it.** The question this benchmark asks is which Base Model forecasts a
Competition best. A model built to emit calibrated distributions over a fixed option set
is the most direct answer that question has ever been offered, and refusing it because it
cannot pretend to be a chat model would measure the pretence, not the forecast. An
Exhibition Run is the right door because it is the door for things the Season cannot
rank: it is shown, labelled, and proves nothing on its own.

## Considered Options

- **A script outside the harness: read `contexts`, call Jev, write `predictions`.**
  Fewest lines. Rejected: ADR-0032's whole point is one door, and a row written by a
  second writer has no `attempts` telemetry, no Lock check by role and no pre-flight.
- **A proxy that speaks chat completions to the harness and Jev on the other side.**
  Keeps the engine untouched by adding a service to run and a place for the two Choices to
  hide. Rejected: the mapping is the decision, and it belongs where a reader can find it.
- **Pass the Choice option set through `models.config`.** Would make the question a row
  property and invite a second Jev row with different scoreline options. Rejected for
  now: one mapping, in code, under this ADR; a second mapping is a second ADR.
- **Two Score questions (home goals, away goals) instead of one Choice over scorelines.**
  Loses the joint distribution and can argmax to a scoreline the seat never rated
  highest. One Choice over 36 scorelines keeps `score` the exact scoreline judged most
  likely, which is what ADR-0043's sentence asks.
- **Ask Jev the same prompt as text and let it fail.** It has no text output; there is
  nothing to validate.
- **Wait for TypeSafe to appear on OpenRouter.** Nothing suggests it will; the product is
  not a chat completion.

## Consequences

- `attempt-match-calls.ts` chooses a builder and parser by `provider`; a new
  `typesafe-entrant.ts` holds the request, the two Choice questions, the reply schema and
  the rendering into prediction JSON. The OpenRouter path is byte-for-byte what it was for
  every other row, proven by the existing envelope tests.
- `config.ts` reads `TYPESAFE_API_KEY` for the replay and the pre-flight; the roster entry
  and the scheduled run refuse a `provider = 'typesafe'` row by name.
- The `models` row is inserted by the operator, as ADR-0032 requires; the harness still
  takes only a `model_id`.
- The Exhibition caveat on every surface that shows this row names the second variable:
  asked through a typed endpoint, not the chat prompt. Frozen text, a constant in a module,
  not a `scores.detail` row.
- Repair counts for the row read zero and the caveat says why.
- Base Model Class: `First-party` — sole endpoint served by the vendor itself, by the
  CONTEXT.md criterion.
- Unknown until the first pre-flight call: price, rate limit, whether a context of several
  thousand tokens is accepted as `state`. A 422 on size ends this ADR at "the state does
  not fit" and nothing else is built.
- The FPL track does not open to this row, and `readExhibitionTrack` is not taught the
  provider: a `TRACK=fpl` replay naming it refuses in `loadExhibition` like any row whose
  Prompt Version is not the FPL one.
