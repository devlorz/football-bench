# Latency under the five-minute window, and what the two-minute one was hiding

Ticket 0023 slice 1 replaced a 120,000ms client timeout with 300,000ms, argued from means
because every maximum in the record sat at the ceiling and no percentile could be read
from a censored top. The comment on
`DEFAULT_ENTRANT_CALL_TIMEOUT_MS` called itself provisional and said the first uncensored
maxima would arrive with the next run. They did, the same afternoon, and they are larger
than the argument assumed.

Read off `attempts` for every call made after 2026-08-20T13:40Z — the fills that closed
La Liga's Gameweek 2 and the Premier League's Gameweek 1 under the new window.

## What the seats actually take

| Seat | Calls | Mean | Max | Timeouts |
| --- | ---: | ---: | ---: | ---: |
| GLM 5.3 | 4 | 216.4s | **300,009ms** | 1 |
| Qwen3.8 Max | 8 | 171.0s | **300,027ms** | 2 |
| DeepSeek V4 Pro | 19 | 100.0s | 205,757ms | 0 |
| Kimi K3 | 9 | 98.9s | 153,318ms | 0 |
| Muse Spark 1.2 | 3 | 29.4s | 41,192ms | 0 |
| GPT-5.6 Sol Pro | 4 | 17.9s | 21,480ms | 0 |
| Gemini 3.1 Pro Preview | 21 | 14.3s | 34,233ms | 0 |
| Claude Opus 5 | 6 | 7.8s | 9,009ms | 0 |

## The censoring was worse than the means suggested

Three seats that Gapped on the old ceiling now finish, and they finish far above it.
DeepSeek V4 Pro — 16 Gaps on 2026-08-20's first two runs, more than any other seat — took
**205,757ms** and ended on its own. Kimi K3 reached 153,318ms. Neither had ever been
allowed past 120,000ms, so neither number existed before today.

The means moved with them, and that is the part worth keeping. Slice 1 justified
300,000ms as "roughly three times the 101.6s mean of the slowest seat". Under the wider
window the same seat means 100.0s, but **GLM 5.3 means 216.4s and Qwen3.8 Max 171.0s** —
both above the figure the whole argument was anchored to. The old means were not the
slow seats' true means; they were the average of what fitted inside two minutes.

## The new ceiling is being hit too

GLM 5.3's maximum is 300,009ms and Qwen3.8 Max's is 300,027ms — over 300,000 by nine and
twenty-seven milliseconds, the same signature the old record showed at 120,005 to
120,020ms. Three of the five Gaps left on the Premier League's Gameweek 1 are these two
seats hitting the new wall.

**Then a retry cleared all three.** The same five pairs were asked again half an hour
later and every timeout answered — GLM 5.3 and Qwen3.8 Max both landed inside the window
they had just overrun. So the two seats sit *at* the boundary rather than beyond it: their
slowest calls fall on either side of five minutes depending on the run, which is a
different finding from a seat that reliably needs more.

That weakens the case for moving the number again. 300,000ms took timeouts from 37 across
two runs to zero across both Gameweeks, and the maxima that cleared it did so by nine and
twenty-seven milliseconds rather than by minutes. Whether a wider window would buy
anything, or whether a seat that thinks for five minutes is already at the edge of what
the schedule can carry, is a decision for whoever reads this rather than one this report
makes: the `fill` trigger runs two hours before a Lock, and a window is only free until it
starts costing Gameweeks.

## What it bought

| | Before | After |
| --- | ---: | ---: |
| La Liga Gameweek 2 | 116 / 140 | **139 / 140** |
| Premier League Gameweek 1 | 63 / 100 | **99 / 100** |
| Timeout Gaps across both | 37 | **0** |

One Gap is left in each Gameweek, and neither is a clock we set. La Liga's is Gemini 3.1
Pro Preview failing the Prediction schema after three Repairs, an Entrant's own failure and
the kind of Gap the record exists to hold.

The Premier League's is the more interesting one, and it only became visible because the
window widened. DeepSeek V4 Pro on Fixture 9, routed to Novita, was cut at **120,002ms** on
the first pass and recorded as a timeout. Given five minutes it ran to **195,092ms** and
then to **209,712ms** on the retry, finished on its own both times, and returned a body of
nothing but blank lines — no JSON, no error, no refusal. The parser calls that an
unexpected response shape, which is exactly what it is.

**The old ceiling was hiding this failure, not preventing it.** A timeout said we stopped
listening; what the seat was going to do at the end of those three and a half minutes was
unknowable. Widening the window did not make the call succeed — it made the failure
legible, and a Gap that names what the provider actually returned is worth more than one
that names our own impatience. That is the whole of what slice 1 set out to do, arriving
in a form nobody predicted.

Not covered here: `ENTRANT_MAX_OUTPUT_TOKENS`, whose own censored maxima are in
[the completion-token report](2026-08-20-completion-tokens-per-seat.md) and which is
provisional for the same reason this window was.
