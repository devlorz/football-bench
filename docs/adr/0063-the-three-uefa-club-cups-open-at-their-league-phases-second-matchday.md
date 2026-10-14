---
status: accepted
---

# The three UEFA club cups open at their league phase's second matchday

> **Accepted 2026-10-12** by the operator, with the history paragraph and the
> domestic-xG reading as corrected the same day. Spec
> [0028](../specs/0028-the-uefa-club-cups-open.md) turns this note into requirements.
>
> Amended 2026-10-12, before any caveat was built, by the operator's decision to sum the
> club cups into `/overall`. The roster section now says the cups join the leagues'
> current Edition set by roster, once ticket 0110 lands. The frozen caveat sentence no
> longer claims the cups are summed nowhere.
>
> Amended 2026-10-13, by the operator's decision while ticket 0102 was in review: `{cup}`
> in the frozen caveat is the short name without "UEFA", as the Nations League's caveat
> reads "The Nations League". The three names are "Champions League", "Europa League"
> and "Conference League".
>
> Amended 2026-10-13, by the operator's decision while ticket 0103 was in review: an
> opponent that is itself one of the cup's sides is stored under the record's spelling.
> The same match arrives on both sides' pages under one source match id, so two
> spellings would overwrite each other. Every other opponent keeps 365Scores' spelling.
> Extended 2026-10-14 by ticket 0107's review: "the cup's sides" means every cup's. A
> row is shared across cups, so a side of any cup is stored under the record's spelling,
> found by its competitor id. `UCL`'s stored opponents that are `UEL` sides change
> spelling from the first fetch after 0107 ("Olympique de Marseille" becomes
> "Marseille"). Its frozen render does not move.
>
> Amended 2026-10-13, after the operator read `UCL`'s first production packet: **the
> Europa League's and Conference League's history lines carry their sheets' shots and
> xG.** `UCL` is unchanged. It froze scores-only at its first Lock and stays that way
> for its league phase. See *Amendment: the Europa and Conference Leagues' history lines
> carry their sheets' figures* at the foot of this note.

>
> Amended 2026-10-14 by the operator: **the Conference League opens at its `MD1`, not its
> `MD2`.** `UECL`'s `MD1` is played 2026-10-15, and its Lock is 15:15Z that day. The code
> was ready a day before that Lock, so its whole league phase can be predicted: six
> Gameweeks, none adopted as history.
> - Gameweek 1's packet is the empty state: the 36-side table at nought and no played
>   Fixture yet. It is read on a throwaway database before the insert.
> - The insert and `roster:enter` land before Lock − 6h, 2026-10-15T09:15Z, so seats are
>   entered before Gameweek 1's Lock. Tickets 0112 and 0113 then answer Gameweek 1 with
>   no special case.
> - The fallback is ADR-0054's, unchanged. If any step misses Gameweek 1, `UECL` opens
>   at Gameweek 2 as first written, with `MD1` adopted as history.
> - Cost: about $5.40 more (18 Fixtures × 8 seats).
>
> `UCL` and `UEL` keep their `MD2` openings. The title stays as it is because it is the
> note's name.

**The UEFA Champions League (`UCL`), Europa League (`UEL`) and Conference League
(`UECL`) open for 2026-27, league phase only, each at its `MD2`.** Each cup has 36 clubs
in one 36-side table. `UCL` and `UEL` play 144 Fixtures over eight matchdays and `UECL`
plays 108 over six. Each Competition seats the eight of the leagues' Edition 2
([ADR-0062](0062-eight-seats-open-the-leagues-second-edition.md)). Each Gameweek's packet
has the table, this cup's played Fixtures with shots and xG, each side's five most recent
matches in any competition, and who picks each club. The operator decided this on
2026-10-12: start at matchday 2, use the Edition 2 seats, take history from 365Scores
(FotMob only if 365Scores lacks it), and find a head coach source. When told the first
Lock was a day away, the operator answered "ต้องทำให้ทัน" ("it has to make it").

These are the seventh, eighth and ninth Competitions, and the first cups whose sides are
clubs. They follow the Nations League's cup template
([ADR-0057](0057-the-nations-league-opens-as-the-first-cup-on-sources-nobody-documents.md),
[ADR-0058](0058-the-nations-leagues-shots-and-xg-come-from-365scores.md)) wherever a
club and a national side are the same kind of thing. They depart from it on history and
head coaches, where they are not.

