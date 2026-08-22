# Ticket: Ligue 1 activates

**What to build:** the same act as ticket 0039, for France — the `FL1` row inserted by
the operator, ten Entrants seated, the checklist in order, the dry run green, and the
first open Gameweek predicted and Locked before kickoff. Independent of Serie A's
activation: the two leagues open on their own clocks. Source:
[spec 0024](../../specs/0024-serie-a-and-ligue-1-open.md), stories 23–29. Decisions:
[ADR-0049](../../adr/0049-serie-a-and-ligue-1-open-the-bundesliga-waits-on-hands-not-money.md),
the ADR-0036 banner.

**Blocked by:** 0034, 0035, 0037. Deliberately not blocked by 0038 — Squad Changes may
trail.

**Status:** done, except box 3 — see "What happened"

- [x] The pre-cron checklist runs in order: secrets, insert (operator), `roster:enter`,
      prior-Season xG, dry run. Secrets, insert, `roster:enter` and prior-Season xG all
      held; the dry run did not, and box 3 records why. The checklist's
      `FOOTBALL_DATA_SEASON` advance check is ticket 0035's, which is open — this
      activation did not touch it and does not claim it.
- [x] `roster:enter` seats ten Entrants under `match-fl1/2026-27-v1`; the stored-seats
      guard holds.
- [ ] `COMPETITION=FL1` dry run is green against the archived snapshots before the first
      Lock. **Not done, and it cannot be made true afterwards.** At activation the
      rehearsal was red for every Competition, the two live ones included; the activation
      went ahead without it, against the stated alternative of opening at Gameweek 2.
      Both causes have since been fixed and `COMPETITION=FL1` now exits 0 —
      `Contexts: 9, Predictions: 0 (expected 0), Gaps: 90 (expected 90)` — but that is
      after the Lock at `17:15:00Z`, and this box asks for green *before* it. Ticking it
      would be backdating. Gameweek 2 onward is rehearsed; Gameweek 1 was not.
- [x] Ligue 1 opens at the first Gameweek whose derived deadline had not passed at
      activation — its Gameweek 1 deadline was hours from ADR-0049's drafting, so played
      Gameweeks arriving as Locked history is the expected shape here, and the
      mid-Season adoption path (no `locked_in_gw` for a Fixture with a result) is what
      this activation exercises for real. **This box records which Gameweek Ligue 1
      opened at.**
      **Gameweek 1**, not Gameweek 2: the derived deadline `2026-08-21T17:15:00Z` had not
      passed, with 34 minutes left when the row was inserted. So no played Gameweek
      arrived as Locked history and no Fixture carries a result without a `locked_in_gw` —
      the mid-Season adoption path this box anticipated was **not** exercised. The league
      opened before a ball was kicked in it, which is the better outcome and the narrower
      test.
- [x] No Lock is set by hand; a missed deadline means the Gameweek is let go. Nothing
      wrote a Lock. The deadline the fetch stored is the one the run was measured against.
- [x] The first Lock is observed at the derived deadline, and every Entrant's Prediction
      with its stored context predates it.
      **90 Predictions over 10 seats and 9 Fixtures**, last written
      `2026-08-21T17:05:16Z` — nine minutes inside the `17:15:00Z` deadline. The Lock was
      then observed the way it is meant to be: `predict:scheduled` run again *after* the
      deadline found no due work, called no Base Model and wrote nothing, and the count
      stood at 90. A run before the deadline could not have shown this; one at
      `17:05` was mistaken for the observation and re-run afterwards.
- [x] Ligue 1 appears on the dashboard with no dashboard change.
      `test/dashboard-competition-view.test.ts` is 16 passed with Ligue 1 among its cases
      and no file under `dashboard/` touched by this ticket.

      _**The live page is now read, and it was worth reading.** This box first said the
      live page "is evidence only once deployed; that is not claimed here" while ticket
      0039 left the same box open over the same evidence — one ticket ticking and the
      other not, on identical grounds, which review caught. The deployed Worker answers:
      `https://football-bench.leelorz6.workers.dev/fl1` returns `200` and its switcher
      renders `Premier League`, `La Liga`, `Serie A`, `Ligue 1`. That closes the box on
      the thing the box names, and it is the check ticket 0022 exists over — the build
      passing says nothing about what the edge serves, which is exactly how the
      2026-08-20 restart left the page answering a question nobody wanted asked._

---

## What happened, 2026-08-21

Activated at **Gameweek 1**, with 34 minutes to spare against a derived deadline of
`2026-08-21T17:15:00Z`. The order below is the order it ran in; where a box is not
ticked, the reason is here rather than in a commit message.

### The clock, recomputed rather than inherited

