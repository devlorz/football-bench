# Ticket: The scoring rehearsal plays out a Gameweek of this Season again

**What to build:** `npm run match:rehearse` once more plays an archived Gameweek of the
current Season through the whole Match track and passes. That means the dry run writes
contexts and Predictions, the scripted results settle the Gameweek's Fixtures, and the
production scorer writes a record the verifier accepts. Today it writes nothing and
fails, and it has failed since before ticket 0090 changed the scorer. So the only
end-to-end check of the scorer against real archived bytes is silent.

**Blocked by:** None — can start immediately. Found while reviewing ticket 0090, whose
`match:rehearse` box stays unticked on this.

**Status:** ready-for-agent. The cause is read off the code below and fits every line of
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

## Acceptance

- [ ] The cause above is confirmed by a run, or corrected in this ticket.
- [ ] The replay is loaded at an instant before the rehearsed Gameweek's deadline, not at
      the archive's observation instant. `npm run match:rehearse` then passes for a
      settled PL Gameweek of 2026-27 named by `GAMEWEEK`, with the verifier's checks
      unchanged in strength.
      - The scripted results settle that Gameweek's own Fixtures, still as scorelines a
        person chose rather than ones derived from the Fixtures.
      - The verifier still requires every one of them to settle.
- [ ] A rehearsal pointed at a Gameweek whose Lock owns no Fixture, or whose Fixtures the
      script does not settle, fails and says which, rather than printing a full list of
      missing metrics.
- [ ] The rehearsal names its Competition from `COMPETITION` like the other commands, or
      this ticket records why PL alone is enough.
- [ ] The command's output says that the packets were built from bytes newer than the
      Gameweek's Lock, so they prove the path and not what an Entrant would have seen.
      At least the Availability section is affected, and the Head Coach state rows once
      the stamp question above is checked.
- [ ] The command stays read-only against the configured database, and writes only to
      its throwaway cluster, as it does now.

## What this ticket does not do

- **Change how the fetch Locks a late-listed Fixture.** That is correct for production.
  Only the replay into an empty database misreads it.
- **Rehearse the backfilled 365Scores rows.** The dry run cannot replay those (ADR-0058,
  amended 2026-09-23). That is a separate amendment.
- **Change the scorer.**
