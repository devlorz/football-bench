# Ticket: A Competition adopted mid-Season names its first asked Lock

**What to build:** the Europa League's leaderboard, before its first Gameweek is scored,
names its next Lock as Gameweek 2, 2026-10-15T15:15Z. Today it names Gameweek 1,
2026-09-16T15:15Z, a Lock that passed before any seat was entered. The leagues', the
Nations League's and every Edition's pre-season Lock stays what it is today. The
Conference League, which opens the same way, gets the same answer.

Source: found on production 2026-10-14, after the dashboard deploy that first served
`UEL`. It is the second half of ticket 0112.

Decisions it must not bend:
- ticket 0112's rule: the first Gameweek a Competition's seats are asked at is the first
  of the ranked range whose Lock is at or after the earliest entry under its Prompt
  Version;
- the leaderboard comment's own reasoning for using the earliest Gameweek rather than
  the clock: a Season whose first deadline has passed and whose scoring run has not
  landed must still name a date;
- the policy-from-data rule.

**Blocked by:** None — can start immediately. It is display only, so the Lock, the
Predictions and the scoring are untouched.

**Status:** built 2026-10-14, not yet deployed. The last box waits on the dashboard deploy.

---

## What is already known

- **The leaderboard's pre-season Lock is the Edition's earliest ranked Gameweek.** That
  is Gameweek 1 for a cup that adopted its `MD1` as Locked history (ADR-0063). `UCL`
  showed the same thing until its Gameweek 2 was scored, at which point the field goes
  null.
- **The rule this ticket needs is 0112's**, and it now lives in two queries: the seat
  query and the pre-season Lock. Changing one without the other would put a seat on
  the page at one Lock while the page names another. This is the forced
  simultaneous-edit case, so the condition becomes one shared fragment that both
  queries use.
- **A Competition with no entered seat** keeps today's answer, the earliest Gameweek,
  rather than none.

## Acceptance criteria

- [x] A Competition whose seats were entered after Gameweek 1's Lock names Gameweek 2's Lock on its pre-season leaderboard. The suite proves it: the adopted-mid-Season case fails without the fix and passes with it.
- [x] Every existing read-API suite passes unchanged. This includes the seeded pre-season Lock and the Edition-boundary cases. Eight suites passed, 121 of 121, and `tsc` is clean.
- [x] The seat query and the pre-season Lock read one shared condition, `askedFrom` in the read API. Read against production in a read-only transaction before the deploy:
      - `UEL` names Gameweek 2 at 2026-10-15T15:15Z;
      - `UCL`, `UNL`, `PL` and `PD` have scored Gameweeks and name none;
      - `UEL`'s Gameweek 2 still has 18 Fixtures × 8 slots.
- [ ] After the deploy, production's `/api/uel/leaderboard` names `{ gw: 2, deadlineAt: 2026-10-15T15:15:00.000Z }` until Gameweek 2 is scored.
