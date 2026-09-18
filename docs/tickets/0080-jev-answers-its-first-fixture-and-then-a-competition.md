# Ticket: Jev answers its first Fixture, and then a Competition

**What to build:** nothing in code. The operator inserts the Exhibition row for
`jev-latest`, pre-flights it against one played Fixture to learn the three things the
docs do not say — price, rate limit, and whether a stored context fits in `state` — and,
if all three allow it, replays it over one Competition's played Fixtures. The outcome is
a report in `docs/reports` in the shape of the pre-flight reports already there, and
either an Exhibition Run standing labelled on that Competition's rankings or a one-line
closure of ADR-0059 saying which of the three stopped it. Source:
[ADR-0059](../adr/0059-an-exhibition-run-may-answer-through-a-typed-endpoint-instead-of-a-chat-one.md);
door: [ADR-0032](../adr/0032-exhibition-runs-join-the-record-after-the-fact.md);
procedure: [a new Base Model arrives](../runbooks/a-new-base-model-arrives.md), sections
3 and 6.

**Blocked by:** 0079 — the wire does not exist before it.

**Status:** done, 2026-09-18. Scoped to one Competition and run over five, each approved
separately. The record is in
[the report](../reports/2026-09-18-jev-latest-preflight-and-premier-league-replay.md),
extended on 2026-09-18 to cover all five. Two things the runs found outlive this ticket:
Serie A's un-repaired Gap, which refutes a sentence of ADR-0059 and put an amendment at
that ADR's head, and the probability layer's reading, which places these Predictions last
of seventeen where Bet Points place them second.

---

## What is already known

**Every step here spends money, and every step is the operator's.** The project's rule
on paid runs applies to the pre-flight and the replay alike: the agent states the call
count and the price and waits; it never starts either. The call count of a replay is one
per played Fixture in the Competition named, with no Repair chain behind it. The price
per call is not in TypeSafe's documentation and has to come from the account or the
first pre-flight's `usage` against the plan's rate.

**The row first, the pre-flight second, the replay last, and each may be the last.**
The runbook's section 3 is the shape: insert the row, aim the single-model pre-flight at
one Fixture, read the report. Three readings decide whether to go on:

- a 401 is a key problem and not this ticket's;
- a 422 on the `state` — a stored context is several thousand tokens of text — ends
  ADR-0059 at "the state does not fit", and the row is deleted;
- a parseable answer with `usage` gives the per-call cost, which times the Fixture count
  is the number the replay's permission request states.

**Which Competition.** The Premier League has the most played Fixtures and the most
seats to stand beside; it is the default the replay already assumes. A second
Competition is a second permission request, not a loop.

**What the surface must show before this is called done.** The row on that
Competition's readable rankings, with the "ran after Gameweek N" label and the
typed-endpoint caveat ticket 0079 froze; its Repair count reading zero under that
caveat; and its absence from the Comparison Anchor, the complete-case intersection and
every interval — the `role` filter's doing, and a thing to look at, not to build.

**Walking away is one row.** If the pre-flight says no, delete the row, write the
report, and close ADR-0059 with the reason. The wire from 0079 stays: it cost nothing and
proves the shape.

## Acceptance

- [x] The Exhibition row exists: `role = 'exhibition'`, `provider = 'typesafe'`,
      `base_model = 'jev-latest'`, `quantization` null, at the named Competition's frozen
      Prompt Version, inserted by the operator.
      *The operator ran the `insert into models (...)` statement against production
      with `prompt_version = 'match/2026-27-v2'`, the Premier League's frozen version;
      the row is what both the pre-flight and the replay below called against.*
      *Four more rows followed at 14:11:37.798343Z, one statement, one per remaining open
      Competition and each at that Competition's own frozen version (ADR-0038):
      `exhibition-pd/jev-latest` at `match-pd/2026-27-v2`, `exhibition-sa/jev-latest` at
      `match-sa/2026-27-v1`, `exhibition-fl1/jev-latest` at `match-fl1/2026-27-v1`,
      `exhibition-bl1/jev-latest` at `match-bl1/2026-27-v1`. Why the ids are prefixed
      rather than suffixed is the first finding under "Past the Premier League".*
