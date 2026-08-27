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

**Status:** ready-for-agent

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

- [ ] **First, and recorded in this ticket:** whether the Repair message is inside any
      frozen Prompt Version's sha. If it is, nothing else here is built and the ticket
      records what decision would be needed instead.
- [ ] A Repair for a wrong container names it: an array where an object with `home` and
      `away` belongs, an array where `H`, `D` and `A` belong, and a `fixture_id` that is
      the wrong value or the wrong type each produce a sentence a reader can act on.
- [ ] The two messages the validator names today are unchanged for the inputs that produce
      them today — other seats see those, and this ticket is not about them.
- [ ] Replayed over the 84 archived bodies, every one now receives a message naming its own
      defect, and the general fallback is reached by none of them. The count is recorded
      here beside the query that read it.
- [ ] No Prompt Version's sha moves. No prompt template text changes.
