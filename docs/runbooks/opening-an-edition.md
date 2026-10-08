# Opening an Edition

A Competition's roster changes only at an Edition boundary (ADR-0061), and a boundary is
opened by an ADR that names the roster and the first Gameweek in advance. This is the
operator's sequence from that ADR to the first Lock, written for the leagues' Edition 2
(ADR-0062, ticket 0098) and meant to be reread for the next one.

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Decisions:
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md),
[ADR-0062](../adr/0062-eight-seats-open-the-leagues-second-edition.md),
[ADR-0034](../adr/0034-the-roster-refreshes-to-ten-entrants-before-the-first-lock.md)
(pre-flight twice: each candidate alone, then the roster), [ADR-0054](../adr/0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md)
(no hand-set Lock: miss a Gameweek and the Edition opens at the next).

---

## 0. The rule that gates everything

**No seat is stamped, pre-flighted or entered until the roster ADR is accepted.** Not a
ticket, not a spec, not a message: the ADR with `status: accepted`.

**The clock is the predict run's, not the Lock's.** The scheduled run first asks a
Gameweek at **Lock − 6 hours** (`main`), and again at Lock − 2 hours (`fill`). Everything
below must be on production — rows and code both — before the earliest league's
Lock − 6h, or that league's Edition opens one Gameweek later (ADR-0054) and its Edition 1
plays on. Cron runs `origin/main`: an unpushed commit is not deployed.

## 1. What has to be true before the first paid step

- The roster ADR is accepted and names each joining seat's `baseModel`, provider pin,
  `canonicalSlug` from the catalog, class and listing date (rule 4: listed before the ADR).
- Ticket 0098's constant holds the Edition's lists (`MATCH_EDITION_ROSTERS[N]`), the
  dashboard's `CLOSED_LEAGUE_EDITIONS` names Edition N−1 closed by that ADR, and the suite
  is green. `matchRosterOf("PL", N)` is the roster you expect.
- Production is at the latest migration: `npm run db:rehearse` says "Nothing to rehearse".
- `origin/main` is `HEAD`.

## 2. Pre-flights, on a throwaway database — every one paid, ask before each

The pre-flight reads a real Fixture and counts the seats at a Prompt Version, and both
exist for the new Edition only after the stamps and the entry below — which are the
steps the pre-flight gates. So, as for a new Competition, build the Edition somewhere
throwaway first ([opening a Competition](opening-a-competition.md) §3):

```bash
set -a; . ./.env; set +a
createdb edition_preflight
export DATABASE_URL="postgres://localhost:5432/edition_preflight"   # after .env, never before
export FOOTBALL_DATA_SEASON=2026-27
npm run --silent db:migrate
psql "$DATABASE_URL" -c "insert into competitions (competition, season)
  values ('PL','$SEASON'),('PD','$SEASON'),('SA','$SEASON'),('BL1','$SEASON'),('FL1','$SEASON')"
npm run --silent roster:enter            # Edition 1, ten per league
npm run --silent fetch                   # Fixtures and Gameweeks; reaches no Base Model
```

Then the stamps and the entry exactly as production will get them (§4 below, same SQL,
same command), then one candidate at a time as a temporary `exhibition` row at the
league's Prompt Version:

```sql
insert into models (id, name, base_model, provider, quantization, prompt_version, role, config)
values ('candidate/claude-opus-5.5', 'Claude Opus 5.5', 'anthropic/claude-opus-5.5', 'anthropic',
        null, 'match/2026-27-v2', 'exhibition', '{}');
```

```bash
unset EXPECTED_ENTRANT_COUNT             # .env sets it; the two cannot both be set
COMPETITION=PL FIXTURE_ID=<a Fixture of the first Edition-N Gameweek> \
  EXHIBITION_MODEL_ID=candidate/claude-opus-5.5 npm run preflight   # PAID, one call
```

Read each report's `resolvedModel` against the seat's `canonicalSlug` in the constant.
**If one differs, the constant and the ADR are amended before the roster run.** Delete
the `candidate/…` rows, then the roster's own:

```bash
COMPETITION=PL FIXTURE_ID=<the same one> EXPECTED_ENTRANT_COUNT=<the Edition's size> \
  npm run preflight                      # PAID, one call per seat
```