The previous session's handoff described Ligue 1's Gameweek 1 as already kicked off. It
had not. Both figures were recomputed from the committed schedule before anything was
run — earliest Gameweek 1 kickoff `2026-08-21T18:45:00Z` over nine Fixtures, less
`DERIVED_DEADLINE_LEAD_MS` (`src/football-data-org/derived-deadline.ts:16`), giving
`17:15:00Z`. Serie A's is `2026-08-22T15:00:00Z` from a `16:30:00Z` earliest kickoff over
ten. The stored `gameweeks.deadline_at` agreed with the derivation exactly, which is the
check that matters: `1 | 2026-08-21 17:15:00+00`.

A time narrated from estimate rather than from `date -u` drifted nineteen minutes over
the session and was corrected mid-run. Read the clock; do not carry it forward.

### The checklist, in order

`db:migrate` reported `No migrations to apply.` — production was already at
`0035_the_italian_and_french_divisions`, so no migration gated this. `FL1` has been a
legal `competition_code` since migration 0022; no schema change was needed to open it.
`FOOTBALL_DATA_ORG_TOKEN` was already set, La Liga having required it.
Prior-Season history and xG were already backfilled by ticket 0037.

The insert:

```sql
insert into competitions (competition, season) values ('FL1', '2026-27');
-- INSERT 0 1; the table then reads FL1, PD, PL for 2026-27
```

Then `roster:enter`, which reaches no Base Model and costs nothing — it is
`enterActiveCompetitionRosters` over `models` and nothing else. The handoff's claim that
seating "reaches a Base Model, which needs its own permission" is wrong and is corrected
here. It seated thirty across the three listed Competitions, of which Ligue 1's ten:

```
prompt_version       | count
match-fl1/2026-27-v1 |    10
```

The ids are plain (`match-fl1/claude-opus-5`), not version-qualified, which is the shape
a first activation with no retired seats produces (ADR-0042). The stored-seats guard held
— it refuses by name, so a silent pass is not a possible outcome.

### `gameweeks` has to exist before the poll can see anything

`fetch.yml` is `cron: "0 6 * * *"`, so the next scheduled fetch was the following morning
and the deadline was the same afternoon. Without a hand-run fetch, Ligue 1 would have had
no `gameweeks` row for the due query to find and the Gameweek would have been let go for
want of a row rather than for want of a decision. `npm run fetch` — the same thing the
workflow runs — was run by hand. It stored the schedule, the xG and the Squad Changes,
and failed on one source; see below.

```
gw | deadline_at              gw 1 fixtures
 1 | 2026-08-21 17:15:00+00   9
 2 | 2026-08-28 17:15:00+00
 3 | 2026-09-03 17:15:00+00
```

### The run

`predict:scheduled` was run locally rather than dispatched. The dispatch path is
`predict.yml`'s `manual` job, which runs `predict` and not `predict:scheduled`, so it
would not have exercised `prediction_runs`, the due query or the advisory lock; the
scheduled cron is `*/30` and the next firing was fifteen minutes before the deadline,
which is one attempt against a schedule that routinely slips five to fifteen minutes on
a public repository. Running the scheduled entrypoint by hand keeps the layer under test
and removes the slip.

Both due runs completed:

```
gw | trigger | scheduled_for          | completed_at
 1 | main    | 2026-08-21 11:15:00+00 | 2026-08-21 17:05:16.821+00
 1 | fill    | 2026-08-21 15:15:00+00 | 2026-08-21 17:05:17.108+00
```

`11:15` is `deadline − 6h` and `15:15` is `deadline − 2h`; the neighbouring `11:30` and
`15:30` rows are the Premier League's, whose deadline is `17:30:00Z`.

A count taken mid-run read 85 of 90 and was read as a Gap; it was the run still in
flight. Count after a run, not during one.

### The record, as queries rather than as pasted output

Every figure above was read off production and pasted. Tickets 0036 and 0037 set the
standard this first draft dropped: the query beside the value, so a reader checks rather
than trusts. **Found by review** — it counted seven `select`s in 0036, six in 0037 and
none here.

```sql
-- The league is listed. Read FL1, PD, PL at activation; SA joined on 2026-08-21T19:10Z.
select competition from competitions where season = '2026-27' order by competition;

-- Ten seats, under the frozen version and no other. Expect one row: 10.
select prompt_version, count(*)::int as seats
  from models where prompt_version = 'match-fl1/2026-27-v1'
 group by prompt_version;

-- The deadline the run was measured against, which the derivation must equal.
-- Expect 1 | 2026-08-21 17:15:00+00.
select gw, deadline_at from gameweeks
 where competition = 'FL1' and season = '2026-27' and gw = 1;

-- The two due runs. Expect main scheduled 11:15:00+00 and fill 15:15:00+00,
-- both completed 2026-08-21 17:05:1x+00.
select gw, trigger, scheduled_for, completed_at from prediction_runs
 where competition = 'FL1' and season = '2026-27' and gw = 1
 order by trigger;

-- The claim this whole ticket rests on: ninety Predictions, every one of them
-- before the Lock. Expect 90 and a last write of 2026-08-21 17:05:16+00,
-- nine minutes inside the 17:15:00+00 deadline above.
select count(*)::int as predictions, max(p.predicted_at) as last_written
  from predictions p
  join fixtures f
    on f.competition = p.competition
   and f.season = p.season
   and f.fixture_id = p.fixture_id
 where p.competition = 'FL1' and p.season = '2026-27'
   and coalesce(f.locked_in_gw, f.gw) = 1;
```

