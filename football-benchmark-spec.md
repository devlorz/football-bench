# Football Benchmark — Architecture & Implementation Plan

**Version:** 2.0
**Status:** Draft for implementation
**Target league:** English Premier League (2026/27 season, starting mid-August 2026)

Terminology in this document follows [CONTEXT.md](./CONTEXT.md). Decisions are recorded in
[docs/adr/](./docs/adr/) and referenced inline as ADR-NNNN.

---

## 1. Overview

A system that compares LLMs against each other on two tracks:

1. **Match track** — for every Premier League Fixture, each Entrant submits a probability
   distribution over Home / Draw / Away *and* a Predicted Score.
2. **FPL track** — each Entrant manages a Fantasy Premier League team under the complete
   2026/27 ruleset, all season.

The comparison is LLM against LLM. Deterministic forecasters appear as Reference Lines for
orientation and are never ranked (ADR-0001).

### Design principles

- **LLMs interpret, deterministic code computes.** Entrants emit structured predictions as
  JSON. All scoring, validation and aggregation is plain code with no LLM involved.
- **A prediction that cannot be proven to precede its Lock is worth nothing.** Timestamps
  and lock rules are first-class.
- **Only the write path is urgent.** Predictions are immutable and everything downstream is
  deterministic and re-runnable, so scoring, intervals and the dashboard can be built after
  the season starts and back-filled at no cost (ADR-0005).
- **No servers to maintain.** Scheduled GitHub Actions write to Supabase; the frontend is
  static.

### What this benchmark can and cannot claim

This section exists because the honest limits are easy to lose once a leaderboard is live.

| | Match track | FPL track |
|---|---|---|
| Sample per Season | 380 Fixtures | 1 season path per Entrant |
| Public ranking by | Match Points | cumulative FPL points |
| Interval available | yes — Paired Difference on RPS | no |
| Status | **evidence** | **demonstration** |

- **Match Points rank, they do not prove.** Separating two Base Models on Match Points needs
  on the order of a thousand Fixtures. The RPS layer, which needs roughly 125, is where any
  claim comes from (ADR-0012).
- **The FPL ranking is a demonstration.** With one path per Entrant, the plausible skill gap
  is the same size as the variance of a single season. It is labelled as such on the
  leaderboard (ADR-0003).
- **There is no Positive Control.** If every interval spans zero, the benchmark cannot
  distinguish "these Base Models are genuinely close" from "this setup resolves nothing"
  (ADR-0009).
- **The two tracks are never combined into one ranking.** Doing so would blend evidence with
  demonstration into a number that looks equally credible.
- **LLM predictions cannot be back-filled.** A Base Model already knows the results of past
  seasons, so the sample is capped at Fixtures played after the system goes live. Every
  missed Gameweek is ten Fixtures lost permanently.

### Non-goals

- No real-time scoring. Next-day scoring is correct for a benchmark.
- No paid data sources.
- No custom-trained ML models.
- No lineup data. Predictions lock before lineups are announced.
- No user accounts or third-party submissions.

---

## 2. Data Sources

| Source | Used for | Auth | Notes |
|---|---|---|---|
| **FPL Official API** | Fixtures, Gameweek deadlines, players, prices, availability, per-player Gameweek points, per-match stats | none | CORS-blocked in browsers, server-side only. IDs are unique only within a Season. |
| **football-data.co.uk** | Historical results for Reference Lines and for cross-season context; `E0.csv` (Premier League) and `E1.csv` (Championship, for promoted sides) | none | Static CSV per season, 30+ years. Not the same site as football-data.org. |
| **OpenRouter** | Every Entrant call | API key | One client for all nine Base Models (ADR-0009, ADR-0014). |

**Deliberately excluded:** pre-season friendlies (no free structured source, and the signal
they carry arrives more reliably as FPL opening prices), FBref current-season advanced stats,
undocumented Sofascore/FotMob endpoints.

**Cost:** roughly $3–4 per Gameweek across nine Entrants on the Match track, about $130 for a
season. Synchronous calls only — no Batch API (ADR-0002).

### The roster

