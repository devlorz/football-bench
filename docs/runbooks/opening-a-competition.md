# Opening a Competition

Every edit a new Competition needs, in one place. Three comments in the codebase each say
opening a Competition is "one entry" or "a single edit"; each is true about its own file
and none of them is true about the change. There are **thirteen** places, plus what §2's
Wikipedia club map still holds only in prose, and this page is the only thing that
gathers them — a review found the gap after La Liga's history landed, when four of the
then-five had been made and nothing said what the fifth was. The sixth arrived with
ticket 7 and is the same story one more time: the transfer window and its club map were
"one entry" in a file that had never had a second league in it.

Ticket 0059 found the same gap one row lower down: the live-source → football-data.co.uk
map (§2) had no row of its own in the table below, only prose, so the table grew its
eighth row here — the next reader counts what the change is rather than finding the gap
the way this one was found.

Ticket 0070 made it nine, and this one is not a section that reads wrong — it is the run.
The source registry (ADR-0057) decides which loops of the daily fetch a Competition is
walked into, and a Competition listed without an entry fails the whole run by name, every
day, until one is written. It is the first row here whose absence is loud rather than
quiet, and it goes **first** for that reason: with the entry in place every other missing
edit is the section-shaped failure the rest of this table describes.

Ticket 0071 made it ten, ticket 0072 eleven, ticket 0073 twelve and ticket 0074
thirteen. Edits 9 to 12 are loud in the same way and for the same kind of reason: a
Competition whose entry names UEFA for its schedule, or 365Scores for its shots and xG,
needs that source's own numeric id for it; one whose entry names the GitHub dataset for
its history needs that dataset's own word for it; and one whose entry names the current
head coaches list needs the section of that page its sides are listed under. Without one,
that Competition's day fails by name. Each is a row rather than a sentence in edit 0
because each is a second file, which is the whole reason this page exists.

The count in the first paragraph had been left at ten by tickets 0072 and 0073 while this
one grew twice; 0074 corrected it. A page that counts the change is only worth reading
while its own count is right.

Ticket 0076 added no row and changed no count. It added the table's **second column**,
because thirteen rows had come to describe two different changes — a league's and a cup's —
and the sentences below the table were the only thing saying which was which. A column says
it per row, which is what a page that exists to be counted off owes the Competition after
next.

Vocabulary: [CONTEXT.md](../../CONTEXT.md) — Competition, Division, Track.
Decisions: [ADR-0035](../adr/0035-the-match-track-grows-a-competition-dimension.md)
(a Competition is a dimension, not a Track),
[ADR-0036](../adr/0036-a-new-competitions-schedule-results-and-lock-come-from-football-data-org.md)
(where its schedule comes from),
[ADR-0037](../adr/0037-a-new-competition-plays-the-v2-context-minus-availability.md)
(what its packet holds, and the curation cost),
[ADR-0038](../adr/0038-one-prompt-template-one-prompt-version-per-competition.md)
(its own frozen Prompt Version).

Applying a pending migration is [the Competition migration](the-competition-migration.md).
This page is what to write before that one runs.

---

## 1. The thirteen edits

In this order. Each is small; the risk is entirely in stopping one short.

Edit **0** was added by ticket 0070 and edits 1 to 8 keep the numbers they have had
since ticket 0059 — four tickets cite them by number, and renumbering a list other
documents point into buys a tidier column and costs every one of those references. It is
numbered 0 because it genuinely comes before the rest, not because it matters least.
Ticket 0071 appended edit **9** at the end for the same reason, ticket 0072
appended edit **10**, ticket 0073 edit **11** and ticket 0074 edit **12**: a row goes on
the bottom so that nothing above it moves.

