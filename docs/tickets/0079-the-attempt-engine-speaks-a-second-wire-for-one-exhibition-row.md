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

- [x] A `MatchCall` whose `provider` is `typesafe` produces a `POST` to
      `https://api.typesafe.ai/v1/systemone` with a bearer `TYPESAFE_API_KEY`, `model`
      `jev-latest`, `state` equal to the stored context body, and exactly two Choice
      questions: outcome over `H`/`D`/`A`, scoreline over the thirty-six options.
      *`test/typesafe-entrant.test.ts`'s "posts the stored context bytes as state, with
      exactly two Choice questions" pins the request shape directly, parsing
      `typesafeRequest`'s own body and asserting the URL, the bearer, `model`, `state`
      and both criteria maps. `test/replay-match-exhibition.test.ts`'s "posts the stored
      context as state, with no chat envelope..." and
      `test/preflight-base-models.test.ts`'s "checks one typesafe Exhibition over its own
      wire" prove the same shape reaches the real host through both doors, against a
      captured `http` call rather than the function in isolation.*
- [x] A recorded Jev reply is rendered into `{fixture_id, probs, score, rationale: ""}`
      that `validatePrediction` accepts, with `probs` taken from the outcome Choice's
      `probabilities` and `score` from the scoreline Choice's `choice`.
      *`test/typesafe-entrant.test.ts`'s three cases under "rendering a Jev reply into a
      Prediction": the happy path against `validatePrediction`; a body with no `answers`
      to read at all, which returns null; and a malformed scoreline choice, which still
      renders and lets `validatePrediction` — not this parser — record the `schema`
      failure. That third case is also exercised end to end in
      `test/replay-match-exhibition.test.ts`'s "never Repairs an invalid Jev reply",
      added after review.*
- [x] The attempt row for that call carries `tokensIn`/`tokensOut` from `usage`, the
      resolved provider `typesafe`, the resolved model from the reply, and the raw reply
      body; a 429 or 529 is recorded as `rate_limit`, a 401 or 422 as `provider`.
      *`test/replay-match-exhibition.test.ts`'s telemetry test selects `tokens_in`,
      `tokens_out`, `resolved_provider`, `resolved_model` and, added after review because
      the first pass never asserted it, `raw_response` — compared against the literal
      Jev reply body. "classifies 529 as rate_limit and 401 as provider" asserts both
      named kinds directly. 422 is not asserted on its own: it falls to the same
      `"provider"` default branch 401 does, through the same `response.status` check, so
      a dedicated case would exercise no line the 401 case does not already reach.*
- [x] Every existing envelope test for the OpenRouter path passes unchanged: no real
      seat's request body moves by a byte.
      *Left empty through the first pass of this ticket; review named it as the box
      needing evidence most. `test/openrouter-entrant.test.ts` and
      `test/predict-gameweek.test.ts` pass unmodified against this diff, and neither
      `openrouter-entrant.ts` nor `predict-gameweek.ts` was edited: the wire is chosen by
      an `isTypesafeProvider` branch added in `attempt-match-calls.ts` and
      `preflight-base-models.ts`, and every non-typesafe call still reaches
      `openRouterRequest`/`parseOpenRouterResponse` on the same arguments it always did.
      `ParsedOpenRouterResponse` was renamed to `ParsedEntrantResponse` during review — a
      type-level rename with no test referencing the old name and no effect on the wire.*
- [x] `EXHIBITION_MODEL_ID` naming the row runs the pre-flight and the Match replay
      through this wire; `TRACK=fpl` naming it refuses in the loader as any row at a
      Match Prompt Version does.
      *The first half was tested from the start (the two tests named in box one). The
      second half — `TRACK=fpl` — had no test until review found the gap: it relied on
      the Prompt Version check in `load-exhibition.ts`, which never mentions `provider`
      at all, so nothing proved a typesafe row hits it rather than some carve-out.
      `test/replay-fpl-exhibition.test.ts`'s "refuses a typesafe row the same way:
      TRACK=fpl reads only the Prompt Version, never the provider" now seats a typesafe
      row at the Match Prompt Version and asserts the same
      `is at Prompt Version ... not fpl/...` refusal any other misplaced row gets.*
