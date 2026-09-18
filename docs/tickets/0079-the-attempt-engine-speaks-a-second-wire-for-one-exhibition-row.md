# Ticket: The attempt engine speaks a second wire for one Exhibition row

**What to build:** a `models` row with `provider = 'typesafe'` and `role = 'exhibition'`
can be replayed and pre-flighted over the Match track's stored contexts: the engine sends
each context's bytes as Jev's `state` with two Choice questions, renders the typed reply
into the prediction JSON every seat is validated against, and records the attempt with
the same telemetry, Lock-by-role and scoring as any other row. Every other row's
OpenRouter envelope is byte-for-byte unchanged. No call reaches TypeSafe in this ticket:
the suite proves the wire with recorded replies. Source:
[ADR-0059](../adr/0059-an-exhibition-run-may-answer-through-a-typed-endpoint-instead-of-a-chat-one.md).
Decisions it must not bend:
[ADR-0032](../adr/0032-exhibition-runs-join-the-record-after-the-fact.md) (one door, the
harness takes only a `model_id`),
[ADR-0009](../adr/0009-six-entrants-frontier-and-open-weight-all-through-openrouter.md)
(every Entrant through OpenRouter — this row is not an Entrant and the roster entry must
say so), [ADR-0055](../adr/0055-a-seat-thinks-as-its-provider-ships-it-and-a-shadow-seat-may-think-otherwise.md)
(`config.reasoning` is the only key read off `models.config`; this row reads none).

**Blocked by:** None — can start immediately. It spends nothing.

**Status:** drafted, 2026-09-18

---

## What is already known

**The wire is chosen by the row, not by a flag.** The engine already carries `provider`
on every `MatchCall`; a `typesafe` provider selects the second request builder and parser
the way a role selects the Lock. No environment variable, no `TRACK`-style switch, no
boolean on the replay's options: a caller that could name the wire is a second place for
the row to be contradicted.

**The mapping is fixed in code and is this ADR's whole decision.** One Choice over `H`,
`D`, `A` for `probs`; one Choice over the thirty-six scorelines `0-0` … `5-5` for
`score`, its argmax taken as the exact scoreline; `rationale` the empty string;
`fixture_id` copied from the call. The rendered JSON goes through `validatePrediction`
unchanged so a reply that somehow violates the schema is recorded as a `schema` failure
like any seat's — but a typed reply cannot, and no Repair message is ever sent to this
row: a Repair is a chat turn, and the wire has no second turn. Repairs for this row are
zero by construction; the caveat (below) says so.

**The reply's telemetry maps onto the columns that exist.** `usage.input_tokens` and
`usage.output_tokens` fill `tokensIn`/`tokensOut`; the reply's `model` is the resolved
model; the resolved provider is `typesafe`; `raw_response` stores the reply body whole.
HTTP 429 and 529 are `rate_limit`, 401/422 and anything else non-2xx `provider`, a
timeout `timeout`, exactly the kinds the OpenRouter path records.

**The context bytes are sent whole.** `contexts.body` — hash, Prompt Version and the
five closing instruction lines included — is the `state` string. Nothing is stripped or
re-rendered: the seat reads what every real seat read, which is the one claim the
Exhibition label rests on.

**Where the key is read.** `TYPESAFE_API_KEY` is required by the replay and the
pre-flight only when the named row's provider is `typesafe`; `OPENROUTER_API_KEY` stays
required as it is. The scheduled prediction run, the fill and the roster entry never read
it, and the roster entry refuses a `typesafe` provider by name so the row cannot become
an Entrant or a Shadow by an edit to the roster of record.

**The caveat is a constant, not a row.** The surface that shows an Exhibition Run's
label gains one frozen sentence for a row whose provider is `typesafe`: asked through a
typed endpoint, not the chat prompt, so its Repair count and its rationale mean nothing
here. Rendered from the row's provider, the same way the "ran after Gameweek N" label is
derived from stored dates and not a flag.

**Prefactor, if it makes the change easy.** The worker in the attempt engine builds,
sends and parses in one block. If lifting the OpenRouter build-and-parse pair behind one
seam makes the second wire a second implementation of that seam rather than a branch
threaded through the block, do that first and prove the envelope tests still pass
byte-for-byte before adding the second wire. If the branch is smaller and as clear,
branch.

## Acceptance

- [ ] A `MatchCall` whose `provider` is `typesafe` produces a `POST` to
      `https://api.typesafe.ai/v1/systemone` with a bearer `TYPESAFE_API_KEY`, `model`
      `jev-latest`, `state` equal to the stored context body, and exactly two Choice
      questions: outcome over `H`/`D`/`A`, scoreline over the thirty-six options.
- [ ] A recorded Jev reply is rendered into `{fixture_id, probs, score, rationale: ""}`
      that `validatePrediction` accepts, with `probs` taken from the outcome Choice's
      `probabilities` and `score` from the scoreline Choice's `choice`.
- [ ] The attempt row for that call carries `tokensIn`/`tokensOut` from `usage`, the
      resolved provider `typesafe`, the resolved model from the reply, and the raw reply
      body; a 429 or 529 is recorded as `rate_limit`, a 401 or 422 as `provider`.
- [ ] Every existing envelope test for the OpenRouter path passes unchanged: no real
      seat's request body moves by a byte.
- [ ] `EXHIBITION_MODEL_ID` naming the row runs the pre-flight and the Match replay
      through this wire; `TRACK=fpl` naming it refuses in the loader as any row at a
      Match Prompt Version does.
- [ ] The replay and the pre-flight refuse to start without `TYPESAFE_API_KEY` when the
      named row's provider is `typesafe`, and never ask for it otherwise.
- [ ] The roster entry refuses a row whose provider is `typesafe`, by name.
- [ ] Wherever an Exhibition Run's label is shown, a `typesafe` row also shows the frozen
      typed-endpoint caveat; every other Exhibition row's surface is unchanged.
- [ ] No test and no command in this ticket reaches `api.typesafe.ai`.
