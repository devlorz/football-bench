# Tickets: The match track restart

Six tracer-bullet slices under one gate — the earliest restarted Lock, at latest the
Premier League's **2026-08-21T17:30Z** — that retire one question and freeze a better one.
Source: [spec 0020](../specs/0020-the-match-track-restart.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md), including **Head Coach**. Decisions:
[ADR-0042](../adr/0042-the-match-track-restarts-under-amended-prompt-versions.md),
[ADR-0043](../adr/0043-base-rates-xg-rates-and-two-instruction-lines-join-the-restarted-match-versions.md),
[ADR-0044](../adr/0044-head-coach-changes-join-the-match-context-racing-the-freeze.md).

Six slices and their edges, deliberately. Scoring Gameweek 1 is first and alone because
its window closes forever at the flip — it is an act against the live record, and spec
0018's rule holds: an act against the record never shares a slice with the code it
depends on. The three additions land together because they move one builder and one
template under one review — a template amended twice in three days is two reviews of a
Season-long freeze (spec 0019's rule, unchanged). The bench sits between the additions
and the flip because that is the one seat from which its findings can still move a
sentence cheaply. Head Coach is last and disposable by construction: ADR-0044 settles
both outcomes of its race in advance, so no slice below it waits on it.

There is nothing to prefactor: every slice extends a seam that already exists — the
builder, the template constants, the dry-run harness, the dashboard's per-Competition
read, the Squad Changes pipeline shape.

---

## 1 — La Liga's Gameweek 1 scored under v1

**What to build:** The record holds La Liga's Gameweek 1 whole — every v1 seat's Match
Points, Bet Points and RPS beside the sixty Predictions it already holds. Whole means
the six Fixtures Gameweek 1's Lock owned: attribution is `locked_in_gw` (ADR-0013,
ADR-0015), so the four Fixtures the calendar moved to late August are not this
Gameweek's record at all — they lock into a later Gameweek and are asked there, under
the restarted version, with no Gap and no special path. Of the six, one is still
unplayed, and the scorer accommodates that without new code: an unsettled Fixture is
absent rather than a miss, and the score rows upsert, so the run is made once now over
what has settled and repeated after the last kickoff. Only that final, complete run
gates anything — and what it gates is the flip alone.

**Blocked by:** None — can start immediately, and only the flip waits on its completion.

- [x] The five settled Fixtures' results are fetched and stored, and the scoring run
      writes every v1 seat's rows over them now — Gaps standing as Gaps.
- [ ] After the remaining Fixture's kickoff, its result is fetched and the same run
      repeated; the upsert leaves every row stating the whole Gameweek.
- [ ] Both runs are the production scorer on the production path — no bespoke script, no
      hand-written row, no version named anywhere but the code.
- [x] It is recorded — in this ticket — that the flip is forbidden until the complete
      run has happened.
- [ ] If the calendar moves the remaining Fixture past the gate, the flip proceeds and
      the completing run is executed from the last pre-flip revision of the scorer —
      the version it names is code, and the pre-flip code still names v1. An escape
      hatch for a moved Fixture only, never the plan.

### The first run — recorded 2026-08-19

**The flip (slice 4) is forbidden until the complete run has happened.** The complete run
is the production scorer over all six Fixtures Gameweek 1's Lock owned, which cannot
happen before Club Atlético de Madrid v Málaga CF kicks off at 2026-08-19T19:00Z. Until a
run after that kickoff has written every v1 seat's Gameweek 1 rows over six settled
Fixtures, no constant moves. The only exception is the escape hatch above, and it is for
a moved Fixture and nothing else.

The first run needed no act of ours and no new code. It is the two production crons that
already run: daily fetch (`.github/workflows/fetch.yml`, 06:00Z) stored the results, and
daily scoring (`.github/workflows/score.yml`, 10:00Z — run 32125149309, 2026-08-18T10:09Z)
printed `Scored PD 2026-27 Gameweeks 1, 2`. Read back off production at the table:

Gameweek 1 owns six Fixtures and holds five results, exactly as attribution by
`locked_in_gw` says it should:

| Fixture | Kickoff | Result |
| --- | --- | --- |
| Deportivo Alavés v Getafe CF | 2026-08-15T17:30Z | 3–0 |
| Sevilla FC v Rayo Vallecano de Madrid | 2026-08-15T19:30Z | 2–1 |
| Real Racing Club de Santander v Villarreal CF | 2026-08-16T15:00Z | 2–2 |
| RCD Espanyol de Barcelona v Levante UD | 2026-08-16T17:00Z | 3–0 |
| RC Deportivo La Coruña v Elche CF | 2026-08-17T19:00Z | 1–1 |
| Club Atlético de Madrid v Málaga CF | 2026-08-19T19:00Z | *unplayed* |

Sixty Predictions over those six from ten seats, and no Gap: `predictions` joined to
`fixtures` returns one row — `gw 1, 60 predictions, 10 seats, 6 fixtures` — and nothing
for any other Gameweek. All ten seats still stand under `match-pd/2026-27-v1`; no version
string has moved.

Every v1 seat's Gameweek 1 numbers, off `scores`:

| Seat | Match Points | Bet Points | RPS |
| --- | --- | --- | --- |
| `match-pd/claude-opus-5` | 7 | 17 | 0.17858 |
| `match-pd/deepseek-v4-pro` | 2 | 15 | 0.19587 |
| `match-pd/gemini-3.1-pro-preview` | 2 | 15 | 0.19013 |
| `match-pd/glm-5.2` | 5 | 15 | 0.19145 |
| `match-pd/gpt-5.6-sol-pro` | 0 | 13 | 0.19610 |
| `match-pd/grok-4.6` | 7 | 17 | 0.19367 |
| `match-pd/kimi-k3` | 2 | 15 | 0.18721 |
| `match-pd/minimax-m3` | 2 | 16 | 0.18811 |
| `match-pd/muse-spark-1.2` | 2 | 15 | 0.20078 |
| `match-pd/qwen3.8-max` | 2 | 15 | 0.20098 |

The two stamps in those rows are the upsert already behaving as the completing run needs
it to. The outcome metrics — `match_points`, `bet_points`, `rps`, `brier` and their
season-to-date twins — carry `n = 5` and `scored_at = 2026-08-18T10:07:26Z`, moved by the
run that learnt the fifth result. The behavioural ones — `coherence`, `gap_rate`,
`attempts_to_valid` — carry `n = 6` and are still stamped 2026-08-16T10:04:45Z, because
they read no result and no run since has changed their value. Two daily runs have already
passed over these rows without touching them; the completing run will move the outcome
metrics to `n = 6` and leave the behavioural ones exactly where they are.

The four Fixtures the calendar moved are not in the Gameweek: they carry `gw = 1` with
`locked_in_gw = 2` and no Prediction — Valencia CF v Real Betis Balompié (2026-08-25),
Real Madrid CF v Real Sociedad de Fútbol (2026-08-26), RC Celta de Vigo v CA Osasuna and
FC Barcelona v Athletic Club (both 2026-08-27). They are Gameweek 2's, and they will be
asked at Gameweek 2's Lock.

### The gate is a day earlier than this ticket's header says

Gameweek 2's Lock is **2026-08-20T17:30Z** — `gameweeks` gives PD's deadlines as GW1
2026-08-15T17:00Z, GW2 2026-08-20T17:30Z, GW3 2026-08-28T15:30Z. The header dates the gate
from the Premier League's 2026-08-21T17:30Z as the latest it could be; La Liga's restarted
Lock is the earliest, and it lands a day sooner. Every slice the flip blocks inherits that
date, and slices 2 and 3 have a day less than the header implies.

