# Spec 0028 — The UEFA club cups open

**Status:** ready-for-agent
**Scope:** everything that must exist before `UCL`, `UEL` and `UECL` predict their
Gameweek 2, and everything their league phases need to settle and score
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:**
[ADR-0063](../adr/0063-the-three-uefa-club-cups-open-at-their-league-phases-second-matchday.md),
standing on [ADR-0057](../adr/0057-the-nations-league-opens-as-the-first-cup-on-sources-nobody-documents.md),
[ADR-0058](../adr/0058-the-nations-leagues-shots-and-xg-come-from-365scores.md),
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md),
[ADR-0062](../adr/0062-eight-seats-open-the-leagues-second-edition.md),
[ADR 0035–0038](../adr/), [ADR-0054](../adr/0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md)

---

ADR-0063 opens the UEFA Champions League, Europa League and Conference League for
2026-27, league phase only, each at its `MD2`. Each cup has 36 clubs in one table: 144
Fixtures over eight Gameweeks for `UCL` and `UEL`, and 108 over six for `UECL`. They are
the first cups whose sides are clubs. The Nations League's work (spec 0027) built most of
the cup path: the UEFA schedule fetch, the 365Scores stats fetch, the source registry,
the group table, and the snapshot-diff Head Coach model. This spec reuses all of it and
names what is new. That is a round filter and a per-Competition matchday map in the UEFA
fetch, a club-results history source, a club Head Coach source, three name maps, three
Prompt Versions, and two roster-module changes.

**The clock is the binding constraint.** `UCL`'s Gameweek 2 Locks 2026-10-13T15:15Z,
`UEL`'s 10-15T15:15Z and `UECL`'s 10-22T13:00Z. ADR-0063 sets a cut line for `UCL` only,
2026-10-13T06:00Z. If the history or Head Coach work is not green by then, `UCL` pins
without that section, and the section is stated absent for its whole league phase. The
stories below are ordered so that everything above the cut is what `UCL` cannot open
without.

## Problem Statement

The operator runs a benchmark asking which Base Model forecasts each Competition best.
Every Competition so far is a domestic league or the Nations League. Europe's three club
cups put clubs from thirty-odd countries against each other every week. For two-thirds
of those clubs the Base Models have read far less than for a Premier League side, and the
record has nothing on them at all: 70 of the 108 clubs play in no league the record holds.

Opening them as the record stands fails in specific ways:

- The UEFA fetch maps matchday names to Gameweeks with `UNL`'s six-entry map. The cups'
  qualifying rounds sit in the same feed under the same names, `MD1` and `MD2`, so they
  would become Gameweeks 1 and 2.
- There is no source of "what each club did last" for most of the 108 clubs, and no Head
  Coach source for any club outside the five leagues.
- The roster module cannot seat the leagues' Edition 2 eight as a Competition's
  Edition 1.
- The dashboard would count each club cup as a league and break `/overall`.

## Solution

Each club cup reads the same sources as `UNL` wherever a club is like a national side,
and two new sources where it is not:

- UEFA's feed gives the league-phase schedule and the ninety-minute result.
- 365Scores gives the shots and xG of every cup Fixture.
- 365Scores' per-club results listing gives each side's five most recent competitive
  matches in any competition.
- The English Wikipedia infobox of each club gives who picks the team. It is stored as
  daily snapshots, and a Change is the difference between two of them.

The packet carries the 36-side league-phase table with what each band of places leads
to, the cup's played Fixtures with their figures, the five recent matches, the Head Coach
lines, and Squad Changes stated absent. Each cup seats the leagues' Edition 2 eight as
its own Edition 1 and carries a roster caveat saying so. Each joins the leagues' current
Edition set and the Combined Ranking once ticket 0110 lands, because the set is defined
by roster. The operator applies the migration, runs the paid pre-flights,
and inserts each `competitions` row in the runbook's order, after the code is pushed
and deployed.

## User Stories

### Schema, vocabulary and registry

