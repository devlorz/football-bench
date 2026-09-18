# Jev's first Fixture, and then the Premier League — 2026-09-18

Ticket: [0080-jev-answers-its-first-fixture-and-then-a-competition.md](../tickets/0080-jev-answers-its-first-fixture-and-then-a-competition.md).
Decisions: [ADR-0059](../adr/0059-an-exhibition-run-may-answer-through-a-typed-endpoint-instead-of-a-chat-one.md).
Steps: [docs/runbooks/a-new-base-model-arrives.md](../runbooks/a-new-base-model-arrives.md) sections 3 and 6.

## Pre-flight context

| Check | Observed |
|---|---|
| Target seat | `exhibition/jev-latest` (`role = 'exhibition'`) |
| Base Model | `jev-latest` |
| Provider | `typesafe` (sole endpoint, `https://api.typesafe.ai/v1/systemone`) |
| Quantization | `null` |
| Prompt Version | `match/2026-27-v2` |
| Fixture used | 1, Arsenal v Coventry City, kick-off `2026-08-21T19:00:00Z` |
| Pricing | $0.042 / MTok input, output free (from the TypeSafe account) |

## A request-shape bug, not the anticipated 422

The first pre-flight call returned HTTP 422, but not the "`state` does not fit" outcome
ADR-0059 and ticket 0080 both expected. TypeSafe's own schema error named the cause:

```
Input tag 'Choice' found using 'type' does not match any of the expected tags:
<QuestionType.Noul: 'noul'>, <QuestionType.Choice: 'choice'>, <QuestionType.Score: 'score'>,
<QuestionType.BoundingBox: 'bounding_box'>
```

Ticket 0079's `typesafeRequest` sent `"type": "Choice"` (capitalized) for both questions;
TypeSafe's discriminator is lower-case. Nothing in TypeSafe's documentation states the
casing — this was exactly the kind of fact only a real call surfaces. Fixed in
`src/predictions/typesafe-entrant.ts` (both `outcome` and `score` questions now send
`"choice"`) and in the test that had baked in the same wrong guess
(`test/typesafe-entrant.test.ts`). `tsc --noEmit` and the full `typesafe-entrant.test.ts`
suite are clean after the fix. The re-run pre-flight call below is the one this fix
produced.

## Pre-flight observation

A single-model pre-flight targeting `exhibition/jev-latest` ran against Premier League
Fixture 1 (`Arsenal v Coventry City`) under `match/2026-27-v2`. The raw response was
archived byte-for-byte in `raw_snapshots` under `typesafe-preflight:jev-latest`:

```json
{
  "model": "jev-1.13.0",
  "answers": {
    "outcome": {
      "type": "choice",
      "choice": "H",
      "confidence": 1.0,
      "probabilities": { "A": 0.0, "H": 1.0, "D": 0.0 }
    },
    "score": {
      "type": "choice",
      "choice": "3-0",
      "confidence": 0.78,
      "probabilities": {
        "3-0": 0.79, "2-0": 0.11, "4-0": 0.04, "3-1": 0.03, "1-0": 0.01, "4-1": 0.01
        /* the remaining 30 of 36 scorelines answered 0.0 */
      }
    }
  },
  "usage": { "input_tokens": 3212, "output_tokens": 379 }
}
```

## Telemetry and verdict

- **Status:** `parseable` (`ok: true`), HTTP 200, no refusal.
- **Resolved provider / model:** `typesafe` / `jev-1.13.0`.
- **Outcome distribution:** Home win 1.0, Draw 0.0, Away win 0.0 — a confident, resolved
  call rather than a flat or missing one.
- **Score distribution:** 36 scorelines returned, mass concentrated on `3-0` (0.79) with
  the rest of the probability on nearby, plausible scorelines (`2-0`, `4-0`, `3-1`,
  `1-0`, `4-1`) and 30 of 36 lines at 0.0 — a shaped distribution, not degenerate.
- **`usage`:** 3,212 input tokens, 379 output tokens.
- **Latency:** under 10 seconds, observed wall-clock on the operator's terminal (this
  codebase does not instrument pre-flight latency — see the `attempts`-table method in
  [the five-minute-window report](2026-08-20-latency-under-the-five-minute-window.md),
  which does not apply here since pre-flight writes no `attempts` row).
- **Price:** $0.042/MTok input, output free (TypeSafe account dashboard). At 3,212 input
  tokens, one call costs **≈$0.000135**. The account's own per-call spend read
  `<$0.01` for the day, consistent with this.
- **Go verdict:** none of the three stop conditions fired — not a 401, not a 422 on
  `state` (the one 422 seen was the request-shape bug above, now fixed), and a
  parseable answer with usable `usage`. Ready for the replay.

## The replay permission request

Stated to the operator before any replay call was made: 40 played Premier League
Fixtures with a stored `match`-track context (the exact count `replay-match-exhibition.ts`
resolves at call time, read via `select count(*) from fixtures f join contexts c on ...
where f.competition = 'PL' and f.season = '2026-27' and f.result is not null`), 40 calls,
no Repair chain behind any of them, and a derived total of **$0.005–$0.01** at the
observed per-call rate. The operator confirmed. The replay ran:

```bash
EXHIBITION_MODEL_ID=exhibition/jev-latest COMPETITION=PL npm run exhibition:replay
```

## Replay outcome

```
exhibition/jev-latest covered Gameweeks 1, 2, 3, 4 of the 2026-27 Match track.
```

- **Predictions written:** 40. **Attempts:** 40. **Errored attempts:** 0 — every Fixture
  answered on the first attempt, no Repair, no Gap.
- **Match Points scoring:** run separately (`COMPETITION=PL npm run match:score`, a free,
  local computation — no Base Model call) since a replay writes Predictions but does not
  score them. Before: `matchPoints: 0, betPoints: 0, n: 0`. After: `matchPoints: 52,
  betPoints: 157, n: 40`.

## Surface check

Read directly off `handleDashboardRequest`'s `/api/pl/leaderboard` response against the
production database (the same function `src/dashboard/worker.ts` serves in production;
`src/cli/dev-api.ts` is its local-development wiring):

- `exhibition/jev-latest` appears in `entrants` with `"exhibition": { "ranAfterGw": 4 }`
  and `n: 40` — the "ran after Gameweek N" label the ticket asked for.
- The leaderboard body's `typesafeCaveat` field is present (`"This Exhibition Run was
  asked through a typed endpoint, not the chat prompt every other seat answers. Its
  Repair count and its rationale mean nothing here."`) — `typesafeCaveatField` in
  `read-api.ts` sets it whenever any row on the page is a typesafe Exhibition row, which
  `exhibition/jev-latest` now is.
- Its Repair count is 0, matching the "means nothing here" caveat rather than
  contradicting it.
- `matchRoster` in `score-match-gameweek.ts` selects `role = 'entrant'` for the Comparison
  Anchor and every complete case (ADR-0032's mechanism, exercised unchanged by
  ticket 0079's tests) — `exhibition/jev-latest` is `role = 'exhibition'`, so it is
  excluded from the Comparison Anchor, the complete-case intersection and every interval
  by the same construction every other Exhibition row already relies on. No new code
  path was needed for this row, and none was added.

## What ADR-0059 asked to learn

- **Price:** $0.042/MTok input, output free — cheap enough that the 40-call replay cost
  a fraction of a cent.
- **Rate limit:** not hit at 40 sequential calls; unknown above that.
- **Does the stored context fit `state`:** yes — the Premier League's `match/2026-27-v2`
  context (the same one every other seat reads) sent whole, no truncation, no 422 on
  size at any of the 41 calls made (1 pre-flight + 40 replay).