That compresses this slice against the flip in a way worth stating plainly: the completing
run cannot start before tonight's 19:00Z kickoff, and the flip must be merged before
17:30Z tomorrow. Waiting for the crons leaves the whole sequence — fetch 06:00Z, score
10:00Z, then review and merge the constants — inside one morning. Both workflows carry
`workflow_dispatch`, so **the completing run should be dispatched by hand tonight**, once
the result is posted, rather than waited for: `fetch.yml` then `score.yml`, in that order,
which is the same production path on the same code and buys the flip a night's margin.

If the completing run has not happened by the time the flip is otherwise ready, the flip
still waits. The escape hatch above is for a Fixture the calendar moved, and tonight's
kickoff has not moved.

Two things outside this slice that the read turned up:

- The daily fetch has exited non-zero since 2026-08-18 (run 32105885838): La Liga's
  Understat xG source fails validation. `runDailyFetch` collects that failure and throws
  only at the end, so the football-data.org results were stored regardless — which is how
  the five got here — but a red fetch is a poor thing to be trusting for the sixth. Check
  the stored result before trusting the scoring run that follows it.
- Gameweek 2 already carries a `gap_rate` row per seat at `n = 4`, stamped 2026-08-16 —
  the four moved Fixtures are Locked to it and have no Prediction yet, which is the
  pre-Lock state and not a fault. It resolves itself when Gameweek 2's Lock runs, under
  whichever version is standing then.

## 2 — The amended question

**What to build:** A rendered match packet carries the three additions ADR-0043 fixes:
one base-rates line from the prior Season's top flight, xG for and against per game on
the Prior-Season line, and the two instruction sentences verbatim. Both Competitions
render it identically; every sentence the packet can now say is a test's expected string.

**Blocked by:** None — can start immediately, in parallel with 1.

- [x] One base-rates line per context: the prior Season's top-flight home-win, draw and
      away-win shares, goals per match, and the match count they cover — computed from
      stored results alone, once per packet, not per team.
- [x] A Competition with no curated divisions renders the base-rates unavailable sentence
      in the family the table section already uses.
- [x] The Prior-Season line carries xG for and against per game — overall, home and away —
      under the form lines' both-or-nothing rule: short coverage announced, zero coverage
      reading unavailable, a promoted club unavailable by nature.
- [x] The two instruction sentences appear in the closing block exactly as ADR-0043
      quotes them — score as the likeliest exact scoreline, probabilities scored by RPS
      over the ordered outcomes — and a render test holds each verbatim.
- [x] No coaching sentence enters; the additions are facts and the game's rule, nothing
      else (ADR-0018 unmoved).
- [x] The rendered packet is read by eye over production data for both Competitions —
      the `context:show` discipline that found both of PD's earlier moves.

### The additions, rendered — recorded 2026-08-19

Five of the six boxes are closed in code, all at the two seams spec 0020 named. The
sixth is the eye-read and is the user's to run; the commands are at the end of this
section.

The base-rates line renders once per context, between the current-Season table and the
two club sections — league-wide facts first, then per-club. Its shape, over the four
seeded results the suite computes it from rather than any production reading:

> Prior-Season base rates (2025-26 Premier League, 4 matches): home wins 50.0%, draws
> 25.0%, away wins 25.0%, 2.25 goals per match.

The count and the shares are computed over the prior Season's top-flight stored results
alone; what production renders is what the eye-read below is for.

It has two other states and both are tested as whole lines: a Competition with no
curated divisions reads `Prior-Season base rates: unavailable; no division history is
stored for this Competition.`, in the same family the table section's unavailable
sentence uses, and a curated Competition with no prior-Season rows reads
`Prior-Season base rates: no 2025-26 Premier League results stored.` rather than dividing
by zero. The match count is singular where it is one, which the seeded suites do render.

The xG rates are appended to the points-per-game line rather than given one of their
own — ADR-0043 says appended, and one Prior-Season rate line carrying two rates is what
that means — in the same venue shape:

> Prior-Season points per game: 3.00 overall, 3.00 home, 3.00 away; xG for and against
> per game 2.25-0.75 overall, 2.00-1.00 home, 2.50-0.50 away.

under the form lines' both-or-nothing rule, which is now one function rather than two
copies of it: short coverage announces itself
(`2.00-1.00 (over 1 of 3 matches) overall`), a venue with no covered match reads
`unavailable`, and a promoted club reads unavailable at every venue by nature — Understat
carries no second division, which the cross-Season packet test asserts on Coventry.

The two instruction sentences close the block, verbatim from ADR-0043 and beside the
shape rules they qualify. No coaching sentence entered: what was added is two
arithmetic sums over stored results and the game's own rule, and ADR-0018 is unmoved.

**The two frozen sha pins are red, and that is slice 4's box.** Changing the packet
changed both renders, so `test/openrouter-entrant.test.ts`'s two checksum tests fail
until the constants move — which slice 4 does in one reviewed change, from real renders
of this template. Every other test over the packet was moved with the sentences: the
builder suite, the prediction and pre-flight packets, and the stored-context hash the
prediction path pins.

The eye-read, from a shell with production's `DATABASE_URL`:

```
SEASON=2026-27 GAMEWEEK=1 npm run context:show
SEASON=2026-27 GAMEWEEK=2 COMPETITION=PD npm run context:show
```

The Premier League's Gameweek 1 and La Liga's Gameweek 2 are the two packets the gate
freezes. What to read for: that the base-rates line carries a real 380-match count and
not an `unavailable` nobody intended, and that the xG lines are not `unavailable` across
the board — spec 0020 asks for prior-Season Understat rows to be verified in production,
and this is the read that verifies them.

### The eye-read — recorded 2026-08-19

Both packets were rendered against production and read. **The three additions render
correctly in both Competitions**, and spec 0020's verify-early question is answered yes:
the prior-Season Understat rows exist for both leagues.

The base-rates line carries a real count in both, once per context, between the table
and the club sections:

> Prior-Season base rates (2025-26 Premier League, 380 matches): home wins 42.6%, draws
> 27.4%, away wins 30.0%, 2.75 goals per match.

> Prior-Season base rates (2025-26 La Liga, 380 matches): home wins 48.9%, draws 24.5%,
> away wins 26.6%, 2.69 goals per match.

The xG rates read real numbers for every club that spent the prior Season in the top
flight — seventeen of La Liga's twenty in the Gameweek 2 packet, and Arsenal and
Manchester United in the Premier League's — and `unavailable` at every venue for exactly
the promoted clubs, which is Understat carrying no second division and not a fault:
Málaga CF, RC Deportivo La Coruña and Real Racing Club de Santander from the Segunda
División, Coventry City and Hull City from the Championship. One club renders the
short-coverage sentence the both-or-nothing rule promises,
`1.41-1.47 (over 37 of 38 matches) overall, 1.59-1.14 (over 18 of 19 matches) home`, and
no venue anywhere reads `unavailable` next to a covered one. The two instruction
sentences close every packet verbatim. No sentence needs to move, so slice 2's tests
stand as committed.

**What the read found instead is outside slice 2 and inside the gate.** La Liga's
Gameweek 2 packet, rendered at its own Lock instant of 2026-08-20T17:30Z, states that no
2026-27 result has been played:

> La Liga table: no result has been played yet this Season.

