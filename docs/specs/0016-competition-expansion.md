# Spec 0016 — Competition expansion

**Status:** ready-for-agent
**Scope:** everything that must exist before La Liga's first predicted Gameweek
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:** [ADR 0035–0038](../adr/)

---

The match track expands beyond the Premier League, per ADR-0035 through ADR-0038: every
row gains a Competition dimension, a new Competition's schedule, results and Lock come
from football-data.org with a derived deadline, its context is v2 minus availability, and
the ten Entrants are seated per Competition under per-Competition Prompt Versions. La
Liga (`PD`) launches first; Serie A (`SA`), the Bundesliga (`BL1`) and Ligue 1 (`FL1`)
follow behind the gates ADR-0035 records. This spec turns those decisions into buildable,
testable requirements.

Reads ADR-0005 (write path first), ADR-0006 (one Lock per Gameweek), ADR-0013 (postponed
keeps its Prediction), ADR-0015 (a Fixture owns its Locked Gameweek), ADR-0024
(unscheduled leaves the schedule), ADR-0026 (a used Prompt Version is unamendable), and
ADR-0035–0038 (this expansion's shape). Vocabulary follows `CONTEXT.md` as amended by
ADR-0035: **Competition** enters the Language; Fixture, Season and Gameweek generalise;
"matchday" stays forbidden — the round is a Gameweek in every Competition.

## Problem Statement

The benchmark can only answer its question about one league. Four more of Europe's top
leagues kick off within weeks — La Liga today — and every Gameweek that passes
unrecorded is sample gone permanently, because a Prediction made after the fact proves
nothing (spec 0001's founding constraint, unchanged).

The system cannot simply be pointed at a second league. The schema is accidentally
one-league: La Liga's round 5 and Premier League Gameweek 5 are the same `(season, gw)`
row, `prediction_runs`' upsert would overwrite one league's run record with the other's
without an error, and `scores` would fold both leagues into one ranking. And the FPL API —
today the sole source of fixtures, kickoffs, deadlines and results — has no non-English
equivalent, so a second league needs a second source and a Lock the source does not
publish.

## Solution

One migration gives every keyed table a `competition` column (football-data.org codes:
`PL`, `PD`, `SA`, `BL1`, `FL1`), backfills existing rows as `PL`, and renames
`fixtures.fpl_id` to `fixture_id`. The daily fetch grows a football-data.org path that
writes the same tables the FPL path writes — fixtures, Gameweeks, kickoffs, results — for
every Competition except `PL`, with the Gameweek deadline derived as earliest kickoff
minus ninety minutes. The context builders become Competition-scoped and assemble the v2
packet from the sources that exist for the league. Each Competition freezes its own Prompt
Version from one shared template, and the ten Entrants are seated per Competition. The
scheduler stays one loop under one advisory lock, walking every active Competition. The
scorer, already league-agnostic given the `fixtures` table, follows with a Competition
filter.

## User Stories

### The record grows a Competition dimension

1. As an operator, I want every table keyed by `(season, …)` — `gameweeks`, `fixtures`,
   `contexts`, `predictions`, `attempts`, `prediction_runs`, `scores` — keyed by
   `(competition, season, …)`, so that a second Competition's rows are new rows and can
   never overwrite the first's.
2. As an operator, I want every existing row backfilled `competition = 'PL'` with no other
   value changed, so that the running Premier League record is relabelled, not rewritten.
3. As a developer, I want `fixtures.fpl_id` renamed to `fixture_id`, holding each source's
   native id unique within `(competition, season)`, so that the column's name is true for
   every source that writes it.
4. As an operator, I want the migration rehearsed green on a temporary Postgres before it
   touches the live record, and never applied inside a Lock window or while Predictions
   are in flight, so that the one unforgivable failure — damaging the live record — cannot
   happen quietly.
5. As a developer, I want the Lock-enforcement triggers (`prediction_requires_locked_fixture`,
   the immutability of `locked_in_gw`) proven to survive the key change, so that the
   commitment mechanism is the same mechanism after the migration as before it.

### Fetching a new Competition

6. As an operator, I want the daily fetch to read football-data.org for every active
   Competition except `PL` — Fixture list, round number as the Gameweek, kickoff times,
   final scores — writing the same tables the FPL path writes, so that everything
   downstream of `fixtures` works without knowing which source fed it.
7. As an operator, I want the `PL` fetch path byte-for-byte untouched, so that the
   expansion cannot regress the league the benchmark already runs.
8. As an operator, I want every football-data.org response stored in `raw_snapshots` under
   its own source name, so that a fetch stays replayable and disputable like every other
   source.
9. As an operator, I want a per-Competition stale-source guard — a Competition whose
   source has produced no rows by its first derived deadline fails the fetch loudly —
   so that an empty Gameweek can never lock silently.
10. As an operator, I want the fetch cadence to fit the source's free-tier rate limit with
    margin, so that a quota error is a design bug, not an operational surprise.

### The derived Lock

11. As an operator, I want each new Competition Gameweek's deadline computed as its
    earliest scheduled kickoff minus ninety minutes and recomputed at every fetch until a
    Lock is observed at it, so that the Lock tracks the real schedule while it can still
    move.
12. As an operator, I want a deadline frozen from the moment a Lock is observed at it,
    with the Fixture owning the Gameweek it Locked in (ADR-0015), so that what "the
    Entrants committed before X" means is a stored fact, not a recomputation.
13. As an operator, I want a loud alert if any fetch observes a kickoff moved earlier than
    the current derived deadline, so that a Prediction can never postdate a kickoff
    without a human knowing the margin was breached.
14. As an operator, I want postponed Fixtures to keep their original Predictions
    (ADR-0013) and Fixtures dropped from the schedule to leave it (ADR-0024), carried
    unchanged into every Competition, so that schedule chaos is handled by machinery that
    has already survived a season of it.
15. As an operator, I want La Liga's opening round — three Fixtures already deferred to
    25–27 August — to flow through that machinery without special cases, so that the
    policy is proven on its first real Gameweek.

### The context

16. As a developer, I want every context builder that selects rows or names a division to
    take the Competition it is building for — narrowed from "every context builder" by
    ADR-0037's amendment of 2026-08-15, which records why — and every read of
    `historical_matches` and `understat_match_xg` that filters by date or Season alone to
    filter by Competition before any second league's rows land in those tables, so that
    no league's packet can silently blend another league's data.
    _There were five such reads, not the two this story named: the context's history and
    xG, the Elo line's prior Season, the daily fetch's staleness guard, and the FPL
    track's league table._
17. As an operator, I want La Liga's historical results, league table and prior-season
    points-per-game read from football-data.co.uk `SP1`, with `SP2` playing the
    Championship's role for promoted clubs, so that the league-table and PPG sections
    match what the Premier League packet carries.
18. As an operator, I want per-match xG from Understat with the league name a parameter,
    backfilled two seasons for each new Competition, so that the xG section matches the
    Premier League's span.
19. As an operator, I want squad changes from Wikipedia's transfer list for the league,
    behind a curated club-identity map, so that the squad-changes section ships where a
    source exists.
20. As an operator, I want no availability section in a new Competition's packet, recorded
    as the structural difference ADR-0037 states, so that a missing feed is a documented
    property of the benchmark, not a silent hole.
21. As a developer, I want every team-identity map to fail loudly on an unmapped name —
    the existing rule — so that a new league's spelling drift costs an alert, not history.
22. As an operator, I want the stored context to record exactly what each Entrant saw —
    already the system's behaviour — so that if the Gameweek-3 escape hatch ships a
    partial packet, the record is honest about its own contents.

### Entrants and prompts

23. As an operator, I want one prompt template whose only variable is the Competition's
    name, rendered and frozen per Competition as its own Prompt Version
    (`match-pd/2026-27-v1`), with the sha over the rendered text, so that wording can
    never differ between Competitions by more than the league's name.
24. As an operator, I want `match/2026-27-v2` untouched in text, hash and seats, so that
    the running Premier League benchmark's continuity survives the expansion (ADR-0026).
25. As an operator, I want the ten Entrants seated per Competition through the existing
    `models` machinery, with the Season-prefix rule on version strings extended to carry
    the Competition, so that seating, filters and rosters work the way they already work.
25a. As an operator, I want a Competition's seats to be the Season Roster that stood at
    the Season's first Lock, so that a Competition opening later cannot become a second
    door for a Base Model that missed ADR-0034's cutoff.
26. As an operator, I want prediction runs, fill runs and gap alerts to operate per
    Competition through their existing Prompt-Version filters, so that a Gap in La Liga
    is La Liga's Gap and nothing else's.

### Scoring

27. As an operator, I want the scorer scoped by `(competition, season)`, and Premier
    League scores identical before and after the migration, so that expansion adds
    rankings without touching the one that exists.
28. As a reader, I want each Competition's leaderboard read only from its own `scores`
    rows, with no combined cross-league ranking anywhere, so that the per-Competition
    benchmark claim (ADR-0035) is enforced by construction.

### Operating it

29. As an operator, I want one scheduler loop under the existing advisory lock walking
    every Competition with work due, so that per-league lock contention — and the lock's
    silent-skip failure mode — never exists.
30. As an operator, I want the active-Competition list read from the database, so that
    opening Serie A, the Bundesliga or Ligue 1 is an insert plus identity maps plus a
    Prompt Version — no workflow edit, no code branch.
31. As an operator, I want the remaining three Competitions gated on La Liga completing
    one full fetch → Lock → predict → score cycle and on the per-Fixture cost read from
    Premier League Gameweek 1 `attempts` being acceptable at five leagues' volume, so
    that scale follows evidence.
32. As an operator, I want the rollout windows honoured — apply the migration before the
    Premier League Gameweek 1 Lock only if the rehearsal is green, else after Gameweek 1
    settles; La Liga targets its Gameweek 2, falls back to Gameweek 3 — so that the
    schedule pressure never touches the two inviolables: the live record and the
    Lock-before-kickoff rule.

### Proving it

33. As a developer, I want a migration test that seeds a pre-migration Premier League
    record, migrates it, and proves every Prediction, score and context readable and
    identical with `competition = 'PL'`, so that the relabel-not-rewrite claim is a test,
    not a hope.
34. As a developer, I want a coexistence test where two Competitions share `(season, gw)`
    and Fixture ids — runs, contexts, scores and predictions all landing disjoint — so
    that the collision class the migration exists to kill is proven dead.
35. As a developer, I want the derived-deadline rules — recompute while unlocked, freeze
    at Lock, alert on a kickoff inside the deadline — as pure-function tests, so that the
    Lock policy is proven without a live schedule.
36. As a developer, I want the football-data.org parser tested against recorded snapshots,
    so that a source format drift fails a test before it fails a fetch.
37. As a developer, I want a contamination test seeding two leagues' history and xG and
    proving each Competition's packet contains only its own rows, so that story 16's
    filter is enforced both directions.
38. As a developer, I want a render test proving each Competition's frozen prompt text
    differs from the template's Premier League rendering by exactly the Competition name,
    so that ADR-0038's only-variable claim is checked mechanically.
39. As a developer, I want the roster guard to reject a Competition seated with anything
    other than the Season Roster, so that story 25a's closed door is enforced by the same
    machinery that already counts the seats.

## Implementation Decisions

### The migration

One migration file, one pass: add `competition text not null` to the seven keyed tables,
rebuild primary and foreign keys as `(competition, season, …)`, backfill `'PL'`, rename
`fpl_id` to `fixture_id` everywhere it appears (fixtures, predictions, contexts'
uniqueness expression), and recreate the two Lock triggers against the new keys. The
`track` checks are untouched (ADR-0035). A `competitions` table lists the active
Competitions per Season and is what the scheduler and fetch walk; `PL` is its first row.
Rehearsal runs the full migration against a temporary Postgres seeded with a
representative Season and replays the migration test (story 33) before the real database
is touched. It is the next migration in sequence, and the rename's blast radius now
includes the FPL dashboard's tests and the Season seed, which grew after this expansion
was first drafted.

Sequencing against the roster refresh: ADR-0034's refresh owns the same days under a
harder cutoff and its pre-flights write `attempts`, a table this migration rekeys. The
order is roster refresh complete, then migrate, then La Liga — the migration never
straddles a pre-flight, a Lock window, or Predictions in flight.

### Season configuration stays singular

All five Competitions run August-to-May seasons under the same `2026-27` label, and
football-data.co.uk uses one season path for all of them, so `SEASON` and
`FOOTBALL_DATA_SEASON` stay single values. The per-country divergence ADR-0035's research
flagged is a non-issue for these five leagues; a Competition with a different calendar
(if one ever joins) forces the config change then, not now.

### The fetch seam

The daily fetch dispatches per Competition row: `PL` takes the existing FPL path,
everything else the football-data.org client. Both write the same three surfaces —
`gameweeks` (round, deadline), `fixtures` (teams, kickoff, result, Lock observation) —
so the seam is the tables, exactly as the scorer already assumes. Team names for a new
Competition are stored as football-data.org gives them; the identity maps translate at
the context boundary (football-data.co.uk names, Understat names), mirroring how the FPL
path resolves names today. Dispatch keys on the Competition code — a field already read,
not a mode flag.

### The derived deadline, precisely

The deadline column is written by the fetch: for a Gameweek with no Lock observed,
`deadline_at = min(kickoff_at) - 90 minutes` over its scheduled Fixtures, updated every
fetch. The first fetch that observes `now >= deadline_at` performs the Lock exactly as
the FPL path does, and from then the Gameweek's deadline is immutable — enforced the same
way `locked_in_gw` is. The earlier-kickoff alert (story 13) fires when a fetch would
shrink `deadline_at` into the past or observes a kickoff earlier than the frozen deadline;
it writes the alert and does not silently relock. The ninety-minute buffer against a daily
fetch cadence is the accepted margin; ADR-0036 records the reasoning.

### Prompt Versions and seating

The template lives where the frozen text lives today; each Competition's rendered text is
a constant with its own sha, version string `match-<code, lowercased>/2026-27-v1`. The
roster-seating machinery seats ten Entrants per active Competition; the
version-prefix validation extends from `match/${season}-` to the Competition-scoped form.
Nothing about the `PL` constants moves. The seats are the Season Roster as it stood at the
Season's first Lock — ten after ADR-0034's refresh — and the roster guard that counts them
enforces it, so a Competition opening later cannot seat a Base Model the cutoff excluded.

### Scorer and reads

`scoreMatchSeason` and the Gameweek scorer take a Competition and derive their Gameweek
list per `(competition, season)`. Every read that filters `track = 'match'` today filters
Competition beside it. The dashboard's shape for multiple Competitions is explicitly not
decided here (ADR-0035); until its ADR lands, the read API continues serving `PL` as it
does today.

### La Liga's launch checklist

What must exist before `PD`'s first predicted Gameweek: the migration applied and
verified; the `competitions` row; the football-data.org fetch producing Gameweeks,
Fixtures and derived deadlines; two seasons of `SP1`/`SP2` history and Understat xG
backfilled; the three identity maps reviewed; `match-pd/2026-27-v1` frozen and ten seats
entered; the pre-cron checklist run for the new Competition. Squad changes may trail into
the Season (they change weekly anyway); availability never ships (ADR-0037).

## Testing Decisions

A test drives the real seam: migrations against a temporary Postgres, fetches against
recorded snapshots, deadline logic as pure functions, and end-to-end coexistence through
the same entry points the crons call. Numbers asserted for the migration test come from
the pre-migration seed's own scored output, never hand-typed. The stories in "Proving it"
are the test list; the coexistence test (34) is the one that must exist before any `PD`
row is written to the live database, because it proves the failure class this whole spec
exists to prevent.

## Out of Scope

- The dashboard's per-Competition shape — its own ADR and spec.
- Any availability feed for non-`PL` Competitions (ADR-0037 decides its absence).
- A combined cross-league ranking, in any surface.
- Activating `SA`, `BL1`, `FL1` — gated by story 31; when they open it is data and maps,
  not new spec work.
- The FPL track, entirely.
- Exhibition Runs for new Competitions — the mechanism is already Competition-scoped by
  its Prompt-Version filter; nothing new is built for it.
- Reference Lines for new Competitions.

## Further Notes

### Order of work

The migration and its rehearsal first — it gates everything and its deadline is the
Premier League Gameweek 1 Lock. Then, in parallel: the football-data.org fetch with the
derived Lock (the write path proper), and the curation work (identity maps, history and
xG backfill) that gates the context. Then the Prompt Version and seating, the
Competition-scoped context builders, the scorer filter, and the pre-cron checklist run.
The escape hatch is already decided: if curation is not done by La Liga Gameweek 2, ship
the write path at Gameweek 3 with the sections that are ready rather than losing a third
Gameweek.

### What to verify early

- Against the live football-data.org API on day one: that `PD` fixtures carry usable
  round numbers for the deferred opening Fixtures (do the three postponed matches still
  report round 1?), and that kickoff timestamps are timezone-sound. The derived-Lock
  design leans on both.
- The real per-Fixture cost from Premier League Gameweek 1 `attempts`, which prices the
  five-league future and gates story 31.
- That football-data.co.uk's `SP1`/`SP2` CSVs parse under the existing reader with only
  new division codes — the parser validates the `Div` column per file and the check
  constraint on `historical_matches.division` must grow in the same change.
- One manual pass over the three identity maps by someone who watches the league —
  Understat and football-data spell Spanish clubs differently, and a silent mismatch
  costs context, not errors, once the loud-failure rule catches only unknown names, not
  wrong mappings.
