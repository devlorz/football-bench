# A new Competition's schedule, results and Lock come from football-data.org

> Amended 2026-08-15 by ticket 8 of spec 0016. **La Liga's Gameweek 1 was Locked at
> 17:00Z by hand, not at the 16:00Z the rule below derives.** It is the only Gameweek in
> the benchmark whose Lock was not `earliest kickoff − 90 minutes`, and the rule below
> stands unchanged for every other.
>
> What happened: the Competition was activated on the afternoon of its opening day, after
> the derived deadline had already passed. Nothing had been committed under it — no
> Fixture was Locked into that Gameweek, so migration 0025's trigger did not hold it — and
> the choice was between a Gameweek predicted under a stated Lock of 17:00Z and no Gameweek
> at all. The predictions were written by 16:26Z, thirty-four minutes before that Lock and
> sixty-four minutes before the earliest kick-off. The two promises the record actually
> makes both hold: every Prediction preceded its Lock, and every Prediction preceded its
> Fixture.
>
> What it costs, stated rather than smoothed over: La Liga Gameweek 1's Entrants had a
> thirty-minute cut-off where every other Gameweek's have ninety. Nothing in the packet
> differs — the context is built `as of` the Lock and reads only stored data — but the
> margin does, so this Gameweek is not strictly comparable to the others and any
> cross-Gameweek claim should say so. It is one Gameweek of thirty-eight in one of five
> Competitions.
>
> This is a record of a decision taken once under a clock, not a precedent. The
> alternative the rule already provides is the one to reach for next time: let the
> Gameweek go and open at the next one, which is what ADR-0035 calls the accepted price.

> Amended 2026-09-03 by ticket 0064. **A Fixture attaches to the Gameweek its kickoff
> falls in, not to the matchday football-data.org labels it with.** The matchday stays
> what `gw` stores and what the dashboard calls it; `locked_in_gw` (ADR-0015) is where the
> attachment goes, and the deadline is derived over the Fixtures attached to a Gameweek
> rather than over the Fixtures labelled with it. The `earliest kickoff − 90 minutes` rule
> below is unchanged; what changes is which kickoffs it reads.
>
> What happened: La Liga brought one matchday-6 Fixture, Real Sociedad–Celta, forward to
> 3 September, twelve days ahead of the other nine, which stayed on 15–17 September.
> Matchday 4 opened on the 4th and matchday 5 on the 11th. The rule read matchday 6's
> earliest kickoff, derived its deadline at 17:30Z on the 3rd — a day before matchday 4's
> — and the scheduler, which orders due work by deadline and not by number, ran Gameweek 6
> before Gameweeks 4 and 5. All ten Fixtures were Locked under that deadline: one of them
> ninety minutes before kick-off, nine of them twelve to fourteen days before, on a packet
> that will be two weeks stale by the time they are played. 150 calls, $1.91.
>
> Why it happened: FPL's `event` is chronological — a Fixture the Premier League brings
> forward is relabelled by FPL into the Gameweek it lands in, which is why ADR-0006's
> whole-Gameweek Lock never met this on the FPL path. football-data.org's `matchday` is
> the league's round number and says nothing about when the round is played. This ADR
> stored the one as the other and assumed they agree, and they agree until a league moves
> a match. The machinery for a Fixture whose deadline is not its label's already exists
> (`locked_in_gw`, ADR-0015) and the fetch already uses it in one direction — a Fixture
> first seen after its own Gameweek's Lock joins the next open one. The other direction,
> a Fixture pulled ahead of a lower-numbered Gameweek that is still open, was never
> written, and the deadline derivation grouped kickoffs by label and so let one moved
> Fixture drag its whole round's Lock forward with it.
>
> What is decided: the nine early Predictions per seat are withdrawn and the nine
> Fixtures are re-Locked into Gameweek 5 (ticket 0065). Real Sociedad–Celta keeps its Lock
> and its ten Predictions — they preceded a Lock that preceded its kick-off, and it has
> been played. The nine also satisfied every promise the record makes, and ADR-0013's
> reasoning — equally stale for every seat, Paired Differences untouched — would have let
> them stand; the first draft of this note did let them stand. They are withdrawn all the
> same because the staleness is not a postponement's: ADR-0013 accepts information that
> aged *after* an honest Lock, where here the Lock itself was placed twelve days early by
> a derivation reading the wrong column. Gameweek 5's deadline, 2026-09-11 17:30Z, is the
> latest that still precedes all nine kick-offs; Gameweek 4's, a day after the moved
> Fixture, was rejected because re-deriving it over that Fixture would have put it
> seventy-seven minutes from the moment the decision was taken, with Gameweek 4's own run
> already overdue and unrescuable past it. This is the one recorded exception to
> ADR-0013's insert-only rule and to ADR-0015's immutable `locked_in_gw`, lifted inside
> one migration and restored by it. What it costs, stated: $1.71 of the $1.91 is sunk;
> Gameweek 5 becomes a Double Gameweek of twenty and its run costs accordingly; the
> `attempts` ledger keeps 135 rows for Gameweek 6 whose Predictions no longer exist, and
> Gameweek 6 holds one Fixture for the rest of the Season. No `deferred` flag marks any
> of it, because nothing moved after a Lock; the migration's comment and this note are
> the record.
>
> What the rule becomes, so it does not happen again: a not-yet-Locked Fixture attaches
> to the latest Gameweek whose window — the earliest kickoff among the Fixtures the source
> *labels* with it — has opened by the Fixture's kickoff. Ordinarily that is its own
> label. When it is an earlier Gameweek still open, `locked_in_gw` is written to it and
> that Gameweek's deadline is derived over it too, so the moved Fixture is predicted with
> the Gameweek it is actually played in and its round-mates keep their own Lock. When the
> earlier Gameweek has already Locked, the existing rule holds — the next open Gameweek,
> provided its Lock precedes the kickoff. Under this rule Real Sociedad–Celta would have
> joined Gameweek 4, whose deadline would have moved a day earlier for its own ten
> Fixtures — the same cost a Friday Fixture already imposes on a Premier League weekend —
> and Gameweek 6 would have Locked on the 15th. A whole round played ahead of a
> lower-numbered one attaches wholesale and becomes a Double Gameweek beside an empty
> one, which is what the Premier League's own calendar already produces.

