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

- [x] With a Guest of the same Base Model, the replay covers only Gameweeks before the
      Guest's first Lock
- [x] A Guest of a different Base Model, or in a different Competition, changes nothing
- [x] With no Guest, coverage and calls are identical to today
- [x] A replay left nothing to do makes no call and says so

## What was verified

- `test/replay-match-exhibition.test.ts`, "stopping where its Guest begins", with Gameweek 2
  played: a same-Base-Model Guest first asked at GW2 caps the replay to `[1]`, and Fixture 3
  is never sent and has no attempt or Prediction. A second Guest row of that Base Model (a
  new snapshot, first asked at GW3) does not lift the cap: the earlier first Lock wins.
  A played Fixture with `gw` 1 but `locked_in_gw` 2, holding a context in both Gameweeks,
  is never asked: it is the Guest's.
- A Guest of another Base Model, a same-Base-Model Guest at PD's Prompt Version, and one
  withdrawn before its first Lock together cap nothing: `[1, 2]`, `guestFromGw: null`.
- A Guest first asked at GW1 leaves `[]`, `guestFromGw: 1`. The stub throws on any call,
  and there are no attempts.
- No Guest: the existing 21 tests pass unchanged except for destructuring `{ gameweeks }`.
- Mutation: dropping `base_model`, dropping `prompt_version`, `from` 3 instead of 1, `<=`
  for `<`, `max` for `min`, and `f.gw` for `f.locked_in_gw` each fail at least one test.
- `guest-seat-coexistence` still passes.
- **Not tested:** the CLI sentence ("… before Gameweek N, where its Guest begins"), to be
  read by eye during 0121; and the retired-Gameweek filter together with the cap, which
  are independent filters.
- The return field is `guestFromGw`, which is the name agreed in the AskUserQuestion step.
  The review prompt had `capGw`. `guestFromGw` was kept because it matches `guest.fromGw` in
  the read API bodies.
