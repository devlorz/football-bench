# Opening a Competition

Every edit a new league needs, in one place. Three comments in the codebase each say
opening a league is "one entry" or "a single edit"; each is true about its own file and
none of them is true about the change. There are **six** places, plus the curation, and
this page is the only thing that gathers them — a review found the gap after La Liga's
history landed, when four of the then-five had been made and nothing said what the fifth
was. The sixth arrived with ticket 7 and is the same story one more time: the transfer
window and its club map were "one entry" in a file that had never had a second league in
it.

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

## 1. The seven edits

In this order. Each is small; the risk is entirely in stopping one short.

| # | Where | What | If it is missing |
| --- | --- | --- | --- |
| 1 | `migrations/00XX` — `competition_code` domain | The code, if beyond the five 0022 listed | Every write of the code is refused |
| 2 | `src/predictions/openrouter-entrant.ts` — `MATCH_PROMPTS` | Version, `competitionName`, and the sha once read | `Competition XX has no frozen Prompt Version`; no seats |
| 3 | `src/football-data/divisions.ts` — `BY_COMPETITION` | Top and second division, source codes and stored names | The packet says the league table is unavailable |
| 4 | `migrations/00XX` — `historical_matches_division_check` | The two names edit 3 added, character for character | The backfill fails on its first insert |
| 5 | `src/understat/team-identity.ts` + `UNDERSTAT_LEAGUES` | The league slug and that league's ~20 club names | No xG, or — with the slug wrong — another league's rows relabelled |
| 6 | `src/squad-changes/transfer-window.ts` + `club-identity.ts` | The country's two windows with their page titles and page `format`, and that league's ~20 clubs by live-source spelling | No Squad Changes section, and — with the format wrong — a page parsed as a shape it is not |
| 7 | `src/head-coach/head-coach-source.ts` — `SEASON_ARTICLES` | The Season's article title for the league, under the Season already listed | No Head Coach changes section, silently — the fetch stores nothing and the packet says the article is not listed |

Edits 3 and 4 are one change and are checked against each other by
`test/schema.test.ts`; edit 2's `competitionName` must equal edit 3's top-flight name and
`test/openrouter-entrant.test.ts` requires it.

**Edit 6 moves edit 2's sha.** A Competition with no transfer window renders no Squad
Changes section at all; writing its windows down opens the gate, and the packet grows the
stated absence "no Squad Change data stored for this Gameweek" even before a fetch lands.
Do edit 6 first, or expect the pin to move once — it is the one rendering change that
arrives from a registry rather than from the builder, and it is legitimate only while the
version is unused.

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
- **Live-source name → football-data.co.uk name.** For every Competition but the Premier
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

Then the `competitions` insert, then `npm run roster:enter` — which seats ten Entrants per
listed Competition and must run after the insert, not before
([pre-cron checklist](pre-cron-checklist.md) §1).

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
