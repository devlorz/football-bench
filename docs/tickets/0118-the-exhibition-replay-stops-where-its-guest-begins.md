# Ticket: The Exhibition replay stops where its Guest begins

**What to build:** when a Base Model holds a Guest row in a Competition, the Match
Exhibition replay of that Base Model covers only the Gameweeks before the Guest's first
Lock, and never asks a Fixture at or after it. A Base Model with no Guest replays exactly
as today. A replay the cap leaves with nothing to do says so and spends nothing. Spec:
[0029](../specs/0029-guest-seats.md). Decision:
[ADR-0064](../adr/0064-a-guest-seat-answers-at-the-lock-without-joining-the-roster.md),
amending [ADR-0032](../adr/0032-exhibition-runs-join-the-record-after-the-fact.md).

Decisions it must not bend:
- the cap is read off the record and never passed in: no environment variable, no range
  (ADR-0032);
- "the same Base Model" is `base_model`, never the dated snapshot;
- the FPL replay is untouched.

**Blocked by:** [0114](0114-a-guest-answers-at-the-lock-and-stands-nowhere-yet.md).
Independent of 0115–0117.

---

## What is already known

- **The first Lock is 0115's derivation:** `firstLockOf(seat, competition, season, from)`
  in `season-roster.ts`. It takes a lower bound `from`. The read API passes the Edition's
  first ranked Gameweek; the cap needs the Guest's first Lock across the whole Season, so
  pass the Season's first Gameweek (`1`), never an Edition's. A wrong `from` gives a wrong
  cap. It is null for a Guest no Lock asks (withdrawn before its first), which caps
  nothing.
- **What the cap prevents** is one Base Model answering one Fixture twice and paying
  twice, and a recall-tainted record growing beside a clean one. ADR-0065's top-up replay
  of Gemini 4 Argon's Exhibition rows depends on this cap. It is what makes running that
  replay more than once safe.
- **The replay already holds an advisory lock** and asks only unanswered Fixtures. The cap
  is one more filter on the Gameweeks it walks, beside the retired-Gameweek filter
  (ADR-0042).

## Acceptance

- [ ] With a Guest of the same Base Model, the replay covers only Gameweeks before the
      Guest's first Lock
- [ ] A Guest of a different Base Model, or in a different Competition, changes nothing
- [ ] With no Guest, coverage and calls are identical to today
- [ ] A replay left nothing to do makes no call and says so
