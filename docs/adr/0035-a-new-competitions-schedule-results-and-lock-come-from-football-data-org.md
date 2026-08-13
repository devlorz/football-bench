# A new Competition's schedule, results and Lock come from football-data.org

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
  Rejected: a paid dependency for data the context does not require after ADR-0036, plus a
  second identity-mapping layer.
- **Scraping league sites** — rejected; fragile, and the benchmark's honesty rests on
  sources a skeptic can independently query.
- **football-data.co.uk as the schedule source** — rejected; it publishes results, not a
  forward schedule, and updates on a baseline cadence. It stays what it already is: the
  historical-context source (ADR-0036).

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
