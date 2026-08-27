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

- [ ] The spend is stated and authorised **before** any call: how many calls, against which
      Fixture, at what expected cost.
- [ ] A reading after 0062, comparable to the before-reading, recorded here with the
      command that produced it.
- [ ] The wasted-cost-per-seat query from the price report is re-run over the window that
      follows 0062, and its number is recorded beside the earlier $1.8975 — same query, two
      dates.
- [ ] The verdict is stated either way: recovered, partly recovered, or unchanged. If
      unchanged, the ticket names which of the price report's two remaining options it
      recommends and what deciding that would cost.
