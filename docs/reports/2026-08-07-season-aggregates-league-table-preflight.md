# Base Model pre-flight, season aggregates and league table — 2026-08-07

Ticket: **Freeze verification: pre-flight on the extended v2** ([tickets 0007](../tickets/0007-season-aggregates-and-the-league-table-in-the-match-context.md), [spec 0007](../specs/0007-season-aggregates-and-the-league-table-in-the-match-context.md))

Season-to-date shots, on-target and xG now ride the three record lines, and the full
Premier League table replaces the `Current-Season league position` ordinal. Both landed
inside the existing frozen pair `match/2026-27-v2`, whose pinned SHA-256 moved to
`1dfeafb38f67b23c971595fe62666a063ccf385bf5a47f698c18753a93ed4594`.

## The freeze rule holds — v2 was still unused

Spec 0007 permits editing a frozen Prompt Version only until its first use. Verified
against the live database rather than assumed:

| Check | Observed |
|---|---|
| `contexts` | 0 rows — no context has ever been stored, under any Prompt Version |
| `predictions` | 0 rows |
| `attempts` | 0 rows |
| Roster | nine `entrant` rows, all on `match/2026-27-v2` |
| 2026-27 Gameweek 1 deadline | `2026-08-21T17:30:00Z` |

The additions therefore ship as an edit to `match/2026-27-v2`, not as `match/2026-27-v3`.
The same three counts were re-read after both pre-flight runs below and were still zero.

## What changed, and what did not

Slices 1 and 2 (`ca320b2`, `d2e270f`) touch `src/context/build-historical-context.ts`,
the pinned checksum in `src/predictions/openrouter-entrant.ts`, and tests. No migration,
no fetch, no query. `src/predictions/predict-gameweek.ts` — where a context is hashed and
stored — is byte-identical across both commits, so storage and hashing are unchanged and
nothing recorded under an earlier hash was touched.

## Run 1 — live database, opening-day context

`npm run preflight`, Fixture 1, Arsenal v Coventry City, 2026-08-21 19:00 UTC. This is the
context Entrants actually meet on the first Friday: before any 2026-27 result exists, both
new sections render in their announcement form.

```
Premier League table: no result has been played yet this Season.

Arsenal
Prior-Season final position: 1st in 2025-26 Premier League; promoted: no.
Current-Season overall: no matches played.
Current-Season home split: no home matches played.
Current-Season away split: no away matches played.
```

The `Current-Season league position` line is absent from both team sections; the
prior-Season final position line is kept. Inspected offline through the shared
`buildMatchContext` path before any outbound call.

**Result: 9/9 parseable, `ok: true`.** No refusals, no transport errors, no missing
routing metadata.

## Run 2 — dense context, throwaway Postgres

The opening-day context exercises only the empty path, so a second run put both sections
in their populated form. A throwaway Postgres — `startTemporaryPostgres`, the same
mechanism the dry run and preview use — was seeded by replaying the archived 2025-26
football-data CSVs through the current parser, then shifting eight rounds of that record
forward a year to stand as the current Season. Every figure below is a real result, not an
invented one. The live database was read only, and was never a write target for this run.

Fixture: Arsenal v Liverpool, Gameweek 8, deadline 2026-10-30 18:30 UTC.

```
Premier League table (results through 2026-10-25):
1. Arsenal — Pld 8, W 6, D 1, L 1, GF 15, GA 3, Pts 19
2. Sunderland — Pld 9, W 5, D 2, L 2, GF 11, GA 7, Pts 17
3. Man City — Pld 8, W 5, D 1, L 2, GF 17, GA 6, Pts 16
...
20. Wolves — Pld 8, W 0, D 2, L 6, GF 5, GA 16, Pts 2

Arsenal
Current-Season overall: 8 played, 6W 1D 1L, GF 15, GA 3, shots 123-65, on target 34-18, xG 9.03-3.96 (over 5 of 8 matches).
Current-Season home split: 4 played, 3W 1D 0L, GF 11, GA 1, shots 67-17, on target 18-5, xG 3.06-0.86 (over 1 of 4 matches).
Current-Season away split: 4 played, 3W 0D 1L, GF 4, GA 2, shots 56-48, on target 16-13, xG 5.97-3.10.
```

Three Arsenal xG rows were deliberately withheld from the seed so the coverage
announcement renders in a real prompt and not only in a test. The prompt therefore carries
every shape the two additions can take: a full twenty-row table, complete stat pairs, an
announced partial pair, and a pair with complete coverage announcing nothing.

Arithmetic checked by hand off the emitted bytes: the home and away splits sum to the
overall line in every column — played 4+4=8, GF 11+4=15, GA 1+2=3, shots 67+56=123, on
target 18+16=34, xG 3.06+5.97=9.03 and 0.86+3.10=3.96 — and the coverage counts agree,
1 of 4 plus 4 of 4 giving 5 of 8. Rule ordering holds on real data at four separate ties:
Man City above Man United on goal difference (+11 v +1), Bournemouth above Liverpool
(+3 v +2), Tottenham above Chelsea (+7 v +6), Crystal Palace above Brentford (+4 v 0).

**Result: 9/9 parseable, `ok: true`.** No refusals, no transport errors, no missing
routing metadata.

