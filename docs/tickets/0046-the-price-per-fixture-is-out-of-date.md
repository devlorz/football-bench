# Ticket: The price per Fixture is out of date

**What to build:** a cost figure the record can stand behind, replacing one that was
measured on a packet the benchmark no longer sends — and the first honest look at the half
of the bill nobody has ever measured. Source: the spend read on 2026-08-22, below.
Decisions this touches:
[ADR-0049](../adr/0049-serie-a-and-ligue-1-open-the-bundesliga-waits-on-hands-not-money.md),
which committed a Season figure derived from it.

**Blocked by:** None — every number below is already in `attempts`.

**Status:** ready-for-agent

---

## What is already known

`$0.1845` per Fixture comes from
[the price report](../reports/2026-08-15-five-league-price.md), read off La Liga's
Gameweek 1 on 2026-08-15. Every Gameweek run since has cost more, and the reason is not a
mystery — it is a decision this project took on purpose.

**The controlled comparison is La Liga against itself.** Same league, same ten seats, same
Fixture shape; only the template changed between them:

| | prompt tokens | cost per call |
| --- | ---: | ---: |
| `PD` Gameweek 1 | 1,437 | $0.01407 |
| `PD` Gameweek 2 | **2,584** | **$0.02217** |

Eighty per cent more input, fifty-eight per cent more money. That is ADR-0042's restart
and ADR-0043's additions — base rates, xG rates and two instruction lines — arriving as a
bill. **The `$0.1845` was measured on the cheapest packet this benchmark has ever sent**,
one Gameweek before the packet grew, and nothing re-measured it afterwards.

Every league now runs the larger packet:

| League | prompt tokens | cost per call | Gameweek 1 per Fixture |
| --- | ---: | ---: | ---: |
| `FL1` | 2,195 | $0.02604 | **$0.3003** |
| `SA` | 2,400 | $0.02282 | **$0.2575** |
| `PL` | 3,460 | $0.02545 | **$0.2982** |

`PL` is the dearest packet because it alone still carries the availability section
ADR-0037 removed from every other league.

**So ADR-0049's Season figure is low.** It committed **$266.79** for four Competitions
(1,446 Fixtures × $0.1845). At the rates above the same four Seasons cost **$372–$434**.
The report said what it was — "one Gameweek, one Competition, six Fixtures" — and the
error was carrying it into a commitment without measuring again after the restart.

**Ligue 1 rules out the easy explanation.** It Gapped nothing — ninety of ninety — and
still cost $0.3003 per Fixture. Retries are not what moved this number.

## The half nobody has measured

Everything above is `prompt_tokens`. Output is priced several times higher on most seats
and **has never been looked at**, while two things in the record say it should be:

- `ENTRANT_MAX_OUTPUT_TOKENS` is **32,000**, and `openrouter-entrant.ts` already records a
  call that spent 16,000 of them thinking and returned `content: null`. A seat that
  reasons its way past the ceiling is billed for all of it and produces no Prediction.
- **126 of 627 calls this Season produced no Prediction** — one in five. `SA` alone:
  `gemini-3.1-pro-preview` took 24 calls to land 8, at $0.4792, which is nineteen per cent
  of Serie A's bill for eight per cent of its Predictions.

## Acceptance

- [ ] The output side is measured the way the input side just was: completion and
      reasoning tokens per successful call, per Competition and Gameweek, and the same for
      calls that produced nothing. Until this exists, no cost claim here is more than half
      a claim.
- [ ] A report replaces the 2026-08-15 one rather than amending it, read off Gameweeks
      that ran on the **current** template, and states which Prompt Versions it covers so
      the next restart cannot silently invalidate it the way this one did.
- [ ] ADR-0049 is amended with the corrected Season figure. It is a recorded decision
      carrying a number now known to be wrong; the amendment says what changed and why,
      and does not rewrite what was decided at the time.
- [ ] The wasted-call rate is reported per seat, separating a seat that fails validation
      from one that times out — they cost differently and are fixed differently.
- [ ] Any figure this ticket publishes carries the query that produced it, with the value
      beside it, the way tickets 0036 and 0037 do.

## What to consider, and what not to

Written down because the obvious lever is the wrong one.

- **Restructuring the packet for prefix caching is the big lever and is not available
  yet.** `withCacheBreakpoint` already marks the first message, which discounts the prefix
  a Repair chain re-sends. It cannot discount anything across Fixtures, because the packet
  has almost no shared prefix: every section takes `homeTeam` and `awayTeam`, and the only
  league-wide text — the six instruction lines — sits at the **end**, after all the
  variable content. Hoisting the league table and the base rates in front of the
  Fixture-specific text would give ten seats a cached prefix over ten Fixtures, and it
  would change the rendering, which means a new Prompt Version (ADR-0026). That is a
  Season boundary or a restart, not a cost fix.
- **Cutting a seat because it is dear is not a cost lever, it is a different benchmark.**
  The field spans more than thirty times from cheapest to dearest, and comparing Base
  Models is the whole point (ADR-0009).
- **The availability section is a fair question and an evidential one.** It is a thousand
  tokens of `PL`'s packet and no other league has it. Whether it earns them is something
  this benchmark can actually answer from RPS once there is enough of a record — and that
  is the only honest way to decide it.
- **The wasted fifth is the lever that needs no frozen text changed.** A seat that fails
  `schema` three times in a row is a fact about that seat and the ceiling it is given, not
  about the prompt every other seat reads fine.