| # | Needed when edit 0 names | Where | What | If it is missing |
| --- | --- | --- | --- | --- |
| 0 | always | `src/fetch/competition-sources.ts` — `BY_COMPETITION` | Which schedule, history, stats, Squad Changes and head-coach source this Competition reads, or `null` for each it has none of | `Competition XX has no source registry entry` — the whole daily fetch fails by name, every day |
| 1 | always | `migrations/00XX` — `competition_code` domain | The code, if beyond the six `0022` and `0042` listed | Every write of the code is refused |
| 2 | always | `src/predictions/openrouter-entrant.ts` — `MATCH_PROMPTS` | Version, `competitionName`, and the sha once read | `Competition XX has no frozen Prompt Version`; no seats |
| 3 | `history: "football-data.co.uk"` | `src/football-data/divisions.ts` — `BY_COMPETITION` | Top and second division, source codes and stored names | The packet says the league table is unavailable |
| 4 | `history: "football-data.co.uk"` | `migrations/00XX` — `historical_matches_division_check` | The two names edit 3 added, character for character | The backfill fails on its first insert |
| 5 | `stats: "understat"` | `src/understat/team-identity.ts` + `UNDERSTAT_LEAGUES` | The league slug and that league's ~20 club names | No xG, or — with the slug wrong — another league's rows relabelled |
| 6 | `squadChanges: "wikipedia-transfers"` | `src/squad-changes/transfer-window.ts` + `club-identity.ts` | The country's two windows with their page titles and page `format`, and that league's ~20 clubs by live-source spelling | No Squad Changes section, and — with the format wrong — a page parsed as a shape it is not |
| 7 | `headCoaches: "wikipedia-season-article"` | `src/head-coach/head-coach-source.ts` — `SEASON_ARTICLES` | The Season's article title for the league, under the Season already listed | No Head Coach changes section, silently — the fetch stores nothing and the packet says the article is not listed |
| 8 | `history: "football-data.co.uk"` | `src/football-data/team-identity.ts` — `BY_COMPETITION` | Live-source name → football-data.co.uk name, per Competition (§2) | Every club's history section reads "none in stored data" over a complete backfill, and nothing fails |
| 9 | `schedule: "uefa"` | `src/uefa/fetch-competition.ts` — `UEFA_COMPETITION_IDS` | UEFA's numeric competitionId | `Competition XX reads UEFA, which needs its UEFA competitionId` — that Competition's day, every day |
| 10 | `stats: "365scores"` | `src/365scores/fetch-match-stats.ts` — `SCORES_365_COMPETITION_IDS` and the name map beside it | 365Scores' numeric competition id, and every side it spells differently from the record | The id: `Competition XX reads 365Scores, which needs its 365Scores competition id`. A name: `365Scores lists YY in Competition XX, which is not a side this record stores` — either way that Competition's day, every day |
| 11 | `history: "martj42/international_results"` | `src/international-results/fetch-results.ts` — `DATASET_NAME_BY_COMPETITION` and the name map beside it | The dataset's own word for the Competition, which every merged line in the packet carries, and every side it spells differently from the record | The name: `Competition XX reads the international results dataset, which needs the dataset's own name for it` — that Competition's day, every day. A side: `The international results dataset names no side resolving to YY` — the same, and it is the *only* way a renamed side is caught |
| 12 | `headCoaches: "wikipedia-national-team-head-coaches"` | `src/head-coach/fetch-national-team-head-coaches.ts` — `BY_COMPETITION` | The confederation section of the current head coaches list this Competition's sides are listed under, and every one of those sides by the FIFA trigram the page keys its rows with | The section: `Competition XX reads the current national team head coaches list, which needs its confederation's section` — that Competition's day, every day. A side: `The trigram map reaches no side spelled YY`, a page row the map has never seen, or one of the map's own trigrams the page has dropped — the same |

**Edit 10's name map is not the curation §2 describes.** Three names and not twenty, and
they do not move between Seasons: a cup's sides are countries, so the map is written once
against the source's own spellings and reviewed once (ADR-0058). What it shares with §2
is the rule that matters — derive it from the archived bytes rather than transcribing it,
and require nothing left over on either side.