| Tier | Base Models | Pinning |
|---|---|---|
| Frontier | Claude, GPT, Gemini | provider pinned; served first-party |
| First-party | Grok | provider pinned; served first-party |
| Open-weight | Kimi, GLM, DeepSeek, Qwen, MiniMax | provider **and** quantization pinned |

Nine Entrants, one Prompt Version, one context arm (ADR-0001, ADR-0008, ADR-0014). Adding a
Base Model is a row in `models`, not a change to the pipeline.

---

## 3. Architecture

```
FPL API ──────────┐
                  ├──> GitHub Actions (cron) ──> Supabase (Postgres)
football-data.co.uk┘         │                        │
                             │                        v
                    3 jobs:  │              Cloudflare Worker (/api/*)
                    fetch    │                        │
                    predict  │                        v
                    score ───┘              Cloudflare Pages (dashboard)
```

| Workflow | Schedule | Responsibility |
|---|---|---|
| `fetch.yml` | daily 06:00 UTC | FPL bootstrap-static, fixtures, Gameweek deadlines; `E0.csv` / `E1.csv`. Upsert and archive a raw snapshot every run. Idempotent. |
| `predict.yml` | poll every 15m for **GW deadline − 6h** (main) and **deadline − 2h** (fill), plus `workflow_dispatch` | Derive due work from stored deadlines, build context per Fixture, call every Entrant, validate, insert. The fill run and any manual run fill only Fixtures with no Prediction, reusing the stored context verbatim. Alerts if Gaps remain (ADR-0006, ADR-0011). |
| `score.yml` | daily **10:00 UTC** | Score Fixtures that have results. FPL finalises a Gameweek at 09:00 UK the day after its last match, so anything earlier reads bonus points and defensive contributions before they settle. Pure deterministic TypeScript. |

**Supabase (Postgres)** is the system of record. **Cloudflare Worker** is a thin read-only
API. **Cloudflare Pages** hosts the static dashboard.

### Language & stack

TypeScript throughout, `zod` for validation, `supabase-js` for the database, OpenRouter for
all model calls with provider pinning.

---

## 4. Database Schema

