# Spec 0027 — The Nations League opens

**Status:** ready-for-agent
**Scope:** everything that must exist before the Nations League's first predicted
Gameweek, and everything its six Gameweeks need to settle and score
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:**
[ADR-0057](../adr/0057-the-nations-league-opens-as-the-first-cup-on-sources-nobody-documents.md),
[ADR-0058](../adr/0058-the-nations-leagues-shots-and-xg-come-from-365scores.md),
standing on [ADR 0035–0038](../adr/), [ADR-0050](../adr/0050-a-row-the-source-has-no-result-for-is-not-corruption.md),
[ADR-0054](../adr/0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md),
[ADR-0056](../adr/0056-results-have-a-second-source-shots-have-one.md)

---

ADR-0057 opens `UNL`, the UEFA Nations League, for 2026-27: fifty-four national teams,
fourteen groups across Leagues A–D, 156 Fixtures in six Gameweeks that are UEFA's
matchdays `MD1`–`MD6`, and nothing after November. It is the first Competition that is
not a league, and none of the five sources the league template rests on holds a national
team. ADR-0058 picks 365Scores for shots and xG and as the second source of results.
This spec turns those two decisions into requirements. Where spec 0024 could say "every
code path already exists", this one cannot: the schedule source, the stats source, the
history source and the head-coach source are all new, and the daily fetch has to learn
that a Competition may have none of the sources it walks today.

Reads ADR-0036 (derived deadline, attachment by kickoff, the withdrawn path), ADR-0037
(a packet holds what has a source and states what has none), ADR-0038 (one template, one
Prompt Version per Competition), ADR-0043 (xG rates in the packet), ADR-0045 (the packet
names who picks each team), ADR-0050 (a missing figure is not corruption), ADR-0054 (no
target Gameweek; a missing map fails loudly), ADR-0056 (results have a second source).

## Problem Statement

An operator who wants the benchmark to ask its question of national teams has nowhere
to start. The `competitions` insert that opens a league would open `UNL` into a daily
fetch that reads football-data.org (403 on this plan), then throws "no curated
divisions", "no Understat league", and after the first deadline "no stored
football-data matches" — every day, for a Competition that never claimed any of them.
There is no way to store a national team's schedule, its shots, its xG, its recent
results or its head coach, and no packet that says honestly which of those a Nations
League Fixture has.

## Solution

`UNL` opens the way every Competition opens — a frozen Prompt Version, a `competitions`
insert, ten seats — on four new sources the daily fetch reaches only for Competitions
that list them: UEFA's match feed for the schedule and the ninety-minute result,
365Scores for each side's shots and xG and as the second reading of the score, a GitHub
dataset for each side's last five internationals, and a Wikipedia list for who picks
each team. A per-Competition source registry replaces "every listed Competition reads
every source"; a Competition absent from it still fails loudly. The packet renders the
sections that have a source and states the absence of the ones that do not, Fixture by
Fixture, including the roughly four per cent of Fixtures 365Scores holds no xG for.

## User Stories

### Schema and registry

1. As an operator, I want `UNL` in the `competition_code` domain, so that a Fixture,
   Gameweek, seat or score can be written under it at all.
2. As an operator, I want a migration that creates `international_results` (one row per
   international, keyed by date and the two sides, carrying competition name, venue
   country and the neutral flag) and a team-stats table keyed by source and source match
   id (per side: shots, shots on target, xG; the kickoff and the two sides for the join),
   so that Nations League rows have somewhere to go without touching
   `historical_matches` or `understat_match_xg`.
3. As an operator, I want the historical-matches Division check left exactly as it is,
   so that a cup's history can never be filed under a Division it does not have.
4. As a developer, I want a source registry that names, per Competition, where its
   schedule, its history, its shots and xG and its head coaches come from, so that the
   daily fetch reads a field rather than testing a code, and a new Competition is one
   entry.
5. As a developer, I want a Competition missing from the registry to fail the daily
   fetch by name, so that ADR-0054's rule — a missing map fails, a wrong one fails
   nothing — survives the registry's arrival.
6. As a developer, I want the schema test to hold the registry against the
   `competition_code` domain, so that a code in one and not the other is a red test and
   not a Gameweek.

### The frozen prompt

7. As an operator, I want `MATCH_PROMPTS.UNL` frozen as `match-unl/2026-27-v1` with the
   Competition name "UEFA Nations League", so that ten seats can be entered under it and
   the Competition routes exist on the dashboard.