The pre-flight writes no `attempts` row; the report in `docs/reports` is its record.
Drop the throwaway database afterwards.

## 3. Push and deploy

```bash
git push origin main
./scripts/deploy-dashboard.sh            # refuses a dirty tree; builds; moves `deployed`
```

The deploy carries `CLOSED_LEAGUE_EDITIONS`; until the Editions rows exist (§4),
`/edition-(N−1)/…` answers the current Edition and the Edition note stays hidden, which
is the designed window (ticket 0085).

## 4. The record, on production — the operator's hands only

Three writes, in this order, all before the earliest Lock − 6h. `DATABASE_URL` is the
session pooler.

**4a. Stamp the leaving seats at each league's Edition-N first Lock**, read off
`gameweeks` rather than typed, and matched by seat slug rather than id prefix — La
Liga's seats are `match-pd/2026-27-v2/<slug>` after its restart (ADR-0042) and every other
league's are `match-xx/<slug>`:

```sql
with boundary(competition, first_gw) as (values ('BL1',5),('FL1',6),('PD',8),('PL',6),('SA',6)),
     version(competition, v) as (values
       ('PL','match/2026-27-v2'),('PD','match-pd/2026-27-v2'),('SA','match-sa/2026-27-v1'),
       ('BL1','match-bl1/2026-27-v1'),('FL1','match-fl1/2026-27-v1')),
     leaving(slug) as (values
       ('deepseek-v4-pro'),('minimax-m3'),('qwen3.8-max'),
       ('gpt-5.6-sol-pro'),('grok-4.6'),('muse-spark-1.2'))
update models m set withdrawn_at = g.deadline_at
  from boundary b
  join gameweeks g on g.competition = b.competition and g.season = '2026-27' and g.gw = b.first_gw
  join version vs on vs.competition = b.competition
  join leaving l on true
 where m.role = 'entrant' and m.prompt_version = vs.v
   and m.id like '%/' || l.slug and m.withdrawn_at is null;
-- expect: UPDATE 30 (six per league)
```

The stamp is the Lock itself: ticket 0083's predicate asks a seat only when its stamp is
*later* than the Lock, so a seat stamped at the Lock is not asked at it, and ticket
0097's scorer keeps every earlier Gameweek's rows as they were.

**4b. Enter the joining seats**:

```bash
EDITION=2 npm run --silent roster:enter
# expect: "Entered 40 Entrants for Edition 2: …" (eight per league, four of them new rows)
#         "Left as they stand, having no Edition 2 roster of record: UNL"
```

It refuses by name if any leaving seat is still standing (4a not run) — that refusal is
the guard, not an obstacle.

**4c. Insert the Editions rows**, one per league, first Gameweek = the boundary above:

```sql
insert into editions (competition, season, edition, first_gw) values
  ('BL1','2026-27',2,5), ('FL1','2026-27',2,6), ('PD','2026-27',2,8),
  ('PL','2026-27',2,6), ('SA','2026-27',2,6);
```

From this row on, the read API answers `/api/pl/…` as Edition 2 and `/api/edition-1/pl/…`
as Edition 1, the scorer accumulates from `first_gw`, and the predict run at Lock − 6h
asks the eight.

## 5. Check, without spending

```bash
COMPETITION=PL GAMEWEEK=6 npm run --silent context:show | tail -1     # the packet builds
COMPETITION=PL GAMEWEEK=6 npm run --silent dry-run | tail -8          # 8 seats asked, none of the six
curl -s https://football-bench.leelorz6.workers.dev/api/pl/leaderboard | head -c 300   # edition: 2
curl -s https://football-bench.leelorz6.workers.dev/api/edition-1/pl/leaderboard | head -c 300
```

A Gameweek the sequence misses is not a failure: the league's Edition 1 plays it, the
Editions row is inserted with the next Gameweek's number instead, and the stamps move
to that Lock (`update models set withdrawn_at = …` again, same SQL with the new
`boundary`), before *that* Lock − 6h.

## 6. Afterwards

- Record the date, the Gameweek each league actually opened at, and the pre-flight
  report in the roster ADR's *Consequences* and the ticket that ran this.
- Ticket 0077's method — the real per-Fixture rate off `attempts` — is owed for the
  new roster after its first Gameweek settles.