```sql
create table models (
  id             text primary key,       -- 'claude/v1', 'deepseek/v1'
  name           text not null,
  base_model     text not null,          -- OpenRouter model id, version-pinned
  provider       text not null,          -- pinned provider slug
  quantization   text,                   -- pinned; null for first-party frontier models
  prompt_version text not null,          -- frozen for the Season (ADR-0001)
  role           text not null check (role in ('entrant','reference')),
  config         jsonb not null default '{}',
  created_at     timestamptz default now()
);

create table gameweeks (
  season       text not null,
  gw           int  not null,
  deadline_at  timestamptz not null,
  primary key (season, gw)
);

create table fixtures (
  season       text not null,
  fpl_id       int  not null,            -- unique only within a Season
  gw           int  not null,            -- Gameweek it is currently scheduled in
  locked_in_gw int,                      -- Gameweek whose deadline locked its Predictions
  home_team    text not null,
  away_team    text not null,
  kickoff_at   timestamptz not null,
  result       jsonb,                    -- { home_goals, away_goals, outcome, stats }
  deferred     boolean not null default false,
  updated_at   timestamptz default now(),
  primary key (season, fpl_id),
  foreign key (season, gw) references gameweeks(season, gw),
  foreign key (season, locked_in_gw) references gameweeks(season, gw)
);

create table contexts (
  id         bigint generated always as identity primary key,
  season     text not null,
  gw         int  not null,
  track      text not null check (track in ('match','fpl')),
  fpl_id     int,                        -- Fixture on the match track, null on the FPL track
  hash       text not null,
  body       text not null,              -- the exact text handed to the Entrant
  built_at   timestamptz not null default now(),
  check (
    (track = 'match' and fpl_id is not null)
    or (track = 'fpl' and fpl_id is null)
  ),
  foreign key (season, gw) references gameweeks(season, gw)
);
create unique index on contexts (season, gw, track, coalesce(fpl_id, -1));

create table predictions (
  model_id      text not null references models(id),
  season        text not null,
  fpl_id        int  not null,
  probs         jsonb not null,          -- { "H":..., "D":..., "A":... }, sums to 1 ± 0.001
  pred_home     int  not null,
  pred_away     int  not null,
  context_id    bigint not null references contexts(id),
  rationale     text,                    -- display only, never scored
  attempts_used int  not null,           -- 0-3
  predicted_at  timestamptz not null default now(),
  primary key (model_id, season, fpl_id),
  foreign key (season, fpl_id) references fixtures(season, fpl_id)
);

create table manager_states (
  model_id       text not null references models(id),
  season         text not null,
  gw             int  not null,
  squad          jsonb not null,   -- [{ player_id, purchase_price }] x15
  team_sheet     jsonb not null,   -- { starting[11], bench_order[4], captain, vice_captain }
  bank           int  not null,    -- tenths of a million
  free_transfers int  not null,    -- 0-5
  chips_used     jsonb not null,   -- { wildcard_1: 7, bench_boost_1: null, ... }
  chip_active    text,
  rolled_over    boolean not null default false,
  attempts_used  int  not null,
  predicted_at   timestamptz not null,
  primary key (model_id, season, gw),
  foreign key (season, gw) references gameweeks(season, gw)
);

create table attempts (
  id                bigint generated always as identity primary key,
  model_id          text not null references models(id),
  season            text not null,
  gw                int  not null,
  track             text not null check (track in ('match','fpl')),
  fpl_id            int,
  attempt_no        int  not null,       -- 0 = first call, 1-3 = Repairs
  ok                boolean not null,
  error_kind        text,                -- schema | probs_sum | refusal | provider | timeout | rate_limit | deadline | rule
  error_detail      text,
  resolved_provider text,                -- what OpenRouter actually routed to
  resolved_model    text,
  latency_ms        int,
  tokens_in         int,
  tokens_out        int,
  raw_response      text,
  trigger           text not null check (trigger in ('main','fill','manual')),
  attempted_at      timestamptz not null default now(),
  foreign key (season, gw) references gameweeks(season, gw)
);

create table prediction_runs (
  season        text not null,
  gw            int  not null,
  trigger       text not null check (trigger in ('main','fill')),
  scheduled_for timestamptz not null,
  started_at    timestamptz not null,
  completed_at  timestamptz,
  attempt_count int not null default 1,
  last_error    text,
  primary key (season, gw, trigger),
  foreign key (season, gw) references gameweeks(season, gw)
);

create table scores (
  model_id   text not null references models(id),
  season     text not null,
  gw         int  not null,
  track      text not null check (track in ('match','fpl')),
  metric     text not null,
  value      numeric not null,
  n          int,                        -- Fixtures behind this value
  detail     jsonb,
  scored_at  timestamptz default now(),
  primary key (model_id, season, gw, track, metric),
  foreign key (season, gw) references gameweeks(season, gw)
);

create table raw_snapshots (
  id         bigint generated always as identity primary key,
  source     text not null,              -- fpl_bootstrap | fpl_fixtures | football_data_e0 | ...
  sha256     text not null,
  body       text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (source, sha256)
);
```

Notes:

- Identity is `(season, fpl_id)` everywhere. FPL ids restart each Season (ADR-0007).
- A Fixture owns the Gameweek that locked it; Predictions derive that value through the
  Fixture rather than storing a second copy (ADR-0015).
- The database refuses a Prediction while its Fixture's locked Gameweek is null, so every
  stored Prediction has a path to one authoritative deadline (ADR-0015).
- `predictions` holds only successes. Every call, successful or not, is logged to `attempts`
  — that is where Gap rate, attempts-to-valid and vendor behaviour are read from (ADR-0007).
- `contexts.body` is the exact text sent. The fill run and manual runs reuse it verbatim
  rather than rebuilding it (ADR-0006).
- `prediction_runs` is operational scheduler state, not benchmark evidence. A run is complete
  only after its Prediction orchestration finishes; persistence failures remain incomplete
  and are retried by a later poll. A run claimed before the Lock remains retryable after it,
  when the write path records and refuses the late attempts.
- `resolved_provider` and `resolved_model` are echoed from each response so a vendor swapping
  a snapshot beneath a stable model name is detectable afterwards.

---

## 5. Benchmark Integrity Rules