with `Current-Season overall: no matches played.` under all twenty-eight club sections
and every form line stopping at 2026-05-23 — while slice 1's five settled Fixtures sit in
the record above. The cause is one production variable: `FOOTBALL_DATA_SEASON` is
`2025-26` while `SEASON` is `2026-27`, so `fetchFootballDataSeason` pulls
`mmz4281/2526/*.csv` every day and no 2026-27 row ever reaches `historical_matches`. The
upstream `mmz4281/2627/SP1.csv` does carry all five results, so nothing is missing at the
source. Scoring is untouched — it reads `fixtures` for results and `historical_matches`
only for the prior Season's Elo baseline — which is why slice 1's numbers are right while
the packet's are blind.

`requireCurrentSeasonMatchesAfterFirstDeadline` is the guard for exactly this, and it
sleeps through it: it dates itself from the *Premier League's* Gameweek 1 deadline
(2026-08-21T17:30Z) and asks `h.competition = 'PL'`, so it cannot fire until a day after
PD's gate. Its own comment says each Competition needs its own, and that remains its own
change rather than this ticket's.

The fix before the gate is the variable, not code: set `FOOTBALL_DATA_SEASON` to
`2026-27` and dispatch `fetch.yml`, which is due tonight for slice 1 anyway. The delete
in `fetchFootballDataSeason` is scoped to the season it is storing, so the 2025-26 rows
the base rates and the prior-Season lines are computed from are not touched by the flip.
Both are the user's to run.

### The variable, flipped — recorded 2026-08-19

`FOOTBALL_DATA_SEASON` was set to `2026-27` and `fetch.yml` dispatched. La Liga's five
results reached `historical_matches` and the Gameweek 2 packet now opens on them:

> La Liga table (results through 2026-08-17):
> 1. Alaves — Pld 1, W 1, D 0, L 0, GF 3, GA 0, Pts 3
> ...

with `Current-Season overall: 1 played, 0W 0D 1L, GF 1, GA 2, shots 6-13, on target 3-4,
xG 1.91-2.02.` under the clubs that played, the venue splits agreeing, and the
2026-27 result heading each form line with its xG joined. The Premier League's packet is
unchanged — its 2025-26 rows were never in the flip's path, the delete being scoped to
the Season being stored — and its table still says no result has been played, which is
true until 2026-08-21.

**The run still exited non-zero, for a new and self-healing reason.**
`mmz4281/2627/E0.csv` does not exist yet: football-data.co.uk answers `HTTP 300 Multiple
Choices` offering EC, E3, E2 and E1, because the Premier League has not kicked off. The
English file appears once it has, so the daily fetch stays red until 2026-08-22 or so and
then goes green with nothing done to it. Nothing is lost meanwhile: Competitions are
walked in code order, PD is stored before PL is attempted, and each failure is collected
rather than thrown.

That the run threw a single `FootballDataSourceHttpError` rather than an `AggregateError`
also settles the older alarm: **La Liga's Understat xG failure did not recur**, and the
2026-27 xG joined to the form lines above is that fetch's own output. Understat's
`getLeagueData/La_liga/2026` reads clean at source too — 380 dates, five results, all
twenty names resolving.

For tonight: the completing run's fetch will exit non-zero on E0 whatever else it does.
Read the stored result for Club Atlético de Madrid v Málaga CF, not the exit code, before
dispatching `score.yml`.

## 3 — The bench: the amended question against Gameweek 1's record

**What to build:** The amendment's first contact with real Base Models happens off the
record. The amended template runs over La Liga's Gameweek 1 through the dry-run harness —
archived snapshots into a scratch store, real calls, nothing written to the record — and
the run is read beside the sixty v1 Predictions for what six Fixtures can say: failures,
not skill.

**Blocked by:** 2. (The comparison half reads whatever results have settled — five
Fixtures serve it as well as six, and what the bench chiefly measures reads no result
at all.)

- [x] Gameweek 1's snapshots are verified to cover what the bench replays before the
      bench is attempted — a dry run replays bytes and invents none.
- [ ] The bench runs the amended builder over the same Fixtures at the same as-of instant
      and touches no production table: the context identity, the restarted scoring and
      ADR-0032's objection all forbid it, each independently. **Two of the three, and the
      third accepted rather than pending.** The Fixtures are the same six and nothing was
      written to production. The instant is an hour off production's and production is
      read; both deviations are measured below, and the measurement is what settles them.
      The packet does not move across that hour, checked source by source rather than
      assumed, so a re-run at the absolute instant would spend a second roster's worth of
      paid calls to confirm what reading already established. The box stays open because
      it says "same" and "touches" and neither is literally true of what ran. No work is
      waiting behind it, and nothing in slice 4 reads it.
- [x] What is read from it is what ADR-0026's dry opening read: Repair and format
      failures, the incoherence rate under the new sentences, and whether the base-rates
      anchor is picked up at all — with RPS deltas at n=6 named as noise in the findings.
- [x] The findings are written into this ticket, and any sentence they move is moved in
      slice 2's tests before the flip.
- [ ] The bench gates nothing: if the clock runs short, ship-or-freeze applies and the
      flip proceeds without it, recorded as skipped. **N/A** — the clock did not run
      short, the bench ran, and nothing was skipped. The evidence that would close this
      box lives in a branch that did not happen; it is left open rather than ticked.

### The bench, run — recorded 2026-08-19

The amended template was put to the real roster over La Liga's Gameweek 1 through
`predict:preview`, dated six hours before that Gameweek's own Lock, against a throwaway
cluster built from the archive. Fifty forecasts, ten Gaps, 342 seconds, 115,630 tokens in
and 115,579 out. **Nothing was written to production**, and that is the accurate claim
rather than the box's "touches": production is read — `raw_snapshots` for the bytes and
`models` for the roster — over a session `restrictToReadOnly` downgrades before the first
statement, and every write goes to the `startTemporaryPostgres` cluster dropped in the
`finally`. The run's own output is kept as
[a report](../reports/2026-08-19-match-restart-bench-pd-gw1.md).

**Two things had to move before the bench could be attempted**, both recorded in the
commits rather than here: `previewGameweek` named `PL` as a literal and ran at the wall
clock, so La Liga's Gameweek 1 would have answered after its own Lock and returned sixty
deadline misses rather than fifty forecasts.

**The archive covers the replay, with one hole.** `npm run dry-run` over PD Gameweek 1
builds six contexts for exactly the six Fixtures the Lock owned and reports
`Gaps: 60 (expected 60)` — the archive answers for every source the packet reads. Two
conditions on that. It must run with `FOOTBALL_DATA_SEASON=2025-26`, because since this
morning's flip the archive holds a `football_data:2026-27:E0` snapshot whose body is the
300 page, and the replay fetcher answers 200 to everything it holds, so the HTML reaches
the CSV parser; 2025-26 is also what production itself was running at Gameweek 1's Lock,
so the rehearsal is the more faithful for it. And the rehearsed packet reads
`xG unavailable` on every line: the prior Season's xG arrives through the one-off
`fetch:xg-history` backfill rather than the daily fetch the rehearsal replays. **The
bench therefore tested the base-rates line and the two instruction sentences, and did not
test the xG line** — which the eye-read above covered over production instead.

**The instant is not production's, by an hour.** Box 2 asks for the same as-of instant
and the bench did not have it. Production froze La Liga's Gameweek 1 at a deadline of
2026-08-15T17:00:00Z and ran its main Predictions at `deadline-6h`, 11:00Z. The rehearsal
builds its `gameweeks` table from the archive into an empty database, so it re-derives
the deadline from the first kickoff's ninety-minute lead — Deportivo Alavés v Getafe CF
at 17:30Z gives 16:00Z — and `deadline-6h` off that is 10:00Z. The frozen production
deadline is never replayed, so no `PREVIEW_AT` alone would have fixed it; an absolute
instant (`PREVIEW_AT=2026-08-15T11:00:00Z`, which `resolveDryRunInstant` accepts) would
have matched production's clock while the packet stayed bounded by the re-derived
16:00Z Lock.

