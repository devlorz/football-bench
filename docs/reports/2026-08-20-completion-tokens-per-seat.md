# How much every seat actually wrote on 2026-08-20

The record behind `ENTRANT_MAX_OUTPUT_TOKENS`. A request that names no output ceiling is
priced by OpenRouter against whatever ceiling the Base Model allows, and refused when the
balance cannot cover that ceiling rather than the call — which is what the sixteen HTTP
402s on the Premier League's Gameweek 1 were, with $1.61 still in the account. Naming a
ceiling fixes that, and a ceiling has to come from somewhere. This is the somewhere.

**Source.** The OpenRouter activity export for 2026-08-20, **248 generations**: 9 from
pre-flight, 158 from La Liga's Gameweek 2 and 81 from the Premier League's Gameweek 1.
The export is a download and is not held in this repo, so the table below is the record;
it cannot be re-derived from anything checked in.

**`tokens_completion` already contains `tokens_reasoning`**, so the columns below are
`tokens_completion` alone and nothing is added to them. That reasoning never exceeds
completion would not on its own prove containment — two separate quantities could sit that
way by chance. What proves it is the difference: over the **183 rows carrying both**,
`tokens_completion - tokens_reasoning` runs from **11 to 458 tokens, mean 259**. Two
independent quantities would spread with the length of the answer; a band that narrow, at
exactly the size of a Prediction's JSON and its rationale, is the visible part of one
quantity whose remainder is the thinking.

## Longest and mean completion per seat

Split by whether the call ended on its own or was cancelled at the two-minute client
timeout, because the two mean different things.

| Seat | max (finished) | mean | n | max (cancelled) | n |
| --- | ---: | ---: | ---: | ---: | ---: |
| DeepSeek V4 Pro | 6138 | 3518 | 9 | 5447 | 16 |
| Grok 4.6 | 5521 | 2265 | 23 | 198 | 3 |
| GLM 5.3 | 5235 | 2840 | 21 | 5509 | 4 |
| Muse Spark 1.2 | 5009 | 3591 | 20 | — | 0 |
| Qwen3.8 Max | 4210 | 2558 | 18 | — | 0 |
| Kimi K3 | 3773 | 2386 | 16 | 2977 | 5 |
| Gemini 3.1 Pro Preview | 3417 | 1701 | 48 | — | 0 |
| MiniMax M3 | 1823 | 1260 | 25 | — | 0 |
| GPT-5.6 Sol Pro | 1777 | 1322 | 21 | — | 0 |
| Claude Opus 5 | 470 | 340 | 19 | — | 0 |

### Why the cancelled column does not add up to slice 1's 37, and should not

Slice 1 counted **37 timeout Gaps** over these runs; the cancelled column above sums to
**28**, which is the number of cancelled generations in the export. The nine missing are
Qwen3.8 Max's, and Qwen is the seat whose cancelled cell reads 0 — its nine timeouts left
no billed generation behind at all, so the export never saw them.

The arithmetic closes on that reading and on no other: the finished column sums to 220,
plus 28 cancelled is **248**, the day's billed generations exactly. So Qwen's 18 finished
rows are 18 calls that finished, its 4,210 maximum is an answer that ended on its own, and
no cut call is hiding in a finished column anywhere in the table.

The 28 cancelled rows produced **112,833 completion tokens between them, a mean of
4,030** — the figure ticket 0023's accounting footnote uses, given here because the table
above carries no mean for that side.

## The cancelled column is a floor, not a length

A call cut off at two minutes stopped mid-answer, so its token count says how far the seat
had got, not how far it was going. **GLM 5.3 was cancelled at 5,509 tokens — longer than
the 5,235 of anything it was ever allowed to finish.** One seat is enough: the top of this
record is censored, in the same way and by the same clock as the latencies in
[ticket 0023](../tickets/0023-the-clock-that-makes-gaps-and-the-ceiling-nobody-set.md)'s
first slice.

So a cap read straight off 6,138 would be read off a distribution with its tail cut. The
number set instead is **16,000**, roughly two and a half times the longest completion
anyone has watched end on its own.

**It is provisional, and dated.** Slice 1 widened the window to five minutes, so the calls
that were cut here will finish in the next run and the first uncensored maxima arrive with
it. This report is worth replacing then rather than kept.

## The sixteen refusals, and which seats took them

All sixteen HTTP 402s fell on the Premier League's Gameweek 1, and on four seats: **Gemini
3.1 Pro Preview, Kimi K3, GPT-5.6 Sol Pro and Claude Opus 5**. **MiniMax M3 and Muse Spark
took none.**

The mechanism is that a ceiling-priced estimate scales with a seat's output price, so the
dearest seats are refused first as a balance falls. This export carries no price column,
so what is evidenced here is which seats were refused, not their ranking by price — the
ranking in ticket 0023 comes from the model list, not from this record.

## The day's ledger, for anyone re-deriving the above

| Run | Calls billed | Ledger |
| --- | ---: | ---: |
| Pre-flight | 9 | $0.1571 |
| La Liga Gameweek 2 | 158 | $2.9959 |
| Premier League Gameweek 1 | 81 | $1.5589 |
| | **248** | **$4.7119** |
