# Spec 0003 — FPL track

**Status:** ready-for-agent
**Scope:** nine Entrants managing a Fantasy Premier League team under the complete 2026/27
ruleset, selection and scoring together
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:** [ADR 0001–0017](../adr/)
**Siblings:** [spec 0001](./0001-match-track-write-path.md) complete ·
[spec 0002](./0002-match-track-scoring.md) written

---

## Problem Statement

The Match track asks each Entrant a question and grades the answer. Every question is
independent, every answer is discarded once scored, and nothing an Entrant does in Gameweek 7
affects Gameweek 8. That is what makes it a clean measurement — and it is also why it cannot
observe the thing this track exists for.

Fantasy Premier League is a different task. A Squad persists. A bad decision in August is still
in the team in November, costing points every week until it is transferred out — and
transferring it out costs a Free Transfer, or four points, or a Chip that can only be spent
once per half-Season. The question stops being *"what will happen?"* and becomes *"you are in a
hole you dug; can you climb out?"*

Nothing in the system can answer that today. `manager_states` has existed since the first
migration and holds zero rows. No code references it. `fpl_players` is fetched and used only to
tell the Match track who is expensive and who is injured. Per-player Gameweek points — the
thing every FPL score is built from — are never fetched at all.

There is a second problem, and it is the reason this track must be presented carefully. With
one seat per Base Model there is exactly one season path each, so the ranking it produces is a
sample of one. The plausible skill gap between two Base Models is the same size as the
variance of a single season. A cumulative points table will look exactly as authoritative as
the Match track's, and it will not be.

## Solution

Each of the nine Base Models manages one team across the Season under the complete 2026/27
rules: a persistent Squad, Free Transfers banked to five, −4 point Hits, both Chip sets, real
Selling Prices, auto-substitutions and a captain.

Every Gameweek, an Entrant is shown its own Manager State and the player pool, and submits an
action: transfers, an optional Chip, and a Team Sheet. A deterministic reducer decides whether
that action is legal. An illegal action is returned with the reason and up to three Repairs; a
fourth failure Rolls Over the Gameweek, leaving the previous Team Sheet in place with Free
Transfers accruing normally.

Points come from FPL's own per-player Gameweek data, with captain doubling and automatic
substitutions applied by the same rules the real game uses.

The ranking is published as a **demonstration**, labelled as such wherever it appears, next to
the metrics that can carry weight: how many Repairs an Entrant needed, how often it Rolled
Over, and which rules it broke.

---

## User Stories

### Collecting what the track needs

1. As an operator, I want per-player Gameweek points fetched from FPL's live endpoint, so that
   an Entrant's Squad can be scored from the same numbers the real game uses.
2. As an operator, I want a Gameweek's points treated as final only when FPL reports
   `data_checked`, so that bonus points and defensive contributions have settled before any
   Squad is scored from them.
3. As an operator, I want the settled-ness read from the feed rather than inferred from the
   clock, so that an early or delayed run cannot score a Gameweek that is still moving.
4. As an auditor, I want the raw live response archived like every other upstream body, so that
   a disputed points total can be traced back to the bytes it came from.
5. As an operator, I want per-player prices captured every Gameweek, so that Selling Price can
   be computed from what an Entrant actually paid rather than from today's price.

### Managing a Squad

6. As an Entrant, I want to pick fifteen players in Gameweek 1 within £100.0m, so that I start
   the Season under the same constraint as every other Entrant.
7. As an Entrant, I want my Squad to persist into the next Gameweek, so that my decisions
   compound the way they do in the real game.
8. As an Entrant, I want one Free Transfer each Gameweek and to bank up to five, so that
   holding still has a value.
9. As an Entrant, I want a transfer beyond my banked Free Transfers to cost four points, so
   that acting has a price and inaction is a real alternative.
10. As an Entrant, I want to sell a player for what I paid plus half of any rise, rounded down,
    so that price movement rewards me the way the real game does.
11. As an Entrant, I want my bank balance carried between Gameweeks, so that saving for an
    expensive player is a strategy available to me.
12. As an Entrant, I want a Squad of exactly two goalkeepers, five defenders, five midfielders
    and three forwards, so that the shape constraint is the real one.
13. As an Entrant, I want at most three players from any one club, so that the concentration
    limit applies.
14. As an Entrant, I want to name a starting eleven in a legal formation, an ordered bench and
    a captain and vice-captain, so that my Team Sheet is complete.
15. As an Entrant, I want my captain's points doubled, so that the choice matters.
16. As an Entrant, I want my vice-captain promoted when my captain does not play, so that a
    late withdrawal does not silently waste the choice.
17. As an Entrant, I want unused starters replaced from the bench in my stated order under the
    real substitution rules, so that a blank from a non-playing starter is recovered where the
    game would recover it.

