# The five-league price, re-read after the restart — and the output side, for the first time

**Replaces** [the 2026-08-15 report](2026-08-15-five-league-price.md) rather than amending
it: that report's $0.1845/Fixture was read off La Liga's Gameweek 1, one Gameweek before
ADR-0042's restart and ADR-0043's additions grew every packet. Its figures stand as what
was true that day; they are not what a Season costs now. The old report now carries a
banner pointing here, and so do the other two live documents that cited $0.1845
(`docs/specs/0024-serie-a-and-ligue-1-open.md`, ADR-0049, and
`2026-08-20-pd-gameweek-2-first-run-under-v2.md`).

**Scope.** Every Gameweek any Competition has played under its *current, unretired* Prompt
Version: `match/2026-27-v2` (`PL`), `match-pd/2026-27-v2` (`PD`, Gameweek 2 on),
`match-sa/2026-27-v1` (`SA`), `match-fl1/2026-27-v1` (`FL1`). La Liga's Gameweek 1 — played
under the retired `match-pd/2026-27-v1` — is excluded throughout, the way ADR-0042 keeps it:
whole, under its own version, and never re-averaged into a version it wasn't played under.
Read from `attempts` on 2026-08-25. Match track, `role = 'entrant'` only.

**Every rate and Season figure below prices every call, not only the successful ones** —
Repairs, timeouts and validation failures included, the same choice the 2026-08-15 report
made ("Repairs are counted here because they are money that was spent"). The "Calls that
produced no Prediction" and per-seat sections quantify how much of each total that is.

## What one Fixture costs, current template

```sql
select a.competition, a.gw,
       count(distinct a.fixture_id) as fixtures,
       round(sum(((a.raw_response::jsonb->'usage'->>'cost')::numeric)), 4) as cost
  from attempts a
  join models m on m.id = a.model_id
 where a.track = 'match' and m.role = 'entrant'
   and not (a.competition = 'PD' and a.gw = 1)
 group by a.competition, a.gw
 order by a.competition, a.gw;
```

| Competition | Gameweek | Fixtures | Cost | Per Fixture |
| --- | ---: | ---: | ---: | ---: |
| `FL1` | 1 | 9 | $2.7024 | **$0.3003** |
| `PD` | 2 | 14 | $3.9577 | **$0.2827** |
| `PL` | 1 | 10 | $2.9819 | **$0.2982** |
| `SA` | 1 | 10 | $2.6947 | **$0.2695** |

`PD`'s 14 Fixtures are its own ten plus the four the calendar moved out of Gameweek 1 and
into this Lock — recorded when the run happened, in
[the 2026-08-20 report](2026-08-20-pd-gameweek-2-first-run-under-v2.md).

All four sit in a $0.27–$0.30 band — the packet, not the league, sets the price now. `PL`
still carries the availability section every other league dropped (ADR-0037), and does not
stand out for it; whatever that section costs is inside this band, not visibly above it.

## The output side, measured for the first time

`usage.completion_tokens` and `usage.completion_tokens_details.reasoning_tokens` sit in
`raw_response` on every call and have never been queried until this report.

```sql
select a.competition, a.gw,
       count(*) as calls,
       round(avg((a.raw_response::jsonb->'usage'->>'prompt_tokens')::numeric)) as avg_prompt,
       round(avg((a.raw_response::jsonb->'usage'->>'completion_tokens')::numeric)) as avg_completion,
       round(avg((a.raw_response::jsonb->'usage'->'completion_tokens_details'
                  ->>'reasoning_tokens')::numeric)) as avg_reasoning
  from attempts a
  join models m on m.id = a.model_id
 where a.track = 'match' and m.role = 'entrant' and a.ok
   and not (a.competition = 'PD' and a.gw = 1)
 group by a.competition, a.gw
 order by a.competition, a.gw;
```

