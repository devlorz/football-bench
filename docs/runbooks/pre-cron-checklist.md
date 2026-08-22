# Pre-cron checklist

Everything that must be true before the scheduled workflows are trusted, in order. Run this
before the first deploy and again before each pre-Season rehearsal.

Vocabulary: [CONTEXT.md](../../CONTEXT.md). The dry run referenced throughout is the
rehearsal built by the last write-path ticket.

---

## 1. Apply migrations before enabling anything

The deployed schema must match the repository before a workflow runs against it. A workflow
enabled ahead of its migration fails on its first invocation, not at deploy time.

```bash
set -a; . ./.env; set +a; npm run --silent db:migrate
```

`DATABASE_URL` must be the **session pooler on port 5432**. The migration runner takes a
session-level advisory lock, which the transaction pooler on 6543 would break.

To confirm the deployed schema matches the repository, build a temporary Postgres from the
migrations and compare `pg_dump --schema-only` output from both, filtering
`^--|^$|^SET |^SELECT pg_catalog|^\(un)?restrict`. This has caught real drift three
times.

**A merged migration is not an applied one.** Migrations land on `main` continuously
while this checklist runs only before a deploy or a rehearsal, so a migration can sit
merged and unapplied for days with nothing between the two noticing. Ticket 0019's gate
found exactly that: `0030` and `0031` were merged and production was still on `0029`,
two days before the Season's first Lock. Apply at ship time, not at gate time — and if
the gate is the first time anyone looked, say so in the ticket, because the gap was
real even though the outcome was fine.

**On a database migrated from empty, list the Season's Competitions by hand.** Migration
0022 relabels the record it finds, so a database with no Gameweek in it gets no
`competitions` row — and that table is what the scheduler and the fetch walk (ADR-0035).
Left empty, every job correctly finds nothing to do and reports success, which is the
quietest possible way for a deployment to do nothing at all. A database migrated over an
existing record already has its row and this is a no-op.

```bash
set -a; . ./.env; set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "insert into competitions (competition, season)
      values ('PL', '$SEASON') on conflict do nothing"
psql "$DATABASE_URL" -c "select competition, season from competitions"
```

**Then enter the roster, not before.** `npm run roster:enter` seats the ten Entrants in
every Competition the table lists, each under that Competition's own frozen Prompt Version
(ADR-0038), so a Competition inserted afterwards has no seats until it is run again — and a
Gameweek predicted with no seat throws `No Entrants are configured for <code>` rather than
quietly predicting nothing. It is safe to re-run: the seats are upserted.

```bash
set -a; . ./.env; set +a; npm run --silent roster:enter
```

A Competition with no frozen Prompt Version fails by name here, which is the check that a
league was opened in the code as well as in the table.

## 2. Create the repository

Create it on GitHub, push `main`, and keep it **public**.

Public is a deliberate decision recorded in
[the spec](../../football-benchmark-spec.md) and
[spec 0001](../specs/0001-match-track-write-path.md): the fifteen-minute Prediction poll is
roughly 2,920 runs per month against a 2,000-minute private allowance, while public standard
runners consume no metered Actions minutes.

