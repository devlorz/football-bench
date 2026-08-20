# Ticket: A run that knows what it will cost before it starts

Carried out of
[ticket 0023](0023-the-clock-that-makes-gaps-and-the-ceiling-nobody-set.md)'s second
slice, which named the acceptance item and then could not honestly tick it. That slice's
job was one field on a request body; this one needs a balance read and a price per seat,
which is a different piece of work and belongs in its own ticket rather than as an
exception written into a slice that says it landed. Vocabulary:
[CONTEXT.md](../../CONTEXT.md) — **Gap**, **Entrant**, **Base Model**.

**Why it is now possible.** Until 0023 the request named no output ceiling, so nothing
could price it: the provider was estimating against whatever the Base Model allows and so
was anyone else. `ENTRANT_MAX_OUTPUT_TOKENS` is 16,000, which makes a call's worst case a
number rather than a guess.

**What it costs to not have.** On 2026-08-20 the Premier League's Gameweek 1 discovered
its balance two thirds of the way through, as 16 HTTP 402s spread across the seats that
had not answered yet. A run that stops at the two-thirds mark leaves Gaps that no Repair
can close once the Lock passes, and the Predictions it did buy are a partial field nobody
asked for. Refusing the whole Gameweek before the first call is the cheaper failure.

**The acceptance item as slice 2 wrote it**, kept verbatim so nothing is lost in the move:

> Cost becomes predictable as a consequence, which is the second reason to do it: a
> request with a stated ceiling can be priced before it is sent, and a pre-run check can
> then refuse a Gameweek the balance cannot finish instead of discovering it two thirds of
> the way through.

**Blocked by:** None — 0023 slice 2 landed the stated ceiling this depends on.

- [ ] The balance is read rather than assumed. OpenRouter exposes the remaining credit;
      one read before a run, and a failure to read it is not silently treated as
      affordable.
- [ ] A run's worst case is priced from the ceiling and the seats, not from a past run's
      average: calls × the per-seat output price at `ENTRANT_MAX_OUTPUT_TOKENS`, plus the
      input side of the packet. Where that price table comes from — a fetched model list
      or a checked-in one that can go stale — is the decision this ticket has to make and
      record.
- [ ] **The count of calls is what the run will actually ask, not Fixtures × seats.** A
      `fill` asks only the pairs that hold no Prediction, and by the time it runs that is
      usually a handful: the query behind both triggers excludes any Fixture and seat that
      already answered. Pricing a fill as though it were a main run overstates it by an
      order of magnitude, and the refusal that follows abandons Gaps the run could have
      afforded to close. On 2026-08-20 a check written that way would have priced La Liga's
      Gameweek 2 at 140 calls with 17 outstanding, refused on a $1.61 balance, and turned
      seventeen closable Gaps into permanent ones at the Lock. A Gap that a refusal creates
      is worse than a partial field, because the partial field can still be filled.
- [ ] The check refuses before the first call rather than during, and says the two numbers
      it compared. A run that is refused costs nothing and leaves no partial field.
- [ ] Whether it refuses or warns is stated per path. The scheduler has nobody reading it
      and should refuse; a run started by hand may be told to go ahead anyway.
- [ ] A test pins that a Gameweek priced above the balance never reaches the Base Models,
      and that one priced under it is untouched.

## Not in this ticket

Changing `ENTRANT_MAX_OUTPUT_TOKENS`, which is 0023's number and provisional on its own
terms — the first uncensored maxima arrive with the next run under the five-minute window
([the completion-token report](../reports/2026-08-20-completion-tokens-per-seat.md)).
Repairing or retrying the Gaps a 402 already produced. Any change to what `usage.cost`
records after the fact.