_Written against the schema rather than from memory — `predictions` carries `competition`
and `fixture_id` (migration 0022), the Gameweek of a Fixture is `coalesce(locked_in_gw,
gw)` as the predict path itself selects, and `prompt_version` is a column of `models`, the
seat, and never of `contexts`. That last one is a mistake this project has already made
once and written down._

_**Re-read 2026-08-21 and every figure held**: four leagues listed, ten seats at
`match-fl1/2026-27-v1`, `deadline_at` `2026-08-21 17:15:00+00`, the two runs completed
`17:05:16.821` and `17:05:17.108`, and **90 Predictions with the last written
`17:05:16.549+00`**. So the margin is eight minutes and forty-three seconds, which the
prose above rounds to nine; the record is the timestamp. Nothing in this ticket now rests
on a pasted number that cannot be asked for again._

### Cost

Nine Fixtures times ten seats, at the $0.1845 per Fixture the
[price report](../../reports/2026-08-15-five-league-price.md) read off La Liga's Gameweek 1
— **90 calls, about $1.66**, against the $56.46 per Season ADR-0049 committed for this
Competition. Asked and granted before the insert, which is the point at which the spend
became inevitable: the row is what makes the poll reach the source.

### The dry run is red for every Competition, and was skipped deliberately

`COMPETITION=FL1 npm run dry-run` exits 1. So does `COMPETITION=PL`, identically:
`COMPETITION` does not reach the failure, which is in `prepareArchivedGameweek` before
the per-Competition path.

`listArchivedCompetitions` (`src/dry-run/prepare-archived-gameweek.ts:44`) derives the
Competitions a rehearsal will walk from the archive's own
`football_data_org:<season>:<CODE>` snapshot names. Ticket 0033 captured Serie A's and
Ligue 1's, so both leagues are now listed in every rehearsal — while their remaining
three sources apiece were never archived, and `runDailyFetch` collects all six misses and
throws:

```
understat:2026-27:Ligue_1                        wikipedia:squad-changes:france-summer-2026
understat:2026-27:Serie_A                        wikipedia:squad-changes:italy-summer-2026
wikipedia:head-coach-changes:2026-27-ligue-1     wikipedia:head-coach-changes:2026-27-serie-a
```

The function's own docstring states the rule it now breaks — *"An archive that never saw
a league cannot rehearse it, and listing it anyway would replay a fetch against bytes
that are not there."* One football-data.org snapshot is too weak a predicate for "the
archive can answer for this league".

This is wider than this ticket: the pre-cron checklist's rehearsal step is currently red
for the Premier League and La Liga, which are live. It is not a Ligue 1 problem and is not
fixed here. **Ticket 0039 inherits it identically.**

Box 3 is **not ticked** and the activation went ahead without it, which was the operator's
call made against the stated alternative of opening at Gameweek 2.

### Three drifts on the Ligue 1 season article, two fixed

`npm run fetch` failed on `wikipedia:head-coach-changes:2026-27-ligue-1`. Three distinct
shape differences, found one at a time because each hid the next:

1. **`Managerial changes` column labels.** The article heads its fifth column
   `Position in table`; `SOURCE_COLUMNS` pinned `Position in the table`. Checked against
   the live wikitext of all four season articles: Premier League, La Liga and Serie A all
   write `Position in the table` and **only Ligue 1 differs**, so Serie A does not inherit
   this one.
2. **`Personnel and kits` column order.** Ligue 1 heads it
   `Team | Chairman | Manager | Captain` — `Manager` is third, not second. This is exactly
   the case `parse-head-coaches.ts`'s pin was written to catch: read by position against
   the common pair, every club's **chairman** would have been stored as its Head Coach,
   and nothing downstream could have told.
3. **A two-row header.** Every one of the eighteen rows reads seven cells against eight
   header columns — the article uses `rowspan="2"` with a spanning kit group, and
   `tableLines` reads one header row. **Not fixed.**

1 and 2 are fixed by giving `HeadCoachSource` optional `columns` and `personnelColumns`,
listed on Ligue 1's entry beside its article title, where the other per-league facts
already live. The Head Coach column is read as `columns.indexOf("Manager")` rather than a
second constant that could disagree with the first. Not matched loosely: the pin exists so
a reordered table is a refusal, and shrugging at one label's wording would accept that
wording from every league whose page does not use it.