**Edit 11's name map is checked in the opposite direction, and has to be.** 365Scores
lists one Competition, so every name in its listing must resolve onto a stored side and a
stranger is caught on sight. The dataset lists every men's international ever played, so a
name the map does not hold is indistinguishable from one of the two hundred sides this
record has no section for. The question is therefore asked the other way round: every
side the record stores has played since the window opened, so every one of them must be
reachable in the file, and one that is not is a spelling that moved. Naming that in the
error is what stops a rename from reading as a side that did not play.

**Edit 12's map is checked in both directions, because it can be.** Its page lists one
confederation per section and the Competition holds all but a named few of that
section — so a trigram on the page that the map has never seen, one of the map's own that
the page has dropped, and a stored side the map cannot reach are three different edits
and each is refused by name. That is the strongest of the three shapes on this page, and
it is available only because both lists are closed. Do not reach for it where one side is
open: edit 11's dataset lists every side there is, and asking it this way would refuse
every morning.

**Edits 3 to 8 are a league's, and a cup makes none of them.** Edit 0 is what says so, and
the second column is edit 0 read back: every row but the first three is needed only by a
Competition whose registry entry names that source, and an entry naming `null` for a source
is a Competition the daily fetch does not walk into that loop, so there is no map for it to
be missing. `UNL` reads four sources of its own instead (ADR-0057), and its rows go in
`international_results`, `team_match_stats` and `national_team_head_coaches` rather than in
`historical_matches`, `understat_match_xg` and `head_coaches`. Edits 0, 1 and 2 are every
Competition's, cup or league.

**So the count is nine or seven, and never thirteen.** A domestic league makes edits 0 to 8
and none of 9 to 12. `UNL` makes 0, 1, 2, 9, 10, 11 and 12 — seven. No Competition has made
all thirteen and none can: edits 3, 4 and 8 answer a football-data.co.uk history where 11
answers the dataset's, 5 a league's xG where 10 answers a cup's, 7 a season article where 12
answers the current list — and an entry names one source per field. Count the second column
against the entry you are about to write, not the row numbers.

**Edit 0 names nothing that does not exist yet.** An entry pointing at a source no fetch
implements opens a Competition into a run that reaches nothing and reports success — the
one failure this whole page is arranged to prevent. Write the fetch, then the entry, then
the `competitions` row. `UNL` sat in the domain (edit 1) with no entry between tickets
0070 and 0071 for exactly this reason. It has one now, and `test/schema.test.ts` holds
the domain and the registry to the same set of codes, so the next Competition cannot
reach production half-listed the way that gap allowed. Each of `UNL`'s three own sources became a
name in the ticket that wrote its fetch and stated an absence until then: `stats` with
ticket 0072, `history` with 0073 and `headCoaches` with 0074. Its one remaining `null`,
`squadChanges`, is not waiting for a ticket — a national side has no transfer window, so
that entry says the Competition has no such source at all.

Edits 3 and 4 are one change and are checked against each other by
`test/schema.test.ts`; edit 2's `competitionName` must equal edit 3's top-flight name and
`test/openrouter-entrant.test.ts` requires it. `test/competition-sources.test.ts` checks
edit 0 against edits 3, 5, 6, 7, 10, 11 and 12 in one direction: an entry naming a source that
has no map for that Competition is a red test rather than a section that reads calm.

**Edit 6 moves edit 2's sha, for a league.** A league whose transfer windows are not yet
written down renders no Squad Changes section at all; writing them down opens the gate,
and the packet grows the stated absence "no Squad Change data stored for this Gameweek"
even before a fetch lands. Do edit 6 first, or expect the pin to move once — it is
legitimate only while the version is unused.

