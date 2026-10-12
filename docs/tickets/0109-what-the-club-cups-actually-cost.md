# Ticket: What the club cups actually cost

**What to build:** each club cup's real per-Fixture cost is read off its `attempts`
rows after its first settled predicted Gameweek. The figure replaces ADR-0063's $0.3003
ceiling (about $103 for the three league phases) in the price report and in ADR-0063's
*What it costs*, as ticket 0077 did for `UNL`.

Source: ADR-0063 *What it costs*, ticket 0077's method, spec 0028 story 79.

**Blocked by:** 0106, 0107, 0108, and each cup's first predicted Gameweek settled
(`UCL` 2026-10-14, `UEL` 10-15, `UECL` 10-22 at the earliest).

**Status:** ready-for-agent

---

## What is already known

- The ceiling is measured with ten seats. The cups seat eight with a different mix, which
  includes Claude Opus 5.5 at $20 per million output tokens, still unmeasured in output
  length.
- A 36-side table makes the packet larger than `UNL`'s, so the prompt side is expected to
  rise against `UNL`'s measured rate.
- The read uses production `attempts` through an npm script, not a one-off psql.

## Acceptance criteria

- [ ] Per cup: Gameweek, Fixtures, total cost and per-Fixture cost, read from `attempts` with the query recorded.
- [ ] ADR-0063's ceiling is replaced with the measured figure and the league-phase total re-derived.
- [ ] The price report gains a row per cup.
