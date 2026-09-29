# Ticket: The scoring rehearsal plays out a Gameweek of this Season again

**What to build:** `npm run match:rehearse` once more plays an archived Gameweek of the
current Season through the whole Match track and passes. That means the dry run writes
contexts and Predictions, the scripted results settle the Gameweek's Fixtures, and the
production scorer writes a record the verifier accepts. Today it writes nothing and
fails, and it has failed since before ticket 0090 changed the scorer. So the only
end-to-end check of the scorer against real archived bytes is silent.

**Blocked by:** None — can start immediately. Found while reviewing ticket 0090, whose
`match:rehearse` box stays unticked on this.

**Status:** done 2026-09-29. `npm run match:rehearse` passed for Gameweeks 1 and 4 against
the archive observed 2026-09-28T13:23:19Z: 10 of 10 settled, 10 contexts, 247 score rows.
Was: ready-for-agent. The cause is read off the code below and fits every line of
the observed output, but it has not been confirmed by a run; the first box does that.
The operator chose option 2 on 2026-09-26.

---

## What is already known

**The failure, run by the operator on 2026-09-26** with `GAMEWEEK=1`: archive of 699
snapshots observed 2026-09-26T06:33:08Z, "10 of 10 Fixtures settled, 0 contexts, 0
Predictions", "Score rows: 0".

- Every Entrant is missing every metric.
- Every Reference Line is missing its rows too, which no missing Prediction can explain.
- "9 comparisons expected, 0 published".

The same shape was seen on 2026-09-25 for Gameweeks 1, 4 and 5, at `8987b01` and after
ticket 0090.

**The cause, read off the code.** The dry run loads the archive into an empty database at
the archive's own observation instant, and that instant is now long after Gameweek 1's
deadline. The FPL fetch gives a Fixture it first sees after its deadline a Lock in the
*next open* Gameweek: that is how a real Fixture listed late is Locked. In an empty
database every played Fixture is being seen for the first time, so all of them are Locked
into the next open Gameweek, and none into its own.

What follows from that:

- **0 contexts.** The prediction path selects the Gameweek's Fixtures by their Lock,
  falling back to their scheduled Gameweek only when they have none, so it finds none for
  Gameweek 1.
- **Nothing scored, the Reference Lines included.** The scorer returns before opening a
  transaction when the asked Gameweek's Lock owns no Fixture. That is the only path that
  also skips the Reference Lines.
- **10 settled anyway.** The scripted results are written by Fixture id, whatever the
  Fixture's Lock is.

The rehearsal was written (2026-07-30, scored 2026-08-08) against a pre-season archive,
observed before Gameweek 1's deadline, where this could not happen. It broke when the
archive's newest bytes passed the first deadline, not when any code changed.

**Two more things fixed to that first archive:**

- **The scripted results are keyed by Fixture ids 1–10**, which are Gameweek 1's. A
  rehearsal of any other Gameweek settles none of them, and the verifier requires ten.
  The scorelines were chosen by hand so the verifier cannot agree with itself; that
  property must survive whatever replaces the keys.
- **The Competition is always `PL`.**

## The choice

**Chosen on 2026-09-26: option 2.** It changes only the instant the replay is loaded at.
Option 1 would change how the archive is loaded, and option 3 gives up the one end-to-end
check against real bytes. The other two are kept below as the record of what was weighed.

1. **Rehearse the archive's next open Gameweek**, the one the archive really is observed
   before. The replay still Locks every played Fixture into that same Gameweek, so its
   Lock owns the whole Season so far. The replay would have to leave those Fixtures in
   their own Gameweeks, for instance by loading in two steps. That is a change to how the
   archive is loaded, not to the fetch.
2. **Load the replay at an instant before the rehearsed Gameweek's deadline** instead of
   at the archive's instant. This is closest to what the rehearsal did when it worked.
   The bytes are still the newest ones. The Match context loader was read on 2026-09-26
   to see how much of that reaches a PL packet:
   - **Bounded by the deadline:** historical results, Understat xG, Squad Changes and
     Head Coach Changes. These are bounded in the query, or by the renderer on
     `dated_on`.
   - **Not bounded:** the Availability section. It reads the `fpl_players` partition of
     the Gameweek as the fetch wrote it: status, news, chance of playing and price, taken
     from the newest bootstrap. Nothing filters it by time.
   - **Probably stamped at replay time (not checked):** the Head Coach state rows are
     bounded by `observed_at < deadline`. If the replay stamps them at its own instant,
     their contents are the newest while their stamp is early, so a later appointment
     would pass as known.

   So the packets carry an injury list from weeks after the Lock. The rehearsal's
   verifier checks the record's shape and not forecast quality, so it still proves the
   plumbing. The command's own output has to say so, not only this ticket. The
   prediction path selects by Lock and `kickoff_at > now`, never by `result`, so
   Fixtures that already carry a result from the newest bytes are still asked.
3. **Record the rehearsal as retired** in favour of the equivalence suites (tickets 0090,
   0089), if neither of the above is worth its cost.

## What the run found (2026-09-27 to 2026-09-29)