For a cup that gate never opens, and since ticket 0075 it is not the gate that is asked:
a Competition whose edit 0 names `null` for `squadChanges` renders the stated absence
"Squad changes: none for this Competition; a national side has no transfer window."
`squadChangeWindow` also answers `undefined` for a cup — no window is written down for
one — but that answer is the same one a league between two windows gives, and a section
that leaned on it could not tell a Competition with no window from a Competition between
windows. So the registry decides, and a cup's absence is its freeze's final state rather
than a pin waiting for edit 6.

**Edit 0 moves it too, for a cup, in three places now.** A Competition whose `history`
names the GitHub dataset renders the recent-internationals section *instead of* the
historical-results one (ticket 0073), one whose `headCoaches` names the current list
renders that section instead of the season article's (ticket 0074), and one whose
`squadChanges` names nothing states the absence above instead of rendering the window's
section (ticket 0075) — so the entry decides which of two things the sha is taken over,
three times. Those are the second, third and fourth rendering changes arriving from a
registry rather than from a builder, and the first two are why ticket 0075 pinned `UNL`
only after 0073 and 0074 had landed: pinning between them would have pinned a render that
was about to grow a section. The third arrived with the pin itself, in the same commit,
which is the shape to repeat — a dispatch that changes the render is taken before the
freeze or not at all.

**The `competitions` row is not on this list.** Inserting it is what *activates* a
Competition and it comes last, after the curation and the backfill — a row present before
the maps exist is a league the scheduler will walk with nothing to say. That insert is
also the only step that is not a code change, which is the property ADR-0035 wanted.

## 2. The curation, which is the real cost

Roughly twenty clubs across three maps per Competition, refreshed every Season as
clubs are promoted and relegated (ADR-0037). All three:

- **Understat name → football-data.co.uk name**, per Competition
  (`src/understat/team-identity.ts`). Derive it, do not transcribe it: read the club
  titles out of `getLeagueData/<league>/<year>` and the `HomeTeam` column out of
  `mmz4281/<season>/<code>.csv`, and require both sets to come out the same size with
  nothing left over on either side.
- **Live-source name → football-data.co.uk name** (edit 8,
  `src/football-data/team-identity.ts`). For every Competition but the Premier
  League the live source is football-data.org, whose names are the long official ones
  ("Club Atlético de Madrid") where the stored results say "Ath Madrid". Without it every
  club's history section reads "none in stored data" over a complete backfill, and
  nothing fails.

- **Live-source name → Wikipedia club**, per Competition
  (`src/squad-changes/club-identity.ts`). Keyed by the roster spelling `fixtures`
  carries, which is the live source's — FPL's short names for the Premier League and
  football-data.org's long ones everywhere else — and holding both the club's article
  title and its displayed name, because English Wikipedia's transfer lists head their
  club sections with a link in some editions and with bare text in others. Derive it the
  same way: the live source's team names against the page's own section headings, both
  sets the same size with nothing left over.

All three must be reviewed by a person before the backfill runs. A name *missing* from a
map fails loudly; a name mapped *wrongly* fails nothing, ever.

**The transfer window itself is not curation and is not a map.** It is two frozen dates
and a page title per window, read off that page's own lead, and it ships inside the
Prompt Version — so it cannot move without a new one (ADR-0026, ADR-0031). Windows differ
by country: Spain opened its 2026 summer on 1 July where England opened on 15 June.

## 3. Backfill and activate

```bash
set -a; . ./.env; set +a
HISTORICAL_COMPETITION=XX HISTORICAL_SEASON=<prior season> npm run --silent fetch:history
HISTORICAL_COMPETITION=XX HISTORICAL_SEASON=<prior season> npm run --silent fetch:xg-history
```

`HISTORICAL_COMPETITION` is required and has no default, deliberately: the database
refuses a Competition left *unset*, and nothing anywhere refuses one that is *stated and
wrong*.

Then the `competitions` insert, then `npm run roster:enter` — which seats each listed
Competition's **roster of record** and must run after the insert, not before
([pre-cron checklist](pre-cron-checklist.md) §1).