1. As the operator, I want `UCL`, `UEL` and `UECL` in the `competition_code` domain, so that a Fixture, a Gameweek or a Prediction can name them.
2. As the operator, I want CONTEXT.md's Competition entry to list nine Competitions and to say that a UEFA cup not read from football-data.org takes UEFA's own abbreviation, so that `UCL` means the Champions League everywhere in this record.
3. As the operator, I want an Edition 1 row for each club cup in `editions`, starting at Gameweek 1, so that every Gameweek of the cup falls in an Edition and `MD1`'s adopted history belongs to Edition 1.
4. As a maintainer, I want a `club_results` table keyed by source and source match id, with kickoff, both sides, both scores and the competition's name, so that a club's matches are stored without a Division and apart from `international_results`.
5. As a maintainer, I want a `club_head_coaches` table keyed by side and observed day, with the instant observed and a nullable head coach and no assumption date, so that an infobox snapshot stores what the source says and nothing it does not.
6. As a maintainer, I want each club cup's source registry entry to name `uefa` for its schedule, `365scores` for its stats, the 365Scores club results for its history, the Wikipedia club infobox for its Head Coaches, and no Squad Changes source, so that the daily fetch walks exactly those sources for it.
7. As a maintainer, I want the history and Head Coach unions in the registry to gain one source name each, so that a club cup's sources are new names and not new spellings of a league's.
8. As a maintainer, I want a listed Competition with no registry entry to keep failing by name before any source is reached, so that ADR-0054's loud-missing-map rule still holds.
9. As a maintainer, I want the new migration added to both suites' migration filename lists, so that schema tests and the rehearsal both see it.

### The schedule from UEFA

10. As a maintainer, I want the UEFA fetch to know UEFA's ids 1, 14 and 2019 for `UCL`, `UEL` and `UECL`, so that each Competition reads its own schedule and an unknown Competition is refused rather than guessed.
11. As a maintainer, I want the UEFA fetch to keep only matches whose round is the `League Phase`, so that the qualifying rounds' `MD1`/`MD2` never become Gameweeks.
12. As a maintainer, I want every other round, qualifiers and knockouts alike, to be skipped silently and not refused, so that a feed that has held qualifiers since July does not fail the fetch every day.
13. As a maintainer, I want `UNL` to keep refusing a matchday outside its map exactly as it does today, so that the club cups' skip rule does not loosen the Nations League's guard.
14. As a maintainer, I want each Competition to have its own matchday-to-Gameweek map (`MD1`–`MD8` for `UCL` and `UEL`, `MD1`–`MD6` for `UECL`, `MD1`–`MD6` for `UNL` unchanged), so that a Gameweek's number is its matchday's number.
15. As a maintainer, I want a league-phase match whose matchday is outside its Competition's map to be refused by name, so that a feed change surfaces instead of becoming a new Gameweek.
16. As the operator, I want each Gameweek's Lock derived as the earliest kickoff minus ninety minutes and frozen once observed, as for every Competition, so that no Lock is set by hand.
17. As the operator, I want the one-group `League` table name stored on every league-phase Fixture, so that the packet's table reads all 36 sides.
18. As the operator, I want `MD1` of `UCL` and `UEL`, already played, to arrive on the first daily fetch after the insert as Locked history with no Prediction, so that Gameweek 2 opens with Gameweek 1's results in the record.
19. As the operator, I want a Gameweek whose Lock has passed before the insert to be let go and adopted as history, so that a late insert costs one Gameweek and nothing else.
20. As the operator, I want the ninety-minute score to settle a Fixture and an `ABANDONED` match to take the withdrawn path, as for `UNL`, so that the club cups settle by the same rules.

### Shots and xG from 365Scores

21. As a maintainer, I want the 365Scores fetch to know competitions 572, 573 and 7685, so that each cup's sheets are read under its own id.
22. As a maintainer, I want one reviewed name map per cup from 365Scores' spelling to UEFA's `internationalName`, so that every one of the 36 sides joins its Fixture.
23. As a maintainer, I want a 365Scores side missing from its cup's map to refuse by name, so that a missing entry fails loudly and never renders as a hole the source does not have.
24. As the operator, I want the stats fetch to read the sheet of every settled Fixture of the cup that has no stored row, including those settled before the Competition was listed, so that each cup's `MD1` sheets (18 for `UCL`) are stored before Gameweek 2's Lock.
25. As the operator, I want a settled Fixture with no xG on its sheet stored as a hole and read again on later days, as for `UNL`, so that a late sheet fills itself in.
26. As the operator, I want 365Scores' score compared with UEFA's as the second source of results (ADR-0056), so that a disagreement surfaces as it does for `UNL`.