Nothing in the packet moves across that hour, and that is checkable rather than hopeful:
every source the packet reads is bounded by the deadline, La Liga's first kickoff of the
Season was 17:30Z so no result exists in the gap, the prior-Season rows and the xG rows
predate both instants, Squad Changes are partitioned by Gameweek rather than by time, and
La Liga renders no FPL section at all. The packet the bench sent is the packet 17:00Z
would have produced; the *claim of identity* is what was wrong, not the bytes. Whoever
repeats this bench should pass the absolute instant and say so.

**Format failures are one seat's.** Gemini 3.1 Pro Preview failed the schema on four of
its six Fixtures and reached the other two only after three Repairs each, which is the
ceiling. Every other seat answered every Fixture with no Repair at all. The remaining six
Gaps are timeouts and not format: DeepSeek V4 Pro three, Qwen3.8 Max two, Kimi K3 one.

**ADR-0043 predicted this would fall, and it did not.** "The expected effect is a lower
incoherence rate across the board" is the decision's own sentence, and it is the thing
this bench was in a position to check. Counted by the scorer's rule — the likeliest
outcome by `probs` against the outcome the Predicted Score implies — the bench runs 17
incoherent of 50 (34%) against the record's 18 of 60 (30%) under v1. **The expected fall
was not observed at n = 50; the reading moved the other way by 4 points, which at this n
is noise either way.** What is not noise is what changed underneath it:

| | v1, the record | The bench, amended |
| --- | --- | --- |
| Draw scorelines | 23 of 60 | 17 of 50 |
| Draw ranked likeliest | 5 | **0** |
| Highest draw probability anywhere | 0.380 | 0.300 |

Every incoherent forecast in the bench is the same forecast: a 1-1 scoreline with Home
ranked top. No seat ranked the draw first even once, where v1 did five times.
**The amendment's own sentence and the Coherence metric point in opposite directions**,
which is the mechanism behind the number ADR-0043 expected to fall: `score is the exact
final scoreline you judge most likely — not expected goals rounded` invites exactly the
1-1-under-a-Home-lean answer Coherence counts as incoherent, and the sentence beside it
naming RPS pushes the probabilities toward the distribution rather than toward the
scoreline. ADR-0043 accepted that Coherence changes meaning and expected the rate to
improve; what this run shows is the meaning changing without the improvement. That is a
question about a metric and its decision, not a defect in a rendered sentence, so **no
sentence moves and slice 2's tests stand** — which is also what box 4 asks. It is
recorded here for whoever reads Coherence after the restart rather than acted on before
the gate.

**The base-rates anchor is picked up.** The roster's mean forecast moved toward the line
the packet now states, on both halves that matter:

| | Home | Draw | Away |
| --- | --- | --- | --- |
| Base rates, as rendered | 0.489 | 0.245 | 0.266 |
| v1, the record | 0.434 | 0.281 | 0.286 |
| The bench, amended | 0.458 | 0.259 | 0.283 |

Total absolute distance from the stated rates falls from 0.111 to 0.062. The per-Fixture
spread across seats is narrow throughout, 0.07 to 0.15 on the home probability. Six
Fixtures and one run of each is far too little to call this an effect rather than a
coincidence, and it is recorded as what it is: consistent with the anchor being read, and
not proof of it.

**RPS deltas are not reported at all.** At n=6 they would be noise, ADR-0026's dry
opening said so, and the bench was not scored.

Half of this comparison can be re-derived and half cannot, which is worth stating
plainly. The record's sixty Predictions are re-countable at any time from
`docs/queries/0020-slice-3-v1-coherence.sql`, by the scorer's own rule and the scorer's
own `locked_in_gw` attribution. The bench's fifty — the 17, the draw counts, the means —
came out of a cluster that was dropped with the process, from Base Models that answer
differently each time. Re-running the command produces a different run, not this one.
What stands behind those numbers is the run's own output, kept at
[docs/reports/2026-08-19-match-restart-bench-pd-gw1.md](../reports/2026-08-19-match-restart-bench-pd-gw1.md).

## 4 — The flip and the re-seat

**What to build:** Both Competitions stand on the restarted versions: the Premier
League's `match/2026-27-v2` amended under its own name, La Liga on `match-pd/2026-27-v2`
with seats seeded from the v1 roster. From this merge, the v1 seats are invisible to
every run, alert and roster read, and the false sentence in the constants' comment is
gone.

**Blocked by:** 2, 3, and the *completion* of 1 — the complete scoring run over all six
Fixtures, which arrives with the last kickoff, not with the ticket's opening.

- [x] The constants move in one reviewed change: La Liga's version string to v2, both sha
      pins re-pinned from real renders of the amended template.
- [x] The constants' comment no longer claims the Premier League's version has been used;
      it records what ADR-0042 established instead.
- [ ] La Liga's v2 seats are seeded through the same door production seats have always
      entered by — same Base Models, providers and quantization pins as v1's ten.
- [x] The roster window is exercised or explicitly declined: the GLM seat's 5.3 decision
      is made before the gate and recorded either way, because the window closes whether
      or not anyone chose.
- [x] The coexistence suites prove the boundary the flip owns: v1 seats out of
      prediction runs, gap alerts and every roster read; v2 seats in. The Exhibition
      clause this box used to carry is gone, to a ticket of its own — the reason is
      below, and the short of it is that `replayMatchExhibition` could not select La
      Liga before the flip either, so the claim was never the flip's to prove.
- [ ] Prediction pre-flight passes for both Competitions on the restarted versions.

### The seat id the restart could not have — recorded 2026-08-19

The two sha pins were re-taken from rendered packets read before the values were
written: both carry ADR-0043's three additions — the base-rates line, xG for and
against per game on the Prior-Season line, and the two closing instruction sentences —
and La Liga's carries neither an availability section (ADR-0037) nor an FPL block.
`match/2026-27-v2` is `cdebf27b`; `match-pd/2026-27-v2` is `f54e7347`.

Then the re-seat refused to be a constant move. `enterSeasonRoster` names a seat
`<prefix>/<slug>` where the prefix is the Prompt Version's leading segment, so
`match-pd/2026-27-v1` and `match-pd/2026-27-v2` want the same ten ids — and the write is
`on conflict (id) do update set prompt_version = excluded.prompt_version`. Seeding v2
through the door would not have created rows; it would have relabelled the ten rows La
Liga's Gameweek 1 hangs off, and its sixty Predictions would have become Predictions of
v2 seats. ADR-0042's "kept whole, not merged" and slice 5's frozen block both die there,
silently, in a run that reports success. Spec 0020 says it plainly — "**New `models`
rows** under `match-pd/2026-27-v2`" — and the code could not write one.

So the seeding reads the record before it names a seat: where a plain id is already
stored under another Prompt Version, the whole roster takes the version's own segment
instead — `match-pd/2026-27-v2/claude-opus-5` — and the retired ten stand untouched.
Read from the record rather than switched on the version string, because no version
tells the two cases apart: `match/2026-27-v2` is the Premier League's first-used version
and keeps its plain ids, `match-pd/2026-27-v2` follows a v1 that ran. `seatSlug` and the
dashboard's `entrantSlug` now read the last segment rather than the second, which leaves
every existing id and every `?entrant=` link answering exactly as before — a Base Model
slug carries no slash, so the last one ends the prefix however long it is.