| Competition | GW | Successful calls | avg prompt tokens | avg completion tokens | avg reasoning tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| `FL1` | 1 | 90 | 2,195 | 3,288 | 2,674 |
| `PD` | 2 | 139 | 2,584 | 2,574 | 2,069 |
| `PL` | 1 | 100 | 3,460 | 2,931 | 2,345 |
| `SA` | 1 | 100 | 2,386 | 2,823 | 2,282 |

Grouped by Competition and Gameweek both, though each Competition has exactly one in-scope
Gameweek right now (`FL1` GW1, `PD` GW2, `PL` GW1, `SA` GW1) — the two columns coincide
today, and the query groups by both so a second Gameweek does not silently fold in later.

`completion_tokens` contains `reasoning_tokens` rather than sitting beside it, confirming
the earlier read in `openrouter-entrant.ts`: the gap between the two columns — 614, 505,
586, 541 tokens across the four leagues — is the size of a Prediction's JSON and its
rationale, not a second quantity of thinking.

**Completion tokens run 85–150% of prompt tokens** — `FL1` 150%, `SA` 118%, `PD` 100%,
`PL` 85% (`PL`'s prompt is largest, from the availability section, which is why its ratio
is lowest). Output is comparable in size to input in *tokens* on every successful call —
but tokens are not dollars, and the two sides are not priced alike (ticket 0046: "Output
is priced several times higher on most seats"). The token ratio alone cannot say which
side of the bill is bigger; the next section prices both sides directly.

### The dollar split: input vs output

`usage.cost_details.upstream_inference_prompt_cost` and
`...upstream_inference_completions_cost` sit beside `usage.cost` on every row — present
on all 429 successful calls in scope, no gaps — and sum to it exactly. This is the figure
Box 1 actually asked for: not token counts, but what fraction of the money is which side.

```sql
select a.competition,
       round(sum((a.raw_response::jsonb->'usage'->>'cost')::numeric), 4) as total_cost,
       round(sum((a.raw_response::jsonb->'usage'->'cost_details'
                  ->>'upstream_inference_prompt_cost')::numeric), 4) as prompt_cost,
       round(sum((a.raw_response::jsonb->'usage'->'cost_details'
                  ->>'upstream_inference_completions_cost')::numeric), 4) as completion_cost
  from attempts a
  join models m on m.id = a.model_id
 where a.track = 'match' and m.role = 'entrant' and a.ok
   and not (a.competition = 'PD' and a.gw = 1)
 group by a.competition
 order by a.competition;
```

| Competition | Total cost | Input cost | Output cost | Output share |
| --- | ---: | ---: | ---: | ---: |
| `FL1` | $2.3433 | $0.3995 | $1.9438 | 83.0% |
| `PD` | $3.0809 | $0.6999 | $2.3811 | 77.3% |
| `PL` | $2.5452 | $0.6969 | $1.8484 | 72.6% |
| `SA` | $2.2665 | $0.4530 | $1.8135 | 80.0% |
| **All four** | **$10.2360** | **$2.2493** | **$7.9867** | **78.0%** |

**Output is 72–83% of the dollar bill on every successful call, despite running only
85–150% of the token count.** Per-output-token pricing is running several times per-input-
token pricing on this roster, the same asymmetry ticket 0046 named and nobody had priced.
This is the report's answer to Box 1's real question, and it re-ranks the levers in "What
to consider, and what not to": prefix caching (input-side, and already ruled out as
unavailable) would touch at most the 22–27% of the bill that is input; a seat that reasons
less, or is Repaired less, touches the 72–83% that is output.

The same split holds for wasted calls, with one caveat the successful-call table does not
carry: for `ok` calls `prompt_cost + completion_cost` reconciles to `usage.cost` exactly on
every one of the 429 rows, but one non-`ok` row does not — GLM 5.3, `FL1`, a schema
failure, carries `usage.cost: 0` while its own `cost_details` sums to $0.0326. That row is
$0 in every dollar figure elsewhere in this report (they all read `usage.cost`), so it is
not hiding spend anywhere else — but it means the two fields disagree with each other
inside a single stored response, which the "not reconciled against OpenRouter's own
ledger" caveat below should be read to cover. Summing `cost_details` over all 175 wasted
calls gives $0.2219 input and $1.9114 output — 10.4% / 89.6% of their $2.1333 combined,
which is $0.0326 above the $2.1007 `usage.cost` total used everywhere else in this report
because of that one row. Wasted calls are expensive for the same reason successful ones
are: mostly output.

