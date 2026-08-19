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

- [ ] One base-rates line per context: the prior Season's top-flight home-win, draw and
      away-win shares, goals per match, and the match count they cover — computed from
      stored results alone, once per packet, not per team.
- [ ] A Competition with no curated divisions renders the base-rates unavailable sentence
      in the family the table section already uses.
- [ ] The Prior-Season line carries xG for and against per game — overall, home and away —
      under the form lines' both-or-nothing rule: short coverage announced, zero coverage
      reading unavailable, a promoted club unavailable by nature.
- [ ] The two instruction sentences appear in the closing block exactly as ADR-0043
      quotes them — score as the likeliest exact scoreline, probabilities scored by RPS
      over the ordered outcomes — and a render test holds each verbatim.
- [ ] No coaching sentence enters; the additions are facts and the game's rule, nothing
      else (ADR-0018 unmoved).
- [ ] The rendered packet is read by eye over production data for both Competitions —
      the `context:show` discipline that found both of PD's earlier moves.

## 3 — The bench: the amended question against Gameweek 1's record

**What to build:** The amendment's first contact with real Base Models happens off the
record. The amended template runs over La Liga's Gameweek 1 through the dry-run harness —
archived snapshots into a scratch store, real calls, nothing written to the record — and
the run is read beside the sixty v1 Predictions for what six Fixtures can say: failures,
not skill.

**Blocked by:** 2. (The comparison half reads whatever results have settled — five
Fixtures serve it as well as six, and what the bench chiefly measures reads no result
at all.)

- [ ] Gameweek 1's snapshots are verified to cover what the bench replays before the
      bench is attempted — a dry run replays bytes and invents none.
- [ ] The bench runs the amended builder over the same Fixtures at the same as-of instant
      and touches no production table: the context identity, the restarted scoring and
      ADR-0032's objection all forbid it, each independently.
- [ ] What is read from it is what ADR-0026's dry opening read: Repair and format
      failures, the incoherence rate under the new sentences, and whether the base-rates
      anchor is picked up at all — with RPS deltas at n=6 named as noise in the findings.
- [ ] The findings are written into this ticket, and any sentence they move is moved in
      slice 2's tests before the flip.
- [ ] The bench gates nothing: if the clock runs short, ship-or-freeze applies and the
      flip proceeds without it, recorded as skipped.

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