1. **One Lock per Gameweek.** Every Prediction for a Gameweek locks at that Gameweek's FPL
   deadline, regardless of when the Fixture kicks off. A Monday Fixture is locked on Friday
   (ADR-0006).
2. **The Lock is enforced in the insert path as well as in scoring.** A Prediction cannot be
   stored until its Fixture owns a locked Gameweek, and a run after that Gameweek's deadline
   cannot write one, so no amount of manual re-triggering can produce a late Prediction
   (ADR-0011, ADR-0015).
3. **Insert-only.** `predictions` and `manager_states` rows are never updated or replaced.
   A re-run can fill an empty slot and nothing else. Re-rolling until an answer looks better
   is structurally impossible.
4. **Identical information.** All Entrants receive the same context per Fixture, stored and
   hashed. No lineups, no results, nothing dated after the Lock.
5. **Identical treatment.** No Entrant gets constrained decoding or any other capability the
   others lack (ADR-0010).
6. **Deterministic scoring.** No LLM calls, no network beyond Supabase, unit-tested against
   hand-computed values.

---

## 6. Scoring

### 6.1 Match track — the readable layer

Ranked by **Match Points**, computed from the Predicted Score. Tiers are exclusive:

| Outcome | Points |
|---|---|
| Exact score | 5 |
| Correct goal difference, wrong score | 3 |
| Correct outcome, wrong goal difference | 2 |
| Otherwise | 0 |

Reported alongside: **Score %** (exact hits / n) and **Outcome %** (correct outcomes / n).

Expect about 1.5 points per Fixture with a per-Fixture standard deviation near 1.7. This
layer is legible and it ranks; it does not on its own separate Base Models (ADR-0012).

### 6.2 Match track — the evidential layer

**Ranked Probability Score** on `probs`, for ordered outcomes H, D, A with observed one-hot `o`:

```
RPS = (1 / (r - 1)) * Σ_{i=1..r-1} ( Σ_{j=1..i} (p_j - o_j) )²    where r = 3
```

Lower is better. RPS is used because outcomes are ordered: predicting Home and getting a
Draw is a smaller error than predicting Home and getting an Away win.

Secondary: **Brier**, defined as `Σ_i (p_i - o_i)²` over the three outcomes, unnormalised,
range [0, 2] — the convention is pinned here because published variants differ by a factor of
two. And **accuracy**, argmax against outcome.

**Comparisons** are Paired Differences in RPS on the same Fixture, over the Fixtures where
every Entrant produced a Prediction, with a bootstrap 95% interval (10,000 resamples). Every
published comparison shows its n (ADR-0011).

Nine Entrants make 36 pairs, enough that testing all of them would throw up a spurious
separation or two by chance. The leaderboard publishes intervals **against the current leader
only** — eight comparisons, declared in advance. Any other pair is exploratory and labelled
as such (ADR-0014).

### 6.3 Match track — behavioural metrics

| Metric | From |
|---|---|
| **Gap rate** | Fixtures with no valid Prediction, by cause, from `attempts` |
| **Attempts-to-valid** | 0/1/2/3/failed per Fixture |
| **Coherence** | argmax of `probs` against the outcome implied by the Predicted Score |

### 6.4 FPL track

Full 2026/27 rules (ADR-0003): persistent Squad, Free Transfers banked to five, −4 Hits, both
Chip sets (Wildcard, Free Hit, Triple Captain, Bench Boost per half; the first set expires at
the GW19 deadline), Selling Price of purchase price plus half of any rise rounded down,
auto-substitutions by bench order, captain and vice-captain.

Validation is a **state machine replay**, not a check on a single Squad: Gameweek 20 cannot
be validated without replaying 1–19 for the bank, Free Transfers, Chips spent and purchase
prices. Tests cover sequences.

An illegal action earns three **Repairs** with the validator's reason returned; a third
failure **Rolls Over** the Gameweek — the previous Team Sheet stands and Free Transfers
accrue normally. Never a score of zero (ADR-0004).

Ranked by cumulative FPL points, labelled a demonstration. Reported alongside: Repairs
needed per Gameweek, Roll Over rate, and the violation profile from `attempts`.

### 6.5 Reference Lines