## The calendar, read off UEFA's feed on 2026-10-12

Lock is the earliest kickoff minus ninety minutes (ADR-0036).

| | `MD1` | Opens at | That Gameweek's Lock | Fallback (ADR-0054) | Last league-phase Gameweek |
| --- | --- | --- | --- | --- | --- |
| `UCL` | 09-08/10, played | Gameweek 2 | **2026-10-13T15:15Z** | Gameweek 3, 10-20T15:15Z | 8, 2027-01-27 |
| `UEL` | 09-16/17, played | Gameweek 2 | 2026-10-15T15:15Z | Gameweek 3, 10-22T15:15Z | 8, 2027-01-28 |
| `UECL` | 10-15, unplayed | Gameweek 2 | 2026-10-22T13:00Z | Gameweek 3, 11-05T16:15Z | 6, 2026-12-17 |

`UCL`'s first Lock was about 24 hours away when this note was drafted (14:54Z on 10-12).
So the target is the operator's, and the fallback column is ADR-0054's rule, unchanged.
If a Competition is not in place by its Lock, it opens at the next Gameweek. A Lock is
never set by hand, and a Gameweek that is missed arrives as Locked history through the
mid-Season adoption path (ADR-0015). `MD1` of all three arrives that way by design.
`UECL`'s `MD1` is also unpredicted, by the operator's choice of `MD2` for all three.

## What the sources hold, read 2026-10-12

- **UEFA's feed** (`match.uefa.com/v5/matches?competitionId=<1|14|2019>&seasonYear=2027`)
  answers without a key, as it did for `UNL`. The league phase sits under
  `round.metaData.name = "League Phase"`, `round.phase = "TOURNAMENT"`, with `matchday.name`
  `MD1`–`MD8` (`MD1`–`MD6` for `UECL`). Every match is in one group named `League`.
  **The qualifying rounds are in the same feed under the same matchday names.**
  `First qualifying round` through `Play-Offs` carry `MD1`, `MD2`, `MD1 - PO` and
  `MD2 - PO`: 90 such matches for `UCL`, 80 for `UEL` and 258 for `UECL`. Mapped the way
  `UNL` maps matchday names, they would become Gameweeks 1 and 2.
- **365Scores** carries the three cups as competitions 572, 573 and 7685. Every match
  sampled has per-team "Expected Goals", "Total Shots" and "Shots On Target". Of `UCL`'s
  36 clubs, 365Scores spells 17 differently from UEFA's `internationalName` ("PSG",
  "Inter Milan", "Bayern Munich", "Bodo Glimt", …). `UNL` had 3 of 54.
  - **Every `MD1` sheet of `UCL` and `UEL` carries xG**, read later on 2026-10-12: 36 of
    36, with no hole. That includes the sides whose domestic leagues have none —
    Sabah, Slovan Bratislava, Slavia Praha, Shakhtar, Ararat-Armenia, Omonia, Levski
    Sofia. The figure follows the competition, not the club.
  - **The same sheets have no xG for many domestic leagues.** Read the same day for
    one club each, on its latest league match: none for the Czech, Slovak, Ukrainian,
    Azerbaijani, Belgian, Norwegian, Greek, Austrian, Bulgarian, Cypriot and Armenian
    leagues (a sheet of 14–84 rows without the line); present for the Portuguese,
    Israeli, English, Spanish, German, Italian and French ones. Whether a domestic
    match has an xG follows its league, not whether this record reads that league.
    The Dutch, Turkish, Scottish and the remaining leagues were not read.
  - **FotMob, read the same day for the same matches**, has xG for the Belgian,
    Norwegian, Greek and Austrian matches and none for the Czech, Slovak, Ukrainian and
    Azerbaijani ones. Its `/api/data/` paths answered without a signed header. Its
    `robots.txt` and terms are as ADR-0058 read them. It would narrow the gap below
    and not close it, and it is not opened (see *The decision*).
- **365Scores' `web/games/results/?competitors=<id>`** lists a club's results in every
  competition: league, domestic cups, super cups, Europe, friendlies. All 108 league-phase
  clubs answered on 2026-10-12. For 107 of them the latest settled match was dated
  2026-10-09 to 10-11. Atalanta's was 09-20, and football-data.org agrees that Atalanta
  has played no fixture since then.
