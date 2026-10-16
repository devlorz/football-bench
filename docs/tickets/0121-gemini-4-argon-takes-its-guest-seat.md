# Ticket: Gemini 4 Argon takes its Guest Seat

**What to build:** nothing in code. Gemini 4 Argon is asked at every Lock of all nine
Competitions from the first Lock after its rows are inserted. Its Exhibition rows end at
the Gameweek before that Lock, with no hole and no overlap. Its first Lock is written back
into ADR-0065. Decision: [ADR-0065](../adr/0065-gemini-4-argon-is-the-first-guest-seat.md).
Spec: [0029](../specs/0029-guest-seats.md).

**Blocked by:** [0114](0114-a-guest-answers-at-the-lock-and-stands-nowhere-yet.md),
[0118](0118-the-exhibition-replay-stops-where-its-guest-begins.md). The pages (0115–0119)
are not blockers. Argon's live record starts accruing before anything shows it, and that
is chosen: every week waited is a week of clean answers not collected.

---

## What is already known

- **Paid calls are asked for, each time.** The agent states the call count and the price
  and waits; it never starts them. The auto-mode classifier has also denied paid runs after
  approval, so the operator runs them from the commands handed over:
  - the four cup pre-flights: 4 calls, about $0.03;
  - the top-up replay: one call per league Fixture played between the Exhibition rows' last
    Gameweek and the Guest's first Lock, at about $0.007 each.
- **The scheduled run uses `origin/main`, not the local checkout.** Check how far it is
  behind before inserting a row it would call. It has drifted behind more than once.
- **Production writes are the operator's.** The classifier denied the agent's insert of
  the Exhibition rows on 2026-10-14. Hand over the SQL, as
  `docs/queries/gemini-4-argon-exhibition-rows.sql` was.
- **The Exhibition rows end at** PL, SA and FL1 GW6, BL1 GW5 and PD GW8. PD Fixtures
  564636, 564679 and 564697 are Gaps from a 429, and stay Gaps.
- **A 429 on a fresh Base Model is a permanent Gap** for the replay. Run the top-up at a
  lower `PREDICT_CONCURRENCY`, for example 4.
- **The cups have no Exhibition rows.** The Guest is their only record of Argon.

## Acceptance

- [x] `origin/main` carries 0114 and 0118 before any Guest row exists. *`975fd12` was
      pushed at 2026-10-16 09:33Z, and the first Guest row was inserted at 09:35:27Z.*
- [ ] Four pre-flights, one each in UNL, UCL, UEL and UECL, were approved, run, and
      `parseable` against `google/gemini-4-argon-20261013` through Google
- [ ] Nine Guest rows inserted by the operator, read back, with the SQL kept under
      `docs/queries/`. *Five of nine so far: the leagues, from
      `docs/queries/gemini-4-argon-guest-rows.sql`. The cups follow their pre-flights.*
- [ ] ADR-0065 amended with each Competition's first Lock. *The leagues' are in, amended
      2026-10-16. The cups' go in when their rows are inserted.*
- [x] ~~The top-up replay was approved and run.~~ Not needed. Each league's Exhibition
      coverage already ends at the Gameweek before its Guest's first Lock: BL1 GW5 → GW6,
      PL/SA/FL1 GW6 → GW7, PD GW8 → GW9. The cups have no Exhibition rows. No paid run was
      made.
- [ ] After the first Lock: every Fixture asked, the attempts in the ledger under the
      scheduled trigger, and no Gap alert raised by a Guest Gap
- [ ] The roster's figures for that Gameweek are unchanged by the Guest rows (the 0114
      assertion, read on production)
- [ ] Once 0115–0119 are deployed: the surfaces show Argon labelled, combined by default,
      and split on `?rows=split`. Includes, by eye, what 0115 tested only at the body: the
      ranking row reads "Guest · from GW N · n = … · Gap rate …%", and a closed Edition's
      page looks as it did