## Calls that produced no Prediction

```sql
select a.competition, a.gw,
       count(*) as calls,
       round(avg((a.raw_response::jsonb->'usage'->>'completion_tokens')::numeric))
         as avg_completion,
       round(avg((a.raw_response::jsonb->'usage'->'completion_tokens_details'
                  ->>'reasoning_tokens')::numeric)) as avg_reasoning,
       round(sum(coalesce(((a.raw_response::jsonb->'usage'->>'cost')::numeric), 0)), 4)
         as cost
  from attempts a
  join models m on m.id = a.model_id
 where a.track = 'match' and m.role = 'entrant' and not a.ok
   and not (a.competition = 'PD' and a.gw = 1)
 group by a.competition, a.gw
 order by a.competition, a.gw;
```

| Competition | GW | Wasted calls | avg completion tokens | avg reasoning tokens | Wasted cost | Share of that Gameweek's bill |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `FL1` | 1 | 20 | 1,933 | 1,754 | $0.3591 | 13.3% |
| `PD` | 2 | 83 | 1,804 | 1,625 | $0.8767 | 22.2% |
| `PL` | 1 | 52 | 5,128 | 5,019 | $0.4367 | 14.6% |
| `SA` | 1 | 20 | 1,659 | 1,473 | $0.4282 | 15.9% |
| **All four** | | **175** | | | **$2.1007** | **17.0%** |

175 of 604 calls (29.0%) produced no Prediction, and the money is not spread evenly across
that fifth — see the per-seat table below. `PL`'s 5,128-token average is the ceiling being
hit, not an ordinary failure:

```sql
select m.name as seat, a.attempted_at, a.error_kind,
       (a.raw_response::jsonb->'usage'->>'completion_tokens')::numeric as completion_tokens,
       round((a.raw_response::jsonb->'usage'->>'cost')::numeric, 4) as cost
  from attempts a
  join models m on m.id = a.model_id
 where a.track = 'match' and m.role = 'entrant' and not a.ok and a.competition = 'PL'
   and (a.raw_response::jsonb->'usage'->>'completion_tokens')::numeric >= 16000
 order by a.attempted_at;
```

| Seat | Time (UTC) | Completion tokens | Cost |
| --- | --- | ---: | ---: |
| DeepSeek V4 Pro | 2026-08-20T14:32:58Z | 16,000 | $0.0552 |
| GLM 5.3 | 2026-08-20T14:34:56Z | 16,000 | $0.0737 |
| DeepSeek V4 Pro | 2026-08-20T15:08:23Z | 16,000 | $0.0516 |

All three ran the full 16,000-token ceiling in force at that moment
(`ENTRANT_MAX_OUTPUT_TOKENS` doubled to 32,000 the next day, 2026-08-21T01:48+07:00) and
were billed for no answer — the Match track's own copy of the FPL example already in the
record.

## The wasted-call rate, per seat — validation failure is not a timeout

CONTEXT.md's Seat is a (Competition, Base Model) pair — the same Base Model name holds a
distinct seat, and a distinct `model_id`, in each of the four Competitions. The table below
is at that grain; only seats with at least one non-`ok` call are shown (20 of the roster's
40 seats completed every Fixture with none).