The test seeds the ten v1 rows, runs the door, and asserts twenty rows: the retired ten
at their own ids under v1, the standing ten new under v2 seating the same Base Models,
and a second run of the door still twenty. It fails against the old naming with ten.

**What the flip does not need.** Every seat-selecting query already filters
`prompt_version = $n` against the standing version — `predict-gameweek.ts:156` and
`:174`, `gap-alert.ts:164`, `score-match-gameweek.ts:1589`, and six reads in
`dashboard/read-api.ts` — and `refuseARosterTheRecordDisagreesWith` reads by
`MATCH_PROMPT_VERSIONS`, which the flip empties of v1. The v1 seats leave every run,
alert and roster read by the constant moving, with no filter written for them.

**Left standing, and named rather than fixed.** `replayMatchExhibition` loads its seat at
`MATCH_PROMPT_VERSION` — the Premier League's — and takes no Competition, while its
`settledGameweeks` selects contexts by season and track alone and so sweeps La Liga's
Gameweek 1 in. That predates this slice and is not one of its boxes. Contexts carry no
Prompt Version at all (`migrations/0001_initial.sql`), so nothing about the flip makes a
stored context unresolvable.

So box 5 lost its Exhibition clause rather than waiting on one. The box asked for "an
Exhibition replay of Gameweek 1 still resolving v1's stored contexts", and the run it
names cannot select La Liga at all: it loads a seat at the Premier League's constant,
hardcodes `competition: "PL"` where it writes, and asks which Gameweeks are Settled
without naming a Competition. None of those three is something the flip did, and all
three were as true yesterday. A box the flip cannot discharge because of a defect the
flip did not cause is the wrong place for the defect to be tracked, so the clause moves
to a ticket of its own — with the fix named rather than the question reopened, which is
what separates it from the `seatSlug` decision above: that one is an open decision about
a build boundary, this one is a bug with a known shape.

**A criterion met, and the decision sent where it belongs.** The `seatSlug`/
`entrantSlug` twins took their first forced simultaneous edit in this slice — both moved
`indexOf` to `lastIndexOf` in lockstep, which is the exact case the repo's own bar for
extraction waits for. Noticed, not merged: their doc blocks already say the merge is
moving `entrant-link.ts` into `src/`, a build-boundary decision spec 0017 declined to
make and this ticket declines the same way (its own Out of Scope: dashboard work beyond
the frozen block). A ticket of its own carries it, citing this slice's commit as the
evidence that opened the question.

**Boxes 1 and 2 are ticked, and this must not be pushed.** `score.yml` checks out
`origin/main`, not the working tree, and slice 1's rule holds until the last kickoff has
been scored: the constant on v2 with no v2 seat seeded selects a version no row carries,
and Gameweek 1 stays at five Fixtures forever. So the flip sits on `main` unpushed until
the completing run has written every v1 seat's rows, and the push is the act that is
ordered — not the commit. **Found by review**, which caught this as a commit on `main`
before the run and was right about the order; what it read as already deployed was not,
because `origin/main` stood seven commits behind. Right about three smaller things too
— the claim that v1 was still unused, left standing in the pin's own comment one file
over from the constants this change corrects; a `match-pd/2026-27-v2/` literal written
three lines after the same change replaced a literal for turning every restart into a
false failure; and a qualified id spelled `${seatPrefix}/${version.split("/")[1]}/`,
which re-derives the version from its own pieces and drops a third segment in silence
where `${version}/` is the same string and says so.

**The slug seam had no restart id in it.** The last-segment read was written for
`match-pd/2026-27-v2/claude-opus-5` and every assertion on it used a two-part id, which
`split("/")[1]` answers correctly — the change had no test that failed without it. The
Entrant-link suite now reads a three-segment id and crosses a link into a restarted
La Liga, and both go red under the old reader. The restart's own seeding test asserts
whole stored identities rather than ids and Base Models, because a door that copied the
names and dropped the provider or the quantization pin would have passed it (story 14),
and it builds its expected ids from `seatSlug` rather than spelling the prefix's length
out a second time. **Found by review.**

**The id qualification is box 3's work, landed under box 1's tick.** Not extra: the
constant cannot move without it — the door would relabel the retired ten rather than
seat ten new — so the two are one change or neither is safe. Box 3 stays open because
what it asks for is the seeding *run*, against production, which has not happened.

**Box 5, as narrowed, is closed.** Three seams, each with a retired La Liga seat sitting
in the store beside the standing one and nothing but the Prompt Version telling them
apart. The prediction run and the Gap query: `predictGameweek` for `PD` calls once,
stores one Prediction and one attempt under the standing seat, and returns no alert at
all — the retired seat holds no Prediction for the Locked Fixture, so a query that saw it
would have returned a `GapAlert` naming it. The roster read: the Fixtures endpoint's
slots are the roster on every Fixture, and La Liga's read one seat. Each was checked
against the filter removed — the run calls three Base Models instead of one, and four
Fixture-endpoint tests go red — because a coexistence test over a store with one version
in it proves nothing, which is how the slug seam got past the last review.

The Exhibition clause left this box for its own ticket, and the narrowing is right:
`replayMatchExhibition` loads its seat at `MATCH_PROMPT_VERSION` and takes no
Competition, so it could not select La Liga before the flip either. Contexts carry no
Prompt Version at all (`migrations/0001_initial.sql`), so nothing about the flip makes a
stored context unresolvable — the hole is the Competition axis, and it predates the
restart.

### The window used, on one track of two — recorded 2026-08-19

GLM 5.3 is real and it clears the edge that decides everything else. OpenRouter
publishes it as `z-ai/glm-5.3`, canonical slug `z-ai/glm-5.3-20260816`, released
**2026-08-18T20:57:35Z** — inside ADR-0034's arrival cutoff of 2026-08-19 by some
twenty-seven hours. Z.AI is its only endpoint and serves it at fp8, the same pin the
outgoing seat carried, so the swap moves the Base Model and nothing else about how it is
reached. The outgoing seat is `z-ai/glm-5.2`, `z-ai/glm-5.2-20260616`, also Z.AI at fp8.

The Match track's seat is moved in `SEASON_ROSTER`: `match/glm-5.2` becomes
`match/glm-5.3`. **The seeding run needs one operator step before it.** A swap changes
the seat id, so the outgoing row stands in `models` under a Match Prompt Version naming
a Base Model the roster no longer has, and `enterSeasonRoster` refuses exactly that —
"Seat match/glm-5.2 is stored at a Match Prompt Version and is not in the roster being
entered". The refusal is right and already tested; the step is ADR-0034's own road,
which deleted the outgoing Qwen3.7 and Grok 4.5 rows the same way. Delete
`match/glm-5.2` before `roster:enter`, not after, and only once the FPL side below is
settled.

**The FPL track cannot be moved from here, and may not be movable at all.** Its ten
seats are not in any constant — ADR-0034 enters them by hand at `fpl/2026-27-v2` — so
"update both tracks" is one code edit and one `update models` against production. Worse,
ADR-0034 names the edge this runs into: `manager_states` is insert-only, so once a seat
has a Season path, reassigning it to a different Base Model is not representable, and it
says in the same breath that "moving only the Match seat would leave one Entrant name
covering two Base Models across the tracks". So the Match-side edit above is either half
of a swap or a defect, and which one it is depends on rows this repository cannot see.
`docs/queries/0020-slice-4-fpl-track-started.sql` asks: no `manager_states` rows for
2026-27 means the door is open and the FPL seat moves with it; any rows and the decision
is between two Base Models under one Entrant name and leaving GLM 5.2 seated on both.

