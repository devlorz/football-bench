# La Liga's Gameweek 2, the first asked under the restarted version

The first prediction run under `match-pd/2026-27-v2` — the Prompt Version the match
track restarted onto (ADR-0042) carrying everything ADR-0043 and ADR-0045 added. Run by
hand rather than left to the scheduler, because the first run of a version is the one
worth watching: the cron would have fired it at 2026-08-20T11:30Z, six hours before the
Lock, with nobody reading the result until afterwards.

## Before the run

**Balance: $6.16**, read off the OpenRouter pay-as-you-go panel at 2026-08-20T06:18Z.

**What is being asked.** La Liga Gameweek 2, **14 Fixtures** — its own ten plus the four
the calendar moved out of Gameweek 1 and into this Lock — against **10 seats**, so
**140 calls** if no Repair is needed.

**What it should cost.** The measured unit is $0.1845 per Fixture for the whole field,
read off `usage.cost` over La Liga's Gameweek 1 rather than off a price list
(`2026-08-15-five-league-price.md`). Fourteen of those is **$2.58**, and the packet has
grown since that measurement — base rates, xG rates on the Prior-Season line, two
instruction sentences, and the Head Coach section — so the estimate carried into the run
is **$2.60 to $2.90**, leaving somewhere near $3.30 for the Premier League's Gameweek 1
and the FPL track's opening, both of which Lock on 2026-08-21T17:30Z. (This estimate was
written before the run; what this Gameweek actually cost is $3.9577, per
[the 2026-08-25 price report](2026-08-25-five-league-price.md) — the packet had grown more
than the estimate above allowed for.)

**What paying twice would look like, and why it cannot happen.** The run's own query
excludes any Fixture and seat that already holds a Prediction, so the scheduled run at
11:30Z will find the work done and ask nobody.

## The packet, read before it froze

One Fixture was read in full first — Rayo Vallecano de Madrid v Deportivo Alavés — because
storing a context under a Prompt Version freezes it (ADR-0026) and this was the last
moment the template could still move. It carried, in order: the Gameweek 1 table; the
prior Season's base rates (`home wins 48.9%, draws 24.5%, away wins 26.6%, 2.69 goals per
match` over 380 matches); each club's Prior-Season points per game with xG for and against
appended to the same line; current-Season splits with shots, shots on target and xG; five
recent matches each; two head-to-head meetings; Squad Changes; and the Head Coach section.

The Head Coach section is the one worth recording, because it is what ADR-0045 was argued
on. Rayo carries both halves — `Head Coach: Beñat San José` with the change that put him
there beneath it. Alavés carries only the first: `Head Coach: Quique Sánchez Flores`, no
change lines, because he has been in post since before this Season. Under the Change-only
section that shipped a day earlier, Alavés would have been named nowhere at all, and every
Entrant would have answered from whatever its training data remembered — which is the
confound ADR-0045 exists to remove.

`Historical context as of 2026-08-20T17:30:00.000Z` — the Lock, not the wall clock, which
is why running early changes no byte of what is asked.

Two things seen and left alone: the table lists ten clubs rather than twenty, because
Gameweek 1 played six Fixtures and the rest were moved; and a club is spelled
`Vallecano` in the table and `Rayo Vallecano de Madrid` in the heading, the stored
results' spelling against football-data.org's, which predates all of this.

## After the run

**$2.9246 over 161 calls, 116 Predictions of 140, 14 contexts stored.** The estimate
carried in was $2.60 to $2.90, so the bill landed two cents over its top — close enough
that the per-Fixture unit measured on Gameweek 1 survives the packet having grown.

| Seat | Calls | Answered | Cost | Mean latency |
| --- | ---: | ---: | ---: | ---: |
| Gemini 3.1 Pro Preview | 34 | 12 | $0.7963 | 16.0s |
| GPT-5.6 Sol Pro | 14 | 14 | $0.5105 | 17.9s |
| Kimi K3 | 14 | 10 | $0.4123 | 87.1s |
| Claude Opus 5 | 14 | 14 | $0.3149 | 8.2s |
| Muse Spark 1.2 | 14 | 12 | $0.2286 | 20.7s |
| Grok 4.6 | 15 | 11 | $0.2137 | 66.6s |
| GLM 5.3 | 14 | 14 | $0.1940 | 63.5s |
| Qwen3.8 Max | 14 | 11 | $0.1808 | 86.1s |
| DeepSeek V4 Pro | 14 | 4 | $0.0459 | 100.5s |
| MiniMax M3 | 14 | 14 | $0.0276 | 14.5s |

**GLM 5.3 answered all fourteen.** The seat that replaced the delisted 5.2 and had never
been called before this morning's pre-flight took every Fixture without a Repair, at
$0.1940 — a little dearer than 5.2's Gameweek 1 rate and still the third cheapest seat.

### The 24 Gaps, and why twenty of them are one story

- **timeout, 20** — DeepSeek V4 Pro, Grok 4.6, Kimi K3 and Qwen3.8 Max, over twelve
  Fixtures. The latency column is the finding: those four are the four slowest seats at
  67 to 101 seconds mean, where every seat that answered everything sits between 8 and
  21. They are not failing to answer, they are answering too slowly for the window while
  140 calls go out at once. All four passed pre-flight this morning one call at a time.
- **schema, 2** — Gemini 3.1 Pro Preview, the same seat and the same failure the bench
  saw a day earlier. Its 34 calls for 12 Predictions is a Repair rate no other seat comes
  near, and it is why it tops the bill while answering less than everybody.
- **rate_limit, 2** — Muse Spark 1.2, the same upstream shared-pool limit pre-flight hit
  this morning and a direct probe found cleared. It returns under load.

Nothing here was left to chance: `storeContext` conflicts do nothing and read the stored
row back, so the scheduled run at 11:30Z retries the 24 outstanding pairs against the
contexts already frozen rather than writing new ones, and the fill run at 15:30Z is a
second net before the 17:30Z Lock. Re-running by hand would have paid for what the cron
does for free.

**A note for whoever reads the Gameweek's numbers.** Four of the ten seats are slow
enough that a burst of 140 calls costs them Predictions, while one is Repair-hungry
enough to spend the most and answer least. Neither is a fact about forecasting, and both
would read as one if the Gap rate were taken for a skill measure — which is exactly what
the Gap rate is recorded separately to prevent.
