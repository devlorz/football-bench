# Ticket: The ceiling that was spent before the answer began

`ENTRANT_MAX_OUTPUT_TOKENS` goes from 16,000 to 32,000, on evidence the Season's first FPL
opening produced. Vocabulary: [CONTEXT.md](../../../CONTEXT.md) — **Entrant**, **Repair**,
**Gap**.

**What was measured.** The opening of Gameweek 1 ran at 2026-08-20T18:22Z and refused: six
seats answered legally, three timed out at the five-minute window, and `fpl/minimax-m3`
returned this —

| | |
|---|---|
| `finish_reason` | `length` |
| `prompt_tokens` | 29,031 |
| `completion_tokens` | 16,000 |
| `reasoning_tokens` | **16,000** |
| `content` | null |
| cost | $0.0279 |

Reasoning equals completion: the seat spent the entire output ceiling thinking and had
nothing left to answer with. This is not an answer cut mid-sentence, which is what
`TRUNCATED_AT_CEILING` was written for — it is a seat that never reached the sentence.

**Why the old number could not have known.** 16,000 was set from the Match track: 6,138 was
the longest completion any seat had been watched finish, and across 183 rows reasoning ran
11 to 458 tokens past the content. An FPL prompt is several times a Match prompt, and the
constant's own comment said so and rode the same number anyway, calling itself "provisional
against the first run whose maxima are not censored". This was that run.

**Why 32,000.** Double, and no more: MiniMax produced 16,000 reasoning tokens in ~110
seconds, so 32,000 lands near 3.7 minutes and stays inside the ten-minute call window. The
ceiling is not a quota — a seat that does not use the room is not billed for it — so the
Match track and pre-flight, which share this constant and have never approached 16,000, pay
nothing for the headroom and gain the same protection.

**What this does not promise.** A seat that spent 16,000 without finishing may spend 32,000
without finishing. If MiniMax hits the ceiling again the answer is not a third doubling
picked in the dark; it is that this Base Model does not fit the FPL prompt inside a priced
ceiling, which is a finding about the seat rather than a number to raise.

- [x] `ENTRANT_MAX_OUTPUT_TOKENS` reads `32_000`, and its doc comment carries the FPL
      measurement beside the Match one that could not predict it.
- [x] The test that pins the literal on the wire moves with it, deliberately — that test
      exists so the ceiling cannot move quietly.
- [ ] The next run whose maxima are not censored is read back, and this number is either
      confirmed or shown to be the wrong lever.

## Not in this ticket

**The path that misreports this failure.** `ask-for-gameweek-action.ts` checks
`content === null` before it checks `finish_reason === "length"`, so a ceiling that takes
the content with it is recorded as "OpenRouter returned an unexpected response shape" —
a provider fault — rather than against `TRUNCATED_AT_CEILING`. The constant's comment
claims the ceiling is recorded "on every path"; this is the path where it is not. The same
ordering appears in `attempt-match-calls.ts` and `preflight-base-models.ts` and should be
read before either is moved. Left out because the Gameweek 1 opening is on a clock and this
changes no outcome, only the honesty of the record — but it is why tonight's diagnosis took
a raw-body read instead of a glance at `error_kind`.

Per-track ceilings. One constant serves FPL, Match and pre-flight; giving FPL its own would
add a parameter with one caller that differs, across four files, under the same clock.
