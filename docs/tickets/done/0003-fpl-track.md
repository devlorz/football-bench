# Tickets: FPL track

Eleven tracer-bullet slices that let all nine Base Models manage persistent Fantasy Premier
League Squads under the complete 2026/27 rules and produce a demonstration ranking with
behavioural evidence. Source: [spec 0003](../../specs/0003-fpl-track.md). Vocabulary:
[CONTEXT.md](../../../CONTEXT.md). Decisions: [ADR 0001–0017](../../adr/).

Work the **frontier**: any ticket whose blockers are all done. Player-points ingestion and the
first legal Manager State can begin independently; after that, work follows the state path
through Transfers and Team Sheet scoring. Triple Captain / Bench Boost and the Repair loop can
then proceed independently before converging on the demonstration record.

The rules remain a pure reducer:

```
(ManagerState, GameweekAction, LockedPlayerPool, GameweekNumber)
  → { state: ManagerState } | { violation: Violation }
```

Persistence, the outbound-HTTP seam and the Lock stay outside it. The only new persistence is
the per-player Gameweek-points table; existing Manager State, context, attempt and score rows
carry the rest.

Every persisted Manager State is sufficient input to the next reducer step. The existing
`squad` JSONB always stores one envelope shape with `active` and `free_hit_stash`;
`free_hit_stash` is `null` outside a Free Hit and otherwise contains the permanent Squad,
purchase prices, Team Sheet and bank (ADR-0017). No reducer step reads an earlier database row.

Across FPL scoring tickets, the base metric name means one Gameweek and the
`_season_to_date` suffix means the cumulative snapshot through that same Gameweek, matching
the convention shared with spec 0002.

---

## Collect settled player Gameweek points

**What to build:** The daily FPL fetch archives and stores the per-player points needed to
score a Team Sheet, but only after FPL declares the Gameweek checked. The stored rows contain
enough evidence to distinguish a player who appeared from one who did not.

**Blocked by:** None — can start immediately.

- [x] A numbered migration adds per-player Gameweek points keyed by Season, Gameweek and player, with the required foreign keys, constraints and row-level security
- [x] The FPL live endpoint is fetched through the existing outbound-HTTP seam and its raw response is archived byte-for-byte before derived writes
- [x] The source boundary validates every field used for points and appearance decisions and names every offending field when it rejects a response
- [x] Points are stored only when the corresponding FPL event reports `data_checked`; settled-ness is never inferred from the clock
- [x] An unchecked Gameweek creates no scoreable player-points rows and remains distinguishable from a Gameweek in which every selected player scored zero
- [x] Re-fetching unchanged settled data is idempotent, while a changed upstream settled value is reflected in the stored row
- [x] The existing pre-Lock player snapshot continues to capture that Gameweek's prices independently of the post-Gameweek points fetch
- [x] Tests exercise unchecked and `data_checked` boundary cases against real Postgres, treating `data_checked` as the pinned contract rather than claiming the current unchecked archive proves the settled path

---

## Lock one legal opening Manager State

**What to build:** One Entrant can submit a complete opening Squad and Team Sheet before the
shared Lock, have the action validated by the pure reducer, and receive one immutable Manager
State containing everything needed to continue into another Gameweek.

**Blocked by:** None — can start immediately.

- [x] The reducer accepts plain Manager State and Gameweek action values and has no database, clock, network or random-number dependency
- [x] An opening Squad contains exactly two goalkeepers, five defenders, five midfielders and three forwards within the £100.0m budget
- [x] No opening Squad contains more than three players from one club, an unknown player, or a player outside the locked Gameweek's pool
- [x] A Team Sheet names eleven starters in a legal formation, an ordered four-player bench, and distinct captain and vice-captain choices among the starters
- [x] The opening state records every player's purchase price, money in the bank, Free Transfers and both half-Season Chip sets
- [x] The FPL context contains the Entrant's state and the locked player pool, is stored and hashed, and is the exact text handed to the Entrant
- [x] A legal action received before the Gameweek deadline stores one Manager State; an action received at or after it stores no state
- [x] The database refuses update or deletion of the stored Manager State, so a rerun cannot replace the opening decision
- [x] Budget, quota, club-limit, formation, captain and unknown-player cases are checked with hand-constructed values
- [x] Persistence and Lock tests run against real Postgres while reducer sequence tests require no database

---

## Carry Manager State through Transfers

**What to build:** A legal action in a later Gameweek transforms the previous Manager State
into the next one, carrying the Squad, purchase prices, bank and Free Transfers so that
decisions compound across the Season.

**Blocked by:** Lock one legal opening Manager State.