- [x] One pre-flight against one played Fixture has run, its report is in
      `docs/reports`, and it records: HTTP status, whether the answer was parseable, the
      two Choice distributions, `usage`, latency, and the per-call price derived from
      the account.
      *[docs/reports/2026-09-18-jev-latest-preflight-and-premier-league-replay.md](../reports/2026-09-18-jev-latest-preflight-and-premier-league-replay.md)
      — HTTP 200/`parseable`, both Choice distributions, `usage: {input_tokens: 3212,
      output_tokens: 379}`, latency (<10s, observed), and $0.042/MTok input from the
      TypeSafe account. The first call 422'd on a request-shape bug in ticket 0079's
      code (`"Choice"` vs the required `"choice"`), fixed in
      `src/predictions/typesafe-entrant.ts` and re-run before this evidence was taken.*
- [x] The permission request for the replay stated the Fixture count, the derived total,
      and the Competition, and the operator's yes is in the report.
      *Same report, "The replay permission request" section: 40 Premier League Fixtures,
      $0.005–$0.01 derived total, operator confirmed before
      `EXHIBITION_MODEL_ID=exhibition/jev-latest COMPETITION=PL npm run
      exhibition:replay` ran.*
      *Four further requests followed, one per Competition, each stated and approved on
      its own as this ticket's own "a second Competition is a second permission request,
      not a loop" requires. The whole of it came to 196 calls and $0.0296 at $0.042/MTok
      input, output free, over 705,583 input tokens — the per-Competition split is in the
      report's "The four further replays".*
- [x] The replay over that Competition completed, and the row stands on its readable
      rankings with the Exhibition label and the typed-endpoint caveat; it is absent from
      the Comparison Anchor, the intersection and every interval.
      *40/40 Predictions and Attempts, 0 errored. `/api/pl/leaderboard` (read live
      against production via `handleDashboardRequest`) shows `exhibition/jev-latest`
      with `exhibition: { ranAfterGw: 4 }`, `n: 40`, `matchPoints: 52`, `betPoints: 157`,
      and the body's `typesafeCaveat` field present. `matchRoster` in
      `score-match-gameweek.ts` selects `role = 'entrant'` only, so the row is excluded
      from the Comparison Anchor and every complete case by the same construction
      every other Exhibition row already relies on — see the report's "Surface check".*
      *Four more Competitions followed, and the box holds for each: 195 Predictions from
      196 calls across PL, PD, SA, FL1 and BL1, every row labelled and caveated, none in a
      Comparison Anchor or an interval. The one call that wrote no Prediction is Serie A's
      Gap below — so "0 errored" is true of the Premier League and of nothing wider.*
- [ ] Or: the pre-flight refused, the row is deleted, the report says which of price,
      rate limit or `state` size stopped it, and ADR-0059 carries a one-line closure
      naming that reason.
      *Not this path — the pre-flight cleared and the replay ran.*

## Past the Premier League: what running the other four found

The ticket's own text says a second Competition is a second permission request, not a
loop — the operator asked for four more anyway (La Liga, Serie A, Ligue 1, Bundesliga),
each stated and approved separately. What that turned up, beyond the Premier League leg
this ticket was scoped to:

**An Exhibition row's id has to carry the Competition in its prefix, not its slug, or
`/overall` never sums it.** The combined ranking (`dashboard/src/overall-view.ts`) keys
each row by `entrantSlug(id)` — everything after the last `/` — the same rule real
Entrant rows follow (`match/NAME` and `match-pd/NAME` both slug to `NAME`). The first
attempt at the four extra rows used `exhibition/jev-latest-pd` and siblings, which slug
to `jev-latest-pd` and would never have combined with the Premier League's
`exhibition/jev-latest` row (`jev-latest`). Corrected to `exhibition-pd/jev-latest`,
`exhibition-sa/jev-latest`, `exhibition-fl1/jev-latest`, `exhibition-bl1/jev-latest` —
all slug to `jev-latest`, and `/overall` now sums all five into one row (272 Match
Points, 767 Bet Points, confirmed by calling `overallRanking` directly against the five
leaderboard bodies).