- **Only 38 of the 108 clubs play in a league this record holds**: `UCL` 21, `UEL` 12,
  `UECL` 5. football-data.co.uk has files for some of the other countries and not for
  Czechia, Ukraine, Azerbaijan, Slovakia, Hungary, Cyprus, Slovenia, Bulgaria, Israel,
  Croatia, Armenia, Lithuania, Andorra, Georgia, Bosnia, Latvia, Kazakhstan, Serbia,
  Gibraltar or Albania. Understat holds the five leagues only.
- **Head coaches.** Three sources were read for all 108 clubs:
  - 365Scores' `web/squads/?competitors=<id>` names a coach for 106 clubs. It has none
    for Lens or Lech Poznań. For Viktoria Plzeň it names Martin Hyský, where UEFA's
    17 September lineup and Wikipedia both name Radoslav Kováč.
  - UEFA's `match.uefa.com/v5/matches/<id>/lineups` carries `coaches`, but only as of the
    club's last UEFA match. It names Dino Toppmöller at Lens, who left on 15 September.
  - The `manager =` field of each club's English Wikipedia infobox, read through the
    documented MediaWiki API, was right on all three clubs where the other two disagree:
    Lens (Yannick Cahuzac, since 15 September), Lech (Niels Frederiksen) and Plzeň (Kováč).
    Finding an article by search picked the wrong one 8 times in 108 (a women's side, a
    reserve side, a Malaysian club also named Sabah). The club-to-article map has to be
    reviewed by hand. It cannot be searched.
- **football-data.org** answers `CL` (Champions League) on the project token and 403 for
  `EL` and `UCL`. Its codes are not the ones this note adopts; see *Codes* below.

## The decision

**Schedule, kickoffs, matchday and the ninety-minute result come from UEFA's feed**, read
by `UNL`'s fetch with two changes:

- **Only the `League Phase` round is read.** Every other round is skipped, not refused.
  The qualifiers are already in the feed on day one, so refusing them would fail the
  fetch every day. The knockout rounds (play-offs in February, the round of 16 onward)
  are deferred as they were for `UNL`, and for the same reason: a two-legged tie is a
  decision for when its Fixtures exist. Each Competition's Season and leaderboard close
  at its last league-phase Gameweek.
- **The matchday-to-Gameweek map belongs to each Competition.** `MD1`–`MD8` map to `gw`
  1–8 for `UCL` and `UEL`, and `MD1`–`MD6` to 1–6 for `UECL`. Gameweek *n* is matchday
  *n*, so an Edition 1 that starts at `MD1` holds the editions table's
  `edition > 1 or first_gw = 1` check.

**Shots and xG come from 365Scores**, ADR-0058's fetch with three competition ids and
three reviewed name maps onto UEFA's `internationalName`. A settled Fixture with no
sheet is a hole, as it is for `UNL`.

**History is each club's five most recent settled matches in any competition, from
365Scores' results listing.** Each line names its competition: "Parva Liga", "Super Cup",
"UEFA Europa League". Friendlies are excluded. They are not the club's competitive form,
and pre-season friendlies are most of a club's matches in July and August. The lines carry
scores only. The source read for them has no xG for many domestic leagues (above): a
sheet exists for Qarabağ's league match and the line is not on it, and a packet that
gave xG to Arsenal's league matches but not to Qarabağ's would be uneven in a way the
Entrant cannot see. Two things keep a history line to its score, and they are not the
same thing. Where the club's domestic league has no xG on 365Scores — the eleven
leagues read without it above, and any other found so — the source has none.
Everywhere else — a UEFA match such as a qualifier or `MD1` once it is among the five,
or a domestic match in a league whose sheets carry it, such as the five leagues,
Portugal or Israel — the figure exists and the line omits it by this decision, so that
every line reads alike. The cup's own played Fixtures carry their figures in
the played-Fixtures section instead, so from `MD2` each side has at least one match
with xG in its packet (for `UECL`, once its `MD1` sheets exist). Opponents are named
as 365Scores spells them, except the cup's own sides (as amended). Only the cup's own
36 sides are mapped. Rows go in a new `club_results` table keyed by source and source
match id, not in `historical_matches` (no Division) and not in `international_results`
(national sides, keyed without a source).

