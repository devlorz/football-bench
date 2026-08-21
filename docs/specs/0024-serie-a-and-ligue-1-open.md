# Spec 0024 — Serie A and Ligue 1 open

**Status:** ready-for-agent
**Scope:** everything that must exist before Serie A's and Ligue 1's first predicted
Gameweeks
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:**
[ADR-0049](../adr/0049-serie-a-and-ligue-1-open-the-bundesliga-waits-on-hands-not-money.md),
standing on [ADR 0035–0038](../adr/)

---

ADR-0049 takes the gate ADR-0035 left open: Serie A (`SA`) and Ligue 1 (`FL1`) open for
2026-27, the Bundesliga stays gated, and each league opens at the first Gameweek whose
derived deadline has not passed when it is activated. Every code path a new Competition
needs has existed since La Liga opened (spec 0016); what this spec covers is the
runbook's edits, the curation that is the real cost, the one piece of machinery ticket
0016 left owing (`the per-Competition stale-source guard`), and the activation itself.
[Opening a Competition](../runbooks/opening-a-competition.md) is the checklist this spec
turns into requirements.

Reads ADR-0036 (schedule, results and Lock from football-data.org; derived deadline),
ADR-0037 (v2 context minus availability; curation refreshed per Season), ADR-0038 (one
template, one Prompt Version per Competition), ADR-0042/0043 (the current amended
template both leagues inherit from birth), and the ADR-0036 banner (La Liga Gameweek 1's
hand-set Lock is not a precedent).

## Problem Statement