- [x] Replaying a list of Gameweek actions is a fold over the pure reducer and produces the same final state as applying each action in sequence
- [x] Every persisted output is sufficient input to the next reducer step without loading an earlier Gameweek
- [x] One Free Transfer accrues each Gameweek and unused Free Transfers bank to no more than five
- [x] Transfers beyond the banked allowance deduct a four-point Hit each in the Gameweek where they occur
- [x] Selling Price uses the recorded purchase price plus half of a price rise rounded down, including an independently hand-computed odd-rise case
- [x] The next Manager State carries the resulting Squad, new purchase prices, money in the bank and remaining Free Transfers
- [x] Every post-transfer Squad still satisfies budget, position quota and three-per-club constraints
- [x] A mixed legal-and-illegal action is rejected whole: no Transfer, bank movement, Hit or partial Manager State is applied
- [x] Sequence tests cover inaction, banking to the cap, free Transfers, paid Transfers, a sale followed by a purchase and an invalid later action
- [x] Persisting successive legal states creates one immutable row per Entrant and Gameweek without changing any earlier row

---

## Score a Team Sheet by the real substitution rules

**What to build:** Once a Gameweek's player points are settled, a stored Team Sheet produces
the points FPL itself would award, including automatic substitutions, captaincy and Hits. The
result is written idempotently and an unsettled Gameweek is skipped rather than scored as zero.

**Blocked by:** Collect settled player Gameweek points · Carry Manager State through
Transfers.

- [x] A starter who did not play is replaced from the ordered bench by the first eligible player whose inclusion preserves a legal formation
- [x] Goalkeeper substitution and outfield substitution follow their distinct eligibility rules
- [x] A formation-blocked bench player is skipped in favour of the next eligible player, verified by a hand-computed hard case
- [x] The captain scores double when the captain played; otherwise a playing vice-captain is promoted
- [x] Hits recorded in Manager State are deducted in the same Gameweek
- [x] Only settled stored player points are read, and the scoring function makes no network or clock call
- [x] An unchecked Gameweek writes no FPL score row and cannot appear as a zero-point performance
- [x] A settled Gameweek writes one auditable points row per Entrant with player-level contributions, substitutions, captaincy and Hits in its detail
- [x] Re-running over the same Manager States and stored points leaves row count, value and detail unchanged
- [x] Scoring expectations are calculated by hand rather than by duplicating the implementation in the test

---

## Play Wildcard and Free Hit

**What to build:** An Entrant can spend the transfer-oriented Chips to rebuild permanently or
pivot for one Gameweek, while the reducer preserves the once-per-half lifecycle and restores a
Free Hit Squad correctly.

**Blocked by:** Score a Team Sheet by the real substitution rules.

- [x] Manager State carries two sets of Wildcard, Free Hit, Triple Captain and Bench Boost, one for each half-Season
- [x] The frozen Chip inventory and lifecycle cite the Premier League's official 2026/27 Chips announcement published 20 July 2026 and the official FPL FAQ, both verified 30 July 2026
- [x] A Wildcard permits unlimited legal Transfers in its Gameweek without Hits and persists the rebuilt Squad afterwards
- [x] A Free Hit persists the temporary Squad under `squad.active` and the permanent Squad, purchase prices, Team Sheet and bank under `squad.free_hit_stash`
- [x] The next reducer step restores the Free Hit stash before applying its action, without reading an earlier Manager State row
- [x] Free Hit scoring uses the temporary Squad while later Selling Prices continue from the restored permanent Squad
- [x] Previously banked Free Transfers pass through a Free Hit unchanged; the Free Transfer granted for that Gameweek is consumed by playing the Chip, and the following Gameweek accrues normally up to five
- [x] Wildcard and Free Hit are unavailable in Gameweek 1, and Free Hit cannot be played in consecutive Gameweeks
- [x] A spent Chip cannot be used again from the same half-Season set
- [x] The first-half Chip set remains usable through Gameweek 19 and expires unspent at that deadline
- [x] A Chip action that produces an illegal Squad or Team Sheet is rejected whole without consuming the Chip
- [x] Pure sequence tests cover Wildcard persistence, Free Hit reversion, attempted reuse and the Gameweek 19 expiry boundary

---

## Play Triple Captain and Bench Boost

**What to build:** The scoring-oriented Chips modify the same settled Team Sheet scoring path,
so captain and bench decisions receive exactly their declared one-Gameweek effect without
changing the persistent Squad.

**Blocked by:** Play Wildcard and Free Hit.

Both Chips were gated off until this ticket. `chipRefusal` refused them and the context offered
neither, holding the invariant spec 0003 states: a Chip the rules accept is a Chip the rules
carry out. The gate — `CHIPS_WITH_EFFECT` in `src/fpl/apply-gameweek-action.ts` — was removed
in the same commit as the scoring below, together with the general refusal sentence that
existed only to serve it, since neither has a case left to fire on.