**FotMob is not opened.** The operator named it as the fallback for history. 365Scores
answered for all 108 clubs, so there is nothing for a fallback to fill. ADR-0058 rejected
FotMob because its `robots.txt` disallows `/api/*` and its terms forbid systematic use.
That has not changed, and a daily fetch is systematic use. If 365Scores stops answering,
the choice is between reversing ADR-0058 and stating the absence, and it is made then,
in an amendment.

**Head coaches come from each club's English Wikipedia infobox**, through a reviewed map
of 108 article titles. Each daily fetch stores a snapshot, and a Head Coach Change is the
difference between two snapshots: the same model as the national-team list (migration
0045). The infobox has no appointment date, so a club's line reads "who picks this team",
and "since when" is given only from the day a stored snapshot first shows the change. The
packet says so. One source for all 108 clubs is preferred to splitting them: the 38 in
the five leagues could read dated events from the Season articles, but that would be two
pipelines and two meanings of a Head Coach line inside one packet. Snapshots go in a new
`club_head_coaches` table. `national_team_head_coaches` requires an `assumed_on` date for
every named coach, and an infobox has none.

**The packet** follows the template's sections (ADR-0038, as amended for a cup by
ADR-0057):

- the Fixture line;
- **the league-phase table**: all 36 sides from the first day, ordered by points, goal
  difference and goals scored, with one line saying UEFA's own tie-breaks are not
  applied. One more frozen line states what the table decides: places 1–8 go to the round
  of 16, places 9–24 to the knockout play-off round, places 25–36 are out. An Entrant
  reading a 36-side table needs that to read it;
- this cup's played Fixtures with shots and xG;
- each side's five most recent matches, as above;
- who picks each team, as above;
- **Squad Changes, stated absent.** The wording is "not read for this Competition", not
  "none": clubs have transfer windows. The summer window closed before `MD1`. The
  January window opens before `MD7`, and those changes will not be in the packet.

Availability is silent, as for every Competition but the Premier League (ADR-0057's
amendment).

**The cut line is 2026-10-13T06:00Z, and only for `UCL`.** If the history fetch or the
head coach fetch is not green by then, `UCL`'s `match-ucl/2026-27-v1` is pinned without
the missing section, and that section is stated absent for `UCL`'s whole league phase.
A Prompt Version is frozen from its first Lock (ADR-0026), and a second version in
mid-phase would make Gameweek 2 incomparable with what follows. The operator chose this
cut over that second version. `UEL` and `UECL` pin later and do not inherit the cut. A
cup's packet shape can therefore differ between `UCL` and the other two. That is allowed
because each Competition has its own Prompt Version (ADR-0038). Work after the cut line
until Lock − 6h (09:15Z) is the push and deploy. Ticket 0086's runbook correction holds
here: cron runs `origin/main`, so the code is deployed before any insert.

**Codes are `UCL`, `UEL` and `UECL`, and CONTEXT.md's naming rule is amended.** CONTEXT.md
names a Competition "by football-data.org's code whether or not that source is read".
football-data.org calls the Champions League `CL` and the Europa League `EL`, and it
holds a `UCL` code that this project's token cannot read. The abbreviation everyone
outside that API uses for the Champions League would then name a different cup, or a cup
this record does not hold. None of the three is read from football-data.org. The amended
rule reads: football-data.org's code for a Competition read from it, and UEFA's own
abbreviation for a UEFA cup that is not. `UNL` already satisfies both.

**The roster is the leagues' Edition 2 eight, as each Competition's Edition 1**: Claude
Opus 5, Claude Opus 5.5, Gemini 3.1 Pro Preview, GPT-6.1 Sol, Grok 4.7, Muse Spark 1.3,
Kimi K3, GLM 5.3. These are the same entrant objects, not copies (`LEAGUE_EDITION_2`).
ADR-0061 rule 4 sets the cutoff at this note's date, and all eight were listed before it.
All eight have answered a pre-flight (2026-10-08). Each new Prompt Version still needs
its own eight-seat pre-flight before its first Lock, as `UNL`'s seven did: three runs of
eight calls. Each is paid and asked for separately. Each cup's own Edition 1 is a view
of its own.