```sql
select m.name as seat, a.competition,
       count(*) as calls,
       count(*) filter (where a.ok) as ok_calls,
       count(*) filter (where not a.ok and a.error_kind in ('schema','probs_sum'))
         as validation_failures,
       count(*) filter (where not a.ok and a.error_kind = 'timeout') as timeouts,
       count(*) filter (where not a.ok
         and a.error_kind not in ('schema','probs_sum','timeout')) as other_failures,
       round(sum(coalesce(((a.raw_response::jsonb->'usage'->>'cost')::numeric), 0))
         filter (where not a.ok), 4) as wasted_cost
  from attempts a
  join models m on m.id = a.model_id
 where a.track = 'match' and m.role = 'entrant'
   and not (a.competition = 'PD' and a.gw = 1)
 group by m.name, a.competition
having count(*) filter (where not a.ok) > 0
 order by wasted_cost desc nulls last, seat, a.competition;
```

| Seat | Competition | Calls | OK | Validation failures | Timeouts | Other | Wasted cost |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gemini 3.1 Pro Preview | `PD` | 54 | 13 | 36 | 0 | 5 | **$0.8557** |
| Gemini 3.1 Pro Preview | `SA` | 29 | 10 | 19 | 0 | 0 | **$0.4282** |
| Gemini 3.1 Pro Preview | `FL1` | 25 | 9 | 16 | 0 | 0 | **$0.3574** |
| Gemini 3.1 Pro Preview | `PL` | 22 | 10 | 10 | 0 | 2 | **$0.2562** |
| DeepSeek V4 Pro | `PL` | 18 | 10 | 0 | 6 | 2 | $0.1068 |
| GLM 5.3 | `PL` | 16 | 10 | 0 | 5 | 1 | $0.0737 |
| Grok 4.6 | `PD` | 18 | 14 | 1 | 3 | 0 | $0.0210 |
| MiniMax M3 | `FL1` | 10 | 9 | 1 | 0 | 0 | $0.0017 |
| Claude Opus 5 | `PL` | 16 | 10 | 0 | 0 | 6 | $0.0000 |
| DeepSeek V4 Pro | `PD` | 37 | 14 | 0 | 19 | 4 | $0.0000 |
| DeepSeek V4 Pro | `SA` | 11 | 10 | 0 | 1 | 0 | $0.0000 |
| GLM 5.3 | `FL1` | 10 | 9 | 1 | 0 | 0 | $0.0000 |
| GPT-5.6 Sol Pro | `PL` | 14 | 10 | 0 | 0 | 4 | $0.0000 |
| Kimi K3 | `FL1` | 11 | 9 | 0 | 0 | 2 | $0.0000 |
| Kimi K3 | `PD` | 22 | 14 | 0 | 4 | 4 | $0.0000 |
| Kimi K3 | `PL` | 15 | 10 | 0 | 1 | 4 | $0.0000 |
| Muse Spark 1.2 | `PD` | 16 | 14 | 0 | 0 | 2 | $0.0000 |
| Muse Spark 1.2 | `PL` | 13 | 10 | 0 | 0 | 3 | $0.0000 |
| Qwen3.8 Max | `PD` | 19 | 14 | 0 | 5 | 0 | $0.0000 |
| Qwen3.8 Max | `PL` | 18 | 10 | 0 | 8 | 0 | $0.0000 |

**Timeouts and validation failures cost differently, which is why they are fixed
differently — but only one side of that is directly verified.** A validation failure is a
call the provider finished and billed in full; `raw_response` holds the completion and its
`usage.cost`, and the $1.8975 of Gemini's rows above is read straight off it. A timeout is
different only in what our own record shows: `recordProviderFailure` stores `raw_response:
null` for it (`attempt-match-calls.ts`), so this report's SUM sees no cost row and adds
$0 — that is the record's total, not a confirmed statement that OpenRouter billed nothing.
A generation the provider finished just as the client gave up, with the response never
read, would look identical here. The way to close that gap is a reconciliation this report
does not attempt: compare `sum(cost)` above against `total_usage` from OpenRouter's
`/api/v1/credits` for the same window, across every track — the difference, if any, is
money spent that no `attempts` row prices.

