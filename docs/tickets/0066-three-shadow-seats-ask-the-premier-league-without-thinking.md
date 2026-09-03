# Ticket: Three Shadow Seats ask the Premier League without thinking

**What to build:** the Shadow Seat of
[ADR-0055](../adr/0055-a-seat-thinks-as-its-provider-ships-it-and-a-shadow-seat-may-think-otherwise.md):
a `models` role the prediction run calls and nothing else counts, a request envelope
that reads `models.config`, and three shadows seated in the Premier League — Kimi K3,
DeepSeek V4 Pro and GLM 5.3, the three seats spending most on reasoning — each asking
every Fixture the real seat asks, at the same Lock, over the same context bytes, with
`{"reasoning": {"effort": "none"}}` on the wire and nothing else different. The
deliverable at the end of the Season is a paired report, not a ranking. Decisions this
touches: ADR-0055 (the whole of it), [ADR-0001](../adr/0001-cross-vendor-entrants-with-a-frozen-prompt.md)
and [ADR-0009](../adr/0009-six-entrants-frontier-and-open-weight-all-through-openrouter.md)
(what a seat is; the shadow is deliberately not one), [ADR-0032](../adr/0032-exhibition-runs-join-the-record-after-the-fact.md)
(why this is not an Exhibition).

**Blocked by:** None. The first Premier League Lock the shadows can make is Gameweek 4,
2026-09-12 12:30Z (`main` run at 06:30Z); missing it costs one Gameweek of pairs and
nothing else.

**Status:** open

---

## What is already known

**The money, read 2026-09-03 against production**, match track, `role = 'entrant'`,
every call with a stored body:

```sql
select m.base_model, count(*) calls,
       round(sum((u->>'cost')::numeric), 2) usd,
       round(sum((u->'cost_details'->>'upstream_inference_completions_cost')::numeric
                 * (u->'completion_tokens_details'->>'reasoning_tokens')::int
                 / nullif((u->>'completion_tokens')::int, 0)), 2) usd_reasoning
  from attempts a
  join models m on m.id = a.model_id
  cross join lateral (
    select substring(a.raw_response from '\{"id".*')::jsonb -> 'usage' as u
  ) x
 where a.track = 'match' and a.season = '2026-27' and m.role = 'entrant'
   and a.raw_response like '%{"id"%'
 group by 1 order by 4 desc;
```

| Base Model | calls | bill | of which reasoning |
| --- | ---: | ---: | ---: |
| Kimi K3 | 112 | $5.83 | **$4.62** (79%) |
| Gemini 3.1 Pro Preview | 256 | $5.00 | $3.63 (73%) |
| DeepSeek V4 Pro | 127 | $3.79 | **$3.36** (89%) |
| GLM 5.3 | 115 | $2.96 | **$2.49** (84%) |
| Muse Spark 1.2 | 122 | $2.34 | $1.83 (78%) |
| GPT-5.6 Sol Pro | 116 | $3.70 | $1.26 (34%) |
| Grok 4.6 | 126 | $1.92 | $1.25 (65%) |
| Qwen3.8 Max | 123 | $2.99 | $0.49 (16%) — under-reported, see below |
| MiniMax M3 | 121 | $0.26 | $0.14 (54%) |
| Claude Opus 5 | 116 | $2.94 | $0.00 (0%) |
| **All** | 1,344 | **$31.75** | **$19.09 (60%)** |

The `raw_response` column holds the streamed body with its keep-alive padding, so the
JSON is reached by `substring(... from '\{"id".*')`, not by casting the column. Qwen's
provider returns 12,470 characters of thinking in `message.reasoning` per successful
call while reporting `reasoning_tokens: 672`; its true share is in the range of its
neighbours and its row above is a floor.

**Why Gemini is not shadowed although it is second on the list.** Its bill is
dominated by the calls it fails, not by thinking: nine schema failures in nine first
attempts on Ligue 1 Gameweek 3, every one billed in full and every one Repaired. A
shadow without reasoning would measure the misreading as much as the thinking. The
three shadowed seats have 0.000, 0.005 and 0.019 `attempts_to_valid` season-to-date,
so their pairs are pairs of first answers.

**The record cannot answer the question by itself.** Within-seat split by reasoning
length (settled Fixtures, `ok` calls, outcome hit rate of the argmax pick):

| Base Model | half that thought less | half that thought more |
| --- | ---: | ---: |
| DeepSeek V4 Pro | 0.673 (4,132 tok) | 0.481 (12,178 tok) |
| Kimi K3 | 0.673 (1,336) | 0.510 (4,088) |
| Grok 4.6 | 0.654 (1,023) | 0.442 (2,241) |
| GLM 5.3 | 0.583 (2,454) | 0.521 (6,999) |
| Claude Opus 5 | 0.588 (0) | 0.510 (0) |

