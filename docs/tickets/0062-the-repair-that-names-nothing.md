# Ticket: The Repair that names nothing

**What to build:** a Repair that tells the Entrant what was actually wrong with its answer.
Every one of the 84 validation failures on the record gets the same sentence — "Response
must match the Prediction schema for Fixture N" — which names no field, no expected shape
and no defect, so the Base Model has nothing to correct toward and answers the same way
three times at full price. Source: the read below, taken 2026-08-27 against production.
Decisions this touches:
[ADR-0010](../adr/0010-prompt-only-json-with-three-repairs-on-both-tracks.md) (three
Repairs on both tracks), and the
[2026-08-25 price report](../reports/2026-08-25-five-league-price.md), whose
"a Repair budget or a seat-specific gate would" this ticket answers with a third option.

**Blocked by:** None — can start immediately.

**Status:** done — every box green 2026-08-27

---

## What is already known

**Every validation failure in the record belongs to one Base Model, and every one of them
is a shape mistake rather than a bad answer.** Read on 2026-08-27 over `attempts` joined to
`models`, `track = 'match'`, `role = 'entrant'`, `not ok`, `error_kind in ('schema',
'probs_sum')`, seat `Gemini 3.1 Pro Preview` — 84 rows across all four open Competitions
(`PD` 32, `FL1` 12, `SA` 12, `PL` 10):

| Rows | What the body actually held |
| ---: | --- |
| 49 | `score` an array **and** `probs` an array |
| 18 | `fixture_id` echoed wrong — at least some as a string, `"564638"` |
| 15 | `score` an array, `probs` an array **and** `fixture_id` wrong |
| 2 | `score` an array alone |

Totals across those rows: **66 of 84 sent `score` as an array**, **64 sent `probs` as an
array**, **33 echoed `fixture_id` wrong**. Two real bodies:

```json
{"fixture_id":564637,"probs":[0.43,0.27,0.3],"score":[1,1]}
{"fixture_id":"564638","probs":[0.51,0.26,0.23],"score":[2,1]}
```

**None of the 84 is a refusal, a truncation or a wrong forecast.** Each is a competent
answer written positionally: the prompt's `probs (H, D, A)` and `score (home, away)` read
to this model as tuples where every other seat reads them as objects. The prompt itself
cannot move — one template serves all five Competitions (ADR-0038) and four of their
Versions are in use — so the Repair is the only turn left that can say anything.

**The Repair says nothing because the validator only names two defects.** It selects a
specific message when every zod issue is a probability out of range or a non-integer goal;
any other issue — a wrong container type, a string where a number belongs, a `fixture_id`
that does not match the Fixture asked about — falls through to the sentence above. So the
three failure shapes that make up the whole of the record's waste are exactly the three the
Repair cannot describe.

**What this is worth.** These rows are 90% of the record's wasted cost — $1.8975 of
$2.1007 in the window the price report measured, and a fifth Competition now adds to it. A
validation failure is billed in full: the provider finished the completion, and
`raw_response` holds its `usage.cost`.

**The one precondition, and it is a real fork.** The Repair text is not the frozen
rendering — the pinned sha hashes the context the builder renders (ticket 0058's reading of
it) — but that must be **confirmed rather than assumed** before a line of this is written,
because the Repair is still something an Entrant is shown. If it turns out to sit inside
the freeze, this ticket stops and becomes a decision about amending used Versions
(ADR-0026, ADR-0042), not an implementation.

## Acceptance