**A Competition's roster is its own, and is not always the Season Roster's ten.** The
five leagues seat all ten. The Nations League seats seven: the Season Roster less the
three ADR-0060 excludes, with GPT-6 Astra and Grok 4.7 standing in for GPT-5.6 Sol Pro
and Grok 4.6. Both lists live in `src/season-roster.ts` (`MATCH_EXCLUSIONS`,
`MATCH_SUBSTITUTIONS`) and the size is derived from them, never written (ticket 0081).

| | A league | The cup (`UNL`) |
| --- | --- | --- |
| Seats `roster:enter` writes | 10 | 7 |
| Pre-flight's `EXPECTED_ENTRANT_COUNT` | `10` | `7` |
| Pre-flights owed before the insert | one, the ten | **two new seats to prove, so three runs — all paid** — each substitute alone, then the seven |

A Competition seating a Base Model no other Competition seats owes a pre-flight *per new
seat before the roster's*, because a seat entered on the catalog's word has been observed
by nothing: it is entered to be confirmed or refused, and the refusal must land before the
`competitions` insert rather than at the first Lock. **Each of those runs reaches a Base
Model and spends money; ask before running any of them.** A substitute alone is run as a
temporary `exhibition` row and removed afterwards — `EXHIBITION_MODEL_ID` and
`EXPECTED_ENTRANT_COUNT` cannot both be set ([a new Base Model arrives](a-new-base-model-arrives.md)).

### Pre-flighting a Competition that is not listed yet

**The pre-flight cannot run on production before the insert, and the insert is the step
that must not happen until the pre-flight has passed.** It reads a real `fixtures` row
for the Competition and Season (`Fixture N does not exist in XX Season …`) and counts the
`models` rows at that Competition's Prompt Version (`Pre-flight requires exactly N
Entrants at …`); `roster:enter` writes those rows only for Competitions the
`competitions` table lists, and the fetch writes those Fixtures only for the same. So the
prerequisites and the thing they gate are the same insert, and the way out is a second
database rather than a relaxed count.

Build the whole Competition somewhere throwaway, using the same commands section 3 runs
and one different `DATABASE_URL`. Nothing here but the last step reaches a Base Model.

```bash
set -a; . ./.env; set +a
createdb unl_preflight
export DATABASE_URL="postgres://localhost:5432/unl_preflight"   # after .env, never before
npm run --silent db:migrate

# The insert that is free, because this database is not the record.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "insert into competitions (competition, season) values ('UNL', '$SEASON')"

# Seven seats -- the Competition's roster of record, not ten.
npm run --silent roster:enter

# Fixtures and the four sources the packet reads. Reaches no Base Model.
npm run --silent fetch

# The Fixture the pre-flights aim at, and the seat count to expect.
psql "$DATABASE_URL" -c "select fixture_id, gw, home_team, away_team, kickoff_at
                           from fixtures where competition = 'UNL'
                          order by kickoff_at limit 3"
psql "$DATABASE_URL" -c "select id from models
                          where prompt_version = 'match-unl/2026-27-v1' order by id"
```

Then the pre-flights — two new seats to prove, which is three runs, **each of which
spends**; ask first, and state the call count before you do. (ADR-0060 counts them as
"two pre-flights, each alone and then the seven", which is the same three runs.) Each substitute alone first, as a temporary `exhibition` row against
the cup's own Prompt Version ([a new Base Model arrives](a-new-base-model-arrives.md) §3),
because an unproven Base Model must never answer for the first time from an Entrant row:

```sql
insert into models (id, name, base_model, provider, quantization, prompt_version, role, config)
values ('candidate/gpt-6-astra', 'GPT-6 Astra', 'openai/gpt-6-astra', 'openai', null,
        'match-unl/2026-27-v1', 'exhibition', '{}');
