# The Nations League opens as the first cup, on sources nobody documents

> Amended 2026-09-23 by ticket 0087, the day before the cup's first Lock. **The group's
> table is no longer deferred.** The packet section below lists "a league table" among the
> stated absences, on the reasoning that six results read better than a table and that a
> table would need the group stored on every Fixture. Both halves were revisited once a
> real packet was read: a national side's five form lines say nothing about where it
> stands in its group or what its next result decides, which is the one thing a league's
> packet tells an Entrant that a cup's did not; and the group was in every archived UEFA
> match all along (`group.metaData.groupName`), so storing it is one nullable column
> (migration `0047`). `UNL` packets now open with the group's table -- every side of the
> group from the first day, at nought, ordered by points, goal difference and goals
> scored, with a line saying UEFA's own head-to-head tie-breaks are not applied -- and
> state one absence in words, Squad Changes, not two. The render moved before any
> Prediction stood under it (ADR-0026).

**The UEFA Nations League (`UNL`) opens for 2026-27, all four Leagues, league phase only.**
Fifty-four national teams in fourteen groups, 156 Fixtures over six Gameweeks, each
Gameweek one UEFA matchday: `MD1` 24–26 September, `MD2` 27–29 September, `MD3` 1–3
October, `MD4` 4–6 October, `MD5` 12–14 November, `MD6` 15–17 November 2026. Read off
UEFA's own feed on 2026-09-14, every one of them unplayed; the derived deadline of
Gameweek 1 (ADR-0036, earliest kickoff minus ninety minutes) is 2026-09-24T14:30Z.