- [x] **First, and recorded in this ticket:** whether the Repair message is inside any
      frozen Prompt Version's sha. If it is, nothing else here is built and the ticket
      records what decision would be needed instead.

      **Confirmed not sat: the Repair is outside every pin.** `MATCH_PROMPT_SHA256` and its
      four siblings in `src/predictions/openrouter-entrant.ts` hash one thing —
      `buildMatchContext`'s render, the initial packet a Fixture sends before any Entrant
      has answered (documented at `openrouter-entrant.ts:83-98`: "the sha is over a fully
      rendered context... hashed `buildMatchContext` over the suite's own Fixture and its
      own Competition data"). `predictionRepairMessage` lives in
      `src/predictions/validate-prediction.ts` and is never passed to that function or
      hashed by it — `attempt-match-calls.ts:513-522` pushes it as a later `user` turn onto
      an already-started conversation, after the assistant's own invalid reply. So the
      Repair text sits outside the freeze ADR-0026/0042 govern, and this ticket proceeds as
      an implementation, not a Prompt Version amendment.
- [x] A Repair for a wrong container names it: an array where an object with `home` and
      `away` belongs, an array where `H`, `D` and `A` belong, and a `fixture_id` that is
      the wrong value or the wrong type each produce a sentence a reader can act on.

      Three new messages in `validate-prediction.ts`: `probsContainer(received)`,
      `scoreContainer(received)`, and `fixtureId(expectedFixtureId)` — the last covers the
      wrong-type case (a zod `invalid_type` issue on `fixture_id`), the wrong-value case (a
      well-typed `fixture_id` that fails the post-parse equality check), and every other
      shape zod can raise on that field (non-integer, zero, negative), since the correction
      is the same sentence regardless of what was wrong. Detection reuses the existing
      per-field issue grouping: a container issue is the whole field mistyped — one
      `invalid_type` issue at path length 1, never confused with a range/element issue one
      level deeper. Combinations (e.g. both containers wrong, or a container plus
      `fixture_id`) name every defect, newline-joined, exactly as the two pre-existing
      messages already combined.

      **Caught by review, corrected before this box shipped:** the first pass hardcoded
      "not an array of positional values" into both container messages, on the unstated
      assumption that `invalid_type` at path length 1 always meant an array — it doesn't. A
      missing `probs` key, `score: null` and a bare `probs: "nope"` all produce the identical
      zod issue (`{path:["probs"],code:"invalid_type"}`) and would have gotten the same
      "not an array" sentence, which is false for three of those four shapes and would have
      spent one of ADR-0010's three Repair turns telling the Base Model to fix something it
      never did. `describeReceived` now reads the actual value back out of the parsed JSON
      — "received an array", "received null", "received nothing", "received a string" — so
      the sentence never claims more than what was sent. The `fixtureId` message was
      trimmed the same way, from "not a string or a different value" (also an overclaim,
      and one that left `fixture_id: -5` and `fixture_id: 0` — well-typed, just out of
      range — falling through to the general fallback, contrary to this box's own "wrong
      value or the wrong type" wording) to "return exactly that value", which is true for
      every shape zod can report on that field. `fixtureIdFailed` now matches any issue on
      `fixture_id` rather than only `invalid_type`, which is safe unconditionally: the field
      has no sub-schema, so every issue zod raises on it sits at that same path.
- [x] The two messages the validator names today are unchanged for the inputs that produce
      them today — other seats see those, and this ticket is not about them.

      `probabilitiesRange` and `score` are untouched strings, and the pre-existing test
      "does not misname a wrong-type field as a range failure" (string-typed `H` and
      `home`) still passes unmodified — that shape stays on the general fallback exactly as
      before, because it was never one of the 84 rows.
- [x] Replayed over the 84 archived bodies, every one now receives a message naming its own
      defect, and the general fallback is reached by none of them. The count is recorded
      here beside the query that read it.

      Read 2026-08-27 against production, same selection the ticket opened with:

      ```sql
      select a.raw_response, a.fixture_id, a.competition
        from attempts a
        join models m on m.id = a.model_id
       where a.track = 'match' and m.role = 'entrant' and not a.ok
         and a.error_kind in ('schema', 'probs_sum')
         and m.name = 'Gemini 3.1 Pro Preview';
      ```

      Each row's `raw_response` parsed with `parseOpenRouterResponse` and replayed through
      the new `validatePrediction` with its own `fixture_id`:

      ```
      { "total": 84, "named": 84, "fallback": 0, "unparsed": 0 }
      ```

      All 84 now name their own defect; none reaches
      `validationMessages.schema(expectedFixtureId)`, the generic fallback. Re-run after the
      review correction above, grouped by message: every array-shaped `probs`/`score` row
      still reads "received an array" — the record holds no missing-key or `null` case, so
      the honest wording and the old hardcoded one happen to agree on these 84 rows, which
      is exactly why the review's counterexamples had to be constructed rather than found
      here.
- [x] No Prompt Version's sha moves. No prompt template text changes.

      `openrouter-entrant.ts` is untouched by this ticket — the only file changed is
      `validate-prediction.ts` (plus its test), which the first box establishes sits
      outside every pin.