3 is a table-shape problem, not a wording one, and rewriting `tableLines` for
`rowspan`/`colspan` against a deadline was refused. The row-width guard that catches it is
correct and was not weakened to get past it.

**Consequence, and it is visible rather than silent:** Ligue 1's Gameweek 1 packet renders
`Head Coach: unavailable; no Head Coach is readable for this Gameweek` for every club, and
`predictions` is insert-only, so that is Gameweek 1's stored context permanently. The
packet says so rather than omitting the section.

At the moment of the run the fix for 1 and 2 was uncommitted and untested, which is why
the run was made from the untouched main checkout: it is not on the prediction path —
`build-head-coach-context.ts:182` calls `headCoachSource` only to ask whether an article
is listed, and the two added fields are optional.

_**That sentence stood after it stopped being true, and review found it.** It read "is
uncommitted and **has no test**; it must not be merged as it stands" while, two paragraphs
below, this ticket's own Checks section named the test and its five passes. All three of
its claims are now false: `5c6fdae` carries both `src/head-coach/*` and
`test/parse-ligue-1-head-coach-tables.test.ts` in one commit, merged at `ecada5a`, and
`fcc9908` closed drift 3. A ticket is the record, so a sentence that expired inside it is
worth more as a correction than as a deletion._

### Context, read before paying for it

`GAMEWEEK=1 COMPETITION=FL1 npm run context:show` renders nine Fixtures over 611
historical matches and reaches no Base Model. Read before the run: the table states no
result played yet, prior-Season base rates come off 306 matches (home 46.1%, draw 24.5%,
away 29.4%) which is eighteen clubs and not twenty, form lines carry xG, head-to-head and
Squad Changes carry real names. One `xG unavailable` on a single Marseille fixture is
Understat date drift, not a broken map.

### What is left behind

- **Box 3 is open and is not this ticket's to close.** The rehearsal is red for every
  Competition; it wants either the six missing snapshots archived or a predicate in
  `listArchivedCompetitions` that means what its docstring says. Ticket 0039 hits it
  unchanged.
- **Ligue 1 renders no Head Coach section** until the two-row header is read. The other
  three leagues are unaffected and Serie A does not share any of the three drifts.
- **Ticket 0035 stays open.** `FOOTBALL_DATA_SEASON` still reads `2025-26`.
- The live dashboard has not been looked at; only its view test.

### Checks

`test/parse-ligue-1-head-coach-tables.test.ts` — 5 passed, over the article pinned at
`8cd90e27d704709e48f88f7d633a25174c4e620c262145cb22910a7f475c6d39`. It proves both
overrides are read, that each table is refused under the other leagues' shapes, and it
characterises the unfixed row-width drift rather than hiding it. Mutating
`Position in table` back to `Position in the table` turns 2 of the 5 red; restored from a
byte copy, 5 green. `test/parse-head-coaches.test.ts`,
`test/build-head-coach-context.test.ts` and `test/fetch-head-coach-changes.test.ts` are 40
passed together, so the Premier League and La Liga are unmoved.
`test/dashboard-competition-view.test.ts` is 16 passed.

### Afterwards: both dry-run causes fixed

Two changes after the Lock, neither of which can make box 3 true retrospectively.

**The rehearsal walks one league.** `listArchivedCompetitions` became
`listRehearsedCompetitions`: `PL` and the Competition named by `COMPETITION`, and nothing
else. A league captured but not activated can no longer take another league's rehearsal
down with it, and the ordering stops being circular. PL went green immediately; PD
surfaced `StaleFootballDataSeasonError`, which is ticket 0035's open work showing through
rather than an archive fault.

**The two-row header is read.** `tableLines` now keeps the header's rows apart instead of
flattening them, and `parseHeadCoaches` takes its width from the first row's `colspan`
total rather than from the number of `!` lines. Ligue 1's Personnel table heads five
columns `rowspan="2"` and puts a `colspan="2"` `Sponsors` group over `Main` and
`Other(s)` beneath — seven columns written as eight header cells, which is why every one
of its eighteen rows read one short. All three drifts are now fixed and the packet renders
real names: `Head Coach: Patrick Videira`, `Will Still`.

`COMPETITION=FL1` dry run: exit 0, `Contexts: 9, Predictions: 0 (expected 0), Gaps: 90
(expected 90)`.

**Gameweek 1's stored contexts keep the stated absence.** `predictions` is insert-only and
the context is stored with the Prediction, so the ninety already written say
`Head Coach: unavailable` and always will. The fix reaches Gameweek 2 onward. Production
also holds no `head_coach_changes` row for `FL1` until a fetch runs again.