**A restarted Competition's retired Gameweek is unreachable by the replay, without any
guard needed for it.** La Liga's Prompt Version carries `retired: { version:
"match-pd/2026-27-v1", gw: 1 }`; the concern going in was that the replay might still
spend a call answering into Gameweek 1, a round the ranking excludes by construction
(`rankedFrom` in `read-api.ts`). It doesn't: `playedGameweeks` in
`replay-match-exhibition.ts` reads its Gameweek list off `contexts`, and the retired
Gameweek's contexts are not in that live set — ADR-0042 already keeps them out "the
moment the constant moved." The replay ran Gameweeks 2–6 only, unprompted.

**A replay writes Predictions but does not score them — `match:score` is a separate,
free step per Competition.** Each league's leaderboard read `n: 0, matchPoints: 0` until
`COMPETITION=<code> npm run match:score` ran for it (no Base Model call, a local
computation over stored Predictions and results). The leaderboard endpoint also carries
a 5-minute edge cache (`SCORED_CACHE` in `read-api.ts`), so a browser view taken right
after a score run can still show the pre-scoring figures briefly — not a data problem,
confirmed by reading the same `handleDashboardRequest` path directly against production.

**A schema failure is a genuine, un-repaired Gap for a typesafe row — the mechanism
ADR-0059 built, on a premise ADR-0059 got wrong.** Serie A wrote 39 Predictions against
40 played Fixtures. The missing one, Fixture 558617 (Udinese Calcio v SS Lazio, Gameweek
3), has a single `attempts` row with `error_kind: 'probs_sum'` and no second attempt:
Jev's outcome probabilities did not sum to 1 within ±0.001, and a typesafe row gets no
Repair chain, so that one call is the whole of what was asked. The stored context was
shown (`contexts` row 265, 5,968 bytes), so this is TypeSafe's own `probabilities` map
failing to sum, not a transport fault.

The Gap is the mechanism working; the reason it was built is not. ADR-0059's decision 3
justified skipping Repairs by asserting that "a typed reply cannot be malformed JSON or
fail to sum to 1", and this call is that sentence's counterexample. `probs_sum` is one of
the two `REPAIRABLE_KINDS`, so a chat seat answering the same way would have had up to
three Repairs; this row had none, and an Exhibition Gap alerts nobody (ADR-0032), so
nothing surfaced it until the record was read by hand. ADR-0059 now carries the amendment
that says so, and leaves open whether this wire should get a Repair of its own — re-asking
the same two Choices is a second call, not a chat turn. **This paragraph first read
"exactly as ADR-0059 says … not a bug"; the ADR says the opposite, and the correction is
the finding.**

**Final standing, all five Competitions, after each was scored:**

| Competition | n | Match Points | Bet Points |
| --- | ---: | ---: | ---: |
| Premier League (PL) | 40 | 52 | 157 |
| La Liga (PD) | 53 | 61 | 201 |
| Serie A (SA) | 39 | 74 | 165 |
| Ligue 1 (FL1) | 36 | 53 | 137 |
| Bundesliga (BL1) | 27 | 32 | 107 |
| **`/overall` (summed)** | — | **272** | **767** |

**What the table above must be read beside: the probability layer puts the same
Predictions last.** Read 2026-09-18 from `scores` at Premier League Gameweek 5, where the
Bet Points column above says 157 and second place on `/overall`:

| Seat | RPS | n |
| --- | ---: | ---: |
| `moonshotai/kimi-k3` (best Entrant) | 0.1918 | 40 |
| `anthropic/claude-opus-5` (worst Entrant) | 0.1981 | 40 |
| `reference-elo` | 0.2153 | 40 |
| `reference-uniform` | 0.2194 | 40 |
| `reference-home` | 0.2270 | 40 |
| **`jev-latest`** | **0.2336** | **40** |

Last of seventeen rows, behind every Entrant, every other Exhibition Run and all three
Reference Lines — a seat answering 1/3, 1/3, 1/3 to every Fixture would have scored
better. The pre-flight's archived answer shows the shape behind it: `{"H": 1.0, "D": 0.0,
"A": 0.0}` at confidence 1.0, and RPS punishes a confident wrong call far harder than a
hedged one. ADR-0012 holds that this layer is the only one a claim about forecasting may
rest on, and ADR-0023's frozen qualification says Bet Points are not evidence; a reader
seeing 767 and second place is owed the 0.2336 beside it. The report's "What the
probability layer says" section carries the same reading.

**Coherence is a second figure this wire changes the meaning of.** Per Competition: PL
0.8250, PD 0.8868, FL1 0.8889, SA 0.9487, BL1 1.0000. Every chat seat writes `probs` and
the Predicted Score out of one JSON answer, so its two halves agree by construction; this
wire asks two independent Choice questions (ADR-0059's mapping) and nothing makes them
agree — they disagree in seven of forty Premier League Fixtures. Like the Repair count,
it is a property of the mapping rather than of the Base Model, and it should not be
compared across wires. The frozen `TYPESAFE_CAVEAT` names the Repair count and the
rationale; it does not name Coherence, which is a gap in the caveat rather than in the
data, and a ticket's worth of work if a reader is ever shown the two side by side.