**Gemini 3.1 Pro Preview holds all four validation-failure rows above it, and 81 of the
record's 84 validation failures and $1.8975 of its $2.1007 in wasted cost — 90% of
everything this report calls wasted.** This is not one seat; it is one Base Model,
failing the same way in every seat it holds — `PD`, `SA`, `FL1` and `PL` alike, 36, 19, 16
and 10 validation failures respectively. That consistency across four different Prompt
Versions and Fixture sets is what makes it a seat property and not a Competition property.
Raising `ENTRANT_MAX_OUTPUT_TOKENS` again would not touch it; a Repair budget or a
seat-specific gate would.

## What a Season costs, corrected

```sql
select a.competition,
       count(distinct a.fixture_id) as fixtures,
       sum(((a.raw_response::jsonb->'usage'->>'cost')::numeric)) as cost,
       sum(((a.raw_response::jsonb->'usage'->>'cost')::numeric))
         / count(distinct a.fixture_id) as rate_per_fixture
  from attempts a
  join models m on m.id = a.model_id
 where a.track = 'match' and m.role = 'entrant' and a.raw_response is not null
   and not (a.competition = 'PD' and a.gw = 1)
 group by a.competition
 order by a.competition;
```

Season Fixture counts are unchanged from the 2026-08-15 report (20-club leagues play 380,
`FL1`'s 18 clubs play 306). **The Season column below is `rate_per_fixture` (full
precision, not the 4-decimal figure in the "Per Fixture" column above) times each
Competition's Fixture count** — multiplying the rounded $0.2827 shown for `PD` by 380 gives
$107.43, four cents over the $107.42 below, because the display rate is already rounded and
the Season figure is not computed from it. This is stated because it is exactly the kind of
gap "the query beside the value" exists to prevent.

| Competition | Fixtures | Rate (rounded, for reading) | Season |
| --- | ---: | ---: | ---: |
| `PL` | 380 | $0.2982 | $113.31 |
| `PD` | 380 | $0.2827 | $107.42 |
| `SA` | 380 | $0.2695 | $102.40 |
| `FL1` | 306 | $0.3003 | $91.88 |
| **Four Competitions** | **1,446** | | **$415.01** |

ADR-0049 committed $266.79 for these same four Competitions and 1,446 Fixtures, at
$0.1845/Fixture. The corrected total is **55.6% higher** — inside the $372–$434 range
ticket 0046 estimated from the input-token growth alone, now measured rather than
estimated. This $415.01 is a projection from the measured rate, not itself measured
spend — the actually-measured total behind it is $12.3367 across the sampled Gameweeks
(the "What one Fixture costs" table, summed), of which Gemini 3.1 Pro Preview's $1.8975
in wasted calls is 15.4%. The Bundesliga's gated $56.46 (ADR-0049) rests on the same
stale rate and is unresolved until `BL1` opens and has its own Gameweek to read.

## What this number is not

- **Not stable.** Four Competitions, one or two Gameweeks each, real production runs
  rather than a controlled trial. The per-seat wasted-cost column especially is a small
  sample — Gemini 3.1 Pro Preview's schema behaviour could move a great deal on its own.
- **Not the whole bill.** Match Predictions only, as before — not the FPL track, not
  preflight probes.
- **Not a claim about which seat forecasts better.** This report prices calls; it says
  nothing about accuracy, which is what the RPS-based rankings are for.
- **Not final on the ceiling.** `ENTRANT_MAX_OUTPUT_TOKENS` is 32,000 now, twice what the
  three ceiling-hit calls above ran into before it doubled on 2026-08-21. Whether the new
  ceiling still gets hit is a question only the next Gameweek's data can answer.
- **Not reconciled against OpenRouter's own ledger.** Every headline cost figure here is
  `sum(usage.cost)` over `attempts.raw_response`. A call whose response never reached this
  database — billed by the provider, unrecorded here — would not appear anywhere above; see
  the timeout caveat in the per-seat section. The two fields can also disagree with each
  other inside one stored response, not just across the client/provider boundary: one row
  (the dollar-split section) has `usage.cost: 0` while its own `cost_details` sums to
  $0.0326. Neither gap is resolved here.