### Chips

18. As an Entrant, I want two sets of Chips — Wildcard, Free Hit, Triple Captain and Bench
    Boost in each half-Season — so that the strategic layer of the real game is present.
19. As an Entrant, I want my first-half Chips to expire unspent at the Gameweek 19 deadline, so
    that hoarding them has the same cost it does in the real game.
20. As an Entrant, I want a Wildcard to allow unlimited transfers in that Gameweek without
    Hits, so that a full rebuild is available when I need one.
21. As an Entrant, I want a Free Hit to apply for one Gameweek and then revert my Squad, so that
    a one-week pivot does not permanently reshape my team.
22. As an Entrant, I want a Triple Captain to treble instead of double, and a Bench Boost to
    score my bench, so that both behave as the real game defines them.
23. As an Entrant, I want a Chip I have already spent to be refused, so that the once-per-half
    limit holds.

### When an action is illegal

24. As an Entrant, I want an illegal action returned with the reason it failed, so that I have
    something specific to correct.
25. As an Entrant, I want up to three Repairs, so that self-correction is measured rather than
    assumed.
26. As an operator, I want the number of Repairs recorded per Gameweek, so that
    constraint-satisfaction ability is a reported result rather than an impression.
27. As an operator, I want a fourth failure to Roll Over — the previous Team Sheet stands and
    Free Transfers accrue — so that a struggling Entrant degrades gradually rather than
    scoring zero.
28. As an operator, I want a mixed legal-and-illegal action rejected whole rather than partly
    applied, so that the outcome does not depend on an arbitrary ordering rule.
29. As an auditor, I want validator messages frozen for the Season, so that the difficulty of
    the task does not change while it is being measured.
30. As an operator, I want each violation recorded by kind — budget, quota, club limit,
    formation, Chip, captain — so that a violation profile can be reported per Entrant.

### The Lock

31. As an auditor, I want an Entrant's Gameweek action locked at the same deadline the Match
    track uses, so that both tracks share one Lock and one verification.
32. As an auditor, I want an action arriving after the deadline refused entry, so that no
    Manager State can be advanced on information the Entrant should not have had.
33. As an auditor, I want the context an Entrant was shown stored and hashed, so that "it saw
    only this" is verifiable rather than asserted.
34. As an auditor, I want Manager State insert-only per Gameweek, so that a rerun cannot
    rewrite a decision already taken.

### Scoring

35. As an analyst, I want each Gameweek's points computed from FPL per-player data with captain
    and substitutions applied, so that the total matches what the real game would have given.
36. As an analyst, I want Hits deducted in the Gameweek they were taken, so that the cost of
    activity appears where it was incurred.
37. As an analyst, I want cumulative points per Entrant across the Season, so that the
    demonstration ranking exists.
38. As a leaderboard reader, I want the FPL ranking labelled a demonstration wherever it
    appears, so that I do not read a sample of one as evidence.
39. As an analyst, I want Repairs-per-Gameweek, Roll Over rate and the violation profile
    published beside the points, so that the metrics that can actually separate Base Models are
    as visible as the one that cannot.
40. As an analyst, I want scoring to be a pure function of stored Manager State and stored
    points, so that re-running produces identical totals.
41. As an operator, I want a Gameweek whose points have not settled to be skipped rather than
    scored as zero, so that an unsettled Gameweek is distinguishable from a bad one.

### Joining mid-Season

42. As an operator, I want the track to start at whatever Gameweek it is ready, so that its
    absence never delays the Match track.
43. As an operator, I want every Entrant to start together at that Gameweek, so that they run
    the same path length and remain comparable to each other.
44. As an analyst, I want the starting Gameweek recorded, so that a shorter season is visible
    rather than implied.

### Proving it

45. As a reviewer, I want the rules exercised as sequences of Gameweek actions rather than as
    single Squads, so that the replay behaviour ADR-0003 requires is what is actually tested.
46. As a reviewer, I want Selling Price verified against hand-computed cases including an odd
    rise that rounds down, so that the rule is checked rather than described.
47. As a reviewer, I want Chip expiry at Gameweek 19 asserted, so that the half-Season boundary
    cannot silently drift.
48. As a reviewer, I want auto-substitution verified against a case where the formation
    constraint blocks an otherwise-eligible substitute, so that the ordering rule is tested at
    the point it is hard.
49. As an operator, I want the whole track rehearsed against archived data in a throwaway
    database, so that it is proven before it manages anything real.

---

## Implementation Decisions

### The rules are a pure reducer

The core is a function, not a service:

```
(ManagerState, GameweekAction) → { state: ManagerState } | { violation: Violation }
```

`ManagerState` is the Squad with the price paid for each player, the bank, Free Transfers
banked, and Chips not yet spent. `GameweekAction` is transfers in and out, an optional Chip,
and a Team Sheet.

