# Ticket: Jev answers its first Fixture, and then a Competition

**What to build:** nothing in code. The operator inserts the Exhibition row for
`jev-latest`, pre-flights it against one played Fixture to learn the three things the
docs do not say — price, rate limit, and whether a stored context fits in `state` — and,
if all three allow it, replays it over one Competition's played Fixtures. The outcome is
a report in `docs/reports` in the shape of the pre-flight reports already there, and
either an Exhibition Run standing labelled on that Competition's rankings or a one-line
closure of ADR-0059 saying which of the three stopped it. Source:
[ADR-0059](../adr/0059-an-exhibition-run-may-answer-through-a-typed-endpoint-instead-of-a-chat-one.md);
door: [ADR-0032](../adr/0032-exhibition-runs-join-the-record-after-the-fact.md);
procedure: [a new Base Model arrives](../runbooks/a-new-base-model-arrives.md), sections
3 and 6.

**Blocked by:** 0079 — the wire does not exist before it.

**Status:** drafted, 2026-09-18

---

## What is already known

**Every step here spends money, and every step is the operator's.** The project's rule
on paid runs applies to the pre-flight and the replay alike: the agent states the call
count and the price and waits; it never starts either. The call count of a replay is one
per played Fixture in the Competition named, with no Repair chain behind it. The price
per call is not in TypeSafe's documentation and has to come from the account or the
first pre-flight's `usage` against the plan's rate.

**The row first, the pre-flight second, the replay last, and each may be the last.**
The runbook's section 3 is the shape: insert the row, aim the single-model pre-flight at
one Fixture, read the report. Three readings decide whether to go on:

- a 401 is a key problem and not this ticket's;
- a 422 on the `state` — a stored context is several thousand tokens of text — ends
  ADR-0059 at "the state does not fit", and the row is deleted;
- a parseable answer with `usage` gives the per-call cost, which times the Fixture count
  is the number the replay's permission request states.

**Which Competition.** The Premier League has the most played Fixtures and the most
seats to stand beside; it is the default the replay already assumes. A second
Competition is a second permission request, not a loop.

**What the surface must show before this is called done.** The row on that
Competition's readable rankings, with the "ran after Gameweek N" label and the
typed-endpoint caveat ticket 0079 froze; its Repair count reading zero under that
caveat; and its absence from the Comparison Anchor, the complete-case intersection and
every interval — the `role` filter's doing, and a thing to look at, not to build.

**Walking away is one row.** If the pre-flight says no, delete the row, write the
report, and close ADR-0059 with the reason. The wire from 0079 stays: it cost nothing and
proves the shape.

## Acceptance

- [ ] The Exhibition row exists: `role = 'exhibition'`, `provider = 'typesafe'`,
      `base_model = 'jev-latest'`, `quantization` null, at the named Competition's frozen
      Prompt Version, inserted by the operator.
- [ ] One pre-flight against one played Fixture has run, its report is in
      `docs/reports`, and it records: HTTP status, whether the answer was parseable, the
      two Choice distributions, `usage`, latency, and the per-call price derived from
      the account.
- [ ] The permission request for the replay stated the Fixture count, the derived total,
      and the Competition, and the operator's yes is in the report.
- [ ] The replay over that Competition completed, and the row stands on its readable
      rankings with the Exhibition label and the typed-endpoint caveat; it is absent from
      the Comparison Anchor, the intersection and every interval.
- [ ] Or: the pre-flight refused, the row is deleted, the report says which of price,
      rate limit or `state` size stopped it, and ADR-0059 carries a one-line closure
      naming that reason.