8. As an Entrant, I want the `UNL` rendering to differ from `PL`'s only where the
   packet's sections differ by design, so that the template stays one template and the
   difference between Competitions is a stated structural one.
9. As an operator, I want the `UNL` sha pinned before any Nations League row is stored,
   so that the pin moves only for the reasons ADR-0026 allows.

### Schedule and results from UEFA

10. As an operator, I want the daily fetch to read UEFA's feed for `UNL` — every page of
    the Season, since the feed answers a hundred matches at a time — and store each
    Fixture under its UEFA match id with its group, its kickoff and its matchday, so
    that the schedule is the record's and not a page's.
11. As an operator, I want each matchday name `MD1`–`MD6` stored as Gameweek 1–6, so
    that the Gameweek is UEFA's and CONTEXT.md's sentence about it is true.
12. As an operator, I want a matchday name that is not one of those six — `MD7`, `SF`,
    `Final` — refused by the fetch with the name in the error, so that a knockout
    Fixture that appears after November is a loud fact and not a silent Gameweek 7.
13. As an Entrant, I want the derived deadline rule unchanged — earliest kickoff among
    the Gameweek's Fixtures minus ninety minutes, frozen once a Lock is observed — so
    that a Nations League Gameweek Locks on the same promise as any other.
14. As an operator, I want the ninety-minute score (`score.regular`) and never the total
    to settle a Fixture, so that a result is the same thing it is in every league.
15. As an operator, I want a `FINISHED` match whose ninety-minute score is missing to be
    refused as a validation error, so that a settled Fixture cannot be scoreable with
    nothing to score.
16. As an operator, I want an `ABANDONED` match to take the withdrawn path — deleted if
    never Locked, `deferred` with its Prediction kept if it was — and never to settle at
    the score the feed shows, so that a match that did not finish is not scored as if it
    had.
17. As an operator, I want a Fixture whose kickoff moves inside its Locked deadline
    alerted by `KickoffInsideDeadlineError` exactly as for any Competition, so that a
    Prediction always precedes its kick-off here too.
18. As an operator, I want an empty UEFA response for a listed `UNL` refused by the
    stale-source guard, so that an empty Gameweek can never Lock.
19. As an operator, I want every UEFA response archived in `raw_snapshots` under its
    own source name before it is validated, so that a changed feed is evidence a person
    can read and a dry run can replay.
20. As an operator, I want UEFA's `internationalName` stored on every Fixture with
    "Türki̇ye" normalised to "Türkiye", so that packets carry the name a reader expects
    and every other source maps onto one spelling.

### Shots, xG and the second result from 365Scores

21. As an operator, I want the daily fetch to ask 365Scores for the day's Nations League
    Fixtures on every date the stored schedule has a kickoff on, and for the match sheet
    of every Fixture that has settled, so that shots and xG land the morning after the
    match.
22. As an operator, I want each sheet's per-team "Expected Goals", "Total Shots" and
    "Shots On Target" stored in the team-stats table under source `365scores` and the
    365Scores game id, joined to the Fixture by the two sides and the kickoff date, so
    that the packet's xG rates and shot lines have rows to read.
23. As an operator, I want a settled Fixture whose sheet holds no xG asked again on
    every daily fetch until the Season closes, so that a hole the source later fills is
    filled here too.
24. As an Entrant, I want a settled Fixture with no stored shots or xG rendered as "no
    shots or xG stored for this Fixture" and never as zero, so that an absence reads as
    an absence.
25. As an operator, I want the 365Scores score compared against the Fixture's UEFA
    result and a disagreement reported in the daily fetch's outcome without either
    result being changed, so that results have their second source and nobody's hand
    is on the record.
