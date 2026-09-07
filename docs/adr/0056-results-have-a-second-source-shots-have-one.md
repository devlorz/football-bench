# Results have a second source, shots have one

football-data.co.uk went down at or before 2026-09-06 05:29Z and was still down
twenty-four hours later. The daily fetch failed on all five Competitions at once, as
ADR-0019 says it should, and the Season's most recent matchday never reached
`historical_matches` — while the same results sat in `fixtures`, fetched the same
morning, from sources that were up.

This ADR records that the current Season's top-flight results may be written from
`fixtures` when football-data.co.uk cannot be reached, that shots may not, and what the
blocking guard ADR-0019 installed still blocks once that is true.

## What happened

The 06:00Z run of 2026-09-06 raised an `AggregateError` over five
`FootballDataSourceHttpError`s, one per Competition, every one of them `HTTP 503`. The
site was down whole — `https://www.football-data.co.uk/` itself answered 503, not only
the `mmz4281` files — with nginx's stock maintenance body and `retry-after: 151`. That
`retry-after` was wrong by three orders of magnitude: the same request returned the same
503 at 2026-09-07 05:15Z.

Read against production on 2026-09-07, the gap was one matchday wide and no wider:

| Competition | settled `fixtures` | `historical_matches` | missing |
|---|---|---|---|
| PL | 28 | 20 | 8 |
| PD | 35 | 31 | 4 |
| SA | 24 | 20 | 4 |
| FL1 | 24 | 19 | 5 |
| BL1 | 16 | 9 | 7 |

All twenty-eight missing Matches are dated 2026-09-04 or 2026-09-05. Nothing older is
absent from any Competition, which is what rules out the other reading of these counts —
football-data.co.uk was not already lagging and had not quietly stopped publishing. The
pipeline was whole through 2026-09-03, and what is missing is exactly the round the
failed run would have collected.

Every one of those twenty-eight results was already stored. `fixtures.result` carries
`{home_goals, away_goals, outcome}` for every settled Match, written daily by
football-data.org for `PD`, `SA`, `FL1` and `BL1` and by the FPL API for `PL` — four
sources, none of them football-data.co.uk, none of them down.

Two things had to be true for those rows to be usable as history, and both were checked
rather than assumed:

- **Identity.** All ninety-six clubs across the five Competitions resolve through
  `footballDataTeamName()` to the spelling the stored results carry. Zero unresolved.
  The map already existed: `football-data/team-identity.ts` is keyed on the names
  Fixtures arrive under and valued on football-data.co.uk's, which is precisely the
  direction this needs.
- **Dates.** `historical_matches.played_on` is a date and `fixtures.kickoff_at` is a
  timestamp, and football-data.co.uk records local match dates. Over the ninety-nine
  Matches this Season that both tables hold, `kickoff_at::date` equals `played_on`
  ninety-nine times out of ninety-nine. The five Competitions kick off no later than
  about 19:00Z, so the UTC date and the local date cannot separate.

## The decision

**The current Season's top flight may be written from `fixtures`.** When a
Competition's football-data.co.uk fetch fails, its settled Fixtures are projected into
`historical_matches` — club names mapped through `teamNamesOf()`, `played_on` from
`kickoff_at::date`, `home_goals` and `away_goals` from `result`, and the four shot
columns null.

**Shots have one source and get no substitute.** football-data.org's match payload
carries `score.fullTime` and `score.halfTime` and nothing else; there is no shot count
anywhere in it, and Understat covers no second division. A projected row is a row
without shots, and it says so by being null rather than by being zero.

**The projection is temporary by construction and needs no flag to say so.**
football-data.co.uk publishes whole-Season files, so the first successful fetch after the
outage deletes the division and rewrites it complete, shots included. Until then, a
top-flight row with null shots is a projected row — derivable, and not by argument:
across all 4,020 rows `historical_matches` holds, every Season and every division, the
count of rows with a null `home_shots` is zero. Nothing stored today is ambiguous, and
the first ambiguous row would be the first projected one. No column is added to record
what the data already answers.

**The second division is not projected and must not be deleted.** No source but
football-data.co.uk covers `E1`, `SP2`, `I2`, `F2` or `D2` — the token's competition list
holds `ELC` and none of the other four. The existing write deletes both divisions before
reinserting; the projection deletes only the top flight. A projection that took the
second division's scope with it would erase a backfill it cannot rebuild.

**The blocking guard survives, narrowed.** `StaleFootballDataSeasonError` stops meaning
"football-data.co.uk produced no current-Season result" and starts meaning "no source
did". A Competition past its own Gameweek 1 deadline with no results from anywhere still
fails by name.

## Why not the alternatives

**Wait for the source to come back.** This is what happened for twenty-four hours and it
is still the right answer for an outage measured in hours: the history is not lost, only
unwritten, and one fetch restores it. It stops being the right answer at the point a Lock
falls inside the outage, because then a Gameweek's Entrants are sent a packet whose table
and form lines are a matchday stale, and no later fetch can un-send it. The projection
exists for that case, not for the tidiness of a green cron.

**Move history to football-data.org outright.** Rejected on the same evidence that makes
the projection safe. Four of five second divisions are not in the plan at all, shots are
in no payload, and the backfill's identity — every stored row, two Seasons deep, five
Competitions — is keyed on football-data.co.uk's spelling. The projection borrows one
source's results for one Season's top flight; a migration would strand the rest.

**Degrade the way Understat degrades and write nothing.** This is ADR-0019's rule read
literally, and reading it literally is what produced the gap above. Its stated reason is
that "results and form are the skeleton of the context" — and the skeleton is exactly
what `fixtures.result` still holds. What the projection drops is shots, which ADR-0019
classes with xG as a raw signal on a form line, and which that ADR already accepts losing
to a source being down. The guard was written when results had one source; it now has
two, and the rule follows the reason rather than the sentence.

## What this costs ADR-0019

ADR-0019 keeps shots on every line "partly to floor this asymmetry" — Understat covers no
second division, so promoted clubs open the Season with xG-less form lines, and shots
being present for both divisions is what stops those lines from being empty of raw signal
altogether. It explicitly rejected restricting shots to promoted sides, because that
would make context shapes differ per team rather than per match.

During an outage the projection thins that floor. It does not tilt it the way the
rejected option would — a projected Match has no shots for either club, so the shapes
still differ per match and not per team, and the two clubs in a Fixture see the identical
gap. But the floor is thinner while it lasts, and a promoted club's form line can now
reach a Match with neither xG nor shots.

This is accepted rather than solved, on the ground that the alternative is a form line
with no Match on it at all.

`match/2026-27-v2` is unchanged and no new Prompt Version ships. The builder's
both-or-nothing rule and its coverage marker are v2 behaviour already: a Match missing a
figure has always been able to drop out of a rate, and the rate has always printed what
it covered. A projected Match exercises that path; it does not add one.

## Consequences

Form lines and record lines built during an outage print shots coverage short of their
match count, and say so in the packet rather than averaging over a smaller denominator in
silence.

The daily fetch stops failing when football-data.co.uk alone is down, which removes the
signal that it *is* down. Whatever replaces the raised error has to be as loud, or an
outage becomes a thing that is noticed when someone reads a packet.

`historical_matches` gains rows whose provenance is not football-data.co.uk for the first
time. Every count, every base rate and every Elo replay reads them identically — they
carry the same clubs, dates and scores — but a row's shots being null is now a fact about
when it was written, and any future check that reads null shots as "an old Season" is
wrong.
