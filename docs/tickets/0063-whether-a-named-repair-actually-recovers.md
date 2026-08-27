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

**Status:** done — every box green 2026-08-28

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
- [x] A reading after 0062, comparable to the before-reading, recorded here with the
      command that produced it.

      **Settled by real `attempts` rows, not a pre-flight.** The authorised pre-flight run
      (`COMPETITION=BL1 SEASON=2026-27 FIXTURE_ID=565776 EXPECTED_ENTRANT_COUNT=10 npm run
      --silent preflight`) reproduced the before-reading's shape — nine seats `parseable`,
      Gemini not — and its `detail` field named the live defect correctly (`fixture_id` sent
      as the string `"565776"`, one of 0062's own three named shapes), confirming the message
      fires on a fresh response. It could not settle recovery: a pre-flight sends one ask and
      never Repairs. Reading `attempts` on 2026-08-28 found the real answer already sitting in
      production instead: both
      `BL1` Gameweek 1 and `PL` Gameweek 2 had been predicted for real — `trigger = 'main'`,
      `attempted_at` 2026-08-27T17:59–18:19Z — from this machine's local checkout of
      `a2284a8`, ahead of that commit reaching `origin/main` (pushed later, this same
      session). Not a run this ticket's own work triggered; found already there.

      ```sql
      select a.competition, a.gw, a.fixture_id, a.attempt_no, a.ok, a.error_kind,
             a.attempted_at,
             round((a.raw_response::jsonb->'usage'->>'cost')::numeric, 4) as cost
        from attempts a join models m on m.id = a.model_id
       where a.track = 'match' and m.role = 'entrant' and m.name = 'Gemini 3.1 Pro Preview'
         and a.competition in ('BL1', 'PL')
       order by a.attempted_at;
      ```

      **Every one of the 12 real failures since 0062 recovered on the very next attempt.**
      `BL1` GW1: Gemini failed `attempt_no = 0` on all 9 Fixtures (565776–565784) — a mix of
      `fixture_id` as a string and `probs`/`score` as arrays, same shapes 0062 named — and
      succeeded on `attempt_no = 1`, every time. `PL` GW2: 3 of 10 Fixtures (13, 16, 19) hit
      the same `schema` failure at `attempt_no = 0` and recovered at `attempt_no = 1`, every
      time. **12/12, one Repair each, no seat needed a second.**

      Contrast with `PL` Gameweek 1 (2026-08-20, before 0062, same seat): Fixture 6 needed a
      second separate run and 3 attempts within it before succeeding; Fixture 7 took 3
      attempts in one run; Fixture 9 failed a whole run outright and took 3 attempts in a
      second. The old generic sentence sometimes cost a seat every Repair it was given and
      still needed a retry; the named one has not yet cost a seat more than one.
- [x] The wasted-cost-per-seat query from the price report is re-run over the window that
      follows 0062, and its number is recorded beside the earlier $1.8975 — same query, two
      dates.

      **Re-run verbatim on 2026-08-28** (identical SQL to the price report, no date filter
      added — the table simply has more rows in it now):

      | Seat | Competition | Calls | OK | Validation failures | Wasted cost |
      | --- | --- | ---: | ---: | ---: | ---: |
      | Gemini 3.1 Pro Preview | `PD` | 54 | 13 | 36 | $0.8557 |
      | Gemini 3.1 Pro Preview | `SA` | 29 | 10 | 19 | $0.4282 |
      | Gemini 3.1 Pro Preview | `FL1` | 25 | 9 | 16 | $0.3574 |
      | Gemini 3.1 Pro Preview | `PL` | 33 | 18 | 13 | $0.3390 |
      | Gemini 3.1 Pro Preview | `BL1` | 18 | 9 | 9 | **$0.1999** |

      `PD`/`SA`/`FL1` are byte-for-byte the price report's own rows — no new Gameweek has run
      for them since, so they are the same $1.8975-worth of history, unchanged, not
      re-measured. `PL` grew (22 calls → 33, the GW2 rows above) because GW2 ran after
      0062; its wasted cost moved from $0.2562 to $0.3390, all of the growth being the 3
      GW2 failures at one Repair each. `BL1` is new: 9 calls, 9 failures, $0.1999 wasted,
      all recovered in one Repair. Nothing in the old four rows regressed; the two rows that
      grew since 0062 (`PL`, and the new `BL1`) both show the same one-Repair pattern.
- [x] The verdict is stated either way: recovered, partly recovered, or unchanged. If
      unchanged, the ticket names which of the price report's two remaining options it
      recommends and what deciding that would cost.

      **Recovered.** Every post-0062 validation failure observed in production — 12 of them,
      across two Competitions and two different Prompt Versions — turned into a Prediction
      after exactly one named Repair. The seat did not keep answering positionally once told
      what was wrong; the doomsday case this ticket flagged going in did not happen. Money is
      still spent on the first, wrong answer (this is unavoidable — the shape mistake ships
      before it can be named), but no seat has needed a second Repair or a retry run since
      0062, where it used to need both. Neither of the price report's two remaining options —
      a Repair budget or a seat-specific gate — is recommended: the sample is still small (12
      failures) and every one has resolved for the price of one extra call, which is the
      cheapest outcome either option was reaching for. Worth re-reading once a few more
      Gameweeks accumulate more failures, at no cost beyond the query above.