- [x] Both Chips leave `CHIPS_WITH_EFFECT` and reach the reducer in the same commit that scores them, with the context offering them from that commit and not before
- [x] Triple Captain trebles the playing captain's points instead of doubling them
- [x] When the named captain does not play under Triple Captain, the promoted playing vice-captain receives the triple multiplier
- [x] Bench Boost scores all fifteen eligible Squad members without applying ordinary outfield bench exclusions
- [x] Hits and all non-Chip scoring rules still apply in a Triple Captain or Bench Boost Gameweek
- [x] Each Chip is consumed from the correct half-Season set and cannot affect another Gameweek
- [x] Only one optional Chip may be active for one Gameweek action
- [x] Hand-computed scoring cases cover ordinary captaincy, vice-captain promotion, Triple Captain and Bench Boost
- [x] Replaying the same Chip sequence produces an identical Manager State and score

---

## Repair illegal actions, then Roll Over

**What to build:** An illegal Gameweek action is returned to the Entrant with one frozen,
typed reason and up to three opportunities to repair it. A fourth invalid response discards
the action and advances through a Roll Over instead of destroying the Entrant's score.

**Blocked by:** Play Wildcard and Free Hit.

- [x] Every violation has a stable kind covering budget, squad quota, club limit, formation, Chip unavailable, captain and unknown player — there is deliberately no `chip expired` kind, for the reason spec 0003 §*Violations are typed, and messages are frozen* records
- [x] Validator messages live in one frozen vocabulary so their wording cannot drift independently during the Season
- [x] The complete invalid action is rejected and the violation message is appended to the same Entrant conversation for the Repair
- [x] An initial response plus up to three Repairs is allowed, with attempts-to-legal recorded as 0, 1, 2, 3 or failed
- [x] Every attempt records its raw response, violation kind or provider failure, latency, token counts and resolved endpoint metadata
- [x] A legal Repair stores the resulting Manager State and the number of Repairs used
- [x] A fourth invalid response stores no part of the proposed action and creates a Roll Over state
- [x] Roll Over retains the previous permanent Squad and Team Sheet, consumes no Chip, and accrues Free Transfers normally, including immediately after a Free Hit
- [x] A Rolled Over Gameweek is scored from the standing Team Sheet rather than forced to zero
- [x] Scripted HTTP responses exercise success at each Repair count and final Roll Over, while reducer behaviour remains pure

---

## Start all nine Entrants together

**What to build:** An operator can open the FPL track at any still-open Gameweek, but the
Season path begins only when all nine Base Models have produced legal opening states. The
opening is committed atomically so no Entrant can receive a shorter path than its peers.

**Blocked by:** Repair illegal actions, then Roll Over · Play Triple Captain and Bench Boost.

The Repair loop moved out of `open-fpl-gameweek.ts` into `ask-for-gameweek-action.ts` to make
this ticket possible: an opening cannot store its Manager State the moment it has one. The
extracted function records every attempt as it happens and returns what the conversation came
to, and the caller decides what to persist — which is the whole difference between a later
Gameweek and an opening, and the reason the three-Repair allowance is the same one rather than
a second copy of it.

`openFplGameweek` then stopped being able to open at all. It refuses an Entrant with no standing
Manager State, because seeding one from the empty Squad would store the earliest state the
Season has — the starting Gameweek by definition, for one Entrant of nine, with no way back
through an insert-only table. The roster size is checked against ADR-0014's nine for the
adjacent reason: which Entrants are missing is measured against the rows that were queried, so
a short roster reports nobody missing and starts a Season quietly without a Base Model.

- [x] The operator selects the starting Gameweek explicitly, and that Gameweek is visible in every Entrant's first Manager State
- [x] Exactly one FPL-track seat per Base Model is prepared from the same locked player pool and FPL Prompt Version
- [x] Calls may run concurrently and fail independently while their attempts remain attributable to the correct Entrant
- [x] Opening actions receive the same validation and three-Repair allowance as later actions
- [x] All nine legal opening actions are gathered before any opening Manager State is committed
- [x] The nine opening Manager States are inserted in one transaction; a persistence failure or missing legal action leaves none of them stored
- [x] If all nine are not legal before the Lock, attempts remain recorded but the track does not start and the operator may choose the next Gameweek
- [x] A Gameweek whose opening set is incomplete can never be mistaken for the track's starting Gameweek
- [x] Reference Lines are excluded and every participating Base Model has the same number of Manager State rows
- [x] Tests cover a complete opening, one invalid Entrant, one persistence failure and a delayed start in a later Gameweek

---

## Write the FPL demonstration record

**What to build:** Each settled Gameweek updates the FPL-track record with Gameweek and
cumulative points beside the behaviour that produced the path: Repairs, Roll Overs and typed
violations. The stored qualification makes clear that the ranking is a demonstration, not
evidence of Base Model superiority.