All of it against one archive, observed 2026-09-28T13:23:19Z, unless a line says otherwise.

- **The cause is confirmed on the mechanism, not only by the fix.** The archive was
  replayed into a throwaway database twice and `fixtures` read back. Loaded at the
  archive's instant, all 50 Fixtures of Gameweeks 1–5 had `locked_in_gw = 6`. Loaded just
  before the first deadline, none was Locked. The operator's failing runs (09-25, 09-26)
  used earlier archives, so they are the symptom and not this evidence.
- **The replay loads before Gameweek 1's deadline, not the rehearsed Gameweek's.** If it
  loaded just before Gameweek N's deadline, Gameweek N would be the next open one, and every
  earlier Gameweek's Fixtures would Lock into it. Before the first deadline no Fixture is
  Locked. The prediction path then Locks the rehearsed Gameweek's own Fixtures
  (`attempt-match-calls.ts`). The run for Gameweek 4 settled exactly Fixtures 31–40.
- **The verifier compares the Lock with the schedule.** The run Locks only the Fixtures it
  tries to predict. So it requires every Fixture whose `gw` is the rehearsed Gameweek to
  be under its Lock, and every Locked one to be settled, and names the ids that are not.
- **A second cause, not foreseen above.** With contexts back, every Entrant Gapped every
  Fixture with `schema`. The replay answers each Base Model with its newest archived
  preflight. The archive keeps one preflight per Base Model, whatever the Competition,
  and by 2026-09-27 eight of the ten Match seats' preflights named Fixture 565776 and two
  named PL Fixture 32. The fixture-id guard in `validate-prediction.ts` refuses all of
  them.
  - The operator chose on 2026-09-27 to rewrite `fixture_id` to the Fixture asked, read
    off the prompt's `Fixture ID:` line, **in the scoring rehearsal only**. The rehearsal
    prints the rewrite under "Fabricated results".
  - The dry run keeps replaying answers as recorded. Its expected outcome is built on
    "each Entrant can only answer the one Fixture its archived response names", and its
    run still exercises that guard.
  - A consequence: **each Entrant gives the same probabilities and the same scoreline on
    every Fixture**. The record proves the scorer's plumbing over ten Fixtures, not
    anything about an Entrant's forecasting.
- **What the post-Lock bytes put in the packets**, read off the Gameweek 1 and 4 packets:
  - **Current-Season results played on the Lock's own day, the Fixture's own among them.**
    The Gameweek 1 packet for Arsenal v Coventry lists "Arsenal 3-0 Coventry" dated
    2026-08-21. The context bounds `historical_matches` by `played_on < deadline`, and a
    `date` compared with a `timestamptz` is midnight, so the whole deadline day passes.
    In production those rows do not exist yet when the context is built. Only the replay
    of newer bytes can supply them. The context builder is unchanged.
  - **Head Coach state**, stamped at the replay's instant (`fetch-head-coach-changes.ts`)
    with the newest contents. The replay writes it only for Gameweek 1's partition, so
    Gameweek 4's packet reads "no Head Coach is readable".
  - **Not Availability**, against what this ticket expected. The fetch writes the
    `fpl_players` partition of the bootstrap's `is_next` Gameweek (6 in this archive),
    so both packets read "unavailable because no snapshot was loaded".

## Acceptance

- [x] The cause above is confirmed by a run, or corrected in this ticket.
- [x] The replay is loaded at an instant before the rehearsed Gameweek's deadline, not at
      the archive's observation instant. `npm run match:rehearse` then passes for a
      settled PL Gameweek of 2026-27 named by `GAMEWEEK`, with the verifier's checks
      unchanged in strength.
      - The scripted results settle that Gameweek's own Fixtures, still as scorelines a
        person chose rather than ones derived from the Fixtures.
      - The verifier still requires every one of them to settle.
- [x] A rehearsal pointed at a Gameweek whose Lock owns no Fixture, or whose Fixtures the
      script does not settle, fails and says which, rather than printing a full list of
      missing metrics.
- [x] The rehearsal names its Competition from `COMPETITION` like the other commands, or
      this ticket records why PL alone is enough.
      - PL alone: the load instant is read off the archived FPL bootstrap's deadlines.
        Another league's deadlines are derived from kick-offs by the fetch itself
        (`derived-deadline.ts`), so nothing holds them before the load. A second league
        needs that derivation read first, and it belongs to that league's own ticket.
- [x] The command's output says that the packets were built from bytes newer than the
      Gameweek's Lock, so they prove the path and not what an Entrant would have seen.
      At least the Availability section is affected, and the Head Coach state rows once
      the stamp question above is checked.
      - Checked: results from the Lock's own day and the Head Coach state are affected;
        Availability is not, because it is empty. The output names the first two.
- [x] The command stays read-only against the configured database, and writes only to
      its throwaway cluster, as it does now.

## What this ticket does not do

- **Change how the fetch Locks a late-listed Fixture.** That is correct for production.
  Only the replay into an empty database misreads it.
- **Rehearse the backfilled 365Scores rows.** The dry run cannot replay those (ADR-0058,
  amended 2026-09-23). That is a separate amendment.
- **Change the scorer.**
