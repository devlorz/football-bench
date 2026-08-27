# Ticket: Whether a named Repair actually recovers the seat

**What to build:** the measurement that says whether ticket 0062 worked. A Repair that
names the defect is a better sentence; whether it turns a wasted call into a Prediction is
a fact about one Base Model that only a real call can answer. **An operator ticket: it
spends money, and the spend is the operator's to authorise** — no implementing agent takes
it. Source:
[ticket 0062](0062-the-repair-that-names-nothing.md). Decisions:
[ADR-0010](../adr/0010-prompt-only-json-with-three-repairs-on-both-tracks.md), and the
[2026-08-25 price report](../reports/2026-08-25-five-league-price.md), which this ticket
gives a second reading of.

**Blocked by:** 0062 — there is nothing to measure until the Repair names something.

**Status:** ready-for-agent

---

## What is already known

Ticket 0062's replay proves the Repair *says* the right thing. It cannot prove the seat
*reads* it: the 84 archived bodies are answers to the original ask, and no archived bytes
exist for a Repair that has never been sent. The recovery rate is a property of the Base
Model, and the only instrument for it is a live call.

**The cheap instrument already exists.** A pre-flight asks one Fixture of the whole roster
— ten calls, roughly $0.30 at the rate the four open Competitions measure — and reports per
seat whether the answer was `parseable`. Run before 0062 it reproduces the failure; run
after, on the same Fixture, it says whether the named Repair changed the outcome. The
Bundesliga's own pre-flight on 2026-08-27 is the before-reading and is already recorded:
nine seats `parseable`, `Gemini 3.1 Pro Preview` `unparseable` with `score` an array.

**What a pre-flight cannot settle.** It sends one ask and does not Repair, so it measures
the first answer rather than the recovery. Reading recovery means either a path that
exercises the Repair turn directly, or waiting for scheduled runs to accumulate `attempts`
rows under the new message and re-reading the wasted-cost query the price report already
publishes. The second costs nothing extra and answers over more Fixtures; it is slower, and
that is the whole trade.

**One outcome is a real possibility and must not be written up as a disappointment.** The
seat may keep answering positionally however clearly it is told not to. If it does, that is
the finding the price report's two options — a Repair budget, or a seat-specific gate — were
waiting on, and this ticket's job is to say so plainly rather than to keep spending.

## Acceptance

- [x] The spend is stated and authorised **before** any call: how many calls, against which
      Fixture, at what expected cost. **Stated to the operator 2026-08-28: whole-roster
      pre-flight, `BL1` Fixture 565776 (Bayern v Stuttgart), 10 seats, ~$0.30. Authorised
      before the call ran.**
- [ ] A reading after 0062, comparable to the before-reading, recorded here with the
      command that produced it.

      **Partial — recorded, but does not settle recovery.** Run 2026-08-28, local
      checkout at `a2284a8` (0062 is committed but not pushed, so this reading only holds
      for calls made from this machine, not for `predict.yml`'s scheduled runs, which run
      whatever is on `origin/main`):

      ```bash
      set -a; . ./.env; set +a
      COMPETITION=BL1 SEASON=2026-27 FIXTURE_ID=565776 EXPECTED_ENTRANT_COUNT=10 \
        npm run --silent preflight
      ```

      Same shape as the before-reading: nine seats `parseable`, `Gemini 3.1 Pro Preview`
      `unparseable`. The specific defect this call hit was different from the before-
      reading's (`score` an array) — this time `fixture_id` came back as the string
      `"565776"` instead of the number — but that shape is already on 0062's own record (18
      of the 84 archived rows were exactly this). The pre-flight's `detail` field, which
      reads through 0062's `validatePrediction()`, named it correctly: *"fixture_id must be
      the number 565776 — return exactly that value."* That is live confirmation the named
      Repair fires correctly against a fresh, previously-unarchived Gemini response — not
      just against the 84 archived bodies ticket 0062 replayed.

      **What this does not show.** A pre-flight sends one ask and does not Repair (stated
      going in, box acceptance above). The `detail` string is the message *that would be
      sent* as the Repair; whether Gemini actually corrects itself on seeing it is
      untested by this call. Recovery itself is still unmeasured.
- [ ] The wasted-cost-per-seat query from the price report is re-run over the window that
      follows 0062, and its number is recorded beside the earlier $1.8975 — same query, two
      dates.

      **Not yet possible.** 0062 is unpushed; no `attempts` rows exist anywhere under the
      new Repair message. This box waits on either a scheduled run after 0062 reaches
      `origin/main`, or a manual run that writes to production (which `preflight` and
      `predict:preview` do not — the first makes no write, the second writes to a throwaway
      database dropped with the process).
- [ ] The verdict is stated either way: recovered, partly recovered, or unchanged. If
      unchanged, the ticket names which of the price report's two remaining options it
      recommends and what deciding that would cost.

      **Not yet — blocked on the box above.** Two live paths remain, both costing more than
      this ticket has spent so far and both needing a fresh authorisation:
      1. `predict:preview` for `BL1` Gameweek 1 (real Entrant calls, throwaway DB, the
         Season's own Predictions untouched) — the whole Gameweek, not a single Fixture:
         all 9 Fixtures × 10 seats, plus any Repairs Gemini's seat draws. At the price
         report's ~$0.30/Fixture this roster runs, roughly $2.70–$3.00 before repair
         overhead. This is the only path that actually exercises the Repair turn today.
      2. Push 0062 and let the real scheduled run answer it for free — `BL1` Gameweek 1's
         own Lock is close (deadline `2026-08-28T17:00:00.000Z`, `predict.yml`'s due window
         opens at deadline − 6h); missing it means waiting for Gameweek 2 instead.