Everything the rules need is in those two values. No database, no clock, no network. Replaying
Gameweeks 1–19 to validate Gameweek 20 — which ADR-0003 says is unavoidable — becomes a fold
over a list, and a sequence test becomes a list of actions and an expected final state.

This is the load-bearing decision of the spec. The FPL rules are the most stateful thing in the
project, and keeping them a pure value transformation is what makes them testable at all.

Persistence is a thin layer above: load prior Manager State, apply the reducer, store the
result. The reducer never reads or writes.

### Violations are typed, and messages are frozen

A `Violation` carries a kind — budget, squad quota, club limit, formation, chip unavailable,
chip expired, captain not starting, unknown player — and a message. The kinds drive the
violation profile; the messages are what the Entrant sees.

Both are frozen for the Season (ADR-0004). Making a message more specific mid-Season changes
the difficulty of the task while it is being measured.

A mixed action is rejected whole. Applying transfers in order until one fails would make the
outcome depend on an ordering rule nobody chose.

### Free Hit needs a stashed Squad

Every other Chip modifies one Gameweek's scoring or transfer allowance. Free Hit replaces the
Squad for one Gameweek and reverts it afterwards, so the pre-Chip Squad must be stored and
restored. Every persisted Manager State uses one `squad` JSONB envelope shape. Its
`free_hit_stash` is `null` outside a Free Hit; during a Free Hit it holds the permanent Squad
with purchase prices, permanent Team Sheet and bank while `active` holds the temporary Squad
(ADR-0017). The next reducer step restores that stash before applying the next action; it never
reads the previous database row. This preserves the fold even when the next action Rolls Over.

The stored shape is pinned:

```ts
type SquadEnvelope = {
  active: OwnedPlayer[]; // includes each purchase price
  free_hit_stash: null | { // null in every Manager State outside a Free Hit
    squad: OwnedPlayer[];
    team_sheet: TeamSheet;
    bank: number;
  };
};
```

### The 2026/27 Chip rules are frozen from the official source

