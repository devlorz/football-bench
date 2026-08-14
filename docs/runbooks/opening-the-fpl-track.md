# Opening the FPL track

The FPL track opens once per Season and cannot be reopened. Ten seats commit their first
Squad together or none of them does, `manager_states` is insert-only, and after the
Gameweek's deadline the door is shut for the Season. This is the order to walk it in, and
what each step protects.

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Decisions:
[ADR-0003](../adr/0003-fpl-track-plays-full-rules-with-one-seat-per-base-model.md) (one
seat per Base Model), [ADR-0006](../adr/0006-one-lock-per-gameweek-at-the-fpl-deadline.md)
(the Lock), [ADR-0034](../adr/0034-the-roster-refreshes-to-ten-entrants-before-the-first-lock.md)
(who is on the roster). The cost of a failed opening is measured in
[spec 0010](../specs/0010-the-cost-of-asking-an-entrant.md).

**2026-27 Gameweek 1 deadline: `2026-08-21T17:30:00Z`.**

---

## 1. Pick the hour

Open **three to six hours before the deadline**, not the day before and not the last hour.

The asymmetry decides it. Opening early costs data quality: `loadLockedGameweek` reads the
pool out of `fpl_players` **as the table stands when it is called**, so the Squad is picked
from whatever the last fetch wrote — prices, injury news and availability all move until
the deadline, and the opening Squad is the one artefact that persists the whole Season,
since every later Gameweek inherits it through an insert-only chain. Opening late costs
the Season itself: past the deadline the track cannot start at Gameweek 1 at all.

So take the freshest pool that still leaves room to fail twice.

## 2. Fetch, immediately before

```bash
set -a; . ./.env; set +a; npm run --silent fetch
```

Waiting for the deadline buys nothing if the pool on record is days old — what the
Entrants read is what the fetch last stored, not what FPL currently shows.

## 3. Check the four things that have bitten before

```bash
set -a; . ./.env; set +a; psql "$DATABASE_URL" -c "select prompt_version, count(*) from models where role='entrant' group by 1 order by 1" -c "select count(*) as pool, max(observed_at) as fetched from fpl_players where season='2026-27' and gw=1" -c "select deadline_at from gameweeks where season='2026-27' and gw=1" -c "select count(*) as states from manager_states"
```

- **Ten seats at `fpl/2026-27-v2`.** Nine or eleven and the start refuses before the first
  call — which is the guard working, but read it now rather than then.
- **A pool with a recent `observed_at`.** This is step 2 having landed.
- **The deadline is the one you think it is.** It has moved upstream before.
- **`manager_states` is empty.** Anything there means the track already started.

### `ENTRANT_CALL_TIMEOUT_MS` — the one that actually cost money

The default is **120000** (`src/http.ts`), and spec 0010 records that at the dry opening
*three of nine seats died at exactly that timeout on every run*, each death forcing a
full-board retry: forty-two Entrant calls across three runs, all of it billed. The roster
now carries a reasoning Base Model (Muse Spark 1.2) whose envelope sets no `max_tokens` by
ADR-0034's deliberate choice, so it has more room to be slow than anything in that dry run.

**Set it well above the default in `.env` before opening.** A timeout that fires is not a
saving; it re-bills all ten seats.

`FPL_CONCURRENCY` defaults to the roster size, so all ten are called at once. That is the
intent — one Lock to finish inside — but it means a provider wobble lands on the whole
board in the same minute.

## 4. Open

```bash
set -a; . ./.env; set +a; GAMEWEEK=1 npm run --silent fpl:start
```

Success prints `The FPL track started at Gameweek 1 for every Entrant`.

Failure prints which seats produced no legal opening action and exits non-zero. **Nothing
is stored on failure** — not the seats that answered legally either. That is the all-or-none
rule, and it is why the retry below is expensive.

## 5. If it did not start

Read the named seats first; the message says which Base Model is at fault, which a count
cannot. Then decide from the `attempts` rows, which are on record even though no Manager
State is:

```bash
set -a; . ./.env; set +a; psql "$DATABASE_URL" -c "select model_id, count(*) as attempts, bool_or(ok) as any_ok, max(error_kind) as kind, max(left(coalesce(error_detail,''),70)) as detail from attempts where track='fpl' and gw=1 group by 1 order by 1"
```

Three shapes, three different answers:

- **Timeouts.** Raise `ENTRANT_CALL_TIMEOUT_MS` and retry. This is the failure the dry
  opening actually had.
- **Repairs exhausted on the same misreading.** Spec 0010 records two Base Models burning
  four to five Repair turns on the identical misunderstanding of how an opening Squad is
  bought. A retry will reproduce it. There is no prompt fix available — the Prompt Version
  is frozen (ADR-0001) — so the choice is to retry and hope for a different sample, or to
  open at the next Gameweek without that seat's first week.
- **HTTP 4xx from one provider.** Read the body. The Muse Spark pre-flight on 2026-08-15
  returned a 403 that was an account attestation, not a refusal — an account-level gate
  looks like a model failure and is not one.

Every retry re-calls and re-bills **all ten** seats, including the ones already answering
legally. Budget the remaining time in whole retries, not in minutes.

## 6. Confirm it started

```bash
set -a; . ./.env; set +a; psql "$DATABASE_URL" -c "select count(*) as states, count(distinct model_id) as seats from manager_states where season='2026-27' and gw=1" -c "select model_id, jsonb_array_length(squad->'active') as owned, bank, free_transfers from manager_states where season='2026-27' and gw=1 order by model_id"
```

Ten states, ten distinct seats, fifteen players apiece. Anything short of that with rows
present is worth stopping over: the commit is atomic, so a partial result means something
other than this runbook wrote them.

## 7. After the opening

The scheduled job takes over from Gameweek 2 (`npm run fpl:scheduled`). Nothing else needs
doing on the day — the opening is the only Gameweek that is started rather than run.

## What this runbook does not cover

- The Match track. It has no opening: its first Predictions are written by the predict job
  against the same deadline, and a seat that Gaps Gameweek 1 simply Gaps it.
- Reopening. There is none. A Season whose FPL track missed its Gameweek 1 deadline can
  only start at a later Gameweek, and every Entrant then has a Season path shorter than
  the one the ranking is read against.
