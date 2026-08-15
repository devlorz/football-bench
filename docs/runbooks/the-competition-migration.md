# The Competition migration

How migration `0022_the_competition_dimension.sql` reaches the live record. One-time, and
the only migration in the repository with a window: it rekeys every table the write path
touches, including the two — `attempts` and `prediction_runs` — that a run in flight is
writing to at that moment.

The pass carries whatever is pending behind it, and by now that is `0023` (one grant),
`0024` (the Competition column on `historical_matches` and `understat_match_xg`) and
`0025` (the trigger freezing a Gameweek's deadline once a Fixture has Locked into it).
None has a window of its own — the first two are plain column work, and `0025` adds a
trigger that refuses an `update` nothing in the codebase performs. The window below is
`0022`'s and governs the pass. Re-run the rehearsal after any ticket adds a migration —
one that predates the migrations it is supposed to cover has rehearsed nothing.

Decisions: [ADR-0035](../adr/0035-the-match-track-grows-a-competition-dimension.md).
Spec: [0016](../specs/0016-competition-expansion.md), stories 4 and 32.
Vocabulary: [CONTEXT.md](../../CONTEXT.md).

The order is **roster refresh complete, then migrate, then La Liga**, and the migration
never straddles a pre-flight, a Lock window, or Predictions in flight.

---

## 1. The four preconditions

All four are read from the database rather than remembered. Run them together; any row
returned by the last three is a stop.

```bash
set -a; . ./.env; set +a
```

- [ ] **ADR-0034's roster refresh has finished.** Ten Entrant seats at the Season's Match
      Prompt Version, which is what `SEASON_ROSTER_SIZE` requires and the pre-flights
      confirmed.

      ```sql
      select count(*) from models
       where role = 'entrant' and prompt_version = 'match/2026-27-v2';
      ```

      Ten. Anything else means the refresh is mid-flight, and its pre-flights write
      `attempts` — one of the tables about to be rekeyed.

- [ ] **No pre-flight is running.** A pre-flight is a burst of `attempts` rows and nothing
      marks its end, so recency is the only signal there is.

      ```sql
      select max(attempted_at) from attempts;
      ```

      Older than twenty minutes, and nobody is at a terminal running one.

- [ ] **No Prediction run is in flight.** An open row is a run that started and has not
      reported finishing — either still going, or failed and awaiting its retry. Both are
      reasons to wait.

      ```sql
      select season, gw, trigger, started_at from prediction_runs
       where completed_at is null;
      select season, gw, started_at from fpl_runs where completed_at is null;
      ```

      No rows.

- [ ] **No Lock window is open.** The scheduled run answers a Gameweek at `deadline − 6h`
      and the Fill follows it; the Lock itself is observed by the fetch at the deadline.
      From seven hours before a deadline to two hours after it, something is committing
      Predictions against the keys this migration is changing.

      ```sql
      select season, gw, deadline_at from gameweeks
       where deadline_at between now() - interval '2 hours'
                             and now() + interval '7 hours';
      ```

      No rows. If there are, the window closes at `deadline + 2h`.

## 2. Rehearse against a copy of the record

Not against an invented Season — against the live rows. `pg_dump` reads the deployed
database into a Postgres that exists only for the run, applies every pending migration
there, and proves the record came back relabelled and otherwise identical: every row of
the seven rekeyed tables compared with itself, whole, column by column.

```bash
set -a; . ./.env; set +a; npm run --silent db:rehearse
```

It writes nothing to `DATABASE_URL` and it exits non-zero on any difference. Read the row
counts it prints: a green rehearsal over a record of zero rows has proven nothing about
the live one.

`pg_dump`, `psql` and `initdb` must be on the path, and their major version must be at
least the server's — an older `pg_dump` refuses a newer server outright.

If the restore fails naming a role, create that role in the throwaway cluster the same way
`dashboard_read` is created in `rehearseMigration` and rehearse again. Roles are cluster
objects and a dump does not carry them.

## 3. Apply

```bash
set -a; . ./.env; set +a; npm run --silent db:migrate
```

`DATABASE_URL` must be the **session pooler on port 5432** — the runner takes a
session-level advisory lock, which the transaction pooler on 6543 would break. This is the
same requirement as [§1 of the pre-cron checklist](pre-cron-checklist.md).

One statement of it is slow in proportion to the record: `fixtures` and `gameweeks` drop
their primary keys with `cascade` and every foreign key into them is rebuilt, which
rewrites those indexes. At a single Season's size this is seconds, and it is one
transaction — a failure part-way leaves the record exactly as it was.

## 4. Confirm, then let the crons back in

- [ ] **The schema matches the repository.** Build a temporary Postgres from the
      migrations and diff `pg_dump --schema-only` against the deployed one, filtering
      `^--|^$|^SET |^SELECT pg_catalog|^\(un)?restrict`. The pre-cron checklist describes
      this; it has caught real drift twice.
- [ ] **The Premier League is listed.**

      ```sql
      select competition, season from competitions;
      ```

      One row, `PL`, for the running Season. A Competition is active because it has a row
      here — that is what the scheduler and the fetch will walk, so a second league is an
      insert and never a workflow edit.
- [ ] **The next scheduled run completes.** The first fetch and the first Prediction run
      after the migration are the real confirmation. Until one has, treat the window as
      still open.

## 5. If La Liga's Gameweek 2 is already gone

Nothing here changes. The migration's deadline is the Premier League Gameweek 1 Lock only
because La Liga's Gameweek 2 depends on it; missing that window costs a Gameweek, and
ADR-0035 already decided that a Gameweek lost to a careful rollout is cheaper than a
damaged record. La Liga starts at Gameweek 3.