| Line | Rule |
|---|---|
| `reference-home` | fixed [0.44, 0.28, 0.28], recalibrated from football-data.co.uk history |
| `reference-uniform` | [1/3, 1/3, 1/3] |
| `reference-elo` | Elo (K=20, home advantage +60), logistic mapping, seeded from the prior season |
| `reference-odds` | closing odds, margin-normalised — post-Lock information, shown as a line only |

Reference Lines produce probabilities but no scoreline, so they appear on the RPS layer only
and never on the points leaderboard.

---

## 7. Prediction Job

1. **Build context** per Fixture, deterministically. Contents:
   - form over a **rolling cross-season window** — the last five matches actually played,
     whatever Season or division, each labelled with both (ADR handled in §8 cold start);
   - prior-season final position, with Championship position and a `promoted` flag for
     promoted sides;
   - goals for and against, home and away splits, head-to-head;
   - the five highest-priced players per team with position, price and status;
   - **every** player with `status != 'a'`, with `chance_of_playing_next_round`, `news` and
     `news_added`.

   **No field is ever silently empty.** Absent data is written out — `no prior meeting`,
   `promoted, no top-flight data` — because an intentionally empty field and a broken context
   builder are otherwise indistinguishable. Note that FPL reports
   `chance_of_playing_next_round` as `null` for fully fit players, not `100`.

2. **Store the context**, hash it, and hand the identical text to every Entrant.

3. **Call each Entrant** through OpenRouter with the provider pinned
   (`provider.order` with one slug, `allow_fallbacks: false`, an explicit `quantizations`
   filter). No `response_format` — JSON is requested in the prompt only (ADR-0010).

   Expected output:

   ```json
   {
     "fixture_id": 12345,
     "probs": { "H": 0.60, "D": 0.24, "A": 0.16 },
     "score": { "home": 2, "away": 1 },
     "rationale": "..."
   }
   ```

4. **Validate with zod**: schema, probabilities in [0,1] summing to 1 ± 0.001 (renormalise
   within tolerance, reject outside), non-negative integer goals. On failure, return the
   reason and allow up to **three Repairs**. After the third, record a Gap.

5. **Insert** with `predicted_at` captured when the synchronous response arrives, rejecting
   anything at or after the Gameweek deadline. Log every attempt.

### Rescheduled Fixtures

A Fixture postponed after its Predictions were locked keeps them and is scored when it is
eventually played — the Lock held, and the Predictions are equally stale for every Entrant.
The result is attributed to the Gameweek the Prediction was locked in, flagged `deferred`.
A Fixture inserted into a Gameweek whose deadline has already passed attaches to the next
Gameweek still open. A Fixture never played is never scored and drops out for every Entrant
equally (ADR-0013).

---

## 8. Implementation Plan

Roughly two and a half weeks remain before the first Gameweek. Only the write path has to
exist by then (ADR-0005).

### Before GW1 — the write path

| # | Task |
|---|---|
| 1.1 | Repo scaffold, Supabase migrations for the full schema in §4 |
| 1.2 | `fetch`: FPL bootstrap-static, fixtures, deadlines, `E0.csv` / `E1.csv` → upsert **plus a raw snapshot every run** |
| 1.3 | Context builder per §7.1, including the cold-start window and explicit no-data markers |
| 1.4 | OpenRouter client with provider and quantization pinning; nine Entrant rows |
| 1.5 | zod validation, three Repairs, full `attempts` logging |
| 1.6 | Lock enforcement in the insert path |
| 1.7 | `predict.yml` at deadline −6h and −2h, plus `workflow_dispatch`, with an alert when Gaps remain |
| 1.8 | **Pre-flight**: call all nine Base Models with a real prompt and confirm none refuses a match-probability request |

**Exit criteria:** one Gameweek cycle in which every Entrant has a Prediction for every
Fixture, each provably before the deadline, with no manual step required.

### During the season — back-fillable

| # | Task |
|---|---|
| 2.1 | `score`: Match Points, Score %, Outcome %, RPS, Brier, accuracy, Coherence (unit tests with hand-computed cases) |
| 2.2 | Paired-difference bootstrap intervals over the complete-case intersection, with n |
| 2.3 | Reference Lines: home, uniform, elo |
| 2.4 | Leaderboard and dashboard — two separate tables, never a combined rank |
| 2.5 | Gap and attempts reporting |