For every Competition except the Premier League, the daily fetch reads football-data.org:
the Fixture list, each Fixture's matchday (stored as its Gameweek), kickoff times and final
scores. The free tier covers all four target leagues under one API and one rate limit that
a daily fetch across five Competitions does not approach. The Premier League keeps the FPL
API for everything, untouched.

The FPL API gave the match track four things at once — fixtures, kickoffs, results and a
deadline. football-data.org gives the first three; no non-English league publishes a
deadline, because the deadline was never a football concept. It is derived instead: a
Gameweek's deadline is its earliest kickoff minus ninety minutes, recomputed at every fetch
until the Lock is observed. From the Lock onward nothing changes: a Fixture owns the
Gameweek it was Locked in (ADR-0015), a postponed Fixture keeps its original Prediction
(ADR-0013), and a Fixture dropped from the schedule leaves it (ADR-0024). The Lock still
covers the whole Gameweek at once (ADR-0006): every Entrant sees the same information
cut-off, and a Monday Fixture is predicted on Friday's knowledge — equally stale for
everyone, same as the Premier League.

This is stress-tested immediately: La Liga's 2026-27 Gameweek 1 opens 15 August with three
Fixtures already deferred to 25–27 August for post-World-Cup rest. The existing postponement
machinery handles exactly this shape, which is why the Lock policy transfers rather than
being redesigned.

## Considered Options

- **API-Football** — richer data, including injuries the availability section could use.
  Rejected: a paid dependency for data the context does not require after ADR-0037, plus a
  second identity-mapping layer.
- **Scraping league sites** — rejected; fragile, and the benchmark's honesty rests on
  sources a skeptic can independently query.
- **football-data.co.uk as the schedule source** — rejected; it publishes results, not a
  forward schedule, and updates on a baseline cadence. It stays what it already is: the
  historical-context source (ADR-0037).

## Consequences

- The deadline is ours, not the league's. Once a Lock has been observed at a derived
  deadline, that deadline is frozen with it. If a fetch ever observes a kickoff moved
  earlier than the current derived deadline, that is alerted loudly, not absorbed — a
  Prediction must always precede kick-off, and the ninety-minute buffer plus daily fetch
  cadence is the margin that keeps that true.
- The stale-season guard (`StaleFootballDataSeasonError`'s pattern) is applied per
  Competition: a Competition whose source has produced no rows by its first deadline fails
  the fetch loudly rather than locking an empty Gameweek.
- `raw_snapshots` already namespaces sources by string; football-data.org snapshots join it
  under their own source names, so the fetch stays replayable like every other source.