**The door was open, and the swap is made on both tracks.** The guard ran and did not
fire: `fpl/glm-5.2` had walked no `predictions`, `manager_states`, `attempts`, `scores`
or `contexts` row of 2026-27, so the FPL track had not started and ADR-0034's
insert-only edge had not bound. `UPDATE 1`, and the ten seats at `fpl/2026-27-v2` now
read `fpl/glm-5.3` — `z-ai/glm-5.3`, `z-ai/glm-5.3-20260816`, Z.AI at fp8, every other
seat untouched. The window ADR-0042 reopened is used, once, for the one use it was
expected to have.

**Until `roster:enter` runs, the two tracks disagree, and that is the state to watch.**
The FPL track is on GLM 5.3 in production; the Match track is on GLM 5.3 in the constant
and still on GLM 5.2 in `models`. That is exactly the one-Entrant-name-over-two-Base-
Models shape ADR-0034 refuses, held deliberately for a few hours because the Match seat
cannot be re-seeded until slice 1's completing run has written Gameweek 1 under v1. It
closes with the seeding run, which needs `match/glm-5.2` deleted first. If the flip is
abandoned instead of landed, this is the row that has to go back.

### The Exhibition Run takes a Competition — recorded 2026-08-19

**The clause box 5 sent away is settled.** `replayMatchExhibition` takes the Competition
it replays and threads it through everything it reads and writes, which is what its own
ADR always said it was: ADR-0032 defines an Exhibition Run as replaying one Competition's
stored contexts under that Competition's Prompt Version. Recorded here and not under
slice 4's boxes, because the narrowing above is right — none of this is the flip's doing,
and all of it was as true the day before. Three things were the one-league assumption,
all live from the moment `contexts` held two Competitions:

- The seat was loaded at `MATCH_PROMPT_VERSION`, the Premier League's frozen constant. It
  reads `matchPromptOf(competition).version` now, as every other seat-selecting call site
  does — which also makes a La Liga Exhibition sayable, where the door's own comment said
  it was deliberately unsayable until this work happened.
- `attemptMatchCalls` was passed `competition: "PL"` as a literal, under a comment saying
  no other Competition had ever had an Exhibition Run. That value is what every Prediction
  and attempt the run writes is filed under; the literal and the comment are gone.
- `settledGameweeks` selected contexts by Season and track alone, and its `not exists`
  joined `fixtures` on Season and Gameweek alone, so it mixed the two leagues' Gameweeks
  in both directions. `remainingFixtures` was the same: its `fixtures`/`contexts` join and
  both of its `not exists` subqueries carried no Competition either.

The door in `load-exhibition.ts` widened with it. Its `FrozenPromptVersion` union named
the two constants precisely so a non-`PL` Exhibition could not be said, with a comment
naming this change as the work that should widen it. What was actually keeping a replay
off the wrong league's prompt was never the type — a Match caller derives the version
from the Competition it was handed, and the row check refuses a seat carrying another —
so the type is `string` and the check is the guard.

Two tests, both red against the old code for the right reasons. A La Liga replay of
Gameweek 1 puts its six stored contexts on the wire byte for byte and files every
Prediction and attempt under `PD`; it failed before with
`exhibition-pd/late is at Prompt Version match-pd/2026-27-v2, not match/2026-27-v2` —
the pinned Premier League constant, refusing the only seat that could have run it. And a
Premier League replay covers Gameweek 1 alone where La Liga holds a settled Gameweek 3;
it failed before with `Fixture 101 has no Lock`, which is a Premier League run reaching
for a La Liga Fixture and finding the Lock it has no business assigning.

Contexts carry no Prompt Version column (`migrations/0001_initial.sql`), so the six
Gameweek 1 contexts built under the retired `match-pd/2026-27-v1` stay replayable under
the standing v2 — the reason an Exhibition can reach Gameweek 1 at all after the flip,
and what the first test asserts by sending their stored bytes unchanged.

The command reads `COMPETITION` the way `predict.ts` does, defaulted to `PL`. Safe to
default here for a stronger reason than that command has: the seat is loaded at the named
Competition's Prompt Version, so a La Liga row run under `PL` is refused before the first
paid call rather than replayed under the wrong league's prompt.

What the clause asked for — an Exhibition replay of Gameweek 1 still resolving v1's
stored contexts — is a test now rather than a claim, and slice 4's boxes are unmoved
by it.

## 5 — The frozen block

**What to build:** A reader of the La Liga page sees Gameweek 1 whole and labelled —
"Gameweek 1 — played under match-pd/2026-27-v1, before the restart" — each v1 seat's
Match Points, Bet Points and RPS, beside a leaderboard that begins at Gameweek 2 and
contains nothing of it.

**Blocked by:** 1, 4.

- [x] The block renders from stored scores only, under the exact label, listing every v1
      seat's Gameweek 1 numbers — no intervals, no Comparison Anchor, no season totals.
- [x] The block covers the six Fixtures Gameweek 1's Lock owned and says nothing of the
      four the calendar moved — those are later Locks' Fixtures, asked under the
      restarted version, and a reader comparing the block against a ten-row fixture
      list must not read the difference as missing data.
- [x] Its read names the retired version explicitly and is the only read anywhere that
      does; every roster-shaped endpoint returns v2 seats alone, proven over a store
      seeded with both versions.
- [x] The Premier League's page carries no such block — it has no retired Gameweek — and
      a test says so rather than assumes it.
- [x] Absent scores render as the block saying so, not guessing: the state means slice 1
      was broken, and the page's honesty is the alarm.

### Built ahead of both blockers — recorded 2026-08-19

The block is code and proven over a seeded store; what waits on slices 1 and 4 is the
data it reads, not the surface. Until the completing scoring run lands and the flip
deploys, the deployed page draws its absent-scores sentence, which is the fifth box
behaving rather than failing.

**A retired Gameweek is a field on the Competition, not a flag anywhere.**
`MATCH_PROMPTS.PD` carries `retired: { version: "match-pd/2026-27-v1", gw: 1 }` and `PL`
carries nothing, so "does this league have a block" is answered by the same record that
answers "which version does it run" — one home, and no page or endpoint holds a second
spelling of a version. `retiredPromptOf` is the read; both boxes about the Premier League
fall out of it returning null there.

**The heading is built once, from where both of its variables live.**
`retiredGameweekLabel` in `openrouter-entrant.ts` is the only place ADR-0042's sentence is
spelled. It reaches the page through `competitionRoutes`, so the label is in the built
HTML like every other thing on that page that is not a number — and a label naming a
version the read does not filter by is the one lie this block can tell, which is why the
two are built from one value.

**`/api/{code}/retired` is the only read that names a retired version.** It filters
`prompt_version` by the retired string and reads the *per-Gameweek* metrics at Gameweek 1;
the Season-to-date rows are what a merge would look like, so the test writes one and
proves it stays out. Served only where `retiredPromptOf` answers, so the Premier League
gets the 404 every unserved path gets rather than an empty block claiming something was
retired and scored nought. The body has five fields and the assertion pins the list: an
interval or a Comparison Anchor would each have to be a sixth.

**The Fixture count is `locked_in_gw` and not `gw`.** Six, over a seeded ten that were all
scheduled into Gameweek 1 — which is the shape the real calendar left behind, and the
only shape in which the box's failure is reachable. The page prints the count with the
sentence that says where the other four went.