### FPL track — joins when ready

| # | Task |
|---|---|
| 3.1 | `manager_states` replay engine and full-rules validator (sequence tests) |
| 3.2 | Squad and Team Sheet prompt, zod schema, Repair loop, Roll Over |
| 3.3 | Chip state machine including the GW19 expiry of the first set |
| 3.4 | Points from FPL per-player data: captain, auto-substitutions, Hits, defensive contributions |
| 3.5 | Dashboard tab, labelled a demonstration |

### Later

Additional Entrants (new `models` rows), `reference-odds`, Understat xG in context, a sparse
context arm in a future Season, additional leagues, community-submitted Entrants.

---

## 9. Repo Structure

```
football-benchmark/
├── .github/workflows/     fetch.yml, predict.yml, score.yml
├── src/
│   ├── fetch/             fpl.ts, footballdata-couk.ts, snapshot.ts
│   ├── predict/           context.ts, prompts/, openrouter.ts, validate.ts, repair.ts
│   ├── reference/         home.ts, uniform.ts, elo.ts
│   ├── score/             match-points.ts, rps.ts, brier.ts, bootstrap.ts,
│   │                      fpl-replay.ts, fpl-points.ts, fpl-validator.ts
│   ├── db/                client.ts, queries.ts, migrations.ts
│   └── shared/            types.ts, zod-schemas.ts
├── migrations/            numbered .sql, applied once and recorded
├── dashboard/
├── test/
├── docs/
│   ├── adr/
│   ├── specs/
│   └── tickets/
├── CONTEXT.md
└── football-benchmark-spec.md
```

Migrations are plain numbered SQL applied by `src/db/migrations.ts`, which records each file
in a `schema_migrations` table and applies the file and its record in one transaction. Tests
build their database through the same function, so a new migration reaches them without any
test being edited. The Supabase CLI's own migration system is deliberately not used: tests run
against an ephemeral Postgres rather than Supabase, and two paths to one schema is how a test
comes to assert a shape that production never has.

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **OpenRouter down through both runs** — every Entrant gaps at once, ten Fixtures lost permanently | Two scheduled runs plus manual dispatch; alert on outstanding Gaps. Accepted residual risk (ADR-0009) |
| **A pinned provider is unavailable** | Request fails into a Gap rather than silently rerouting to a different quantization; the fill run retries |
| **A Base Model refuses the task** (probability forecasting sits near betting) | Pre-flight all nine before GW1 — task 1.8. Content policy varies more across nine Base Models than across three |
| **One Entrant gaps heavily**, shrinking the complete-case intersection for everyone — a risk that grows with the roster | Publish n on every comparison; excluding an Entrant is a single recorded decision applied to the whole Season |
| **Spurious separations** — 36 pairs at nine Entrants | Publish intervals against the leader only, eight comparisons declared in advance (ADR-0014) |
| **Context builder emits wrong data all season** | Silent failure — comparisons survive but absolute results are worthless. Explicit no-data markers, stored contexts, hand-checked assertions for GW1 |
| FPL API shape changes during the Season | archive every response before validating the fields currently consumed; fail before writing derived rows |
| football-data.co.uk delayed | Scoring is idempotent and re-runs daily |
| A vendor swaps a model snapshot mid-season | Version-pinned ids; `resolved_model` echoed into `attempts` for after-the-fact detection |
| Late Predictions scored by accident | Lock enforced in both the insert path and scoring, tested explicitly |

---

## 11. Success Criteria

**System.** A full season processed hands-off. Every scored Prediction has `predicted_at`
before its Gameweek deadline, verifiable in one query. Every context handed to an Entrant is
reproducible from storage.

**Match track.** From GW10, publish weekly: a Match Points ranking, and Paired Difference
intervals on RPS against the leader with n shown. State plainly which pairs are separated and
which are not. An interval spanning zero is a result, not a failure — and, absent a Positive
Control, it cannot rule out that the setup resolves nothing.

**FPL track.** A complete season path per Entrant under the full ruleset, with Repairs and
Roll Overs reported, presented as a demonstration rather than as evidence.
