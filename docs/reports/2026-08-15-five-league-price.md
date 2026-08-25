# The five-league price, read off La Liga's opening Gameweek

> Superseded 2026-08-25 by ticket 0046. **The $0.1845/Fixture rate below was read the
> Gameweek before ADR-0042's restart and ADR-0043's additions grew every packet; every
> figure derived from it is stale.** Current-template rates and Season figures are in
> [the 2026-08-25 price report](2026-08-25-five-league-price.md). This report's own
> figures are left as written below — what was true on 2026-08-15 — and are not corrected
> in place.

**Read 2026-08-15** from `attempts` for `PD` Gameweek 1 — the first real Gameweek any
Competition of this expansion has played. Ten Entrants, six Fixtures, 81 calls, all sixty
Predictions written with no Gap.

Ticket 9 was written to read this off the Premier League's Gameweek 1. La Liga went first,
so this is read off La Liga instead; the number is a per-Fixture cost and does not care
which league produced it.

## Where the number comes from

Not from a price list. Every OpenRouter response carries `usage.cost` — what the provider
actually charged for that call — and the write path stores the response verbatim in
`attempts.raw_response` (ADR-0007). So the figures below are the record's own arithmetic
over money already spent, not an estimate against a published rate that may have moved.

```sql
select sum(((raw_response::jsonb)->'usage'->>'cost')::numeric)
  from attempts
 where competition = 'PD' and track = 'match' and raw_response is not null;
```

## What one Gameweek cost

**$1.1069** over 81 calls, six Fixtures, ten Entrants — **$0.1845 per Fixture** for the
whole field.

| Entrant | Calls | OK | Cost | Per Fixture |
| --- | ---: | ---: | ---: | ---: |
| GPT-5.6 Sol Pro | 7 | 7 | $0.3562 | $0.05937 |
| Kimi K3 | 7 | 7 | $0.1626 | $0.02710 |
| Gemini 3.1 Pro Preview | 10 | 7 | $0.1560 | $0.02601 |
| Claude Opus 5 | 7 | 7 | $0.1008 | $0.01680 |
| Muse Spark 1.2 | 8 | 8 | $0.0905 | $0.01508 |
| DeepSeek V4 Pro | 9 | 9 | $0.0727 | $0.01211 |
| Grok 4.6 | 8 | 8 | $0.0675 | $0.01126 |
| Qwen3.8 Max | 8 | 8 | $0.0521 | $0.00868 |
| GLM 5.2 | 10 | 7 | $0.0386 | $0.00643 |
| MiniMax M3 | 7 | 7 | $0.0099 | $0.00165 |

The field spans **36×** from cheapest seat to dearest, and one seat — GPT-5.6 Sol Pro —
is **32%** of the bill on its own. Gemini and GLM each spent ten calls to land seven
Predictions; those three extra calls apiece are Repairs, and Repairs are counted here
because they are money that was spent.

**Repairs cost $0.0560 of the $1.1069, or 5%.** Six calls out of 81.

## What a Season costs

Per-Fixture cost is the unit that travels. Fixtures per Season differ by league — twenty
clubs play 380, eighteen play 306 — so a five-league total is not five times anything.

| Competition | Clubs | Fixtures | At $0.1845/Fixture |
| --- | ---: | ---: | ---: |
| Premier League | 20 | 380 | $70.11 |
| La Liga | 20 | 380 | $70.11 |
| Serie A | 20 | 380 | $70.11 |
| Bundesliga | 18 | 306 | $56.46 |
| Ligue 1 | 18 | 306 | $56.46 |
| **Five Competitions** | | **1,752** | **$323.24** |

Today's two — the Premier League and La Liga — come to **$140.22** for the Season. Opening
the other three adds **$183.02**.

## What this number is not

- **Not a forecast of a full Gameweek.** This Gameweek held six Fixtures because four of
  matchday 1 were deferred to late August. A ten-Fixture La Liga Gameweek costs about
  $1.85 on these figures, and the per-Fixture unit is what the Season projection uses.
- **Not stable.** It is one Gameweek, one Competition, one day's provider pricing. The
  Repair rate especially is a sample of six.
- **Not the whole bill.** It covers the Match track's Predictions only — not the FPL
  track, whose per-Gameweek context is far larger (spec 0010), and not the preflight
  probes each new Base Model costs.
- **Not affected by prompt caching.** Match prompts are per-Fixture, so there is no shared
  prefix across a Gameweek to discount. The `cache_write_tokens` in the usage details are
  written and never read.

## The gate

ADR-0035 gates Serie A, the Bundesliga and Ligue 1 on two things: La Liga completing one
full fetch → Lock → predict → score cycle, and the per-Fixture cost read from real
attempts being acceptable at five leagues' volume.

The first is done. This report is the second: **$323.24 for a five-Competition Season**
against $140.22 for the two now running. Whether that is acceptable is the operator's
call, and it is a decision this report exists to let them make rather than one it makes.

If the number needs to come down before it is taken, the shape of the bill says where to
look first: one seat is a third of it, and the ten-seat field spans 36×.