The benchmark's question is now asked in two leagues, and ADR-0049 has decided it will be
asked in four. Serie A and Ligue 1 kick off within days of the decision, and every
Gameweek that passes before activation is sample gone permanently — a Prediction made
after the fact proves nothing (spec 0001's founding constraint, unchanged).

Nothing about either league exists in code. All six per-league registries hold `PL` and
`PD` only; neither league has any of its three identity maps; the division check
constraint refuses Italian and French division names; and the football-data.co.uk
staleness guard dates itself from the *Premier League's* Gameweek 1 and asks whether the
*English* feed is live — a gap ticket 0016 recorded as "the first thing to write for
Serie A". A Competition activated before those exist is a league the scheduler walks
with nothing to say, or worse — a name mapped wrongly fails nothing, ever.

## Solution

Per league, the runbook's edits: a `MATCH_PROMPTS` entry freezing its Prompt Version, its
divisions in `DIVISIONS` with the check constraint grown in the same change, its Understat
league slug and club map, its country's transfer windows and Wikipedia club map, and its
Season article for Head Coach changes. Three identity maps per league, derived from the
real feeds rather than transcribed, each reviewed by a person before its backfill runs.
One prior Season of history and xG backfilled, mirroring exactly what `PL` and `PD` hold.
The football-data.co.uk staleness guard generalises to every listed Competition, dated
from each league's own first deadline. Then, last, the two `competitions` inserts and the
roster seating — the only steps that are not code changes, and the point the scheduled
runs begin to spend.

## User Stories

### The frozen prompts

1. As an operator, I want `MATCH_PROMPTS` entries for `SA` (`match-sa/2026-27-v1`,
   competition name "Serie A") and `FL1` (`match-fl1/2026-27-v1`, "Ligue 1"), so that
   each league's Prompt Version is a frozen constant with a sha over its rendered form.
2. As a developer, I want each new Competition's rendering proven equal to the Premier
   League's with the league name replaced — `replaceAll`, character for character — so
   that the template stays the only thing that varies between leagues.
3. As an operator, I want the `PL` and `PD` prompt constants byte-for-byte untouched,
   their pinned hashes unchanged, so that the running leagues cannot regress under the
   expansion.
4. As an operator, I want each new sha pinned only once its rendering has been read, so
   that the pin is evidence of a packet somebody looked at, not a formality.

### Divisions and the schema

5. As a developer, I want `DIVISIONS` entries for `SA` (`I1` → "Serie A", `I2` →
   "Serie B") and `FL1` (`F1` → "Ligue 1", `F2` → "Ligue 2"), so that each packet can
   render its league table and its promoted clubs' prior Season.
6. As an operator, I want the `historical_matches_division_check` grown to the four new
   names in the same change, and the schema test holding the constraint and `DIVISIONS`
   against each other, so that a name edited in one place fails loudly in the other.
7. As a developer, I want each entry's top-flight name equal to its `MATCH_PROMPTS`
   competition name, enforced by the existing render test, so that one packet cannot call
   one league two things.

### The three identity maps, per league

8. As an operator, I want the real `competitions/SA/matches` and
   `competitions/FL1/matches` responses captured and archived before any map is drafted,
   so that every map is derived from the live source's own spellings rather than guessed.
9. As an operator, I want each league's Understat → football-data.co.uk map derived from
   `getLeagueData/Serie_A` and `getLeagueData/Ligue_1` against the `I1`/`F1` `HomeTeam`
   columns, both sets the same size with nothing left over, so that a club that cannot
   resolve is a loud failure at ingest and never silent history loss.
10. As an operator, I want each league's football-data.org → football-data.co.uk map
    derived the same way — the long official names against the stored short ones — so
    that no club's history section reads "none in stored data" over a complete backfill.
11. As an operator, I want each league's football-data.org → Wikipedia club map keyed by
    the roster spelling `fixtures` carries, holding both article title and displayed
    name, so that the Squad Changes section resolves every club however the page heads
    its sections.
12. As an operator, I want all six maps (three per league) reviewed by a person before
    any backfill runs, and the review recorded with what it was actually asked to decide,
    so that the one failure mode with no alarm — a name mapped wrongly — is met by the
    only control that catches it.
13. As a developer, I want every map keyed by Competition, so that a wrong league slug
    resolves nothing and raises on the first match instead of relabelling another
    league's rows.

### Squad Changes and Head Coaches

14. As an operator, I want Italy's and France's transfer windows written down with their
    page titles and each page's `format` read off the real page — wikitable or
    club-section, checked for `{|` under a heading, never guessed — so that a page is
    parsed as the shape it is.
15. As an operator, I want a country whose page states no date or fee stored with both
    null, exactly as Spain is, so that the pipeline never asserts a fact nobody
    published.
16. As an operator, I want `SEASON_ARTICLES` entries for "2026–27 Serie A" and "2026–27
    Ligue 1" — en dash, the article's own title — so that each packet's Head Coach
    section reads its league's season article.

### The per-Competition staleness guard

17. As an operator, I want the football-data.co.uk staleness guard applied per listed
    Competition — each league dated from its own Gameweek 1 deadline, asking whether its
    own feed is live — so that a Competition whose history source has gone stale fails
    its fetch loudly before its first Lock, not silently ever after.
18. As an operator, I want one league's staleness collected as that Competition's error
    without costing another league its fetch, matching how per-Competition errors already
    collect, so that a lagging source is noisy without being contagious.
19. As an operator, I want the `FOOTBALL_DATA_SEASON` advance check grown to eight files
    (`I1`, `I2`, `F1`, `F2` join), so that the one-variable-many-leagues consequence the
    pre-cron checklist records stays checkable in one command.

### Backfill

20. As an operator, I want one prior Season (2025-26) of first- and second-division
    history backfilled per league — `I1`+`I2`, `F1`+`F2` — and one prior Season of
    Understat xG, so that each new league's packet reads exactly the depth `PL` and `PD`
    read, no more and no less.
21. As an operator, I want every backfill response archived in `raw_snapshots` under its
    own source name before anything is read from it, and replayable through the archive
    fetcher, so that the record stays disputable and the dry run stays honest.
22. As an operator, I want `HISTORICAL_COMPETITION` stated explicitly for every backfill
    run, so that the unsaid Competition — the one mistake nothing downstream catches —
    stays impossible.

### Activation

23. As an operator, I want the `competitions` inserts to come last, after the curation,
    its reviews and the backfills, so that the scheduler never walks a league with
    nothing to say.
24. As an operator, I want `roster:enter` to seat ten Entrants per new Competition under
    its own Prompt Version, refused if the stored seats disagree with the roster, so that
    a Competition opening late is not a door for a Base Model that missed the cutoff.
25. As an operator, I want each league to open at the first Gameweek whose derived
    deadline has not passed at activation, its earlier Gameweeks arriving as Locked
    history through the mid-Season adoption path, so that no Lock is ever set by hand and
    no played Fixture is ever queued for prediction.
26. As an operator, I want the pre-cron checklist run per new Competition — secrets,
    inserts, seats, prior-Season xG, and the dry run — before its first scheduled
    Gameweek, so that the failures spec 0016's launch met out of order are met in order
    this time.
27. As an operator, I want a `COMPETITION=SA` and `COMPETITION=FL1` dry run green against
    the archived snapshots before each league's first Lock, so that the whole write path
    is rehearsed on the real bytes before real money calls any Base Model.
28. As an operator, I want the scheduled prediction runs, fill runs and gap alerts to
    pick each new league up with no workflow edit, so that activation stays the insert
    ADR-0035 designed it to be.
29. As a reader, I want each league to appear on the dashboard when its rows do, with no
    dashboard change, so that ADR-0039's per-Competition shape is proven generic by the
    third and fourth leagues.

## Implementation Decisions

- **No new machinery except the staleness guard.** Everything else is entries in six
  existing per-league registries, one migration growing one check constraint, and
  curation. The guard generalises an existing guard; it does not invent a new failure
  channel.
- **The division check migration is the only schema change**, and it is additive — four
  names join a check constraint. It follows the competition-migration runbook's windows
  all the same.
- **Both leagues seat ten under `-v1` of the current template** (ADR-0038): the template
  is the one the restart amended (ADR-0042/0043), so both leagues carry base rates, xG
  rates and the two instruction lines from birth. Their shas are pinned on first read.
- **Serie A is 380 Fixtures (twenty clubs), Ligue 1 is 306 (eighteen)** — fixture counts,
  club-map sizes and cost all follow from that, and nothing may assume twenty.
- **The activation order is fixed**: registries → maps → reviews → backfill → inserts →
  seats. The insert is the first step that spends money on the next scheduled run, and it
  is never taken by the implementing agent — it is the operator's act (ADR-0049).
- **Starting Gameweek is a rule, not a target** (ADR-0049): whichever Gameweek's derived
  deadline stands open at activation is the first predicted one. The ticket records which
  that turned out to be, per league.
- **`FOOTBALL_DATA_ORG_TOKEN` already exists as a repository secret** (set for `PD`);
  the free tier covers all four target leagues under one rate limit the daily fetch does
  not approach (ADR-0036). Nothing to add.

## Testing Decisions

A good test here drives the same entry points the crons call, over a temporary Postgres
or recorded bytes, and asserts external behaviour — what lands in the record, what
renders in a packet, what refuses loudly. Implementation details (which map, which regex)
are covered only through those surfaces. Every seam already exists; this spec adds none:

- **Render test** (the `openrouter-entrant` pattern): each new Competition's rendering
  equals `PL`'s with the name replaced, `replaceAll`; pinned hashes for `PL`/`PD` prove
  non-regression; the competition-name agreement test extends to the two new leagues.
- **Schema test**: the division check and `DIVISIONS` held against each other, extended
  to eight names.
- **Daily-fetch tests over recorded snapshots**: the captured real `SA` and `FL1`
  responses join the canned set; the per-Competition staleness guard is tested at the
  daily-fetch seam exactly as `StaleCompetitionSourceError` already is — one league
  stale, the other league's day still lands, the run still fails loudly.
- **Contamination test** (the two-league seeding pattern): extended to prove an `SA`
  packet holds no `FL1` (or `PD`) rows and vice versa, both directions.
- **Squad-changes page test**: each new country's real page drives the whole path —
  fetch, store, and render — the way Spain's does, proving whichever `format` the page
  turned out to be.
- **Dry run as the end-to-end gate**: `COMPETITION=SA npm run dry-run` (and `FL1`) green
  against archived snapshots is the acceptance for the whole write path, and it reaches
  no Base Model.

Prior art for all of the above is in `test/` under the same names spec 0016's tickets
record; the coexistence test's per-Competition tracer pattern extends to four leagues
without structural change.

## Out of Scope

- **The Bundesliga.** Gated by ADR-0049; opening it is a new decision with its own ADR
  and its own cost acceptance. Nothing here prepares for it beyond what generic code
  already provides.
- **The FPL track.** Premier League by nature (ADR-0035), untouched.
- **The dashboard.** Reads the `competitions` table; no change (ADR-0039).
- **Advancing `FOOTBALL_DATA_SEASON`.** A standing operational item owned by the
  pre-cron checklist §4; this spec only widens its check.
- **Exhibition Runs for Gameweeks missed before activation.** A missed Gameweek is
  simply not part of either league's record — the accepted price, not a Gap and not
  backfillable.
- **Any hand-set Lock.** The ADR-0036 banner stands; if a deadline is missed, the
  Gameweek is let go.

## Further Notes

- The clocks at drafting (2026-08-21): Ligue 1's Gameweek 1 derived deadline is
  2026-08-21T17:15Z and Serie A's is 2026-08-22T15:00Z. Whether either league's Gameweek 1
  makes it into the record depends on when the curation reviews land; the rule decides,
  and the ticket records the outcome.
- The curation reviews are the critical path and cannot be delegated to the implementing
  agent: a person must approve all six maps before backfill. Everything upstream of the
  reviews (captures, derivations, the registry edits) can proceed without waiting.
- The cost this spec's activation commits is recorded in ADR-0049: $126.57 per Season
  incremental, $266.79 per Season standing, at the price report's $0.1845 per Fixture.