- [x] The replay and the pre-flight refuse to start without `TYPESAFE_API_KEY` when the
      named row's provider is `typesafe`, and never ask for it otherwise.
      *Two layers, both tested. The entry points:
      `test/replay-match-exhibition.test.ts`'s and
      `test/preflight-base-models.test.ts`'s "refuses to ... without TYPESAFE_API_KEY",
      each asserting zero calls were made. The engine's own backstop, added after review
      found it absent: `typesafeRequest(typesafeApiKey ?? "", ...)` let a caller that
      reached `attemptMatchCalls` or `callBaseModel` directly — bypassing the entry
      point — send an empty `Authorization: Bearer` to the real host. `requireTypesafeApiKey`
      (called once per row before any worker starts) and `typesafeApiKeyOrThrow` (at the
      point the request is built) close that gap and are unit-tested directly in
      `test/typesafe-entrant.test.ts`'s "the TYPESAFE_API_KEY guards" — no `?? ""` remains
      anywhere in this diff.*
- [x] The roster entry refuses a row whose provider is `typesafe`, by name.
      *`test/season-roster.test.ts`'s "refuses a row whose provider is 'typesafe', by
      name" swaps a `typesafe` provider into `SEASON_ROSTER[0]` and asserts the named,
      ADR-referencing message — not the generic "disagrees with the Season Roster on
      provider" a plain identity mismatch would already produce — and that nothing was
      written.*
- [x] Wherever an Exhibition Run's label is shown, a `typesafe` row also shows the frozen
      typed-endpoint caveat; every other Exhibition row's surface is unchanged.
      *Left empty through the first pass; review named it, with box three, as needing
      evidence most, and found two real defects in the "unchanged" half. `TYPESAFE_CAVEAT`
      is threaded through the leaderboard, the entrant record, the Fixtures endpoint and
      the `/overall` aggregation, and rendered in the four Astro pages that already show
      `EXHIBITION_CAVEAT`; each is tested (`test/dashboard-read-api.test.ts`,
      `test/dashboard-entrants-api.test.ts`, `test/dashboard-fixtures-api.test.ts`,
      `test/dashboard-overall-view.test.ts`). What review found: `typesafeCaveat` was a
      required field on `LeaderboardBody` and `EntrantsBody`, so every other row's body
      gained a stray `"typesafeCaveat": null` it did not carry before — the box's own
      "unchanged" claim, false for those two endpoints. Now optional and conditionally
      spread, exactly as `FixturesBody.exhibitionCaveat` already is, so a body with no
      typesafe row is byte-identical to what it was before this field existed. Making it
      optional exposed a second bug in the fix itself: the "moves no figure" tests'
      normalizer overrode the field to `null` rather than dropping it, which reorders an
      object's JSON keys when the field goes from absent to present — a byte-for-byte
      string comparison failed on key order alone, on a Season that was otherwise
      identical. Both tests now delete the key instead of nulling it. Separately,
      `TYPESAFE_CAVEAT`'s wording opened "This row was asked..." where every other
      sentence in `recall-caveat.ts` says "Exhibition Run"; corrected to match. Not
      fixed, and accepted as matching precedent rather than a defect: one sentence still
      touches five UI files (four Astro pages plus `overall-view.ts`) — the same shotgun
      surgery `EXHIBITION_CAVEAT` itself required under ADR-0052, and a shared render
      helper now would be infrastructure that ADR never needed either.*
- [x] No test and no command in this ticket reaches `api.typesafe.ai`.
      *Every test passes its own `http` mock; nothing in this diff calls `fetch` or
      `nodeHttpFetcher` against `TYPESAFE_URL`. The constant is asserted as the request's
      `url` field, never dialled.*