26. As an operator, I want the three 365Scores spellings ("Ireland", "Turkiye", "Bosnia
    & Herzegovina") mapped to the stored names and any other unmapped name refused by
    name, so that a Fixture is never joined to the wrong side and never silently
    skipped.
27. As an operator, I want every 365Scores response archived in `raw_snapshots`, so
    that ADR-0058's baseline reading is repeatable from what the record holds.

### Recent internationals from the GitHub dataset

28. As an operator, I want the daily fetch to read the dataset's `results.csv` once a
    day, store every row for the fifty-four sides from a stated start date forward in
    `international_results`, and record the dataset's latest row date, so that the
    packet can say how fresh the source is.
29. As an Entrant, I want each side's five most recent internationals before the Lock —
    across every competition, with the competition named and a neutral venue marked —
    so that I know what each side did last, including the 2026 World Cup.
30. As an Entrant, I want one line stating the date the dataset was last updated, so
    that a side whose September matches are missing reads as a stale source and not as
    a side that did not play.
31. As an operator, I want the dataset's two spellings ("Czech Republic", "Turkey")
    mapped and any other unmapped name for one of the fifty-four refused by name, so
    that recent form is never attributed to the wrong side.
32. As an operator, I want a Nations League Fixture that has settled in the record and
    not yet in the dataset to appear in the packet from the record and not twice once
    the dataset catches up, so that the same match is never two lines.

### Who picks each team, from Wikipedia

33. As an operator, I want the daily fetch to archive Wikipedia's current-managers list
    and parse its UEFA table into one head coach per side with the date the role was
    assumed, so that the packet can name who picks each team.
34. As an Entrant, I want each side's head coach and the date they assumed the role in
    the packet, so that the promise of ADR-0045 holds for national teams.
35. As an Entrant, I want a Head Coach Change shown when two archived snapshots disagree,
    with the date the change was first observed, so that a change since the first stored
    snapshot is visible and one before it is honestly not.
36. As an operator, I want the table's FIFA trigrams mapped onto the stored names by a
    reviewed fifty-four-entry map derived from UEFA's `countryCode`, and any of the
    fifty-four missing from the table refused by name, so that a side is never given
    another side's coach.
37. As an operator, I want a vacant post rendered as vacant and never as the previous
    holder, so that the packet does not name a coach who has left.

### The packet

38. As an Entrant, I want the `UNL` packet to hold the Fixture line, this Season's
    played Fixtures with shots and xG, each side's five recent internationals, and who
    picks each team, so that everything with a source is in front of me.
39. As an Entrant, I want no league table, no Squad Changes and no availability
    section, each a stated absence and none of them a Gap, so that the packet says what
    a cup does not have rather than apologising for it.
40. As an Entrant, I want Gameweek 1's packet to read "no result has been played yet
    this Season" for the Season section, so that the first Gameweek reads as every
    league's first Gameweek reads.
41. As an operator, I want base rates and xG rates (ADR-0043) computed over
    `international_results` and the team-stats table for `UNL` and never over
    `historical_matches`, so that a Nations League packet reads no league's rows.
42. As an operator, I want the context builder scoped by Competition so that a `PL`
    packet reads no `UNL` row and a `UNL` packet reads no `PL` row, in both directions.

### The daily fetch

43. As an operator, I want the daily fetch to walk the four league-only sources
    (football-data.co.uk, Understat, Squad Changes, Head Coach changes from a Season
    article) only for Competitions whose registry entry names them, so that `UNL` never
    reaches a source it does not have and never fails for lacking one.
44. As an operator, I want the after-first-deadline guard to read the registry's
    history source, so that `UNL` is tested for current-Season rows in
    `international_results` and never for rows in `historical_matches`.
45. As an operator, I want a `UNL` failure collected and reported by name without
    costing another Competition its day, and the run still to fail loudly at the end, so
    that one undocumented feed moving is one Competition's problem.
46. As an operator, I want the ADR-0056 projection never to run for `UNL`, so that a
    cup's results are never written into `historical_matches` by a path meant for a
    league's outage.

### Activation and cost

47. As an operator, I want `UNL` to open at the first Gameweek whose derived deadline
    has not passed when the `competitions` row is inserted, with no target and no
    hand-set Lock, so that ADR-0054's rule holds for the sixth Competition.
48. As an operator, I want a Gameweek the activation missed to arrive as Locked history
    through the mid-Season adoption path, so that the record shows what was played and
    not predicted.
49. As an operator, I want ten seats entered under `match-unl/2026-27-v1` by the
    existing roster command, so that the Season Roster is the same ten as every
    Competition's.
50. As an operator, I want a ticket that re-reads the per-Fixture price off `attempts`
    rows after the first `UNL` Gameweek settles and replaces ADR-0057's $47 ceiling, so
    that the number stated is a measured one.
51. As a reader of `/overall`, I want `UNL` in the Combined Ranking from the Gameweek it
    is first scored, with ADR-0051's prose corrected from "league" to Competition, so
    that the page says what it sums.

### The runbook

52. As the next operator, I want the opening-a-Competition runbook to say which of its
    eight edits a cup makes and which it does not, and to name the registry entry, the
    two new tables and the three name maps as the cup's edits, so that the seventh
    Competition counts what the change is.

## Implementation Decisions

- **Four new source modules, one shape.** Each new source (UEFA schedule, 365Scores
  stats, the GitHub dataset, the Wikipedia managers list) is a fetch that takes the
  database, the Competition, the Season, the HTTP fetcher and a clock, archives the raw
  body before validating it, and writes only through the tables — the seam every source
  in this project already has. None of them is reached except through the daily fetch.
- **The registry is the dispatch.** One readonly map from Competition code to
  `{schedule, history, stats, headCoaches}` source names. The daily fetch's existing
  "every listed Competition but `PL`" filter becomes "every listed Competition whose
  schedule source is football-data.org", and the same for the other three loops. `PL`
  and the four leagues get entries that describe exactly what they read today, so
  nothing about them moves. A listed Competition with no entry throws by name before
  any source is reached.
- **The UEFA fetch mirrors the football-data.org fetch** — paging aside, it is the same
  algorithm over the same `gameweeks` and `fixtures` tables: derived deadline, attachment
  by kickoff, withdrawn statuses, settled statuses, the stale guard, the breach alert.
  Matchday names are read through a six-entry map to Gameweek numbers and anything else
  is refused. `ABANDONED` joins the withdrawn set. The result is `score.regular`.
- **Fixture identity is the UEFA match id**, in the column the FPL id and the
  football-data.org id already share.
- **The team-stats table is generic on purpose**: `(season, competition, source,
  source_match_id)` as key, the kickoff and both sides for the join, and nullable per-side
  shots, shots on target and xG. The 365Scores fetch writes one row per settled Fixture
  it found a sheet for and upserts on every read; a row whose xG is null is a hole and is
  read again. `understat_match_xg` is not touched and stays the five leagues' source.
- **`international_results` is keyed `(played_on, home_team, away_team)`** with
  `tournament`, `country`, `neutral` and both scores; no Season, no Division. The fetch
  stores rows from 2024-06-01 forward for the fifty-four sides only and records the
  file's latest row date on each read (in the snapshot's metadata or a one-row table,
  the ticket decides which is least code).