```

```bash
COMPETITION=UNL FIXTURE_ID=<from above> EXHIBITION_MODEL_ID=candidate/gpt-6-astra \
  npm run preflight          # PAID. Then the same for candidate/grok-4.7.
```

Read the resolved dated model off each report: that is the `canonicalSlug` the seat
carries, and the catalog's word in `MATCH_SUBSTITUTIONS` is only the expectation until it
says so. **If either differs, the constant is amended and ADR-0060 with it, before the
seven-seat run.** Then delete the two `candidate/…` rows — a temporary row left standing
makes the count below refuse — and run the roster's own:

```bash
COMPETITION=UNL FIXTURE_ID=<the same one> EXPECTED_ENTRANT_COUNT=7 \
  npm run preflight          # PAID. Seven seats, one Fixture: seven calls.
```

Only once that report is green does the production insert of section 3 happen. Drop the
throwaway database afterwards; nothing in it is a record of anything, which is the whole
reason it could be written to freely.

The frozen sentence a cut roster owes a reader is served with the Competition's
leaderboard (`ROSTER_CAVEATS`), so a Competition whose opening decision cuts its field
writes that decision's sentence there as well.

## 4. What the source may not have yet

Check before planning a window rather than after a failed run. football-data.co.uk
publishes a new Season's files late, and answers a request for one it does not hold by
redirecting to a near-miss filename — `2627/SP1.csv` → `2627/P1.csv`, the Portuguese
first division — which `fetch` follows and returns as a 200. The per-file `Div` check
refuses it. Understat opens a Season with an empty `dates`, so a new Season's promoted
clubs cannot be added to a map until it publishes; they arrive as `unknown Understat team
name` at the first pre-Season fetch, which is where that failure is meant to land.

English Wikipedia's transfer lists are **three formats, not one**, and which one a
country uses is not guessable from the title. England publishes two wikitables —
`Transfers` and `Loans` — whose first column is the date every move is filed under and
whose last is the fee. Italy publishes **one** wikitable of England's five columns and
states its loans in the fee column, as `Loan` or `6-month loan`; such a row is stored as
a loan with a null fee, because `Loan` is not an amount. Spain and France publish one
section per club holding two `{{fs player}}` lists, arrivals first and departures second,
with **no date and no fee anywhere on the page**; those rows are stored with both null,
which is what migration 0027 made room for. The window's `format` field picks the parser.
A new country's page has to be read before its window is written down — check for `{|`
under a heading, and if there is none it is the club-section shape; if there is one,
count the tables.

The page furniture varies with it. Italy heads its table `==Transfers==` where England
writes `== Transfers ==`, files its dates as `{{dts|format=dmy|2026|8|2}}` rather than as
text, and wraps every name in `{{Sort|key|displayed}}`; each of those was a silent
refusal until the reader was widened. France heads its club sections in bare text —
`===Lens===` — so the **displayed name** is the identity that resolves a club there, as
on every Spanish winter edition, while Italy links every club and resolves by article.

**Not every league has twenty clubs.** Ligue 1 has eighteen, and its map is the first in
this codebase that is not twenty rows. Nothing counts to twenty, but a reviewer reading a
derived map should know what the total is meant to be before they read it.

**A country's transfer list need not state its own window dates.** England's, Spain's and
Italy's all open with a lead that does; France's and Germany's do not — France's says only
which league it lists, and Germany's names only which two divisions it lists. France's
dates are the LFP's own announcement instead (`lfp.fr/article/les-dates-du-mercato-2026-2027`),
for both windows, which makes France the one country whose *winter* dates are announced
rather than customary. Germany's summer dates are `bundesliga.com`'s own announcement
instead; its winter is customary, on the same terms as England's, Spain's and Italy's,
because no equivalent announcement for it is archivable yet.

The winter page for a Season does not exist in August, for any of the five. Its title is
frozen from the naming convention the previous ones used
(`List of Spanish football transfers winter 2026–27`, en dash) and is not verifiable
until it is created.