**The club cups join the leagues' current Edition set, and `/overall` sums them, once
the work is done.** ADR-0051, as amended on 2026-10-08, left the Nations League out of
the sum because its roster is not the leagues'. That reason does not apply here: a club
cup seats the same eight entrant objects as the leagues' Edition 2, so a summed row is
still one Base Model's record across Competitions. Two rules change to allow it:

- **An Edition set is defined by its roster, not by its Edition number.** CONTEXT.md and
  ADR-0061 define a set as the same-numbered Edition of each league. A cup's first
  Edition is numbered 1, and it cannot be numbered 2: ADR-0061 rule 3 requires the
  Edition before to have a scored Gameweek, and the cups' `MD1` was never predicted. The
  amended rule: a set is the Competitions whose current Edition seats the same roster of
  record. The leagues' Edition 2 set then holds the five leagues and the three club cups.
  Their bodies carry Edition numbers 2 and 1, and the overall view's refusal of mixed
  Editions compares rosters instead of numbers. `/edition-1/overall` is unchanged. The
  cups' Edition 1 does not seat the leagues' Edition 1 ten, so it is not in that set.
- **The sum stays raw** (ADR-0051), and the page says what that means here. The three
  league phases add at most 342 Fixtures to roughly 1,500 left in the leagues' Edition 2 (estimated from Season lengths, not read),
  which is about a fifth of the sum by Fixture count. They start later (10-13, 10-15 and
  10-22 against 10-08/10) and end earlier (12-17, 01-27 and 01-28). The overall page
  gains a frozen line saying so.

This change is not on the cut line's path. The first cup Fixture is scored after
2026-10-13, and until the sum's ticket lands the cups stay out of the set. That is the
only state the dashboard can show without "mixed Editions". `UNL` stays out in both
states: its roster is its own seven.

Two things in the roster module do not yet allow seating the eight, and both move with
this note:

- **An Edition 1 can only take seats away from the Season Roster.** It is built from the
  Season Roster less exclusions plus substitutions, with nothing added. The eight include
  Claude Opus 5.5, which is an addition to the Season Roster's ten, so a cup's Edition 1
  has to be able to name an Edition roster outright, as an Edition 2 does.
- **The dashboard puts a Competition in the leagues' Edition set by the absence of a
  roster caveat.** A club cup with no caveat would join the set at Edition 1 beside the
  leagues at Edition 2, and `/overall` would show "mixed Editions" instead of a total.
  So each club cup gets a caveat, and until the sum's ticket replaces that test with the
  roster rule above, the caveat is also what keeps the cups out. The caveat is owed to
  readers in its own right, because the cup's roster is not the Season Roster. Its frozen
  sentence says nothing about any sum, so it stays true on both sides of that ticket.
  With the cup's short name in it ("Champions League", "Europa League", "Conference
  League"), it reads: "The {cup} seats the eight Base Models of the
  leagues' Edition 2, from its own first predicted Gameweek. This is the {cup}'s
  Edition 1, and its ranking here is its own (ADR-0063)."

## What it costs

- **At most about $103 for the league phase.** That is 342 Fixtures (`UCL` 126, `UEL` 126,
  `UECL` 90) at $0.3003 per Fixture, the dearest rate measured, which is the ceiling
  ADR-0054 and ADR-0057 took. It was measured with ten seats. Eight seats and a different
  mix make it a ceiling, not an estimate, until ticket 0077's method reads the real rate
  off `attempts` after each cup's first settled Gameweek. A 36-side table makes this
  packet larger than `UNL`'s. Each fallback Gameweek taken saves 18 Fixtures, about $5.40.
- **Three more undocumented feeds' worth of dependence on two hosts.** UEFA and 365Scores
  now carry four Competitions between them. A path that moves fails those Competitions'
  day by name, and no other's. One 365Scores outage now takes shots, xG, history and the
  second results source from four packets at once.
- **A daily request budget about three times `UNL`'s.** That is roughly 108 results
  listings, 108 Wikipedia pages, three league-phase schedules and the day's match sheets.
  365Scores gets about 0.4 s between requests, as the research reads did. The MediaWiki
  API's etiquette (a contact User-Agent, serial requests) is followed because it is
  documented.
