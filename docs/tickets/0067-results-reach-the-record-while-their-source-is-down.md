# Ticket: Results reach the record while their source is down

**What to build:** the projection of
[ADR-0056](../adr/0056-results-have-a-second-source-shots-have-one.md). When a
Competition's football-data.co.uk fetch fails, its settled Fixtures — already stored, and
fetched that morning from football-data.org or the FPL API — are written into
`historical_matches` as the current Season's top flight, with shots null. The run still
fails afterwards, so the outage stays as loud as it is today. Decisions this touches:
ADR-0056 (the whole of it), [ADR-0019](../adr/0019-per-match-shots-and-xg-join-the-context-for-2026-27-v2.md)
(whose blocking guard this narrows and whose shots-on-every-line floor this thins),
[ADR-0037](../adr/0037-a-new-competition-plays-the-v2-context-minus-availability.md)
(the two-division backfill this must not touch) and
[ADR-0050](../adr/0050-a-row-the-source-has-no-result-for-is-not-corruption.md) (a Match
with no result is skipped, which `settledResult` already does on the other side).

**Blocked by:** None — can start immediately. The first Lock this protects is Bundesliga
Gameweek 3, 2026-09-11 17:00Z, with Serie A and Ligue 1 Gameweek 4 fifteen minutes later,
La Liga Gameweek 5 thirty minutes later and the Premier League Gameweek 4 the following
day at 12:30Z. Five Locks inside twenty hours, all of them 107 hours away at the time of
writing: if football-data.co.uk returns before 2026-09-11 the projection never fires and
this ticket costs nothing. If it does not, five Competitions send packets whose table and
form lines are a matchday stale, and no later fetch can un-send them.

**Status:** open

---

## What is already known

**The outage.** football-data.co.uk began answering `HTTP 503` at or before 2026-09-06
05:29Z and was still answering it at 2026-09-07 05:20Z. The site is down whole, root
included, with nginx's stock maintenance page and a `retry-after: 151` that has now been
wrong for twenty-four hours. The 06:00Z run of 2026-09-06 raised an `AggregateError` over
five `FootballDataSourceHttpError`s, one per Competition.

**The gap, read against production 2026-09-07.** Settled Fixtures against stored history,
current Season, top flight:

| Competition | settled `fixtures` | `historical_matches` | missing |
|---|---|---|---|
| PL | 28 | 20 | 8 |
| PD | 35 | 31 | 4 |
| SA | 24 | 20 | 4 |
| FL1 | 24 | 19 | 5 |
| BL1 | 16 | 9 | 7 |

All twenty-eight missing Matches are dated 2026-09-04 or 2026-09-05, and nothing older is
missing from any Competition — the pipeline was whole through 2026-09-03, so this is the
outage and not a source that had been quietly lagging.

**The two joins the projection needs, both measured rather than assumed.** All ninety-six
clubs across the five Competitions resolve through `footballDataTeamName()` to the
spelling the stored results carry — zero unresolved. Over the ninety-nine Matches this
Season that `fixtures` and `historical_matches` both hold, `kickoff_at::date` equals
`played_on` ninety-nine times out of ninety-nine.

**What null shots means today.** Across all 4,020 rows `historical_matches` holds, every
Season and every division, the count with a null `home_shots` is zero. The first row with
null shots will be the first projected row, which is what lets ADR-0056 decide the
provenance is derivable and add no column.

**What is deliberately not needed.** No new HTTP call: `fixtures.result` already carries
`{home_goals, away_goals, outcome}` for every settled Match, written daily by
football-data.org for `PD`, `SA`, `FL1` and `BL1` and by the FPL API for `PL`. No new
name map: `football-data/team-identity.ts` is already keyed on the names Fixtures arrive
under and valued on football-data.co.uk's. No repair ticket: football-data.co.uk
publishes whole-Season files, so the first successful fetch rewrites the division
complete and the twenty-eight rows heal themselves.

## Acceptance

- [ ] **The projection, on failure and only on failure.** When a Competition's
      `fetchFootballDataSeason` throws, its settled Fixtures for the current Season are
      written into `historical_matches` under the top flight's division name: clubs
      through `teamNamesOf()` for that Competition, `played_on` from `kickoff_at` as a UTC
      date, goals from `result`, and all four shot columns null. A Fixture whose `result`
      is null is not written, which is `settledResult`'s side of ADR-0050 and needs no
      second rule. When the fetch succeeds the projection does not run at all — a
      successful fetch has already written the same Matches with their shots.
- [ ] **The delete is scoped to the top flight.** The projection deletes and rewrites only
      the top flight's division rows for the current Season. The test seeds second-division
      rows for the same Competition and Season, runs the projection, and asserts they are
      byte-identical afterwards. This is the box the ticket most wants: the existing write
      deletes both divisions before reinserting, no source but football-data.co.uk covers
      `E1`, `SP2`, `I2`, `F2` or `D2`, and a projection that inherited that scope would
      erase a backfill it cannot rebuild.
- [ ] **A recovered source overwrites the projection.** The test runs the projection, then
      runs a successful `fetchFootballDataSeason` over the same Competition and Season, and
      asserts every projected row is replaced by the source's own — shots present, counts
      matching the file. Nothing distinguishes a healed division from one that never
      failed.
- [ ] **The run still fails, and says the same thing it says today.** The projection
      happens inside the existing per-Competition `catch`, and the error still joins
      `errors` and still fails the run. `.github/workflows/fetch.yml` opens or updates
      its "Daily fetch is failing" issue exactly as it does now. This is ADR-0056's second
      Consequence answered with no new machinery: the results are saved *and* the outage
      is loud, because saving them was never the reason the run was failing.
- [ ] **The staleness guard narrows to "no source at all".** `StaleFootballDataSeasonError`
      stops firing for a Competition past its Gameweek 1 deadline whose results arrived by
      projection, and still fires for one with no current-Season results from anywhere.
      Both directions are asserted. The guard runs after the projection, not before, or it
      answers a question the projection has already changed.
- [ ] **A projected Match reads honestly in the packet.** A form line over a projected
      Match prints its goals and its xG where Understat has them, and its shots coverage
      short of its match count rather than averaging over a smaller denominator in
      silence. The test builds a context over a mix of projected and stored Matches and
      asserts the coverage marker, not just the absence of a crash.
- [ ] **Nothing else moves.** No migration. `match/2026-27-v2` is unchanged and no new
      Prompt Version ships — the builder's both-or-nothing rule and coverage marker are v2
      behaviour already. Prior Seasons are untouched, the second division is untouched in
      every Competition, and the backfill path (`npm run fetch:history`) is not given a
      projection of its own: it exists to read football-data.co.uk and has no Fixtures to
      read instead.
