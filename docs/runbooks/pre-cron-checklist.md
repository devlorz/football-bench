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
`^--|^$|^SET |^SELECT pg_catalog|^\(un)?restrict`. This has caught real drift twice.

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
| `FOOTBALL_DATA_SEASON` | `2025-26` | `YYYY-YY`. **Advance to `2026-27` after the first matchday.** |
| `PREDICT_CONCURRENCY` | e.g. `10` | Defaults to the Season Roster size, one call per seat |
| `FETCH_ALERT_ASSIGNEE` | | Optional; see below |
| `PREDICT_ALERT_ASSIGNEE` | | Optional; see below |

`FOOTBALL_DATA_SEASON` uses the `YYYY-YY` form and becomes `2526` in the URL. football-data's
own convention is `2526`, which is the natural thing to type and is **rejected**.

Leaving it on the prior Season after the first matchday is the dangerous direction: the fetch
keeps succeeding while current-Season results never load. A guard fails the run once
Gameweek 1's deadline has passed with no stored matches for `SEASON` — but its tolerance is
tight, see [§7](#7-known-imperfections).

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
      set -a; . ./.env; set +a; npm run --silent fetch:xg-history
      ```

      One-off. Deeper history is deliberately not fetched.
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
      | before the Lock | 9 | 81 |
      | at or after the Lock | 0 | 90 |

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
`finished`, archive that live response byte-for-byte, record its checksum, and add it as the
completed-match regression fixture for result ingestion. Confirm that `finished` alone is the
scoreability gate, including the observed state of `finished_provisional`, before trusting the
10:00 UTC scorer. If the observed semantics disagree, stop and revise the decision rather than
adapting the fixture.

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