- **One Competition opens on a day's notice.** `UNL` took ten days from ADR to first
  Lock, through eight tickets. `UCL`'s fallback row is the honest expectation, and the
  target is the operator's.

## Considered Options

- **Gameweek 3 or 4 for all three** (Locks 10-20/22 or 11-03/05), the drafting
  recommendation. That gives three weeks of preparation and drops 36–90 Fixtures. The
  operator chose `MD2`.
- **Open `UCL` at `MD2` with a thin packet** (the table and cup Fixtures only, history and
  coaches stated absent for the whole phase). Lowest risk. Not chosen. It is what the cut
  line falls back to if the fuller packet is not ready.
- **A second Prompt Version mid-phase** (`v1` thin at `MD2`, `v2` complete at `MD3`).
  Rejected by the operator. It would need an exception to ADR-0026, and Gameweek 2 could
  not be compared with the rest.
- **History from football-data.co.uk plus the record's own league rows.** It covers 38
  clubs and part of the remaining 70, and only domestic matches. Rejected for an uneven
  packet and a European match missing from every line.
- **Head coaches from 365Scores' squads.** It is the source already being read. Rejected
  on what was read: two clubs missing and one wrong out of three disagreements.
- **Head coaches from UEFA lineups.** Official, but only as fresh as the club's last UEFA
  match, and published after the Lock. Kept as a possible post-hoc check, as ADR-0057 did.
- **Season articles for the 38 league clubs and infoboxes for the 70.** Gives dated events
  for 38 clubs, at the cost of two pipelines in one packet. Rejected above.
- **football-data.org's codes (`CL`, `EL`, …).** Rejected above.

## Consequences

- **Migration** (one file): `UCL`, `UEL` and `UECL` join the `competition_code` domain;
  `club_results` and `club_head_coaches` are created; an Edition 1 row for each cup goes
  into `editions`. Every migration costs five filename-list edits across two suites.
- **Code**: UEFA ids, round filter and a per-Competition matchday map; 365Scores ids and
  three name maps; a club results fetch and its renderer; an infobox parser, the 108-title
  map and its renderer; three registry entries; three `MATCH_PROMPTS` entries pinned from
  a read render; an Edition 1 that names its roster outright, used by three
  Competitions; three `ROSTER_CAVEATS` sentences; and the dashboard switcher labels.
- **Operator**: apply the migration on production after `db:rehearse`; three paid
  eight-seat pre-flights; the `competitions` inserts; `roster:enter`; in the runbook's
  order, after the push and deploy.
- **The mid-Season adoption path is used for a UEFA-sourced Competition for the first
  time.** `UNL` opened before its `MD1`. `UCL`'s and `UEL`'s first Gameweek arrives as
  Locked history with no Prediction, which ADR-0015 and ticket 0096 allow and which a
  rehearsal must show before the insert. The rehearsal must also show `MD1`'s 365Scores
  sheets stored for every Fixture, with each side's name mapped: the "at least one
  match with xG from `MD2`" above holds only if the stats fetch reads the sheets of
  Fixtures settled before the Competition was listed, and only if no name map entry is
  missing. A missing entry renders a hole the source does not have.
- **CONTEXT.md moves with this note**: Competition lists nine and carries the amended
  naming rule; Gameweek says what one is for the club cups; Head Coach says a club cup's
  line has no "since when" until a snapshot shows one.
- **The tickets are not yet written.** They follow this note's acceptance, numbered off
  `main`.

## Amendment: the Europa and Conference Leagues' history lines carry their sheets' figures (2026-10-13)

**For `UEL` and `UECL`, each line of a side's five most recent competitive matches
carries the shots, shots on target and xG that match's 365Scores sheet holds, where it
holds them.** `UCL` is not touched. `match-ucl/2026-27-v1` froze at its first Lock
(2026-10-13T15:15Z) with scores-only history lines, and it keeps them for its whole league
phase (ADR-0026).

**Why.** The operator decided this after reading `UCL`'s first production packet. The
*History* paragraph above kept every line to its score so that a line would never carry
figures the next line could not. That trade was already weighed once and decided the
other way: ADR-0058's 2026-09-23 amendment puts a 365Scores sheet's figures on the
Nations League's dataset lines "where a sheet was read and say nothing where none was",
with friendlies holed far more often than the competition itself. The same rule now holds
for two of the three club cups.