**Absent scores are three em dashes and a sentence, never a nought.** The seats stay
listed; the scorer writes nothing at all for a Gameweek it has not scored, and a nought
would report that as a Gameweek every seat lost. A failed fetch gets its own line inside
the block rather than the page's error line — the leaderboard above it may have arrived,
and one unread block must not report the whole page as unread.

**Not hidden until the fetch lands, unlike the three states above it.** Those are three
readings of one body and only one may be shown; this is a block that either belongs on
the page or was never built into it.

### The leaderboard did not begin at Gameweek 2 — found by review, 2026-08-19

The first writing of this slice put the block below the ranking and called the position
the separation. It is not. Two reads in the leaderboard name no Prompt Version at all,
because neither is about a seat: `scoredThrough` takes `max(gw)` over the Competition's
RPS rows, and `settledFixtures` counts every Locked Fixture with a result. A Gameweek is
scored, and a Fixture settles, whoever answered it — so the moment slice 1's completing
run writes La Liga's v1 rows, the ranking would have dated itself at Gameweek 1, ranked
the restarted seats as ten noughts against a Gameweek none of them was entered for, and
counted that Gameweek's six Fixtures into the `n` the whole ranking is presented against.
That is the merge ADR-0042 forbids, arriving through the one door that was not watched,
and it is exactly the accidental read story 28 asks to be made impossible.

`rankedFrom` is where it is made impossible: one past the retired Gameweek where a
Competition has one, one everywhere else, read from the same `retired` field the block
is built from. Both reads take it, and so does the pre-season Lock — a reader waiting for
La Liga's next deadline is waiting for the restarted version's first, not for one that
has been played and retired.

The test seeds the v1 Gameweek and then asserts the leaderboard beside it: `throughGw`
null, `settledFixtures` nought over six settled Fixtures, `nextLock` at Gameweek 2. Then
it scores Gameweek 2 and settles one of its Fixtures, so a filter that answered null
whatever the store held would fail — which the first writing of the assertion did not
catch until the constant was walked back by hand.

### The block published two rankings' figures with no sentence — found by review

ADR-0012's rule reaches further than the leaderboard: the scorer stores its qualification
in the detail of every row a figure can be read off "so a value cannot reach a reader
without it". The block published Match Points and Bet Points with neither. It reads both
back off its own rows now — the per-Gameweek rows carry them, so this needed no plumbing,
only the two columns — and it fails closed like the ranking does, because a figure here
always comes from a row and a row always carries the sentence, so a missing one is a
storage fault rather than the leaderboard's one documented exception. The guard is walked
into by a test that strips the sentence and leaves the figures.

RPS has no stored sentence anywhere and needed the third: `RETIRED_GAMEWEEK_CAVEAT` says
one Gameweek supports no claim, which is ADR-0042's own reason for refusing this block the
interval that would be its claim. It is a constant, not a row — it qualifies no computed
number, and the retired version's rows were written before this block existed.

Beside it, the block's "is anything published" question asked only the Match Points. A
seat holding Bet Points and no Match Points would have printed a number under the sentence
saying nothing is stored. It asks all three figures now, and the page reads the body's
answer rather than deriving a fourth of its own.

### A suite that deleted the evidence before asserting on it — found by review

Three of the tests ran after the absent-scores case had deleted every score, so the
sentence "proven over a store seeded with both versions" covered the seat filters and
nothing else — which is precisely how the `scoredThrough` bug above survived a suite
written to catch it. The absent case runs last now, and the coexistence assertions run
with the retired Gameweek's rows and the restarted Gameweek's rows both standing.

The seed gained the trap that makes the window's shape load-bearing: a Reference Line,
which sits under the *Premier League's* frozen version and carries an RPS row for La
Liga's retired Gameweek. A ranking window narrowed by Prompt Version would keep it,
because its version is the one that still stands; a window narrowed by `role = 'entrant'`
would keep it too. Only the Gameweek excludes it, which is why the window is a Gameweek —
and the seed now fails if that reasoning is ever undone.

The absent-scores assertion was a loop of `toBeNull` per field, which would have passed a
seat that lost its name, an order that changed, or a fourth field arriving. One `toEqual`
over the whole array, as the test one screen above it already did.

### What the review asked for and did not get — recorded 2026-08-19

**The three left joins on `scores` stay duplicated.** `retiredGameweek` repeats the shape
`entrants` already has. They are not one thing yet: one reads per-Gameweek metrics at a
retired version's Gameweek, the other reads Season-to-date metrics at the scored one, and
nothing has ever forced the two to be edited together. Extract it the first time a change
has to be made in both.

**`retiredUrl` is still decided by the heading being null.** The heading and the endpoint
are built from one call to `retiredGameweekOf`, so the string cannot be present where the
field is absent; passing the field as well would put a second copy of the same decision in
the page's props to keep in step with the first.

**The block's two sentences are asserted nowhere.** The heading is pinned byte for byte
in `dashboard-competition-view.test.ts` because it is built at build time; the scope line
and the absent-scores line are written by the page's inline script, which nothing in this
repo drives. The prior art for making one testable is `chart-domain.ts` — lift the pure
part into a module the page imports — and that is not open to this page: its script
carries `define:vars`, which implies `is:inline`, and an inline script imports nothing.
So what is proven is the API half: every figure null with every seat still listed. What
is not proven is that the page turns that into the sentence. Recorded rather than papered
over with an assertion against the file's own source text, which would pin the string
without proving the branch ever reaches it.

## 6 — Head Coach changes, racing the cutoff

**What to build:** A Fixture's packet states each club's Head Coach changes — who left,
the stated manner, who arrived, and when — from Wikipedia's per-Competition
managerial-changes table, through the Squad Changes machinery: snapshot stored, shape
drift refused, club identities resolved, section absent outside its gate. If it is not
ready a day before the gate, it is abandoned without ceremony and waits for the next
version — ADR-0044 executing, not failing.

**Blocked by:** 4 — it re-pins the shas the flip set, and only a standing restart can
receive it.

- [x] Both season articles' tables are verified to exist and parse before the pipeline is
      committed to — a source that fails its first read loses the race on the spot.
- [x] Rows land in a per-Gameweek partition through a fetch that archives the raw
      wikitext and refuses a moved shape with the source named.
- [x] The section renders the Fixture's two clubs' events dated, in the Squad Changes
      section's manner; a club with no change costs no line; outside the gate the section
      is absent rather than empty.
- [x] Every rendered fact is bounded by the deadline the context is built for — a sacking
      after the Lock can never leak backward.
- [x] Everything is named head coach — table, section, source string — and "manager"
      appears nowhere in the slice.
- [ ] Both sha pins are re-pinned from real renders carrying the section, before the
      gate.
- [ ] If the cutoff passes first: the slice is closed as deferred with a line saying so,
      and no other slice reopens. **N/A** — the cutoff did not pass first, the
      pipeline landed, and nothing was deferred. The evidence that would close this box
      lives in a branch that did not happen; it is left open rather than ticked, on the
      same terms as slice 3's ship-or-freeze box.

### What the five boxes landed — recorded 2026-08-19

**Box 1, the read the race turned on.** Both articles answered 200 to a live request on
2026-08-19 and both carry a `===Managerial changes===` table: nine rows for the Premier
League, six for La Liga. That request is process evidence and is not in the suite — what
the suite holds is those bytes, pinned by digest, parsing into the events asserted below.
The box asks whether the source could be read before the pipeline was committed to, and
the answer is on this line rather than in a test.

**The two tables share a heading and nothing else.** England quotes its attributes and
spans one column; Spain writes `rowspan=2` bare and spans three at once, so a row can
arrive three cells short of the seven. The transfer lists' parser infers a single leading
span and cannot be reused: this one reads the counts and fills a grid, and a row that does
not come out to exactly seven columns stops the parse rather than being skipped. Skipping
would be worse here than on a transfer list — this table is short, and one row dropped is
a club that reads as having kept its Head Coach.