## Roster resolution, both runs

Identical across the two runs and unchanged from the 2026-07-31 pre-flight — no provider
or model substitution across the context change.

| Entrant | Result | Resolved provider | Resolved model |
|---|---|---|---|
| Claude Opus 5 | parseable | Anthropic | `anthropic/claude-opus-5-20260723` |
| DeepSeek V4 Pro | parseable | Novita | `deepseek/deepseek-v4-pro-20260423` |
| Gemini 3.1 Pro Preview | parseable | Google AI Studio | `google/gemini-3.1-pro-preview-20260219` |
| GLM 5.2 | parseable | Z.AI | `z-ai/glm-5.2-20260616` |
| GPT-5.6 Sol Pro | parseable | OpenAI | `openai/gpt-5.6-sol-pro-20260709` |
| Grok 4.5 | parseable | xAI | `x-ai/grok-4.5-20260708` |
| Kimi K3 | parseable | Moonshot AI | `moonshotai/kimi-k3-20260715` |
| MiniMax M3 | parseable | Minimax | `minimax/minimax-m3-20260531` |
| Qwen3.7 Max | parseable | Alibaba | `qwen/qwen3.7-max-20260520` |

Gemini 3.1 Pro Preview returned the required object-shaped `probs` and `score` on both
runs — the stochastic array-shaped miss the 2026-07-29 and 2026-07-31 pre-flights recorded
did not recur, but it remains a known Base Model behaviour the Repair loop covers, not
something this run rules out.

Every HTTP-successful response from run 1 was archived byte-for-byte on the live database
under `openrouter-preflight:<base-model>`, nine sources now holding nine bodies each. Run
2's bodies were archived in the throwaway cluster and went with it.

## Run 3 — live database, after the shot backfill

Runs 1 and 2 were followed by a backfill of the 2025-26 record (see the finding below),
after which the live `historical_matches` carries shots on 380/380 Premier League and
552/552 Championship rows. Pre-flight was re-run on the live database against the same
Fixture 1, so the recorded verdict stands against the bytes an Entrant will actually
receive rather than against a context missing a signal.

The two new sections are unchanged from run 1 — no 2026-27 result exists, so the table is
still a single announcement and the record lines still read `no matches played`. What
changed is the form lines, which now carry the shot segment:

```
- 2025-26 Premier League | 2026-05-24 | Crystal Palace 1-2 Arsenal | W | shots 8-17, on target 3-7, xG 1.00-3.91
- 2025-26 Championship   | 2026-05-02 | Watford 0-4 Coventry      | W | shots 13-18, on target 4-7, xG unavailable
```

**Result: 9/9 parseable, `ok: true`.** Same nine resolved providers and dated models as
runs 1 and 2. Run 2 is not repeated: its throwaway cluster was seeded by replaying the
archived CSVs through the current parser, so its context already carried full shot
coverage and the backfill does not change it.

The freeze counts were re-read afterwards and are still zero across `contexts`,
`predictions` and `attempts`.

## Finding — fixed in the data, still live in the deploy

At the time of runs 1 and 2, all 932 rows in the live `historical_matches` carried
`home_shots`, `away_shots`, `home_shots_on_target` and `away_shots_on_target` as null, so
the live context had no shot segment on any form line.

The cause is deploy lag, not a bug in this repo's code:

- The archived CSVs do carry the columns — `football_data:2025-26:E0` and `:E1` both have
  `HS,AS,HST,AST` in their header, with values.
- Replaying those exact archived bodies through the current `fetchFootballDataSeason`
  into a clean database stores 380/380 and 552/552 rows with full shot coverage. The
  parser and the insert are correct.
- `pg_stat_user_tables` shows `historical_matches` at 12116 inserts and 12116 deletes
  against 932 live rows — thirteen delete-and-reload cycles — with the most recent
  autoanalyze at 2026-08-07T06:35Z, minutes after the 06:00 UTC `Daily fetch` workflow.
- `.github/workflows/fetch.yml` runs `actions/checkout@v4`, which takes the default
  branch. `git rev-list --count origin/main..main` is **102**, and `origin/main` sits
  behind `0a9dfd5 Carry shots and shots on target into the historical record`.

So the scheduled fetch reloads the whole historical record every morning using code that
predates the shot columns, wiping the coverage the 2026-07-31 report recorded. That report
observed 380/380 and 552/552 immediately after a local run; nothing had held since.

**Half fixed.** A local `fetch-history` run for 2025-26 restored full shot coverage, which
is what run 3 above verifies. But the deploy has not moved: `origin/main` is still
`9204e8a`, last pushed 2026-07-30, and `git merge-base --is-ancestor 0a9dfd5 origin/main`
still answers no. The workflow that overwrites the record therefore still runs pre-shots
code, and the next 06:00 UTC fetch will wipe the backfill again exactly as it did the
2026-07-31 one. The backfill buys a day at a time; only a push makes it hold, and there
are fourteen 06:00 UTC fetches between now and the first Lock.

That push deploys 103 commits at once against a database whose schema is already ahead of
the deployed code, so it is an operator decision rather than a step this ticket takes.
Until it happens, treat live shot coverage as re-verified on the day, never assumed —
which is the same trap the 2026-07-31 report fell into.
