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
- [x] The bench runs the amended builder over the same Fixtures at the same as-of instant
      and touches no production table: the context identity, the restarted scoring and
      ADR-0032's objection all forbid it, each independently.
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

- [ ] The constants move in one reviewed change: La Liga's version string to v2, both sha
      pins re-pinned from real renders of the amended template.
- [ ] The constants' comment no longer claims the Premier League's version has been used;
      it records what ADR-0042 established instead.
- [ ] La Liga's v2 seats are seeded through the same door production seats have always
      entered by — same Base Models, providers and quantization pins as v1's ten.
- [ ] The roster window is exercised or explicitly declined: the GLM seat's 5.3 decision
      is made before the gate and recorded either way, because the window closes whether
      or not anyone chose.
- [ ] The coexistence suites prove the boundary: v1 seats out of prediction runs, gap
      alerts and every roster read; v2 seats in; an Exhibition replay of Gameweek 1
      still resolving v1's stored contexts.
- [ ] Prediction pre-flight passes for both Competitions on the restarted versions.

## 5 — The frozen block

**What to build:** A reader of the La Liga page sees Gameweek 1 whole and labelled —
"Gameweek 1 — played under match-pd/2026-27-v1, before the restart" — each v1 seat's
Match Points, Bet Points and RPS, beside a leaderboard that begins at Gameweek 2 and
contains nothing of it.

**Blocked by:** 1, 4.

- [ ] The block renders from stored scores only, under the exact label, listing every v1
      seat's Gameweek 1 numbers — no intervals, no Comparison Anchor, no season totals.
- [ ] The block covers the six Fixtures Gameweek 1's Lock owned and says nothing of the
      four the calendar moved — those are later Locks' Fixtures, asked under the
      restarted version, and a reader comparing the block against a ten-row fixture
      list must not read the difference as missing data.
- [ ] Its read names the retired version explicitly and is the only read anywhere that
      does; every roster-shaped endpoint returns v2 seats alone, proven over a store
      seeded with both versions.
- [ ] The Premier League's page carries no such block — it has no retired Gameweek — and
      a test says so rather than assumes it.
- [ ] Absent scores render as the block saying so, not guessing: the state means slice 1
      was broken, and the page's honesty is the alarm.

## 6 — Head Coach changes, racing the cutoff

**What to build:** A Fixture's packet states each club's Head Coach changes — who left,
the stated manner, who arrived, and when — from Wikipedia's per-Competition
managerial-changes table, through the Squad Changes machinery: snapshot stored, shape
drift refused, club identities resolved, section absent outside its gate. If it is not
ready a day before the gate, it is abandoned without ceremony and waits for the next
version — ADR-0044 executing, not failing.

**Blocked by:** 4 — it re-pins the shas the flip set, and only a standing restart can
receive it.

- [ ] Both season articles' tables are verified to exist and parse before the pipeline is
      committed to — a source that fails its first read loses the race on the spot.
- [ ] Rows land in a per-Gameweek partition through a fetch that archives the raw
      wikitext and refuses a moved shape with the source named.
- [ ] The section renders the Fixture's two clubs' events dated, in the Squad Changes
      section's manner; a club with no change costs no line; outside the gate the section
      is absent rather than empty.
- [ ] Every rendered fact is bounded by the deadline the context is built for — a sacking
      after the Lock can never leak backward.
- [ ] Everything is named head coach — table, section, source string — and "manager"
      appears nowhere in the slice.
- [ ] Both sha pins are re-pinned from real renders carrying the section, before the
      gate.
- [ ] If the cutoff passes first: the slice is closed as deferred with a line saying so,
      and no other slice reopens.