**Blocked by:** Start all nine Entrants together.

- [x] Every settled Gameweek stores `fpl_points` and `fpl_points_season_to_date` for each Entrant from the shared starting Gameweek onward
- [x] `repairs` stores Repairs used that Gameweek; `repairs_season_to_date` stores the mean per Gameweek with the 0/1/2/3/failed distribution in detail
- [x] `roll_over_rate` stores 0 or 1 for one Gameweek; `roll_over_rate_season_to_date` stores the cumulative fraction
- [x] `violation_profile` and `violation_profile_season_to_date` store total violation counts as values and their typed breakdowns in detail
- [x] Behavioural rows retain enough detail to trace every count to stored Manager States and attempts
- [x] Score rows name the Season, Gameweek, Entrant, FPL track and metric
- [x] Points-ranking detail carries the demonstration qualification wherever the ranking value is stored for later publication
- [x] A Gameweek before the shared starting Gameweek contributes nothing and cannot lengthen one Entrant's path
- [x] An unsettled Gameweek is skipped, while a settled zero-point Team Sheet remains a real scored result
- [x] Scoring is a pure function of stored Manager States, attempts and player points and performs no LLM or network call
- [x] Re-running upserts the same logical rows without duplicates or changed values
- [x] Tests verify Gameweek and cumulative totals plus behavioural metrics against a hand-constructed multi-Entrant sequence

---

## Run the FPL track under the shared Lock

**What to build:** The production runner requests one action per active Entrant each Gameweek
under the same deadline used by the Match track, stores the exact shared context, and safely
feeds the deterministic scorer once FPL points settle.

**Blocked by:** Write the FPL demonstration record.

Two migrations. **0013** widens `contexts_identity` to `(season, gw, track,
fpl_id, model_id)` so a Gameweek can hold one FPL context per Entrant, which is
what lets the whole roster play a Gameweek at all: from the second Gameweek
onwards every context carries its own Entrant's Squad, and the old key had room
for one of them. **0014** adds `fpl_runs`, the FPL scheduler's own ledger.

The two tracks share the `models` table and mark a competitor with
`role = 'entrant'` in both, so three Match-track queries had to start telling
them apart by Prompt Version. Until they did, seeding the nine FPL seats would
have stopped `predictGameweek` outright and reported every one of them as an
unexplained Gap.

- [x] The FPL action runner derives eligibility from the stored Gameweek deadline shared with the Match track
- [x] Every active Entrant sees its own prior Manager State and the same locked player pool for that Gameweek
- [x] The FPL context is stored once per Entrant per Gameweek with its body and hash before actions are committed — one row per Gameweek was this criterion's original wording and is sound only at an opening, where every Entrant is seeded from the same empty Squad
- [x] A pre-Lock run writes at most one Manager State per Entrant and Gameweek; repeated runs cannot replace an existing state
- [x] An action completed at or after the Lock is refused entry and the late attempt remains recorded
- [x] The existing schedule can run the FPL action path without changing Match-track Predictions or delaying their write path
- [x] The track remains inactive before its explicit starting Gameweek and joins without back-filling missed Gameweeks
- [x] Once player points become checked, the scoring path can be rerun independently of the action path
- [x] Production configuration follows the existing pinned-provider, concurrency and database conventions
- [x] Runner and configuration tests use injected HTTP and clock seams and never contact the live database

---

## Rehearse a full multi-Gameweek path

**What to build:** An operator can exercise the entire FPL track over archived player pools,
scripted Entrant actions and fabricated settled points in a throwaway Postgres, proving
persistence, recovery and scoring before any real Squad is managed.

**Blocked by:** Run the FPL track under the shared Lock.

- [x] The rehearsal builds a throwaway database through the production migration path and never opens the configured live database for writes
- [x] Archived FPL bodies satisfy the existing HTTP seam, and any unrecognised request is refused rather than reaching the network
- [x] All nine Entrants begin atomically at the same chosen Gameweek
- [x] The rehearsed sequence includes inaction, a paid Transfer, Selling Price, every Chip, a successful Repair and a Roll Over
- [x] At least one auto-substitution is constrained by formation and one absent captain promotes the vice-captain
- [x] Fabricated points are marked checked and produce hand-computed Gameweek and cumulative totals
- [x] The final output contains all nine Manager State paths, FPL points, Repairs, Roll Overs and violation profiles with the demonstration qualification
- [x] The rehearsal asserts expected rows and values rather than succeeding on completion alone
- [x] Repeating the rehearsal with identical inputs produces identical states, score values and details
- [x] The throwaway cluster is removed after success or failure, and the command exits non-zero on any incomplete path
