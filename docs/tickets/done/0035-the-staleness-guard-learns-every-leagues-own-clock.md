# Ticket: The staleness guard learns every league's own clock

**What to build:** the football-data.co.uk staleness guard stops being the Premier
League's alone — every listed Competition gets its own, dated from its own Gameweek 1
deadline and asking whether its own feed is live — and the `FOOTBALL_DATA_SEASON`
advance check grows to all eight files. The one piece of new machinery in this
expansion, owed since spec 0016's ticket 8 recorded it as "the first thing to write for
Serie A". Source: [spec 0024](../specs/0024-serie-a-and-ligue-1-open.md), stories
17–19. Decisions:
[ADR-0049](../adr/0049-serie-a-and-ligue-1-open-the-bundesliga-waits-on-hands-not-money.md),
[ADR-0036](../adr/0036-a-new-competitions-schedule-results-and-lock-come-from-football-data-org.md)
(whose consequence — "applied per Competition" — this finally implements).

**Blocked by:** None — can start immediately.

**Status:** done

- [x] A listed Competition whose football-data.co.uk feed has produced no current-Season
      rows once its own Gameweek 1 deadline passes fails the fetch loudly, by name —
      each league against its own clock, not the Premier League's.
      _The guard takes the Competition and reads **both halves off the same `gameweeks`
      row** — `g.competition = $2` dates the question and `h.competition = g.competition`
      asks it — so the deadline and the history can no longer come from different leagues.
      The two `'PL'` literals guaranteed that for one league and denied it to every other:
      `gw = 1` returns a row per listed Competition, and a Spanish result answered "the
      English feed is live"._

      _`StaleFootballDataSeasonError` carries the Competition and names it first, because
      its guidance — advance `FOOTBALL_DATA_SEASON` — can be right for the league that
      raised it and premature for one whose file has not published yet._
- [x] One league's staleness is collected as that Competition's error without costing
      another league its fetch — the same collected-errors shape the per-Competition
      fetch already has — and the run still fails loudly at the end.
      _`footballDataSucceeded`, a boolean that only ever meant `PL`, is gone: the guard
      runs inside the same `try` as the fetch that feeds it, so a league whose fetch threw
      is never asked — it has already said so, and a second question would report one
      outage twice. **A first pass kept a list of the Competitions that answered and
      looped it separately**, which held the same rule as bookkeeping where the structure
      already held it. **Found by review.**_
- [x] The guard's behaviour is driven at the daily-fetch seam over a temporary Postgres,
      the way the existing stale-source guards are: one league stale, the other league's
      day still lands.
      _Two tests at `runDailyFetch`, and both were written before the code and watched
      fail. `dates each Competition's staleness from its own Gameweek 1 deadline` runs at
      17:00Z, six days past La Liga's Gameweek 1 deadline and half an hour inside the
      Premier League's: it must fail naming `PD` while both leagues' 380 Fixtures still
      land. `collects every stale Competition rather than stopping at the first` runs at
      17:30Z, past both, and requires an `AggregateError` naming `PD` and `PL` in turn._

      _Mutation-checked rather than assumed, each restored by hand afterwards and the file
      re-run green: making the guard `throw` where it collects turns the second test red,
      and putting the `'PL'` literal back on the `exists` half alone turns both the
      dispatch test and `dates each Competition's staleness…` red._

      _**That second mutation killed neither new test at first**, and review is what found
      it: the discrimination this whole ticket exists for — asking whether a league's
      **own** feed is live — was caught only by a pre-existing dispatch test, and only as
      a side effect of the row this ticket added to it. A test can assert the right
      outcome for the wrong reason, and this one did: `PD` fired under the mutation too,
      because the English feed it wrongly asked about was equally empty. The first test
      now seeds a current-Season `PL` result, so the two leagues are in genuinely
      different states and a shared question has to get one of them wrong._

      _**That test had to be given a row, and the reason is the finding.** It lists `PD` on
      2026-08-21 with `FOOTBALL_DATA_SEASON` on `2025-26`, which is a genuinely stale La
      Liga — it was passing only because the guard could not see it. It is a test about
      which sources the loop reaches, so it now holds one current-Season `PD` result and
      states why._
- [x] The pre-cron checklist's advance check requires eight `200`s — `I1`, `I2`, `F1`,
      `F2` join `E0`, `E1`, `SP1`, `SP2` — and its one-variable-many-leagues note names
      four leagues instead of two.
      _Grown to eight, and **changed from counting statuses to reading the first row**,
      because the checklist's own warning says a `200` can be a redirected near-miss —
      `2627/SP1.csv` → `2627/P1.csv`, the Portuguese first division — and a status line
      cannot tell those apart. A file that is there answers `E1,14/08/2026`; one that is
      not answers `<html><head>`. The command was run before it was written down._

      _**Read 2026-08-21: four of the eight exist and four do not.** `E1`, `SP1`, `SP2`
      and `F2` are real, with their own `Div` and 2026-27 dates. `E0`, `I1`, `I2` and `F1`
      answer `300 Multiple Choices`. So the variable still cannot advance — and the file
      missing is the **Premier League's own**, while La Liga's pair is ready._

      _The note that said "the guard itself names `PL` on both halves, so a lagging La Liga
      is caught by its own fetch and not by the guard" was true when written and is false
      now; it says the opposite, and names all four leagues rather than going
      league-agnostic — the box asks for four. §7's tight-tolerance imperfection gains the
      consequence that there are four of it, one per league, not one in total._

      _Three uses of "matchday" elsewhere in the checklist (§4's opening line and two in
      §7) are CONTEXT.md violations that predate this ticket and are left standing: the
      one this ticket wrote is fixed, and the rest are not this diff's to sweep._

## What this costs the moment it ships, which is the point of it

The record holds **no 2026-27 football-data.co.uk result for any league**, and both live
leagues are past their own Gameweek 1 deadline. So this guard fails the daily fetch for
`PD` from the next run, and for `PL` from 17:30Z today — the Premier League's half was
already failing under the old guard, and La Liga's is what was silent.

That is the guard working, not a regression: both leagues are predicting from a packet
whose form lines and league table read last Season, and nothing said so. The remedy is
§4's advance, which is blocked on `E0` — so the noise stands until football-data.co.uk
publishes it.

**It also prices the next activation, and worse than a first pass here said.** That draft
read "a league opened while its own file is missing fails its fetch every day from its
first deadline", which credits this guard with a failure that happens earlier and for
another reason: a missing file fails the per-file `Div` check on the **first run after
activation**, so that Competition never reaches the guard at all and the guard never
speaks for it. `I1` and `F1` do not exist today. Serie A activated tomorrow therefore
fails its football-data.co.uk fetch from its very first daily run — not from its Gameweek
1 deadline, and not with this error. Ligue 1 is in the same position. **Found by review.**

Whether that is acceptable is an operator's call and belongs beside the activation, not
here. What belongs here is that it is a daily failure from day one, not a delayed one.