**The citations had to come out before the rows were split.** A `{{cite}}` runs to several
lines on both pages and its continuation lines begin with `|url=`, which is a new cell to
anything reading line by line. Every row carrying a multi-line citation would have arrived
one cell too wide with every column after it belonging to somebody else.

**A club is two link conventions, not one.** The season article links
`[[Real Madrid CF|Real Madrid]]` where the transfer list links `[[Real Madrid]]`, so the
transfer parser's rule — the article is the identity, and a row displaying one of the
twenty while linking elsewhere is refused — would have refused a page that is not wrong.
Here either identity resolves, and the check that replaces it is stronger: this column
holds nothing but the Competition's own clubs, so a Team cell resolving to neither is
drift and is refused by name.

**Box 4 is a render bound, not only a trigger.** The store's trigger already proves every
row was fetched before the Lock, and that is not enough: this table publishes the future,
so a Head Coach announced in April to arrive on 1 July sits on the page for three months
before the seat is his. The section drops anything dated after the deadline's own day and
keeps that day, which is the day everything stored was observed before.

**Two rows per change, not one.** The vacancy and the appointment are dated
independently, and a Gameweek whose deadline falls between them is a club genuinely
between Head Coaches. One row holding both would force the render either to publish an
appointment the Entrant could not know of or to drop a vacancy it certainly could.

**The archive replay needed the new page too, and would have gone quiet without it.**
`archive-replay-fetcher.ts` maps a URL back to the name its bytes are archived under, and
its own comments record this gap being missed twice — for Understat and for the transfer
lists — each time silent, because both sources degrade to a stated absence rather than to
a failure. A Head Coach section does the same. Mapped, and covered.

**Box 5, with one thing to know.** Everything this pipeline names is head coach: the
table, the section, the source string, the error classes, the module. The page's own words
— its `Managerial changes` heading and its `Outgoing manager` column labels — are quoted
in one constant each, to detect their movement and for nothing else. Pinning the labels is
what makes a reordered table a refusal rather than a page of confidently transposed names.

**Two rows lose the pairing, and that is the trade.** A club that changes Head Coach
twice in one Season renders as `In: C, D` and `Out: A, B`, and nothing in those two lines
says C replaced A. The identity index expects that club — the date is in the key for it —
so this is a real limit and not an impossible one. It is accepted because the alternative
costs more: one row holding both halves would have to publish an appointment the Entrant
could not know of, or drop a vacancy it certainly could, at every deadline falling between
the two dates. Worth revisiting only if a Season actually produces the case.

**Box 6 is still open, and the pins have moved once already.** Adding a section changes
every rendered packet, so both shas had to move for the suite to be honest about what the
template now says. They are taken from the test's own render, which is not what box 6
asks for: it wants them re-pinned from real renders before the gate, and that is still to
do.

### What the review asked for and got — recorded 2026-08-19

**`managerialChangesTable` was the slice's own word for its own idea.** Box 5 does not
reach the constants quoting the page's `Managerial changes` heading and its
`Outgoing manager` labels — those are the source's words, quoted to detect their movement,
and each carries the doc block saying so. It does reach a function name, which is the
repo's concept and not Wikipedia's: `headCoachChangesTable` now, and box 5's claim is true
as written rather than nearly.

**The shared module had no test of its own.** The extraction was proven by the
squad-changes suite passing unchanged over 108 cases — which is evidence the transfer
lists still read the same, not evidence the three widenings are what they say. Those bytes
happen to contain none of the widened shapes: the Spanish transfer list's nine
`{{flagicon}}` all sit outside `{{fs player}}`, so the new branch never fires there.
`test/wikitext.test.ts` pins each widening and the boundary it stops at, including that a
prefix which is not attribute-shaped is left where it is.

**A comment described a behaviour the code does not have.** `CELL_ATTRIBUTES` claimed to
handle the empty attribute list `||` leaves; it does, but the doc block read as though the
branch recovered a lost cell. It does not — a per-line splitter hands `||x` over as one
cell, and the branch only takes the stray pipe off its front.

**One dead branch removed.** `(?:#invoke:)?` in the flag-icon regex matched
`{{#invoke:flagicon`, which no page writes; the module call `{{#invoke:flag|icon|GER}}` is
the next regex's. `filledRows` also stopped borrowing the caller's issue list to throw
from.

**The third state came out.** `Neither club has changed Head Coach this Season.` was a
sentence for a case ADR-0044 answers differently: the absence of the event *is* the fact,
so a partition holding neither club leaves the heading with nothing under it. Kept: the
empty-partition status line, which says a fetch did not land and has the Squad Changes
precedent behind it.

**Arrivals now render before Departures.** A seat is vacated before it is filled, so
`Out` first is this data's own order — but the box asks for the Squad Changes section's
manner, and that section reads `In` then `Out`. A reader moving down a packet meets `In`
first everywhere or nowhere.

**"With the source named" is asserted now, and at the seam the spec names.** The parser
cases proved the shapes and only that a typed error was thrown. The message is pinned to
the source prefix, and a moved shape is proven to reach *the fetch* as a failure naming
the page, with the bytes archived and the already-read Gameweek keeping all eighteen rows.

### The second review, and the one real bug in it — recorded 2026-08-19

Reviewed against `430ed4f` alone, so five of its findings had already been answered by
`cb2c1ea`: the function name, the source-named assertion, the fetch-seam refusal, the
third rendered state, and box 5's claim. What follows is what was still live.

**A fetch that lands on a table with no rows read as a fetch that never happened.** The
worst of the two, and the section had it backwards. `changes.length === 0` rendered "no
Head Coach change data stored for this Gameweek", copied from the Squad Change section
where it is right: a transfer window's page always lists moves, so an empty partition
there really is a fetch that did not land. A managerial-changes table with no rows in it
is an ordinary August in a league where every club kept its Head Coach. Distinguishing the
two would need the store to record that a fetch ran, which it does not — and until it
does, ADR-0044's reading is the honest one for a league exactly as for a club: absence of
the event is the fact. The line is gone. Stating a Gap that is not one is the worse of the
two errors, because it is a sentence about this pipeline inside a packet that is supposed
to be about football.

**The club resolver had no rule where its two identities disagreed.** It returned the
first club matching *either* the linked article or the displayed name, walking the roster
once — so a row displaying `Real Madrid` over a link to Rayo Vallecano resolved to
whichever of the two the roster listed first. Articles are now checked before any name,
which is the rule that was always meant: the link decides, and the displayed name is only
what is left when the link is somebody else's spelling of the same club. Covered by a
misdirected row built from the real page.

**The daily fetch's composition was unasserted.** `fetchHeadCoachChanges` had a suite;
`runDailyFetch` walking the listed Competitions into it, reporting the Premier League's
outcome in the shape the workflow reads, and leaving rows behind, had nothing. It has one
now.

**Held: the deadline bound is a day, not an instant.** A row dated the deadline's own day
can only be in the store because the trigger let it in, and the trigger requires
`observed_at` before the Lock instant — so the page had already published that date before
the Lock, and an Entrant could have read it. Excluding the day would drop facts that were
genuinely knowable to protect against a case the store already refuses.

**Held: the duplicated request header, date helper and per-Competition try/catch.** Two
copies each, no forced simultaneous edit, and the daily fetch's Premier-League-first shape
is a contract with the workflow that reads its result. Extract at the third.
