# La Liga's Gameweek 2, the first asked under the restarted version

The first prediction run under `match-pd/2026-27-v2` — the Prompt Version the match
track restarted onto (ADR-0042) carrying everything ADR-0043 and ADR-0045 added. Run by
hand rather than left to the scheduler, because the first run of a version is the one
worth watching: the cron would have fired it at 2026-08-20T11:30Z, six hours before the
Lock, with nobody reading the result until afterwards.

## Before the run

**Balance: $6.16**, read off the OpenRouter pay-as-you-go panel at 2026-08-20T06:18Z.

**What is being asked.** La Liga Gameweek 2, **14 Fixtures** — its own ten plus the four
the calendar moved out of Gameweek 1 and into this Lock — against **10 seats**, so
**140 calls** if no Repair is needed.

**What it should cost.** The measured unit is $0.1845 per Fixture for the whole field,
read off `usage.cost` over La Liga's Gameweek 1 rather than off a price list
(`2026-08-15-five-league-price.md`). Fourteen of those is **$2.58**, and the packet has
grown since that measurement — base rates, xG rates on the Prior-Season line, two
instruction sentences, and the Head Coach section — so the estimate carried into the run
is **$2.60 to $2.90**, leaving somewhere near $3.30 for the Premier League's Gameweek 1
and the FPL track's opening, both of which Lock on 2026-08-21T17:30Z.

**What paying twice would look like, and why it cannot happen.** The run's own query
excludes any Fixture and seat that already holds a Prediction, so the scheduled run at
11:30Z will find the work done and ask nobody.

## The packet, read before it froze

One Fixture was read in full first — Rayo Vallecano de Madrid v Deportivo Alavés — because
storing a context under a Prompt Version freezes it (ADR-0026) and this was the last
moment the template could still move. It carried, in order: the Gameweek 1 table; the
prior Season's base rates (`home wins 48.9%, draws 24.5%, away wins 26.6%, 2.69 goals per
match` over 380 matches); each club's Prior-Season points per game with xG for and against
appended to the same line; current-Season splits with shots, shots on target and xG; five
recent matches each; two head-to-head meetings; Squad Changes; and the Head Coach section.

The Head Coach section is the one worth recording, because it is what ADR-0045 was argued
on. Rayo carries both halves — `Head Coach: Beñat San José` with the change that put him
there beneath it. Alavés carries only the first: `Head Coach: Quique Sánchez Flores`, no
change lines, because he has been in post since before this Season. Under the Change-only
section that shipped a day earlier, Alavés would have been named nowhere at all, and every
Entrant would have answered from whatever its training data remembered — which is the
confound ADR-0045 exists to remove.

`Historical context as of 2026-08-20T17:30:00.000Z` — the Lock, not the wall clock, which
is why running early changes no byte of what is asked.

Two things seen and left alone: the table lists ten clubs rather than twenty, because
Gameweek 1 played six Fixtures and the rest were moved; and a club is spelled
`Vallecano` in the table and `Rayo Vallecano de Madrid` in the heading, the stored
results' spelling against football-data.org's, which predates all of this.

## After the run

To be filled from `usage.cost` rather than estimated, in the shape the Gameweek 1 price
report used: total spend, calls, Repairs, per-seat breakdown, and the balance the panel
shows afterwards.
