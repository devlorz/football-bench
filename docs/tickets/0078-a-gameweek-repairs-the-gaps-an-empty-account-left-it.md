# Ticket: A Gameweek repairs the Gaps an empty account left it

**What to build:** one migration that moves La Liga Gameweek 6's Lock out by
seventy-five minutes — 2026-09-15 15:30Z to 16:45Z — so that the forty Gaps its two
scheduled runs left behind can be repaired by a `fill` before any of its Fixtures are
played. The Gaps are a funding failure, not a modelling one: eighty-three calls that
morning came back HTTP 402 `in_flight_budget_exhausted` and never reached a provider.
The repair run is a `fill` on purpose, because a `fill` reads the `contexts` rows stored
at 09:39Z rather than building new ones — so every seat, whenever it answers, reads the
same bytes, and no Prediction has to be withdrawn to keep the comparison honest.
Decisions this touches:
[ADR-0036](../adr/0036-a-new-competitions-schedule-results-and-lock-come-from-football-data-org.md)
(amended 2026-09-15 by this ticket — the second hand-set Lock in the benchmark, against
that file's own "not a precedent" sentence, with the narrow condition that makes it
defensible stated there), migration 0025's frozen deadline (lifted once, inside the
migration, and restored by it), [ADR-0006](../adr/0006-one-lock-per-gameweek-at-the-fpl-deadline.md)
(the whole-Gameweek Lock this repair leaves intact, because the cut-off Entrants share is
the stored context, not the clock).

**Blocked by:** None — and it could not wait. The migration had to be applied, and the
repair run finished, before 2026-09-15 16:45Z: past that instant the Lock check in
`attempt-match-calls.ts` refuses an Entrant whatever trigger asks it, and the migration
refuses to write a deadline already in the past.

**Status:** done — migration applied and repair run complete 2026-09-15 16:01Z. The
ADR amendment and this ticket were written after the fact, the clock having decided the
order. Box 6 is the operator's and is still open.

---

## What is already known

**What the two scheduled runs did.** Read 2026-09-15 15:45–15:52Z against production.
Both completed; neither failed.

| run | window | calls | ok | cost |
| --- | --- | --: | --: | --: |
| `main` | 09:39–09:48Z | 49 | 43 | $1.28 |
| `fill` | 13:36–13:41Z | 48 | 9 | $0.35 |

Of their ninety-seven calls, **eighty-three returned HTTP 402** with
`"reason": "in_flight_budget_exhausted"` — "this request would exceed your available
credits given your current in-flight requests". The OpenRouter account held $10.43 of
its $110 topped up; OpenRouter reserves against concurrency × the 32,000-token output
ceiling rather than against expected spend, and ten concurrent calls reserve more than
that. The weekly key limit was not the cause — it had been raised to $25 and $23.26 of it
remained. The rest of the failures were ordinary: five schema, two timeout.

The Gameweek held **60 Predictions of 100**, and only three of its ten Fixtures had the
full roster. Per-Fixture, at 15:52Z:

| Fixture | kickoff | Predictions |
| --- | --- | --: |
| Real Sociedad–Celta | 09-03 19:00Z | 8 |
| Rayo–Espanyol | 09-15 17:00Z | 10 |
| Alavés–Valencia | 09-15 18:00Z | 10 |
| Elche–Real Madrid | 09-15 19:30Z | 9 |
| Deportivo–Sevilla | 09-16 17:00Z | 10 |
| Atlético–Osasuna | 09-16 17:00Z | 1 |
| Levante–Athletic | 09-16 19:30Z | 3 |
| Barcelona–Racing | 09-16 19:30Z | 2 |
| Betis–Getafe | 09-17 17:00Z | 1 |
| Málaga–Villarreal | 09-17 19:30Z | 6 |

**Why 16:45Z and nothing later.** The earliest kickoff still ahead was Rayo–Espanyol at
17:00Z. A Lock at or after that instant would put a Fixture's Lock behind its own
kick-off, which is the one promise this ADR does not bend; 16:45Z is the latest quarter
hour that stays clear of it. The Fixture that pays for it holds all ten Predictions
already and was never asked again, so the fifteen-minute margin it is left with buys no
seat a minute of news — but it is fifteen where the rule derives ninety, and that is
recorded in the amendment rather than here.

**Why a `fill` and not a fresh ask.** `predictGameweek` builds a context only on `main`;
on `fill` it loads the stored row (`loadStoredContext`). The Match context is also built
`as of` the Lock over stored data alone — it reaches no live source at call time. So the
repair puts the identical question to the seats that failed, and the Paired Differences of
ADR-0011 stay computed over seats that answered the same text. Had the repair rebuilt
contexts, the seats that failed would have answered a better-informed question than the
seats that succeeded, and the honest fix would have been the one the 2026-09-03 amendment
took: withdraw everything and ask again. That would have cost roughly $3 more and a third
exception to ADR-0013's insert-only rule in a fortnight.