It is the sixth Competition and the first that is not a league, and it departs from the
league template ([ADR-0035](0035-the-match-track-grows-a-competition-dimension.md) to
[ADR-0038](0038-one-prompt-template-one-prompt-version-per-competition.md), and the
Bundesliga's [ADR-0054](0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md)) on
every source: none of the five sources those decisions rest on holds a national team.

**Why a cup at all.** The benchmark's question is "which Base Model forecasts this
Competition best", asked once per Competition. Every Competition so far is a domestic
league whose clubs the Base Models have read about all week; a national-team competition
asks the same question of teams that play six times a year, with Leagues C and D holding
the sides the models have read least about. That is a different corner of the same
question, and it is the reason the whole pyramid opens rather than League A alone.

## What the sources hold, read 2026-09-14

- **football-data.org lists `UNL` at `TIER_FOUR`**, its dearest plan. The project token
  answers 403. The source ADR-0036 names for every non-English Competition is closed here
  at any price this project would pay.
- **`https://match.uefa.com/v5/matches?competitionId=2014&seasonYear=2027`** answers with
  no key: the 156 league-phase Fixtures with `matchday.name` `MD1`–`MD6`, the group,
  kickoff in UTC, `score.regular` (ninety minutes), `score.total` (with extra time) and
  `score.penalty` kept apart, and no placeholders. The 2024-25 edition shows the rest of
  the shape: knockouts arrive after their draws as `MD7`/`MD8` two-legged ties with an
  `aggregate`, then `SF`, `3rd place` and `Final` — matchday names that are not numbers.
  One 2024-25 match (Romania–Kosovo, 2024-11-15) stayed `ABANDONED` at 0–0 with no winner
  after UEFA awarded it 3–0; the feed never caught up.
- **No history, xG, transfer or head-coach source among the five in use.**
  football-data.co.uk has no international file, Understat no national teams, the
  transfer lists and Season articles are club pages.
- What was found instead, and what this ADR opens: **365Scores** for shots and xG and as
  the second source of results (its own decision,
  [ADR-0058](0058-the-nations-leagues-shots-and-xg-come-from-365scores.md)); the
  **`martj42/international_results` dataset on GitHub** — one CSV of every men's
  international since 1872, 658 Nations League rows, the whole 2026 World Cup, last
  committed 2026-08-26 on a roughly monthly cadence — for what each side did last; and
  **Wikipedia's "List of current national association football team managers"**, one page
  whose UEFA table names all fifty-five members' head coaches with the date each assumed
  the role.

Every one of these is undocumented, keyless and without a published rate limit or
terms a program can read, which is a different thing from being unreproducible: a
skeptic can query each one today and read our archived response against it tomorrow.
ADR-0036 rejected scraping league sites for fragility; these are JSON and CSV endpoints,
archived whole in `raw_snapshots` on every fetch as every source is, and their fragility
is the price named below.

## The decision

**Schedule, kickoffs, matchday and the ninety-minute result come from UEFA's feed.**
The rest of ADR-0036 stands unchanged: the Lock is derived at earliest kickoff minus
ninety minutes and frozen once observed, a Fixture attaches by kickoff, a postponement
keeps its Prediction. This is the third schedule source (FPL, football-data.org, UEFA)
and the daily fetch dispatches on the Competition code, a field it already reads.

**A Gameweek is a UEFA matchday of the league phase, `MD1` to `MD6`, stored as `gw` 1
to 6.** `MD1` and `MD2` fall three days apart inside one international window, as do
`MD3` and `MD4`; the derived deadline handles that as it handles any two rounds, and a
Gameweek here is a Wednesday-to-Friday or Saturday-to-Monday of twenty-six Fixtures.

**The knockout rounds are not opened this Season.** March 2027's quarter-finals and
promotion/relegation play-offs are two-legged ties whose Fixtures do not exist until the
draw in November; June 2027's Finals go to extra time and penalties; League C/D
play-offs are in March 2028, outside any `2026-27`. Whether and how a two-legged tie or a
shootout is a Fixture the benchmark predicts is a decision for when those Fixtures exist,
and it is deferred, not refused. The Competition's Season, and its leaderboard, close
with Gameweek 6.

**An `ABANDONED` match takes the withdrawn path** — the same one `POSTPONED` takes:
deleted if never Locked, marked `deferred` with its Prediction kept if it was. It is not
settled at the score the feed shows, because that score did not finish being played, and
it is not settled by hand at the score UEFA later awards, because nobody enters results
into this record (ADR-0050). If the feed never posts one, the Fixture stays unsettled and
the record shows exactly that.

**The packet carries what has a source, and says what has none (ADR-0037's rule, applied
to a cup).** Sections present:

- the Fixture line as every Competition has it;
- this Season's played Fixtures with their shots and xG, from 365Scores (ADR-0058) — at
  Gameweek 1 that reads "no result has been played yet this Season", the state every
  league's Gameweek 1 packet already renders;
- each side's **five most recent internationals across every competition** — World Cup,
  qualifiers, friendlies — from the GitHub dataset, with the competition and a neutral
  venue named, and **one line stating the date the dataset was last updated**. The
  staleness of a monthly source belongs in what the Entrant reads, not in a log;
- **who picks each team and since when** (the promise of ADR-0045), from the Wikipedia
  managers list, archived each daily fetch; a Head Coach Change is the difference between
  two archived snapshots and is therefore visible only from the day the first one is
  stored.

Sections absent, each a stated absence and not a Gap: a league table (a group of four
playing six games is read better from the six results than from a table, and a table
would need the group stored on every Fixture), Squad Changes (national teams have no
transfer window), player availability (Premier League only, ADR-0037).

**New rows go in new tables.** `historical_matches` is keyed on one meeting per pair per
Season under a Division, and national sides meet twice a year in different competitions
under no Division at all; the dataset's rows go in `international_results`, keyed by date
and the two sides. 365Scores' per-team shots and xG go in a table keyed by source and
source match id rather than into `understat_match_xg` under a column named for a source
they did not come from.

**Which sources a Competition has is data the fetch reads, not a flag.** A registry names,
per Competition, where its schedule, its history, its shots and xG and its head coaches
come from; the four league-only loops of the daily fetch (football-data.co.uk, Understat,
Squad Changes, Head Coach changes) and the after-first-deadline guard read it and walk
only the Competitions that list them. A Competition missing from the registry still fails
loudly — ADR-0054's rule that a missing map fails and a wrong one fails nothing is kept;
what changes is that "has no Understat league" stops being an error for a Competition
that never claimed one.

**Team names are UEFA's `internationalName`**, stored on every Fixture as the live source
spells them, with one normalisation: UEFA's "Türki̇ye" carries a combining dot the packet
should not, and is stored as "Türkiye". The other sources map onto that spelling — three
names for 365Scores ("Ireland", "Turkiye", "Bosnia & Herzegovina"), two for the dataset
("Czech Republic", "Turkey"), and the Wikipedia table's FIFA trigrams, which are to be
checked against UEFA's `countryCode` for all fifty-four before the first packet renders.
Fifty-four names in three small maps, against the roughly twenty clubs in three maps a
league costs every Season; the curation is the smallest of any Competition.

**No target Gameweek, the same rule as the Bundesliga.** The Competition opens at the
first Gameweek whose derived deadline has not passed when it is activated; a Gameweek the
activation misses is let go and its Fixtures arrive as Locked history through the
mid-Season adoption path (ADR-0015). Missing Gameweeks 1 and 2 costs fifty-two Fixtures,
about $16 at the ceiling below, and nothing else. No Lock is set by hand (the ADR-0036
banner).

**The Combined Ranking takes it as it takes any Competition.** `/overall` sums every
Active and scored Competition (ADR-0051); six Gameweeks of twenty-six enter the sum the
week the first is scored. ADR-0051's prose says "league" where it now means Competition
and is corrected with the price re-read; no code moves.

**It costs at most $47 a Season, and that figure is a ceiling to be re-read.** 156
Fixtures at Ligue 1's $0.3003 per Fixture — the dearest measured rate, chosen as ADR-0054
chose it — is $46.85. The packet here is smaller than any league's, so the true rate is
almost certainly lower, and it is unknown until a Gameweek has settled under
`match-unl/2026-27-v1`. A ticket re-reads it off `attempts` rows after the first
Gameweek settles, and this figure stands until it does. It takes the match track's
standing commitment to about $554 a Season across six Competitions.

## Considered Options

- **League A only** — sixteen sides, forty-eight Fixtures, $14. Rejected: it keeps the
  sides the models know best and drops the ones the question is most interesting for,
  and there is no curation to save, since no map grows with the number of teams.
- **Include the knockouts now** — rejected as above: the Fixtures do not exist, the
  settlement of a two-legged tie or a shootout is its own decision, and one of the rounds
  is in the wrong Season.
- **Read the schedule from ESPN's scoreboard** — answers the same 156 Fixtures in UTC and
  separates shootout scores, but carries no matchday number and no group; the Gameweek
  would have to be inferred from dates. Rejected as a schedule source; not needed as a
  second results source once 365Scores is read for xG (ADR-0058).
- **Read the schedule from Wikipedia's League A–D articles** — every Fixture is a
  `{{Football box}}` with a uefa.com match id, but kickoffs are local time and scores wait
  for an editor. Rejected as a source and rejected as a standing archive for skeptics:
  `raw_snapshots` of the feeds actually read is the archive.
- **Elo ratings (eloratings.net)** as a strength prior — a live TSV of current ratings
  with no dated history, so a rating "as of the Lock" exists only from the day this
  project starts storing it. Deferred, not refused; the results it is computed from are
  already in the packet.
- **A group table** — deferred; see the packet section above.
- **The coach from UEFA's lineups endpoint** — names the coach per match, but only once
  the lineup is published, after the Lock. Deferred as a post-hoc check of the Wikipedia
  reading, useless as a packet source.
- **Wait for a documented source** — none is coming. football-data.org's `UNL` is on a
  plan that costs more per month than the Competition costs per Season, and the rest of
  the field is closed (Sofascore 403 on every host, FBref behind a bot check, StatsBomb's
  open data has Euros and Europa League but no Nations League).

## Consequences

- **A fourth kind of Season shape enters the record**: six Gameweeks in three windows
  over eleven weeks, a leaderboard that closes in November, and thirty-nine weeks of a
  Season in which the Competition has nothing to do. Anything that reads "how far through
  the Season" off the Gameweek count learns that here.
- **Every source is undocumented.** The UEFA feed moved nothing in the fortnight it was
  read but promises nothing; 365Scores and the GitHub dataset likewise. A path that moves
  fails the daily fetch by name for that Competition and no other (the daily fetch's
  per-Competition collection), and the archived responses are what a reader replays. The
  Season may end early because a feed did; that is stated here and not smoothed over.
- **Migration:** `UNL` joins the `competition_code` domain; `international_results` and
  the team-stats table are created; `historical_matches` and its Division check do not
  move.
- **Code:** a UEFA fetch, a 365Scores fetch (ADR-0058), a dataset fetch, a managers-list
  parser distinct from the Season-article parser, the source registry, the dispatch and
  the four loops that read it, three name maps, `MATCH_PROMPTS.UNL` with its pinned
  render, and the runbook, whose eight edits are a league's and not a cup's — it gains a
  second column or a second page.
- **The five domestic sources are not touched for `UNL`**, and the projection ADR-0056
  added for football-data.co.uk outages never runs for it, because the registry never
  sends it there.
- **The frozen `match-unl/2026-27-v1` render is pinned before any Nations League row is
  stored** and moves only for the reasons ADR-0026 allows, as every Competition's does.
- **CONTEXT.md moves with this ADR**: Competition stops meaning "league", Division
  records that a cup curates none, Gameweek names what a Gameweek is for `UNL`.

## Amendment: two of the three absences are stated, the third is silent (ticket 0075)

The packet section above says a cup's three missing sections are "each a stated absence
and not a Gap", and spec 0027's story 39 says the same. Building it found that the third
cannot be, and should not be:

- **the league table** is stated — `League table: no league table for this Competition; a
  national side plays no league.`;
- **Squad Changes** is stated — `Squad changes: none for this Competition; a national
  side has no transfer window.`;
- **availability** is *absent*, silently, exactly as it is for La Liga, Serie A, Ligue 1
  and the Bundesliga.

Availability is Premier League only and structurally so (ADR-0037): the section is built
from the FPL player feed, which has no equivalent anywhere else. Stating its absence in a
cup's packet and nowhere else would make the Nations League the one Competition that
apologises for a feed four leagues also lack — and stating it in all five would be a new
line in four frozen renders, which ADR-0026 does not allow for a used version.

So the count in the sentence above is two, not three. The distinction the original
sentence was reaching for still holds whole: none of the three is a Gap, and no Entrant
is shown a section that reads as though a fetch had failed. What decides whether an
absence is worth words is whether a reader would otherwise wonder — a Competition with no
table where every other Competition has one is a question worth answering, and a section
no Competition but the Premier League has ever carried is not.
