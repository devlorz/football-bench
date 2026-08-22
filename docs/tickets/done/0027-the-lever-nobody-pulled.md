# Ticket: The lever nobody pulled

**What to build:** an opening attempt on the FPL track with one seat called at a time,
made before any Base Model is withdrawn, so that the withdrawal list is decided against a
Base Model that was asked politely rather than against one that was asked in a ten-wide
burst. Source: [spec 0023](../../specs/0023-seven-seats-open-the-fpl-track.md), the Gate.

**Blocked by:** None — can start immediately.

**Status:** operator — a paid run, not agent-grabbable.

Three refusals on the evening of 2026-08-20 all went out ten seats wide, and the FPL job
configuration's own comment records that every timeout Gap of the earlier concurrency work
came from a ten-wide burst and none from pre-flight, which calls one seat at a time. Two of
the three failing seats returned nothing at all — no usage, no body, our own abort — which
is the shape a shared wait produces. That lever has never been pulled, it costs about half
an hour, and it stands in front of a decision that cannot be undone this Season.

The outcome decides the next ticket's central number and nothing else about it: if the two
silent seats produce a legal opening, the withdrawal is the reasoning seat's alone and the
FPL roster stands at nine. Every other decision downstream is written to be indifferent to
which it is.

- [x] Seats × Fixtures, the resulting call count and a rough cost are stated to the user,
      and the run does not start until they say yes. Killing it mid-flight recovers
      nothing, so the decision happens before the first call.
- [x] The opening runs with FPL concurrency at one, against the same Gameweek and the same
      frozen Prompt Version as the three refusals. Run on 2026-08-20, and it did not repeat
      them: **Qwen3.8 Max opened**, in 358,189 ms, having refused three times ten seats
      wide. GLM 5.3 and MiniMax M3 produced no legal opening, as before. The withdrawal
      list stayed at three all the same, because Qwen leaves on wall clock and not on the
      failure this run was testing for — a different ground, recorded as one in ADR-0047.
- [x] Each of the three failing seats has its outcome recorded — a legal opening, a
      timeout with its window, or a ceiling spent on reasoning with its token counts. Qwen
      opened at 358,189 ms called alone; GLM timed out at the full 600,017 ms; MiniMax spent
      32,000 of 32,000 on reasoning at 187,049 ms.
- [x] The withdrawal list is settled and written into ADR-0047, either confirming three
      seats or narrowing it to one, with the run that settled it named. **Three**, and the
      ADR now carries the one-at-a-time run and the prior latency report that agrees with
      it.
- [x] The run is reported under `docs/reports` in the shape the roster pre-flight reports
      take, so the next reader finds the measurement beside the decision —
      `2026-08-20-the-fpl-opening-called-one-seat-at-a-time.md`.

## Not in this ticket

Any code change at all. This ticket produces a fact and an amendment to a recorded
decision; the schema, the guard and the reads are the next ticket's.

Retrying the two silent seats a fourth time at ten wide. The point of the run is to change
one variable, and the ten-wide result is already on record three times over.