The Chip inventory and lifecycle were verified on 30 July 2026 against the Premier League's
official [2026/27 Chips announcement](https://www.premierleague.com/en/news/4679879/whats-happening-with-fpl-chips-in-202627),
published 20 July 2026. It confirms Wildcard, Free Hit, Triple Captain and Bench Boost once per
half-Season; expiry of the first set at the Gameweek 19 deadline; one Chip per Gameweek; Free
Hit being unavailable in Gameweek 1; and consecutive Free Hits being forbidden. The current
official [FPL FAQ](https://www.premierleague.com/en/news/4661030), also verified 30 July 2026,
confirms that Wildcard is unavailable in Gameweek 1, bank and Squad restoration after Free
Hit, and preservation of previously banked Free Transfers. Playing a Free Hit consumes the
Free Transfer granted for that Gameweek, leaves previously banked Free Transfers unchanged,
and lets normal accrual resume in the following Gameweek up to the five-transfer cap.

### Data the fetch must gain

Per-player Gameweek points come from FPL's live endpoint for a Gameweek, archived like every
other upstream body. A Gameweek's points are final when `events[].data_checked` is true — the
FPL-track analogue of the `finished` rule in spec 0002, and read from the feed rather than
inferred from a schedule.

`fpl_players` already captures prices per Gameweek under a Lock-enforced snapshot; Selling
Price reads what the Entrant paid from its own Manager State rather than from that table, since
ADR-0003 makes Manager State the system of record for purchase prices.

### Storage

`manager_states` exists and needs no migration — Squad, Team Sheet, bank, Free Transfers, Chips
used, active Chip, Rolled Over flag, Repairs used, all keyed `(model_id, season, gw)` with the
existing immutability trigger. The `squad` JSONB envelope carries both the active Squad and the
optional Free Hit stash specified above.

A new table records per-player Gameweek points. FPL points and behavioural metrics are written
to `scores` with `track = 'fpl'`, which the schema already permits.

The base metric name stores one Gameweek and the `_season_to_date` suffix stores the cumulative
snapshot through that same Gameweek, matching spec 0002. The FPL names are `fpl_points`,
`repairs`, `roll_over_rate` and `violation_profile`, with corresponding
`*_season_to_date` cumulative metrics. `repairs` is Repairs used that Gameweek and its
cumulative value is the mean per Gameweek, with the full 0/1/2/3/failed distribution in
detail. `roll_over_rate` is 0 or 1 for one Gameweek and a cumulative fraction.
`violation_profile` stores the total violation count as its value and the typed breakdown in
detail, both per Gameweek and cumulatively.

### One Lock, shared

The FPL action locks at the Gameweek deadline, the same instant the Match track uses
(ADR-0006). One run can serve both tracks, and verifying the Lock held remains a single query.

Context is stored and hashed exactly as the Match track's is, so what an Entrant saw is
reconstructible.

### The ranking is a demonstration

One seat per Base Model means one season path each (ADR-0003). The label is not decoration: it
must appear wherever the ranking appears, and the metrics that can separate Base Models —
Repairs, Roll Over rate, violation profile — are published beside it rather than beneath it.

---

## Testing Decisions

### What makes a good test here

The rules are tested as **sequences**, not as single Squads. A test is a starting Manager State,
a list of Gameweek actions, and the state or violation expected at the end. That is what
ADR-0003 requires, and the reducer is what makes it cheap.

A test asserts the value the reducer returns, not the steps it took. Whether Free Transfers are
tracked as a counter or derived from history is an implementation detail; that banking stops at
five is not.

### Seams — two, both existing

**Outbound HTTP** for the live points endpoint, through the fetch that already owns that seam.
**The clock** for the Lock, shared with the Match track.

The reducer needs neither and gets neither. No new seam is introduced.

Tests run against a real Postgres for the persistence layer, as everything else does.

### What gets tested

**The reducer, as pure sequences:**

- Free Transfers accruing and capping at five, and a transfer beyond them costing four points
- Selling Price at purchase plus half the rise, including an odd rise that rounds down
- Budget, the 2/5/5/3 quota, and the three-per-club limit, each rejected with its own kind
- A legal formation accepted and an illegal one rejected
- Each Chip's effect, a spent Chip refused, and the first-half set expiring at Gameweek 19
- Free Hit reverting the stashed permanent Squad, Team Sheet and bank the following Gameweek
  without a database read, including a Roll Over immediately after the Free Hit
- Auto-substitution where the formation constraint blocks an otherwise-eligible substitute —
  the case where the ordering rule is hard rather than obvious
- A mixed legal-and-illegal action rejected whole

**The Repair loop and Roll Over,** driven through the HTTP seam with scripted responses:
attempts-to-legal recorded as 0/1/2/3/failed, and a fourth failure leaving the previous Team
Sheet standing with Free Transfers accrued.

**Persistence and the Lock,** against a real Postgres: Manager State insert-only, an action
after the deadline refused, context stored and shared.

**Points ingestion,** against the pinned `data_checked` contract: unchecked data creates no
scoreable rows and checked data does. The current archive proves only the unchecked path; the
first observed checked bootstrap and corresponding live-points response are a dated
post-Gameweek 1 runbook action, not an implementation blocker.

**Scoring,** against hand-computed points including captain doubling, vice-captain promotion,
Bench Boost, Triple Captain and Hits.

**An end-to-end rehearsal** against archived data in a throwaway cluster, following the dry
run's pattern.

### Prior art

The write path establishes every shape needed. `test/schema.test.ts` for database-enforced
invariants, `test/predict-gameweek.test.ts` for orchestration and a Repair loop against a real
Postgres, `test/prediction-validator.test.ts` for a pure validator with frozen messages, and
`test/run-dry-run.test.ts` for an end-to-end pass in a throwaway cluster. Follow those.

---

## Out of Scope

- **The Match track**, complete in spec 0001 and scored in spec 0002.
- **The leaderboard, dashboard and read API.** This spec writes rows; nothing renders them.
- **Additional seats per Base Model.** ADR-0003 fixes one, which is what makes the ranking a
  demonstration; adding replication is a later decision and a later Season.
- **Mini-leagues, transfers between Entrants, or any interaction between seats.**
- **Recovering a Season that started late.** The track joins at a Gameweek and runs forward.

---

## Further Notes

**This track measures recovery, and recovery may not be observed.** ADR-0003 records the risk
plainly: whether any Entrant reaches a genuinely bad position is left to chance. If all nine
draft competent Squads and never stumble, the capability the track was built to measure goes
unseen and the Season produces a points table and nothing else.

The deliberately-handicapped second seat that would have guaranteed the observation was
considered and declined during design. Nothing here changes that; it is recorded so the outcome
is not mistaken for a bug.

**The constraint-satisfaction metrics are the ones likely to separate anything.** Cumulative
points across a single season path cannot: the plausible skill gap and the single-season
variance are the same size. Repairs needed, Roll Over rate and the violation profile are
graded observations across thirty-eight Gameweeks, and the Match track's first live rehearsal
showed the Base Models are far more distinguishable on how they behave than on how well they
forecast.

**The prompt is much larger than the Match track's.** An Entrant must be shown its own Manager
State and enough of a six-hundred-player pool to choose from. Expect the per-call cost to
exceed the Match track's several times over, and measure it from `attempts.tokens_in` after the
first Gameweek rather than estimating it now — the Match track's own estimate was wrong twice
before it was measured.