The consequence is a recurring chore — see [§6](#6-recurring-chores).

## 3. Secrets

| Secret | Notes |
|---|---|
| `DATABASE_URL` | Session pooler, port 5432 |
| `OPENROUTER_API_KEY` | |
| `FOOTBALL_DATA_ORG_TOKEN` | Only once a Competition other than `PL` is listed |

`FOOTBALL_DATA_ORG_TOKEN` is a free-tier football-data.org token, and the Premier League
never reads it: `PL` takes the FPL API for everything (ADR-0036). Leave it unset while `PL`
is the only row in `competitions`. Set it **in the same change that inserts the second
Competition's row**, because that row is what makes the daily fetch reach the source — a
listed Competition with no token fails its own fetch by name, without touching any other
league's.

## 4. Repository variables

| Variable | Value | Notes |
|---|---|---|
| `SEASON` | `2026-27` | `YYYY-YY` |
| `FOOTBALL_DATA_SEASON` | `2025-26` | `YYYY-YY`. **Advance to `2026-27` — overdue, see below.** |
| `PREDICT_CONCURRENCY` | e.g. `10` | Defaults to the Season Roster size, one call per seat |
| `FETCH_ALERT_ASSIGNEE` | | Optional; see below |
| `PREDICT_ALERT_ASSIGNEE` | | Optional; see below |

`FOOTBALL_DATA_SEASON` uses the `YYYY-YY` form and becomes `2526` in the URL. football-data's
own convention is `2526`, which is the natural thing to type and is **rejected**.

Leaving it on the prior Season after the first matchday is the dangerous direction: the fetch
keeps succeeding while current-Season results never load. Each listed Competition's guard
fails the run once that Competition's own Gameweek 1 deadline has passed with no stored
matches for `SEASON` in it — but its tolerance is tight, see
[§7](#7-known-imperfections).

### It is overdue right now, and cannot be done yet

**Both live leagues have played their first Gameweek and this still reads `2025-26`, so no
2026-27 result is stored for either.** Each Competition's guard fails the daily fetch once
**its own** Gameweek 1 deadline passes with nothing stored for it — La Liga's passed on
2026-08-15 and the Premier League's at 2026-08-21T17:30Z — correctly, because from that
instant the claim "current-Season results are loading" is false for that league.

It cannot be advanced until football-data.co.uk publishes every file the listed
Competitions read, and it publishes them one at a time. Read on 2026-08-21, four of the
eight exist and four do not:

```
E1 SP1 SP2 F2   the file, with its own Div and 2026-27 dates
E0 I1 I2 F1     300 Multiple Choices — no such file
```

**A `200` is not proof on its own.** A request for a file the site does not hold has also
been answered by a redirect to a near-miss name — `2627/SP1.csv` → `2627/P1.csv`, the
Portuguese first division — which `fetch` follows and returns as a 200. The per-file `Div`
check refuses that, loudly, so nothing lands wrong, but the status line will not tell you.
Read the first row instead, and require all eight to name their own division:

```bash
for d in E0 E1 SP1 SP2 I1 I2 F1 F2; do printf "%-4s " "$d"; \
  curl -s --max-time 20 "https://www.football-data.co.uk/mmz4281/2627/$d.csv" \
  | sed -n '2p' | cut -d, -f1-2; done
```

A file that is there answers `E1,14/08/2026`. One that is not answers `<html><head>`.

**One variable serves `PL`, `PD`, `SA` and `FL1` alike, and the files publish one at a
time.** Today `SP1` and `SP2` are ready while `E0`, `I1`, `I2` and `F1` are not, so
advancing now would satisfy La Liga and fail the Premier League, Serie A and Ligue 1 every
day until each of their files appears — collected as that Competition's error, so the
leagues that are ready still land their day. Each of the four is now caught by its own
guard, against its own deadline and its own feed, and named in the failure; none of them
rides on the Premier League's clock any more.

Assignees are optional. Without them, notification depends on watch settings rather than being
addressed to a person.

## 5. Before trusting cron

- [ ] **GitHub Issues is enabled.** Both alert paths open issues; neither works without it.
- [ ] **Run `fetch.yml` once by hand** via `workflow_dispatch`. It is idempotent, so a second
      run costs nothing.

      This is also what confirms the Understat alias mapping. The fetch resolves every team
      name in the feed — including matches not yet played — so a spelling `Coventry` or `Hull`
      got wrong fails here, loudly, months before there is any stored xG to lose. A run that
      succeeds has validated the whole mapping against the live feed.

- [ ] **Ingest the prior Season's xG once**, before any rehearsal or pre-flight. The last-five
      form window crosses the Season boundary, so without this every opening-day form line
      reads `xG unavailable` and the rehearsed contexts do not match what Entrants will
      actually see:

      ```bash
      set -a; . ./.env; set +a; HISTORICAL_COMPETITION=PL npm run --silent fetch:xg-history
      ```

      One-off. Deeper history is deliberately not fetched.

      `HISTORICAL_COMPETITION` is required and has no default, for both this and
      `fetch:history`. Understat's league is a path segment and the Competition is a
      stored column, and a run that left the Competition unsaid would write one
      league's xG under another's name — no collision, no check, and a packet that
      reads perfectly. Run it once per Competition; La Liga is `PD`.
- [ ] **Do not hand-dispatch `predict.yml` as a smoke test.** Its manual job writes real
      Predictions for the Gameweek named in the input. Before that Gameweek's deadline those
      writes are valid and, because `predictions` is insert-only, permanent — the Gameweek is
      consumed, made early on stale context, and the real run at `deadline − 6h` will find
      every slot filled and skip it. The manual job exists to close Gaps after the Fill, not
      to prove the pipeline. It also runs `predict`, not `predict:scheduled`, so it does not
      exercise the scheduler at all. Let cron do that — see [§7](#7-known-imperfections).
- [ ] **Rehearse against archived data** — the dry run exercises the whole write path against
      archived snapshots in a throwaway database, touching neither the network nor real data:

      ```bash
      set -a; . ./.env; set +a
      GAMEWEEK=1 DRY_RUN_AT=deadline-6h npm run --silent dry-run
      ```

      Set `DRY_RUN_AT` to any instant relative to the deadline — `deadline-6h`, `deadline`,
      `deadline+90m`, or an ISO instant — to rehearse either side of the Lock. Contexts are
      printed for review; read a few against the real league table by eye.

      The run rehearses the main run **and** the Fill, and prints the escalation body the
      workflow would hand to `scripts/report-prediction-fill-gaps.sh`. It derives the counts
      the archive should produce and **exits non-zero when it misses them**, so it is a check
      rather than a report to interpret. Against the current archive:

      | `DRY_RUN_AT` | Predictions | Gaps |
      |---|---|---|
      | before the Lock | 10 | 90 |
      | at or after the Lock | 0 | 100 |

      Those counts follow the archive and move when it grows — the run derives
      what it should produce and exits non-zero on a mismatch, so read its
      verdict rather than these numbers. Observed 2026-08-21 at 43 snapshots.

      **`COMPETITION` names the Competition being rehearsed, and only that one
      is walked.** A rehearsal is green or red on its own league's bytes; a
      league captured but not yet activated cannot take another's rehearsal
      down with it, which it did until 2026-08-21.

      `PL` was listed beside it until 2026-08-21, on the grounds that every
      archive holds its sources. That was free while its feed was live and
      stopped being free at its own Gameweek 1 Lock: from that instant, with no
      2026-27 `E0.csv` published, `PL` fails the stale-Season guard and failed
      every other league's rehearsal with it — the same fault, through the door
      the pairing left open.

      **Prior-Season xG reads `unavailable` in every rehearsal, for every
      league.** The daily fetch ingests the current Season's Understat only, and
      the prior Season's comes from the one-off `fetch:xg-history` backfill that
      no rehearsal runs — so the form lines degrade to a stated absence here
      while production renders real numbers. Read the packet from
      `context:show` for the xG, and the rehearsal for the shape.

      Replaying archived responses yields Predictions only for the Fixture each response was
      recorded against; the remaining Gaps are an artifact of the archive, not a fault. See
      [§7](#7-known-imperfections).

## 6. Recurring chores

**Re-enable scheduled workflows before every pre-Season rehearsal.** GitHub disables scheduled
workflows on public repositories after 60 days without repository activity.

**Advance `FOOTBALL_DATA_SEASON`** to the current Season after the first matchday, once that
feed becomes available.

**Pin one observed completed-match FPL fixtures response after the first matchday.** The
pre-Season archive contains only `finished = false` and `finished_provisional = false`, while
FPL exposes no prior Season through this endpoint. Once at least one Fixture reports
`finished` or `finished_provisional`, archive that live response byte-for-byte, record its
checksum, and add it as the completed-match regression fixture for result ingestion. Confirm
that either flag alone is the scoreability gate (ticket 0042) before trusting the 10:00 UTC
scorer. If the observed semantics disagree, stop and revise the decision rather than adapting
the fixture.

**Measure the FPL context's real cost after Gameweek 1.** ADR-0041 widened
`fpl/2026-27-v2` — the duties on every pool line, the Entrant's own record, and the Rationale
coming back — on a track spec 0003 already called several times the Match track's cost, and
both documents refuse to estimate: the figure is read from `attempts.tokens_in` and
`tokens_out` once ten seats have played a real Gameweek. Read it, and record it where the
next version's scope will be argued. This is the one consequence ADR-0041 left with an action
and no owner until here.

**Pin one observed checked FPL Gameweek response after Gameweek 1 settles.** The pre-Season
archive can prove only `data_checked = false`. Once FPL reports Gameweek 1 checked, archive the
bootstrap response carrying `data_checked = true` and the corresponding Gameweek live-points
response byte-for-byte, record both checksums, and add them as the settled-points regression
fixtures. Confirm the pinned `data_checked` contract before trusting FPL-track scoring. If the
observed semantics disagree, stop and revise the decision rather than adapting either fixture.

## 7. Known imperfections

These are deliberate, and recorded so they are not rediscovered as bugs.

**The stale-Season guard fires early.** It triggers once Gameweek 1's deadline has passed with
no current-Season matches stored. Real timings: deadline 21 Aug 17:30 UTC, first kick-off
19:00, first fetch after it 22 Aug 06:00 — by which point football-data has had about eleven
hours to publish a Friday-night result. Probably enough, not certainly. A false positive costs
one spurious issue, not data. Keying off a kick-off more than a day old would move the first
evaluation to 23 August and remove the noise.

Those timings are the Premier League's, and every listed Competition now runs the same guard
against its own deadline and its own feed. So the tolerance is as tight as it ever was and
there are four of it: a league whose source publishes slowly is one spurious issue per league,
not one in total.

**A manual Fill that leaves Gaps does not open an issue** — only scheduled Fills do. That is
the right default for an operator who triggered the run and is watching, and the wrong one for
an operator who walks away. The annotation still records it.

**A dry run reports Gaps for most Fixtures.** One OpenRouter response is archived per Base
Model, recorded against a single Fixture; replayed against the others it is correctly rejected
on its `fixture_id`. The dry run replays archived bytes exactly rather than adapting them, so
a high Gap count is expected — the run states the count it should produce and fails on a
mismatch, so read the verdict rather than the Gap total.

**The dry run does not exercise the scheduler.** It calls the main run and the Fill directly,
so `prediction_runs`, the due query and the advisory lock are not covered by the rehearsal.

The scheduled run covers them, and covers them safely. Until a Gameweek reaches
`deadline − 6h` there is no due work, so a poll takes the advisory lock, runs the due query,
finds nothing and exits — no Entrant is called and nothing is written. Observed on
2026-07-30: the first scheduled run completed in 18 seconds leaving
`prediction_runs`, `predictions` and `attempts` all empty. Cron firing *is* the end-to-end
check of this layer, and it costs nothing.

## 8. Ordering that must be preserved

`deferred` is materialised by the fetch, not derived on read — by the FPL fetch for `PL` and
by the football-data.org fetch for every other Competition, which share the ordering because
they share the three statements that write it. A schedule move seen before
the Lock stays `false` until the first fetch at or after the deadline. The 06:00 UTC fetch
provides that ordering for the 10:00 UTC scorer, and
[ADR-0013](../adr/0013-a-postponed-fixture-keeps-its-original-prediction.md) requires future
workflow changes to preserve it.