The unevenness is real, and it follows the league, not the club. As read on 2026-10-12:
- the sheets carry xG for the five leagues, Portugal and Israel;
- they carry none for the Czech, Slovak, Ukrainian, Azerbaijani, Belgian, Norwegian,
  Greek, Austrian, Bulgarian, Cypriot and Armenian leagues;
- a UEFA match's sheet carries it for every club.

So every side still has figures on its cup matches, and a side from a league without
them has fewer.

**What a line says.** The default follows the Nations League's precedent, and the
operator may change it before either cup's Prompt Version is pinned:
- a sheet with xG renders the same figures the played-Fixtures section does, e.g.
  `shots 12-8, on target 5-3, xG 1.25-0.75`;
- a sheet with shots and no xG renders its shots beside "xG unavailable" (ADR-0058, as
  ticket 0072 amended it);
- a match with no sheet stored renders its score alone and says nothing about figures.

**Where the figures live.** The sheet is the same 365Scores match the results listing
names, so the figures attach to the `club_results` row by its `source_match_id`.
Migration 0051 adds nullable per-side shots, shots on target and xG, plus the instant the
sheet was read, so that "read and empty" and "never read" stay distinct facts. One row
per match still serves every cup that reads it. For example, a domestic match between a
`UEL` side and a `UECL` side is read once.

**When a sheet is read, and when it is left.** A row's sheet is read once the match is a
day old, so a sheet published before its figures settle is not taken as final. A sheet
that answers without xG is then the league's answer and is not read again. This departs
from the cup Fixtures' hole-and-retry rule (ADR-0058) on purpose: a domestic league
without xG will never fill, and retrying it would add about a hundred requests a day for
nothing. A sheet that fails to answer at all is read again the next day. Sheets are read
only for rows touching a side of a Competition whose packet renders them, so `UCL`'s
sides' rows are not read for this.

**`UCL`'s frozen render must not pick the figures up.** `club_results` is shared, and a
domestic match between a `UCL` side and a `UEL` side will carry figures read for the
`UEL` packet. The renderer decides per Competition whether a history line shows figures.
That decision is a per-Competition fact beside the bands line, never a flag (the
policy-from-data rule). `UCL`'s entry says no, and a test must show a `UCL` packet with
an enriched row still printing the score alone.

**Cut lines.** These are the same terms as `UCL`'s:
- for `UEL`, if the sheet reading is not green by 2026-10-15T06:00Z, `match-uel/2026-27-v1`
  is pinned with scores-only lines, and they stay that way for its league phase;
- for `UECL`, the cut is 2026-10-22T03:45Z, nine hours and a quarter before its
  13:00Z Lock.

Either cup that misses its cut keeps the *History* paragraph's original rule. The other
does not inherit the miss.

**What it costs.**
- The first read is about 180 sheets a cup (36 sides × five matches, fewer where two cup
  sides meet), at the 0.4 s spacing the results listing uses.
- After that, each newly settled match costs one sheet, roughly fifty a week per cup.
- The packet grows by the figures on up to ten lines a Fixture. The per-Fixture price is
  re-read by ticket 0109 as before.

**Consequences.**
- **Migration** 0051 adds the columns to `club_results`. That means five filename-list
  edits, `db:rehearse`, and the operator's apply on production before `UEL`'s insert.
- **Code**:
  - a sheet-reading step in the club results fetch, following the rules above;
  - the history renderer reads the figures and a per-Competition entry, and `UCL`'s
    entry renders scores only;
  - the dry-run replay maps the new sheet URLs.
- **Spec 0028** moves:
  - story 50 (scores only) becomes "figures where the sheet has them" for `UEL` and
    `UECL`, and stays as written for `UCL`;
  - stories are added for the day's delay, the read-and-empty rule, and `UCL`'s frozen
    render;
  - "xG on history lines" leaves *Out of Scope*.
- **Tickets**: a new ticket (0111) builds the above. It is blocked by 0103 and blocks 0107
  and 0108, whose renders and pins must show the figures, unless their cut lines are
  missed.
- **The three cups' packets now differ in one more section.** A reader comparing `UCL`
  with the other two should know `UCL`'s history lines are scores-only by its freeze, not
  by its source.