### History from 365Scores' club results

27. As a maintainer, I want a club-results fetch that, for each of a cup's 36 sides, reads 365Scores' results listing and stores every settled match, archived whole before it is validated, so that "what each side did last" has a source for every club.
28. As a maintainer, I want the fetch to resolve each side to its 365Scores competitor id through a reviewed map, so that a club is never matched by a name search.
29. As a maintainer, I want friendlies left out of the stored rows, so that pre-season matches never count as competitive form.
30. As a maintainer, I want each stored row to keep the competition's name as 365Scores gives it, such as "Parva Liga", "Super Cup" or "UEFA Europa League", so that the packet can say where each match was played.
31. As a maintainer, I want opponents stored as 365Scores spells them and only the cup's own sides mapped to UEFA's spelling, so that the curation stays at 36 names a cup.
32. As a maintainer, I want the fetch to upsert by source match id, so that a re-read never duplicates a match and a corrected score replaces the old one.
33. As a maintainer, I want a request pause between clubs, so that 108 listings a day stay polite to an undocumented host.
34. As the operator, I want one club's failed listing to fail that Competition's day by name and leave every other Competition's day intact, so that one bad response never takes the leagues down.

### Who picks each club, from Wikipedia

35. As a maintainer, I want a reviewed map of each of the 108 clubs to its English Wikipedia article title, so that the infobox is read from the right page and never from a search hit (ADR-0063 found 8 wrong hits in 108).
36. As a maintainer, I want an infobox parser that reads the `manager` field, or the club's equivalent coach field, from the article's wikitext through the documented MediaWiki API with a contact User-Agent, so that the source is read the way its owner asks.
37. As a maintainer, I want each daily read stored as one snapshot row per club and day, archived whole, so that a Change can be computed as the difference between two snapshots.
38. As a maintainer, I want an empty or unparseable infobox field stored as no head coach for that day, not as a failure, so that one club's vacancy or edit does not fail the cup's day.
39. As a maintainer, I want an infobox missing from a mapped article, or an article that does not exist, to fail that Competition's day by name, so that a broken map entry is caught the day it breaks.
40. As an Entrant, I want each side's Head Coach line to name who picks the team as of the Lock, so that I know who is in charge.
41. As an Entrant, I want a Change line when two stored snapshots before the Lock disagree, every disagreeing consecutive pair and not only the latest, dated by the first snapshot that shows it, so that a recent sacking is visible.
42. As an Entrant, I want the packet to say the Head Coach source carries no appointment date, so that I do not read an absence of "since" as an absence of change.

### The packet

