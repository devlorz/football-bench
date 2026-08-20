# The FPL opening, called one seat at a time

Four attempts to open the FPL track at Gameweek 1 of 2026-27, all on the evening of
2026-08-20, all against the same frozen `fpl/2026-27-v2` context and the same stored
Gameweek. Read off `attempts` where `track = 'fpl' and gw = 1`. The opening commits every
Entrant's Squad or none, so none of these runs stored a Manager State.

## The four runs

| Run | First call landed | Call window | Concurrency | Seats called |
| --- | --- | ---: | ---: | ---: |
| 1 | 18:22Z | 300,000 ms | 10 | 10 |
| 2 | 18:53Z | 300,000 ms | 10 | 4 |
| 3 | 19:02Z | 600,000 ms | 10 | 4 |
| 4 | 19:23Z | 600,000 ms | **1** | 3 |

The column is when each run's *first* call landed, not when the run began:
`attempts.attempted_at` is stamped the moment a response arrives. It matters for run 4
alone, where the seats went out one after another — GLM's abort at 19:23:59 after ten
minutes, MiniMax at 19:27:06 after three, Qwen at 19:33:05 after six. That run started
around 19:14Z and the list stopped changing at 19:33:05.573Z, which is the instant the
withdrawals are dated to.

Runs 2 to 4 called fewer seats because a seat with a legal opening on record is replayed
from `attempts.raw_response` rather than asked again (ADR-0025). Six seats opened in run 1
and Kimi K3 joined them in run 2; none of them was billed again afterwards.

## What each seat did

| Seat | Run 1 | Run 2 | Run 3 | Run 4, alone |
| --- | --- | --- | --- | --- |
| Claude Opus 5 | legal | replayed | replayed | replayed |
| Muse Spark 1.2 | legal | replayed | replayed | replayed |
| GPT-5.6 Sol Pro | legal | replayed | replayed | replayed |
| Gemini 3.1 Pro Preview | legal | replayed | replayed | replayed |
| Grok 4.6 | legal | replayed | replayed | replayed |
| DeepSeek V4 Pro | legal, 267,011 ms | replayed | replayed | replayed |
| Kimi K3 | timeout, 300,005 ms | legal, 271,080 ms | replayed | replayed |
| Qwen3.8 Max | timeout, 300,005 ms | timeout, 300,005 ms | timeout, 599,994 ms | **legal, 358,189 ms** |
| GLM 5.3 | timeout, 300,008 ms | timeout, 300,013 ms | timeout, 600,011 ms | timeout, 600,017 ms |
| MiniMax M3 | length, 16,000 out | length, 32,000 out | length, 32,000 out | length, 32,000 out |

## What the numbers say

**The burst was real, and it was worth half an hour to find out.** Qwen3.8 Max refused
three times and opened on the fourth, at 358,189 ms — under the same ten-minute window that
had cut it off when nine other seats were in flight beside it. The FPL job configuration's
comment had recorded the pattern from the earlier concurrency work ("every one of ticket
0023's timeout Gaps came from a ten-wide burst and none from pre-flight, which calls one
seat at a time") and this is the fourth data point for it. Kimi K3 is the same story one run
earlier: dead at the five-minute ceiling, legal at 271,080 ms once the window widened.

**Two of the three failures are not the burst.** GLM 5.3 timed out alone, at the full ten
minutes, having timed out at every ceiling it has ever been given — 300,008, 300,013,
600,011, 600,017. Not one of its four figures is its own time; all four are ours. What is
known is that it does not finish inside ten uncontended minutes. What it needs is unmeasured
and stays that way.

MiniMax M3 never had a clock problem. It answered in 187 to 192 seconds every time and spent
the entire output ceiling on reasoning — 16,000 of 16,000 when the ceiling was 16,000, then
32,000 of 32,000 twice after ticket 0026 doubled it, with `content` null and
`finish_reason: length` each time. Concurrency is irrelevant to it and so is a third
doubling.

**The seats that opened are fast and the seats that did not are slow, on the same window.**
All six that opened in run 1 did so inside five minutes, DeepSeek's 267s the slowest of
them; the two that needed a wider window (Kimi at 271s, Qwen at 358s) are the two that the Match-track latency
report of the same day had already found nearest the ceiling. On the Match track's much
smaller prompt, GLM and Qwen were the only two seats with maxima sitting exactly at
300,000ms, means of 216s and 171s. The FPL prompt did not create the ordering; it made it
expensive.

## What was decided

ADR-0047 withdraws GLM 5.3, MiniMax M3 and Qwen3.8 Max from the FPL track's Season Roster,
which opens at seven — six from run 1 and Kimi K3 from run 2. The first two leave having
produced no legal opening in four attempts. Qwen3.8 Max leaves having produced one, on the
operator's judgement that six minutes for a single seat's opening is too much wall clock to
carry into a Season of Locks. That is a decision about the clock and not about the Base
Model, and it is written here in the same words the ADR uses so that no later reader
recovers it as a finding about what Qwen3.8 Max can do.

## Cost

Every failed call is billed for what it generated. The timeouts returned no usage at all —
no `tokens_in`, no `tokens_out`, no cost row — because no response arrived. MiniMax's three
refusals are the measurable waste: 29,031 tokens in and 32,000 out on the last two,
$0.0279 on the first at the smaller ceiling, roughly five cents apiece after the doubling.
The six seats that opened in run 1 were billed once and replayed free three times, and Kimi
K3 twice — ADR-0025 paying for itself on the night it was first needed.