- **The recent-internationals section** takes each side's five latest rows before the
  Lock from `international_results`, merged with the Season's settled `UNL` Fixtures
  from the record, deduplicated on (date, sides), newest first; one trailing line names
  the dataset's latest row date. The section is absent for a Competition whose registry
  names no history source and present-but-empty for a side with no rows.
- **The head-coach section for `UNL` is a new builder over a new store**, not an
  extension of the Season-article one: the Wikipedia table gives the current holder and
  assumption date per side, the store keeps one row per (side, observed date), and a
  Change is the difference between two consecutive snapshots — **every** pair in the
  window that disagrees, not only the last two. Ticket 0074 widened this bullet from "the
  latest snapshot and the one before it", which read literally loses the changes story 35
  asks for: snapshots of A, B, B show no difference between the last two, and a packet
  reading only that pair would say nothing had happened while the Change sat one row
  further back. Taking every consecutive disagreement is the same single pass.
  The existing `head_coaches`/`head_coach_changes` tables were **not** reusable, on two
  counts ticket 0074 records: neither has a column for the assumption date, and
  `head_coaches` is keyed by Gameweek and rewritten whole on every read, which deletes
  the previous answer a Change is the difference from. Migration `0045` keys by side and
  observed day instead.
- **Three name maps, each reviewed before the first packet**: 365Scores → stored (3),
  dataset → stored (2), FIFA trigram → stored (54, derived from UEFA's `countryCode`).
  Each is derived from the archived sources by a test the way the league maps are, and a
  name not in a map refuses loudly.
- **The rendering for `UNL` is `PL`'s minus the absent sections plus the two new ones**,
  and the pinned sha is read off that render before any row lands. The
  competition-name agreement test extends to `UNL`.
- **Cost:** twenty-six sheet reads a Gameweek on 365Scores, one listing read per kickoff
  date, one dataset read and one Wikipedia read a day; none reaches a Base Model. The
  Base Model cost is 156 Fixtures × ten seats, ceiling $47 (ADR-0057), re-read by
  ticket after the first Gameweek settles.
- **The activation order is fixed and the insert is the operator's**: migration →
  registry entry → prompt version and pin → the three maps reviewed → first daily fetch
  of the schedule under a temporary listing in a dry run → `competitions` insert →
  `roster:enter`. The insert is the first step that spends money and is never taken by
  the implementing agent.
- **No hand-set Lock.** If Gameweeks 1 and 2 are missed they are let go; the next
  daily fetch after the insert adopts them as Locked history.

## Testing Decisions

A good test drives the entry point a cron calls — the daily fetch, the context builder,
the render — over a temporary Postgres and the archived bytes of the real feeds, and
asserts what lands in the record, what renders in a packet and what refuses by name.
Which regex parsed the table or which key held the xG is covered only through those
surfaces. The seams, highest first:

- **The daily-fetch seam** (`test/daily-fetch.test.ts` pattern: real Postgres, canned
  HTTP responses by URL, one `competitions` row per test). This is where the registry is
  proven: `UNL` listed alone reaches UEFA, 365Scores, the dataset and Wikipedia and
  nothing else; `PL` and `PD` listed beside it reach exactly what they reach today; a
  `UNL` failure is collected and named while `PD`'s day lands; a Competition with no
  registry entry fails before any source is called. The archived responses read on
  2026-09-14 — UEFA's 2026-27 pages, 365Scores' listing and sheets, a slice of
  `results.csv`, the managers list — join `test/fixtures` gzipped like every recorded
  source.
- **The per-source fetch seam** (`test/fetch-football-data-org-competition.test.ts`
  pattern, one file per new source): the UEFA fetch's matchday map, withdrawn and
  settled statuses, `ABANDONED`, the ninety-minute score, the refusal of `MD7`; the
  365Scores fetch's hole-and-retry, the score comparison, the three-name map; the
  dataset fetch's fifty-four-side filter and latest-date; the managers parser over the
  archived wikitext, with a vacancy.
- **The context seam** (`test/build-historical-context.test.ts` pattern): the
  recent-internationals section over seeded rows, the dedupe against a settled `UNL`
  Fixture, the dataset-date line, the "no shots or xG stored" line for a hole, the
  stated absences, and the contamination test in both directions
  (`test/competition-coexistence.test.ts` tracer pattern).
- **The render seam** (`test/openrouter-entrant.test.ts`): `UNL`'s pinned sha; the
  competition-name agreement; the `PL`/`PD` pins unchanged.
- **The schema seam** (`test/schema.test.ts`): registry held against the domain; the
  new tables' keys and checks; the Division check unchanged.
- **The map-derivation seam** (the league identity-map tests): each of the three maps
  derived from archived sources, both sets the same size with nothing left over, so a
  reviewer checks a diff and not a transcription.
- **Dry run as the gate**: `COMPETITION=UNL npm run dry-run` green over the archived
  snapshots is the acceptance for the whole write path and reaches no Base Model.

No new seam is proposed. The registry sits behind the daily-fetch seam; the new sources
sit at the per-source seam every source already has.

## Out of Scope

- **The knockout rounds** (March and June 2027, March 2028): deferred by ADR-0057; the
  fetch refuses their matchday names and nothing here prepares for them.
- **A group table, Elo ratings, the coach from UEFA's lineups endpoint**: deferred by
  ADR-0057.
- **Squad Changes and player availability for `UNL`**: no source; stated absences.
- **The FPL track and the five leagues' sources**: untouched; the registry describes
  what they read today and changes nothing about it.
- **The dashboard**: routes and pages come from `MATCH_PROMPT_COMPETITIONS` (ADR-0039)
  and need no edit; the `/overall` prose correction is a docs change alongside the price
  re-read.
- **Exhibition Runs for Gameweeks missed before activation**: not part of the record,
  not backfillable.
- **Any hand-set Lock.**

## Further Notes

- Clocks, read 2026-09-14: `MD1` 2026-09-24T16:00Z (deadline 14:30Z), `MD2` 09-27
  13:00Z, `MD3` 10-01 16:00Z, `MD4` 10-04 13:00Z, `MD5` 11-12 17:00Z, `MD6` 11-15 14:00Z.
- `MD1`/`MD2` and `MD3`/`MD4` are three days apart; a Gameweek here is twenty-six
  Fixtures over three days, and two Gameweeks Lock in one week. The derived-deadline
  code handles that as two rounds; the scheduler orders due work by deadline.
- The UEFA feed's 2024-25 edition is the reference for shapes not yet seen in 2026-27:
  `ABANDONED`, `MD7`/`MD8` with `aggregate`, `SF`/`3rd place`/`Final`, `score.penalty`.
- 365Scores' listing takes `DD/MM/YYYY`; one probe of 2024-09-05 returned no games while
  November 2024, March 2025 and June 2025 did — the ticket that builds the fetch checks
  how far back the listing reaches before relying on it for anything but the current
  Season.
- The dataset is committed roughly monthly (2026-07-19, 07-31, 08-26); September's
  Nations League results will lag it, which is why the Season's own Fixtures are merged
  from the record and the dataset date is printed.