43. As an Entrant, I want the Fixture line as every Competition has it, so that the packet opens the same way.
44. As an Entrant, I want the league-phase table of all 36 sides, ordered by points, goal difference and goals scored, with a line saying UEFA's tie-breaks are not applied, so that I see where both sides stand.
45. As an Entrant, I want one line saying places 1–8 go to the round of 16, 9–24 to the knockout play-off round and 25–36 are out, so that I can read what a result decides.
46. As an Entrant, I want the table to count only Fixtures settled before the Lock, and at Gameweek 2 to show every side's `MD1` result, so that the table is the one I could have read at the Lock.
47. As an Entrant, I want the cup's played Fixtures with shots and xG, so that every side, including those whose domestic leagues have no xG, shows at least one match with xG from Gameweek 2.
48. As an Entrant, I want a played Fixture with no sheet to read "no shots or xG stored for this Fixture", and a sheet with shots but no xG to read its shots with "xG unavailable", as for `UNL`, so that a hole is distinguishable from a zero.
49. As an Entrant, I want each side's five most recent competitive matches before the Lock in any competition, newest first, with the competition named and the score, so that I see current form across the league and Europe.
50. As an Entrant, I want history lines to carry scores only, so that every line reads alike whether or not the club's league has xG on its sheet.
51. As an Entrant, I want a cup Fixture to appear on a history line as a score and in the played-Fixtures section with its figures, without the history being cut short, so that the five lines stay five.
52. As an Entrant, I want a side with fewer than five stored matches to show what exists and say so, so that a short list is not read as a failed fetch.
53. As an Entrant, I want Squad Changes stated as "not read for this Competition", so that I do not read it as "no changes".
54. As an Entrant, I want no availability section, silently, as in every Competition but the Premier League, so that the cup packet does not apologise for a feed four leagues also lack.
55. As an Entrant, I want no row stored after the Lock to reach any section, so that the packet never leaks the future (ADR-0093's rule).
56. As a maintainer, I want the packet's sections chosen by the registry and not by a `UCL` literal, so that the builder names no Competition.

### The cut line for `UCL`

57. As the operator, I want `UCL`'s Prompt Version pinned from a read render by 2026-10-13T06:00Z, with whatever sections are green by then, so that the code can be pushed and deployed before Lock − 6h (09:15Z).
58. As the operator, I want a section left out at the cut stated absent in `UCL`'s packet for its whole league phase, so that a missing section never reads as a failed fetch.
59. As the operator, I want `UEL` and `UECL` pinned later with every section green, regardless of what `UCL` cut, so that `UCL`'s haste does not shape the other two.
60. As a maintainer, I want a registry entry for a cut section to name no source, so that the daily fetch does not walk a source the frozen packet will never read.

### The frozen prompt

61. As the operator, I want `match-ucl/2026-27-v1`, `match-uel/2026-27-v1` and `match-uecl/2026-27-v1`, each with its competition name ("UEFA Champions League", "UEFA Europa League", "UEFA Conference League") and a sha pinned from that Competition's render read line by line, so that each is frozen from its first Lock (ADR-0026, ADR-0038).
62. As a maintainer, I want every existing pin (`PL`, `PD`, `SA`, `BL1`, `FL1`, `UNL`) unchanged, so that nothing this spec touches moves a frozen render.
63. As a maintainer, I want the competition-name agreement test to cover the three new Competitions, so that the packet's name and the prompt's name cannot drift.

### The roster

64. As the operator, I want each club cup's Edition 1 to seat the eight of the leagues' Edition 2 (the same entrant objects), so that a cup reader sees the roster a league reader knows.
65. As a maintainer, I want an Edition 1 to be able to name its roster outright, including a seat the Season Roster does not hold (Claude Opus 5.5), while every existing Edition 1 still derives from the Season Roster as today, so that `UNL` and the leagues' Edition 1 read exactly what they read now.
66. As the operator, I want `roster:enter` to enter eight seats under each club cup's Prompt Version, so that the cup's entrants exist before its first Lock.
67. As the operator, I want the pre-flight's expected entrant count for a club cup derived as eight from the roster of record, so that a pre-flight cannot pass with a seat missing.
68. As the operator, I want each club cup to carry the frozen roster caveat ADR-0063 states, with the cup's name, wherever its ranking is shown, so that a reader knows the cup's Edition 1 is the leagues' Edition 2 eight, and the sentence stays true whether or not the cups are summed.
69. As a reader of `/overall`, I want the Combined Ranking to keep summing the five leagues' Edition 2 and no cup until ticket 0110 lands, so that the page shows a total and never "mixed Editions" in between.
69a. As a reader of `/overall`, I want the three club cups summed with the leagues' Edition 2 once each is Active and scored, because they seat the same eight, with a line saying how much of the sum they are and when they start and end, so that one Base Model's record across every Competition it plays reads as one total.
69b. As a reader of `/overall`, I want `UNL` still out of the sum and `/edition-1/overall` unchanged, so that the roster rule never pulls in a set the Base Model did not play.
70. As a reader, I want each club cup in the dashboard switcher as its own view, labelled `UCL`, `UEL` or `UECL`, so that the cups are one click away and never inside the leagues' set.

### The daily fetch

71. As the operator, I want the daily fetch to walk the three club cups through the registry alone, reaching UEFA, 365Scores and Wikipedia and nothing a league reads, so that listing a cup never calls football-data.co.uk, Understat or the transfer lists for it.
72. As the operator, I want the leagues and `UNL` to reach exactly what they reach today, so that opening three cups changes nothing about the other six days.
73. As the operator, I want each new source's failure collected and named under its own Competition while the others' days land, so that an undocumented feed moving costs only the Competitions that read it.
74. As the operator, I want the after-first-deadline guard to ask the club cups' history table, so that a cup with no current results after its first Lock fails loudly, as a league does.

### Activation, rehearsal and cost

75. As the operator, I want a runbook section for opening a club cup, in the corrected order (push and deploy, migration after `db:rehearse`, `competitions` insert, `roster:enter`, the first daily fetch by hand, the dry run over its archive), so that the sequence that worked for `UNL` and Edition 2 is followed again.
76. As the operator, I want the dry run of a club cup's Gameweek 2 to show `MD1` adopted as Locked history, all 36 `MD1` sheets stored with every name mapped, the 36-side table, five history lines per side and a Head Coach line per side, so that the packet is read before money is spent.
77. As the operator, I want each eight-seat pre-flight asked for separately, with its call count and rough cost, so that no paid call runs on this spec alone.
78. As the operator, I want the `competitions` insert left to me and never taken by the implementing agent, so that the first spend is my decision.
79. As the operator, I want each cup's real per-Fixture rate read off `attempts` after its first settled Gameweek, replacing ADR-0063's $0.3003 ceiling, so that the cost figure is measured.
80. As the operator, I want a missed Gameweek 2 to mean opening at Gameweek 3 by ADR-0054's rule, with nothing set by hand, so that being late never corrupts the record.

## Implementation Decisions

- **No new seam.** Every new source is a fetch with the shape every source here has: it
  takes the database, the Competition, the Season, the HTTP fetcher and a clock, archives
  the raw body before validating it, and writes only through its tables. It is reached
  only through the daily fetch, dispatched by the registry.
- **The UEFA fetch gains a round filter and a per-Competition matchday map.** The filter
  is `round.metaData.name = "League Phase"` (with `round.phase = "TOURNAMENT"`), applied
  before the matchday map, and only for a Competition whose feed holds other rounds. The
  map becomes keyed by Competition. A league-phase match whose matchday is outside its
  map is refused, and a match from another round is skipped. `UNL` has no other rounds
  in its 2026-27 feed and keeps its refusal of `MD7`/`MD8`/`SF`. Whether that refusal
  stays for `UNL`'s knockouts is ADR-0057's open decision, and this spec does not touch
  it.
- **The 365Scores stats fetch gains three ids and three maps.** Its existing behaviour
  already reads every settled Fixture of the Season that has no row (the hole-and-retry
  rule), so `MD1`'s sheets are read on the first fetch after the insert. A story here
  only pins that down for adopted history.
- **`club_results`** is keyed `(source, source_match_id)`, with `kicked_off_at`,
  `home_team`, `away_team`, both scores and `competition_name`. It has no Season, Division
  or Competition column. A club plays in several competitions under none of this
  record's codes, the same reason `international_results` has none, and the registry
  gates the read. Rows are stored for the cup's sides from 2026-07-01 forward. Friendlies
  are dropped at the fetch, by 365Scores' competition name.
- **The club history renderer** takes, for each side, the five latest `club_results` rows
  before the Lock. The cup's own settled Fixtures are already among them (365Scores lists
  the club's cup matches), so no merge with `fixtures` is needed. It prints date,
  competition, sides and score. It parallels the internationals renderer rather than
  extending it: that one carries `neutral`, the dataset-freshness line and a dedupe
  against `fixtures`, and none of the three applies here.
- **`club_head_coaches`** is keyed `(team, observed_on)`, with `observed_at` and a
  nullable `head_coach`, and no `assumed_on`. That check is the reason
  `national_team_head_coaches` cannot be reused. The Change computation (every
  disagreeing consecutive pair of snapshots before the Lock) is the national-team
  builder's. Extracting the shared pass is in scope only if a test forces both builders
  to change at once; otherwise the builder is a parallel one.
- **Three name maps per cup**: 365Scores spelling → UEFA (36), UEFA side → 365Scores
  competitor id (36), and UEFA side → Wikipedia article title (36). Each is derived from
  archived responses by a test, the way the league identity maps are, and reviewed as a
  diff. The `UCL` maps are written first. 17 of its 36 365Scores spellings differ.
- **The registry entries** use two new source names: one for the 365Scores club
  results, in the `history` union, and one for the Wikipedia club infobox, in the
  `headCoaches` union. `squadChanges` is `null`, and the packet states the absence in
  ADR-0063's words. A section cut for `UCL` at the cut line is `null` in `UCL`'s entry
  alone.
- **The table section is the group-table builder from ticket 0087**, given one group of
  36 and a new frozen line for the bands. The bands line is a constant keyed by
  Competition, never derived (the frozen-text-is-a-constant rule).
- **The roster module**: Edition 1 reads a per-Competition Edition roster when one is
  named, and derives from the Season Roster otherwise. The three club cups name
  `LEAGUE_EDITION_2`. `matchRosterOf`, `matchRosterSizeOf` and `roster:enter` read
  through it unchanged. `ROSTER_CAVEATS` gains three entries holding ADR-0063's frozen
  sentence. Until ticket 0110, the dashboard's league test (`isLeague`: no caveat) keeps
  the cups out of every Edition set with no change of its own.
- **Ticket 0110 redefines an Edition set by roster.** A Competition is in the current set
  when its current Edition's roster of record is the set's roster, by entrant identity
  and not by number. The overall view's mixed-Edition refusal compares rosters. The
  caveat stops deciding membership. ADR-0051 gains a third amendment and CONTEXT.md's
  Edition set entry moves.
- **Prompt Versions**: three `MATCH_PROMPTS` entries, each pinned from a render read
  whole and recorded in its ticket. `UCL` is pinned by the cut line. `UEL` is pinned
  before 10-15T15:15Z minus the deploy window, and `UECL` before 10-22T13:00Z minus the
  same.
- **The dashboard** gains three switcher labels and no route edits. Routes come from
  `MATCH_PROMPT_COMPETITIONS` (ADR-0039).
- **Codes are `UCL`, `UEL`, `UECL`** (ADR-0063), with CONTEXT.md amended in the same
  ticket as the migration.
- **Request budget a day**: three UEFA schedules (two pages each for `UCL`/`UEL`, four for
  `UECL`), up to 18 sheets per cup on a matchday, 108 club listings, and 108 MediaWiki
  reads, serial, with about 0.4 s between 365Scores requests.
- **Ticket order**, numbered off `main` once this spec lands:
  1. migration, codes, registry, CONTEXT.md;
  2. UEFA round filter and map;
  3. 365Scores ids and `UCL` names;
  4. roster Edition 1 and caveats;
  5. club results;
  6. club Head Coaches;
  7. `UCL` prompt and pin — **cut line**;
  8. runbook and the `UCL` activation (operator);
  9. `UEL` names, pin and activation;
  10. `UECL` names, pin and activation;
  11. price re-read;
  12. `/overall` sums the club cups (0110), after `UCL` activates.

  Tickets 1–4 and 7 are what `UCL` cannot open without. Tickets 5 and 6 are what the cut
  line may drop.

## Testing Decisions

A good test drives the entry point a cron calls: the daily fetch, the context builder,
the render, the roster entry. It runs over a temporary Postgres and the archived bytes of
the real feeds, and asserts what lands in the record, what renders in a packet, and what
refuses by name. How the infobox was parsed or which key held the competitor id is
covered only through those surfaces. The seams, highest first, are all existing ones:

- **The daily-fetch seam** (`daily-fetch` test pattern: real Postgres, canned HTTP by URL,
  one `competitions` row per test):
  - `UCL` listed alone reaches UEFA, 365Scores and Wikipedia and nothing else;
  - `PL`, `PD` and `UNL` beside it reach exactly what they reach today;
  - a `UCL` failure is named while the others' days land;
  - the first fetch after the insert adopts `MD1` as Locked history and stores its 18
    sheets.

  The responses read on 2026-10-12 join `test/fixtures` gzipped: UEFA's three 2026-27
  feeds, 365Scores' `MD1` listings and sheets, a sample of club listings and squads,
  and a sample of infobox wikitext.
- **The per-source fetch seam** (the `fetch-uefa-competition`, `fetch-365scores-stats`,
  `fetch-national-team-head-coaches` patterns):
  - UEFA: qualifiers skipped, `MD8` mapped for `UCL` and refused for `UECL`, and `UNL`'s
    refusal of `MD7` unchanged;
  - 365Scores: the three ids, and a missing name refused;
  - club results: friendlies dropped, upsert by match id, an unmapped side refused;
  - infobox: a vacancy, a field with markup, and an article with no infobox.
- **The context seam** (the `build-internationals-context` and
  `build-national-team-head-coach-context` patterns, plus `competition-coexistence`):
  - the 36-side table at Gameweek 2 with the bands line;
  - every side with at least one played Fixture carrying xG;
  - five history lines with competitions named and scores only;
  - a short history;
  - a Change dated by the snapshot that shows it, and the no-appointment-date line;
  - the Squad Changes absence;
  - nothing after the Lock;
  - no cup row reaching a league packet, and no league row reaching a cup packet.
- **The render seam** (the `openrouter-entrant` pattern): three new pins, the six existing
  pins unchanged, and competition-name agreement for nine.
- **The roster seam** (the `season-roster` pattern): each cup's Edition 1 is the eight in
  Edition 2's order, a league's and `UNL`'s Edition 1 are unchanged, the size is eight,
  and the caveats are present.
- **The dashboard seam** (the `dashboard-competition-view` pattern): the three cups are not
  leagues, the leagues' set is still five, and `/overall` is not "mixed Editions".
- **The schema seam** (the `schema` pattern): the domain holds nine codes, the two new
  tables have their keys and checks, and the Editions rows exist.
- **The map-derivation seam**: each map is derived from archived responses, both sides
  are the same size, and nothing is left over.
- **The dry run as the gate**: `COMPETITION=UCL npm run dry-run` is green over the archive
  after the hand-run first fetch, and reaches no Base Model. Then the same for `UEL` and
  `UECL`.

Only touched test files run during the work (the full suite exceeds five minutes). A gate
run of the whole suite is asked for before a push.

## Out of Scope

- **The knockout rounds** of all three cups (play-offs in February 2027 onward). They are
  skipped by the round filter, and nothing here prepares them.
- **`UECL`'s `MD1` and `UCL`'s/`UEL`'s `MD1` as predicted Gameweeks.** They are history
  only, by the operator's choice of `MD2`.
- **xG on history lines**, including where the club's league has it (ADR-0063).
- **FotMob**, as a fallback or otherwise (ADR-0058, ADR-0063).
- **Squad Changes for clubs**, including January's window.
- **Season-article Head Coach events for the 38 clubs in the five leagues**. One source
  for all 108.
- **Any change to the five leagues' or `UNL`'s packets, pins, sources or rosters.**
- **Any change to `/overall`'s arithmetic** beyond which Competitions are in the set (ticket 0110). The sum stays raw.
- **Exhibition Runs for the cups' missed `MD1`.**
- **Any hand-set Lock**, and any `competitions` insert or paid call by the implementing
  agent.

## Further Notes

- **Clocks**, read off UEFA on 2026-10-12, with Lock = earliest kickoff − 90 min:
  - `UCL`: `MD2` 10-13T16:45Z (Lock 15:15Z), `MD3` 10-20, `MD4` 11-03, `MD5` 11-24,
    `MD6` 12-08, `MD7` 2027-01-19, `MD8` 01-27.
  - `UEL`: `MD2` 10-15T16:45Z (Lock 15:15Z), then 10-22, 11-05, 11-26, 12-10, 01-21,
    01-28.
  - `UECL`: `MD1` 10-15, `MD2` 10-22T14:30Z (Lock 13:00Z), then 11-05, 11-26, 12-10,
    12-17.
- **Atalanta (`UECL`)** has had no fixture between 09-20 and 10-12. Its short recent list
  is real, not a source gap, and football-data.org agrees.
- **365Scores' `results` listing is paged.** One page held 29 matches for Levski and
  reached back to April, which covers five competitive matches for every club checked.
  The fetch reads one page and does not follow `previousPage`, unless a side comes back
  short of five competitive matches.
- **Head Coach disagreements read on 2026-10-12**: Lens (Cahuzac since 09-15; 365Scores
  has none, UEFA's 09-10 lineup has Toppmöller), Lech (Frederiksen; 365Scores has none),
  Plzeň (Kováč; 365Scores has Hyský). These are the infobox parser's first acceptance
  cases.
- **Cost ceiling**: 342 Fixtures × $0.3003 ≈ $103 for all three league phases from
  `MD2`, plus three eight-call pre-flights.