Opus is the control: with no reasoning on either half, the split is Fixture order and
the gap is 0.08. Every other gap is a seat choosing to think longer about the Fixtures
it finds harder. Only a second answer to the *same* Fixture with the effort held at
zero separates the two.

**What every reader already does with a role it does not know.** `predict-gameweek.ts`
selects `role = 'entrant'` twice (the roster check at :159 and the work query at :177);
`score-match-gameweek.ts:1615`, `gap-alert.ts:164`, `preflight-base-models.ts:326`,
`season-roster.ts:392` and every `read-api.ts` query select `role = 'entrant'` too.
A new role value is therefore invisible everywhere except where this ticket makes it
visible. The `models_role_check` constraint was last widened by migration 0019 for
`'exhibition'`.

**`models.config` is written by no code path and read by none.** Every row holds `{}`.
`openRouterRequest` (`openrouter-entrant.ts`) builds the body from `baseModel`,
`provider`, `quantization`, the messages and `max_tokens`; the `OpenRouterEntrant`
type carries the first three. The `WorkItemRow` in `predict-gameweek.ts` is where a
seat's row becomes a call.

**OpenRouter's contract for the field**, read 2026-09-03 from its reasoning-tokens
page and `/api/v1/models`: `reasoning.effort` accepts `max`, `xhigh`, `high`,
`medium`, `low`, `minimal`, `none`; `none` disables reasoning; a model whose reasoning
is `mandatory` rejects `none`; a model that does not support the field ignores it
silently. All three shadowed Base Models list `reasoning` and `reasoning_effort` in
`supported_parameters`. Whether any of the three is `mandatory` is not something the
list says, and is the first thing the pre-flight below finds out.

## Acceptance

- [ ] **Migration:** `models_role_check` admits `'shadow'`. Nothing else in the schema
      moves; `config` already exists and already defaults to `{}`.
- [ ] **The envelope reads `config`.** `OpenRouterEntrant` gains the seat's `config`;
      `openRouterRequest` spreads it into the body after the fields it sets itself, so
      a key `config` names wins and a key it does not name is absent. For `config = {}`
      the serialised body is byte-identical to today's, and a test asserts that against
      a captured body. The stored context, its hash and the Prompt Version are not
      touched — the test that pins each version's sha passes unmodified.
- [ ] **The prediction run admits the role.** Both `role = 'entrant'` selections in
      `predict-gameweek.ts` become `role in ('entrant', 'shadow')`. The roster check's
      "no Entrants configured" error still fires when only shadows exist for a
      Competition, because a shadow without a seat to shadow is a misconfiguration.
      No other reader changes: a test seats one shadow beside one Entrant and asserts
      the scorer, the gap alert, the pre-flight count and the dashboard's roster,
      leaderboard and fixtures views each see exactly one.
- [ ] **Three rows, by migration or by the roster CLI, whichever ADR-0034's seating
      already uses:** `match/shadow-kimi-k3`, `match/shadow-deepseek-v4-pro`,
      `match/shadow-glm-5.3` — `role = 'shadow'`, `prompt_version = 'match/2026-27-v2'`,
      `base_model`, `provider` and `quantization` copied from the row each shadows,
      `config = '{"reasoning": {"effort": "none"}}'`, `name` making the pairing legible.
      Premier League only.
- [ ] **Pre-flight first, and it is a paid call — ask before running it.** The
      single-model pre-flight (`npm run preflight`) is aimed at each shadow once, three
      calls, and the ticket records for each: the resolved provider, whether the
      response carries `reasoning_tokens: 0` (or absent), and whether the provider
      accepted `effort: "none"` or rejected it as mandatory. A rejected shadow is not
      seated; the ticket records which and the ADR's list of three is amended to the
      ones that ran.
- [ ] **The first Gameweek's pairs are read back.** After Premier League Gameweek 4
      settles, a query paired on `fixture_id` between each shadow and its seat — RPS,
      argmax hit, predicted scoreline agreement, `completion_tokens`, `usage.cost` —
      is run and its table pasted here with its timestamp. Ten pairs prove the plumbing
      and nothing else; the ticket says so beside the table.
- [ ] **The Season report.** After the Premier League's last Gameweek settles, the same
      pairing over every Gameweek both halves answered becomes
      `docs/reports/2027-05-…-shadow-seats.md`: per seat, the paired RPS difference
      with its interval, the hit-rate difference, the money the shadow saved, and one
      sentence per seat saying whether its reasoning bought anything at that sample.
      That report is the input to the 2027-28 decision ADR-0055 defers; this ticket
      does not take that decision.
- [ ] **Cost recorded as it goes.** Each Gameweek the shadows add to the Premier
      League's bill is what the record shows it to be, not the estimate: after
      Gameweek 4, the three shadows' `usage.cost` beside the three seats', pasted here.
