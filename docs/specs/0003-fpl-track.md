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
(ManagerState, GameweekAction, LockedPlayerPool, GameweekNumber)
  → { state: ManagerState } | { violation: Violation }
```

`ManagerState` is the Squad with the price paid for each player, the bank, Free Transfers
banked, and Chips not yet spent. `GameweekAction` is transfers in and out, an optional Chip,
and a Team Sheet. The `LockedPlayerPool` is the Gameweek's pool as its Lock found it, which is
what prices a Transfer. The `GameweekNumber` is which Gameweek the action is for, which is what
decides the half-Season a Chip is drawn from.

Everything the rules need is in those four values. No database, no clock, no network. Replaying
Gameweeks 1–19 to validate Gameweek 20 — which ADR-0003 says is unavoidable — becomes a fold
over a list, and a sequence test becomes a list of actions and an expected final state.

The last two are the Gameweek the Entrant is playing, not decisions the Entrant makes, so they
are arguments rather than fields of `GameweekAction`: an Entrant that could name its own
Gameweek could reach into the half-Season set it had already spent.

This is the load-bearing decision of the spec. The FPL rules are the most stateful thing in the
project, and keeping them a pure value transformation is what makes them testable at all.

Persistence is a thin layer above: load prior Manager State, apply the reducer, store the
result. The reducer never reads or writes.

### Violations are typed, and messages are frozen

A `Violation` carries a kind — budget, squad quota, club limit, formation, chip unavailable,
captain not starting, unknown player — and a message. The kinds drive the violation profile;
the messages are what the Entrant sees.

Both are frozen for the Season (ADR-0004). Making a message more specific mid-Season changes
the difficulty of the task while it is being measured.

**There is no `chip expired` kind.** An earlier draft of this list carried one beside `chip
unavailable`, and implementing the Chips showed it has no case to fire on. Which half-Season's
set an action draws from is decided by the Gameweek it is played in, so the first set is out of
reach from Gameweek 20 onwards without anything having to expire it, and the second set is
untouched by whatever the first spent. The three refusals that exist — a Chip already spent
from this half's set, a Wildcard or Free Hit in the opening Gameweek, and a Free Hit straight
after a Free Hit — are all one kind. A kind no action can produce would appear in every
violation profile as a permanent zero and suggest a rule that is not there.

A mixed action is rejected whole. Applying transfers in order until one fails would make the
outcome depend on an ordering rule nobody chose.

**A malformed response is not a `Violation`.** A response that is not a Gameweek action at all
costs a Repair and is recorded like any other refusal, but under its own `schema` kind rather
than one of the seven. The violation profile records how an Entrant manages a Squad, and
failing to return JSON is not a rule of the game it broke; counting it beside a club-limit
breach would make the profile of a Base Model that cannot hold a format look like the profile
of one that cannot count to three players per club. The kinds are a tuple the `ViolationKind`
type is read off, so what a profile must have columns for can be enumerated rather than
remembered.

The sentence an Entrant is sent back is frozen with the reason inside it. It quotes the reason,
asks for a correction and does nothing else — it does not restate the rules, which the context
already lists in full every Gameweek, and it does not say which Repair this is, because an
Entrant told it is on its last chance is being measured on a different task from one that is
not.

### The Repair loop is one conversation, and the fourth failure Rolls Over

An initial response and up to three Repairs (ADR-0010 fixes three on both tracks, so the number
is one constant both read). Each rejected response is appended to the same conversation with
the reason it failed, so what is measured is an Entrant correcting its own answer rather than
answering afresh three more times.

Every attempt leaves one row whatever became of it, because the Repair count and the violation
profile are read from those rows and neither can count what was never written. A row is `ok`
only for an action that was legal and in time; everything else carries one kind — one of the
seven, `schema`, `deadline` for an attempt that landed at or after the Lock, or a provider
failure (`provider`, `rate_limit`, `timeout`, `refusal`).

A row keeps whatever telemetry the response actually carried, and null only where there was
none. A refusal in particular is a call that was made, resolved and billed: its endpoint and
token counts are on the response like any other, and they are what the per-call cost is read
from after the first Gameweek. Recording them as unknown because no action came back would
lose the very numbers this spec says to measure the FPL prompt's cost with.

A provider failure is not an illegal action and does not Roll Over. The Entrant never answered,
so there is nothing to send back and nothing to correct: the Gameweek stops with the attempts
recorded and no Manager State.

**A silent Gameweek still happened.** A stored Manager State is sufficient input to the *next*
Gameweek's reducer step and to that one only (ADR-0017), so the Gameweek it was stored for is
loaded with it and every Gameweek between that one and the one being played is folded through
the same neutral transition a Roll Over uses. Two things would otherwise be wrong, and both are
about a state being read as though no time had passed: the Free Transfers those Gameweeks
granted would be lost, and `chipActive` would still name a Chip that stopped being active when
its Gameweek ended — refusing a Free Hit as consecutive with a whole Gameweek sitting between
the two. The silent Gameweeks are counted from `gameweeks`, which is the record of which
Gameweeks a Season has; arithmetic on the numbers would invent any it does not.

That is also why the standing state is read as the most recent stored Gameweek rather than the
one immediately behind — a Squad must not vanish because a Gameweek was silent.

The fourth invalid response discards the action whole and stores a Roll Over: the standing
Squad and Team Sheet, the Free Transfer the Gameweek grants banked as an untouched Gameweek's
would be, no Hit, and no Chip — a Chip named in the discarded action is not spent by naming it.
The reversion runs first, so a Roll Over immediately after a Free Hit gives the permanent Squad
back rather than making the borrowed one permanent, which is the case ADR-0017 put the stash in
the row for. A Rolled Over Gameweek is scored from the standing Team Sheet like any other,
which is the whole of the argument for rolling over rather than scoring zero.

A Gameweek is only ever played for an Entrant that has a Manager State to carry into it. There
is no Team Sheet to roll onto before the first one and the rules cannot invent a Squad, so an
Entrant with nothing standing is refused before the first call rather than seeded from the
empty Squad — seeding one would store the earliest Manager State the Season has, which is by
definition the Gameweek the track started at, for one Entrant of nine and permanently, because
`manager_states` is insert-only. Openings belong to "Start all nine Entrants together" and to
nowhere else.

**One FPL context per Gameweek is sound only at an opening.** Every Entrant opens from the same
seed state, so the one row the opening stores is one Entrant's context and every Entrant's at
once. Every later Gameweek's context carries its own Squad, and `contexts_identity` — unique on
`(season, gw, track, fpl_id)` — has room for one of them, so a second Entrant reaching a later
Gameweek is refused loudly rather than handed a Squad it does not own and then judged on the one
it does. Widening that key belongs to "Run the FPL track under the shared Lock".

### The opening is gathered whole, then committed whole

Every other Gameweek stores its Manager State as soon as it has one. The opening cannot: an
Entrant whose state was committed while another's was still to come would be a Gameweek further
along than its peers if the rest never arrive, and a season path of a different length is a
season path that cannot be compared. So the nine conversations run first — concurrently, each
with its own three Repairs — and the nine Manager States are inserted in one transaction
afterwards. A missing legal action or a failed insert leaves none of them stored.

That is also what makes "the Gameweek the track started at" answerable: a Gameweek either holds
every Entrant's opening or holds nothing, so the earliest Gameweek with any Manager State is the
starting Gameweek, and an incomplete set can never be read as one. No column records it, because
none is needed.

The attempts are not part of that transaction and are written as each call happens. A refused
start throws away eight legal actions; it must not throw away the record that they were made,
because Repairs and the violation profile are read from those rows and the operator decides
whether to try again from them. A failure to *write* one of those rows is different again: it
aborts the opening rather than reporting an Entrant as missing, because a broken ledger must not
read as an Entrant's own doing.

Which rows are seats is read off `role = 'entrant'` and the FPL Prompt Version, so Reference
Lines and the Match track's Entrants are excluded by what they are rather than by a list kept
somewhere. Three refusals, all before the first call, so a roster problem is never discovered
next to a Lock:

- **Two seats on one Base Model.** ADR-0003 fixes one season path per Base Model, and a second
  is not a longer demonstration but a different experiment.
- **A roster that is not the Season's.** ADR-0014 fixes nine Entrants, and the count is checked
  against that rather than against whatever `models` happens to hold. Nothing else would catch
  it: which Entrants are missing is measured against the rows that were queried, so an
  eight-seat roster reports nobody missing and starts a Season quietly short of a Base Model.
  With `manager_states` insert-only there is no undoing it, and half the published results —
  ADR-0011's complete-case intersection, ADR-0016's eight comparisons against the leader — are
  read against the same nine.
- **A Season already under way.** An opening seeds every Entrant from the empty Squad, so it
  would discard the Season rather than continue it.

The mirror of the last one is that no other entry point may open the track at all: a Gameweek
played for an Entrant with nothing standing is refused rather than seeded, for the reason given
under the Repair loop above.

The same Gameweek may be opened again while its Lock still stands, and the second run hands out
the context already stored rather than rebuilding it. A snapshot that moved in between would
otherwise price a Squad from a text no Entrant was ever shown.

### The record is written whole, or not at all

A Gameweek's eight rows — points and behaviour, each with its cumulative twin — are written on
two conditions: that the Gameweek's points have settled, and that every Entrant on the roster
stored a Manager State for it. The behavioural three could be written the moment the actions are
in, and are not. A record whose Repairs ran a Gameweek ahead of its points would have to be read
with a note about which half of it was current, and the whole of the argument for writing the
behaviour beside the points is that they are read together.

Nothing is lost by waiting. Repairs, Roll Overs and violations are derived from stored Manager
States and attempts, both of which are already on record; when the Gameweek settles, the same
run writes them.

**One Entrant's Gap takes the Gameweek from everyone.** A Gameweek published for eight Entrants
of nine gives those eight a season path a Gameweek longer than the ninth's, which is the one
comparison the track exists to make and the reason the opening commits all nine or none.
ADR-0011's answer for the Match track holds here without amendment: a blocked Gap removes that
Gameweek from every comparison, including between Entrants that were working fine, and the
remedy is a fill run while the Lock is still open rather than a record of unequal lengths. The
roster is read from the starting Gameweek's own rows — the opening has already checked its size
against ADR-0014's nine, and what is wanted afterwards is *which* Entrants.

The alternative was to derive a standing Manager State for the silent Entrant, which is what
the real game does and what `carriedThroughSilence` already does for the next Gameweek's reducer
input. It was rejected here: the Gameweek would score, but its behavioural row would read as
nought Repairs and no violations, so an Entrant whose provider was down would appear in the
profile as one that played a flawless Gameweek.

The cumulative values are folded from the Season's own Gameweeks rather than added to the score
rows already stored, and a Gameweek that settles late rewrites every published Gameweek after
it. Scoring the same Gameweek twice, scoring Gameweek 4 before Gameweek 3 settles, and rerunning
the lot after a late settlement all have to produce the same numbers. A running total kept in
the rows would depend on the order they were written in; recomputing only the Gameweek that
settled would leave every published Gameweek after it holding a total taken over a path with a
hole in it. Only Gameweeks already published are rewritten — a later Gameweek nobody has scored
yet folds in the whole path when it is scored on its own.

**A published Gameweek that stops scoring is a refusal.** If a Gameweek already on record turns
out to be unsettled or short an Entrant, the run raises and changes nothing, naming the Gameweek
and what is wrong with it. Returning quietly would leave its rows standing with nothing behind
them and nobody told. Deleting them was the other candidate and is worse: it would make absent
data destroy published data, so a run against a half-restored database would silently unpublish
a Gameweek. Neither state is reachable from the code — stored points are only ever inserted or
updated, and `manager_states` refuses a delete outright — so what the refusal answers is an
operator working directly on the database, and refusing is the only one of the three answers
that cannot make such a session worse.

**All of it commits together**, across every metric and every Entrant and every Gameweek the
call rewrites. A Gameweek's points without the behaviour that produced them is worse than
nothing at all: a reader cannot tell a record whose second half is still to be written from one
whose Entrant behaved impeccably.

**A Gameweek before the shared starting Gameweek contributes nothing**, and it takes no guard to
make that true: no Entrant has a Manager State before the start, because the opening commits all
nine or none. The bound is stated in the code anyway — the fold begins at the starting Gameweek
and an earlier one is refused — but it restates an invariant rather than creating one, and a
mutation that removes either one cannot be told apart from the code that keeps it. What the
starting Gameweek does decide is what the record *says*: it is stored in the cumulative detail,
because a season path of eleven Gameweeks that began at Gameweek 28 is a different claim from
one that began at Gameweek 1 and lost most of it.

**The violation profile counts kinds, not failures.** It asks for the seven and counts what
comes back, rather than counting every attempt that was not `ok` — `schema`, `deadline` and the
provider kinds are all failures and none of them is a rule of the game (see *Violations are
typed* above). Only `schema` and a provider failure can share a Gameweek with a stored Manager
State, the first inside the same conversation and the second from an earlier run over the same
Gameweek, so those are the two the counting has to survive.

**The qualification is stored, not applied at publication.** It goes in the detail of every row
a ranking can be read off — the Gameweek's points and the Season's — so that a value cannot
reach a reader without the sentence that says what it is worth. A label added by whatever
publishes the table is a label the next thing to read the table will not have.

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

A Wildcard treats Free Transfers exactly as a Free Hit does, and the FAQ (verified 2 August
2026) says so in numbers rather than in principle: "when playing a Wildcard, any saved free
transfers are maintained. If you had 2 saved free transfers, you will still have 2 saved free
transfers the following Gameweek." Two banked before the Chip is two banked after it — the
Gameweek's Transfers take nothing from the bank, and the Free Transfer the Gameweek would
otherwise have granted goes with the Chip. Normal accrual resumes in the Gameweek after, up to
the five-transfer cap.

That worked example is why the sentence is quoted here rather than paraphrased. Read as
"maintained, and the Gameweek accrues as usual" the same rule gives three, and nothing else in
the FAQ rules that out. Both Chips are one rule, not two.

A Wildcard also buys no extra money: "when using a Wildcard, you must remain within your
current budget" (same source), so a Chip action that breaks the budget, the quota, the club
limit or the formation is refused whole and the Chip stays unspent.

**The context reports what this Gameweek will accept, not only what the sets hold.** Several of
these rules withhold a Chip that has not been spent — a Free Hit in the Gameweek straight after
a Free Hit, and either transfer Chip in the Gameweek the track opens on. An Entrant shown a
whole half-Season set and refused for reaching into it has been sent to spend a Repair on a
rule it was never told applied now, which ADR-0004 forbids. So the context carries both: the
unspent set per half, which is what a Season is planned with, and the Chips this Gameweek will
actually take. The second line asks the reducer's own availability rule rather than restating
it, so the two cannot answer differently.

**A Chip the rules accept is a Chip the rules carry out.** All four are carried out: Wildcard
and Free Hit change a Gameweek's Transfers and the reducer does that; Triple Captain and Bench
Boost change a Gameweek's scoring and `scoreTeamSheet` does that, from the `chip_active` the
reducer records on the same Manager State row that carries the Team Sheet and the Hits.

The invariant is stated here rather than enforced by a list, because a list of the Chips that
work is only meaningful while one of them does not. It governs the next Chip instead: a Chip
arrives with its effect, in the same commit, or it does not arrive. Accepting one whose effect
nothing carries out would spend one of an Entrant's eight Chips for the Season and score the
Gameweek exactly as it would have scored anyway — an Entrant's own decision thrown away
silently, in a Season that cannot be replayed. Until "Play Triple Captain and Bench Boost"
landed, the two scoring Chips were refused by exactly such a list and offered by no context;
its removal, and the removal of the general refusal sentence it raised, belong to that ticket
and to no later one.

The `Chip` type, the boundary schema and the stored `chips_used` inventory kept all four
throughout, because those are frozen for the Season and a Chip that appeared in the wire schema
partway through it would be a different task from the one being measured.

**The scoring Chips change the score and nothing else.** Triple Captain trebles the armband —
"your captain points are tripled instead of doubled" (2026/27 Chips announcement) — and moves
with it: when the captain does not play, "the triple points bonus will be passed to your
vice-captain", and when neither plays "the bonus is lost, the chip isn't returned" (official
FPL FAQ, verified 3 August 2026). Bench Boost includes "the points scored by your benched
players" in the total, which is all fifteen.

Two consequences the rules have to state rather than leave to the arithmetic. A Bench Boost
makes **no substitutions at all**: a bench player brought on while his own points are already
counted would be counted twice and would take an absent starter's place out of the total
altogether, which is a different number from the one the Chip promises. And neither Chip
touches Transfers — the Gameweek's Hits are owed as usual, its Free Transfer accrues as usual,
and nothing is stashed — so both are playable in the Gameweek the track opens on, where the
transfer Chips are not. The FAQ bars those two because "you have infinite transfers in this
Gameweek", which is a reason a Chip that takes no part in Transfers was never given.

**The opening Gameweek is read off the Squad, not off the calendar.** Both official sources
bar a Wildcard and a Free Hit from Gameweek 1, and the reason the FAQ gives is that "you have
infinite transfers in this Gameweek" — a fact about an Entrant's opening rather than about the
date. ADR-0003 lets the track join the Season at a Gameweek and run forward, so the reducer
refuses both Chips wherever the Squad is still empty. In a Season the track opens on Gameweek 1
the two readings agree; where they diverge, only this one is right, and a Free Hit has the
second reason besides — there is nothing yet to revert to.

### Auto-substitution is per absent starter, not atomic

Auto-substitution is per absent starter, not atomic. An absent starter remains in the lineup
with zero points unless an eligible bench player replaces them. The maximum legal set of
replacements is applied, with bench order breaking ties. Formation is evaluated on the original
XI after actual replacements only.

Two consequences follow that a whole-lineup reading would get wrong. A Gameweek in which the
bench can cover only some of the absences still makes the replacements it can, rather than
abandoning all of them. And both goalkeepers sitting out stops no outfield substitution: the
absent starting goalkeeper is not vacated, so he keeps the eleven its one goalkeeper while
outfield places are taken as usual.

Verified 2 August 2026 against the official [FPL Help](https://fantasy.premierleague.com/help/)
and the Premier League's
[Managing your team](https://www.premierleague.com/en/news/2174899/fpl-basics-managing-your-team),
which state that a team must always field one goalkeeper and that a substitution happens only
where an eligible bench player exists.

### Data the fetch must gain

Per-player Gameweek points come from FPL's live endpoint for a Gameweek, archived like every
other upstream body. A Gameweek's points are final when `events[].data_checked` is true — the
FPL-track analogue of the `finished` rule in spec 0002, and read from the feed rather than
inferred from a schedule.

`fpl_players` already captures prices per Gameweek under a Lock-enforced snapshot; Selling
Price reads what the Entrant paid from its own Manager State rather than from that table, since
ADR-0003 makes Manager State the system of record for purchase prices.

### Storage

`manager_states` already holds Squad, Team Sheet, bank, Free Transfers, Chips used, active
Chip, Rolled Over flag and Repairs used, all keyed `(model_id, season, gw)` with the existing
immutability trigger. The `squad` JSONB envelope carries both the active Squad and the optional
Free Hit stash specified above.

One migration adds the column that enumeration missed: `hits`, the points owed for a
Gameweek's paid Transfers. The reducer is the only step that knows how many Transfers an
action made against how many Free Transfers were banked, and the action itself is not stored,
so a Hit cannot be recovered later — Manager State is its system of record, as it is for
purchase prices.

A new table records per-player Gameweek points. FPL points and behavioural metrics are written
to `scores` with `track = 'fpl'`, which the schema already permits.

The `fpl_points` detail names everything the total was made of: the side that counted with each
contribution and its multiplier, the substitutions made, who actually wore the armband, the Hit
and the Chip. `manager_states` is the system of record for the last two and the detail copies
both, so that a stored score explains itself without a join — and so that a fifteen-man record
is distinguishable from an eleven-man one by what it says rather than by how long it is.

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