**What cannot be repaired.** Real Sociedad–Celta was played on 2026-09-03.
`predict-gameweek.ts` guards its work query with `f.kickoff_at > now()`, so a Fixture
whose kickoff has passed is never queued for an Entrant again. The two seats that Gapped
it on the 3rd — Gemini 3.1 Pro Preview and Qwen3.8 Max, both `provider` failures — Gap it
for the rest of the Season. The gap alert names them after the repair all the same,
because it reports the Gameweek's Gaps, not the ones the last run could have reached.

**What is not built.** No change to the scheduler, to `deriveDeadline`, to the Lock check,
or to any run's concurrency default. No Prediction deleted, no `locked_in_gw` touched, no
context rebuilt or removed. Migration 0041 is not amended — its comment was true of the day
it was written.

## Acceptance

- [x] **Migration `0044`**, one transaction: share-lock `gameweeks` and `fixtures`; read
      the stored deadline and the ten Fixtures Locked into Gameweek 6; return as a no-op
      when neither exists, so a fresh clone and every throwaway schema in the suite still
      migrate; raise if `now()` is at or after 16:45Z, if the stored deadline is not the
      2026-09-15 15:30Z that 0041 wrote, if the Fixture count is not ten, or if the
      earliest kickoff still ahead — read off the record, not typed — is at or before the
      instant about to be written; then lift
      `gameweek_deadline_is_immutable_once_committed`, write 2026-09-15 16:45Z, and
      restore it. The four `gameweek_deadline_preserves_*_lock` triggers are not lifted
      and pass unaided: each refuses a deadline moved to at-or-before a stored
      observation, and Gameweek 6's were observed 2026-09-03 06:23Z, which this move
      recedes from. Committed as `d6b3698`.
- [x] **The migration's header comment tells the whole story**, in the voice of 0025's,
      0037's and 0041's: what the 402s were and what caused them, why eight Fixtures were
      still reachable, why 16:45Z and not later, why a `fill` leaves the comparison
      undisturbed, which two Gaps are permanent, which rule is lifted and that it is
      restored inside the transaction, and what the daily fetch does with the new instant
      before and after tonight's Fixtures settle.
- [ ] **Rehearsed on a copy — not done, and why.** The clock did not allow it: the fault
      was read at 15:45Z and the Lock the migration had to beat was 16:45Z, with a
      `pg_dump` of production and a restore taking a material part of that hour on the
      last attempt (ticket 0068, box 5). The migration was applied to production directly,
      with its four guards as the whole of its protection. Recorded here as the corner
      that was cut, not as a box that passed: every other migration in this record was
      rehearsed first, and the next one should be.
- [x] **Applied, and the repair run finished, inside the window.** `npm run db:migrate`
      at 15:56Z, then `COMPETITION=PD GAMEWEEK=6 PREDICTION_TRIGGER=fill npm run predict`
      running 15:57–16:01Z: forty-six calls, thirty-eight Predictions, $1.14, no 402 —
      thirty-eight of the forty Gaps closed, fifty-nine minutes before the first kick-off
      and forty-four before the new Lock. The other eight calls were seven schema and one
      `probs_sum`, every one of them Repaired. Read back at 16:08Z: nine of the ten
      Fixtures hold all ten Predictions, Real Sociedad–Celta holds eight, the Gameweek
      holds 98 of 100, and `gameweeks` reads `2026-09-15 16:45Z`.
- [x] **ADR-0036 is amended, dated 2026-09-15, by this ticket.** The banner records the
      funding failure and its numbers, why the repair does not disturb what ADR-0006
      guarantees, what was decided, and the four costs: the fifteen-minute margin, the
      spent buffer, the two permanent Gaps, and the precedent — including the narrow
      condition under which this may be done again. The 2026-08-15 banner's "not a
      precedent" sentence is quoted and knowingly overruled once rather than deleted.
- [ ] **The test lists carry `0044`, committed alongside the Nations League work.** Both
      `test/migrations.test.ts` (two lists) and `test/rehearse-migration.test.ts` (three)
      name every migration filename, and the new line sits in the same hunk as migration
      `0043`'s, which belongs to the Nations League work still uncommitted in the tree.
      Splitting them would commit half of that work, so the five edits wait and travel
      with it. Until then `HEAD` holds a migration its test lists do not name.
- [ ] **The account is funded before 2026-09-18.** This is the box the whole ticket exists
      because of. The balance after the repair is **$9.30**, and the five Gameweeks Locking
      on 2026-09-18 cost about $16 between them, plus whatever OpenRouter reserves against
      ten concurrent calls at the output ceiling — the reservation, not the spend, is what
      failed here. Lowering `PREDICT_CONCURRENCY` shrinks the reservation and is the lever
      if funding is ever tight again; it is not a substitute for a funded account. No
      Gameweek after this one has eight unplayed Fixtures and an hour of slack to be
      rescued in.
