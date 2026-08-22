# Ticket: Ligue 1's history and xG land behind reviewed maps

**What to build:** the same shape as ticket 0036, for France — one prior Season
(2025-26) of French first- and second-division history and one of Understat xG, behind
two derived, human-reviewed identity maps. Eighteen clubs, not twenty, and nothing may
assume otherwise. Demoable: an `FL1` context renders its history, league table,
prior-Season points per game and xG. Source:
[spec 0024](../specs/0024-serie-a-and-ligue-1-open.md), stories 9–10, 12–13, 20–22.
Decisions:
[ADR-0049](../adr/0049-serie-a-and-ligue-1-open-the-bundesliga-waits-on-hands-not-money.md),
[ADR-0037](../adr/0037-a-new-competition-plays-the-v2-context-minus-availability.md).

**Blocked by:** 0033 (the captured `FL1` response), 0034 (the divisions and the check).
Independent of 0036 — the two leagues' curation can run in parallel.

**Status:** done

- [x] The Understat league slug for `FL1` is listed, and the Understat →
      football-data.co.uk map is derived from the real feeds — both sets exactly
      eighteen, nothing left over, keyed by Competition.
      _`UNDERSTAT_LEAGUES` gains `FL1: "Ligue_1"`. The map is read off
      `getLeagueData/Ligue_1/2025` and `mmz4281/2526/F1.csv`: eighteen titles onto
      eighteen `HomeTeam`s, each set exactly eighteen with nothing left over on either
      side. Both feeds are committed and the test derives from them — the standard
      0036's review set — as `test/fixtures/understat-2025-26-Ligue_1.json.gz` and
      `test/fixtures/football-data-2526-F1.csv.gz`._

      _Reading a committed file's `HomeTeam` identities is now `archivedHomeTeams` beside
      `archivedBody`, this ticket being the fourth copy of it and the first forced edit.
      Only the reading is shared: how many the set must hold, which are relegated out of
      it, and which pair could still read if it were swapped stay in each league's own
      test, because that is the part a reviewer has to check. **Found by review.**_

      _The local name for the map's second-division values was `secondTier`, which is a
      word CONTEXT.md's **Division** entry lists under _Avoid_. It came in with 0036 and
      is `secondDivision` in both leagues' tests now. **Found by review.**_

      _The fixtures are the **archived bytes**, not a second capture. Re-runnable:_

      ```sql
      select source, length(body) as bytes, substr(sha256, 1, 12) as sha
        from raw_snapshots
       where source like 'football\_data:2025-26:F_'
          or source = 'understat:2025-26:Ligue_1';
      ```

      _`F1` reads 158,468 bytes and `806b1dd80e00`, `F2` 156,235 and `65f157e1d8db`,
      `Ligue_1` 464,794 and `b21b639526e8` — the length and `sha256` of `gunzip`ping
      each committed fixture. Both CSVs carried the UTF-8 BOM 0036 documents and were
      stripped before committing; the Understat body did not carry one._

      _**Seventeen of the eighteen are the same string on both sides** and cannot be
      wrong. The one that is not is `Paris Saint Germain`→`Paris SG`, and it is the whole
      of what the review was asked to decide on this half — because the other Paris club
      is in the same eighteen and **both sources spell it `Paris FC`**. The two are spelt
      apart on each side, so the swap cannot be made by agreeing with one source and
      misreading the other._

      _Mutation-checked in both directions. A nineteenth key `Bogus` — a club Understat
      never lists — turns the key-set equality red. Exchanging which Paris key points at
      which stored name leaves every count and both set equalities **green**, which is
      why the pair is named rather than left to the arithmetic; named, it is red._

      _2026-27's promoted two are deliberately absent — Understat lists no 2026-27
      Ligue 1 match yet — and arrive as `unknown Understat team name` at the first
      pre-Season fetch, which is where that failure belongs._
- [x] The football-data.org → football-data.co.uk map is derived from the captured
      response — eighteen against eighteen, nothing left over.
      _Every key is a `homeTeam.name` in `football-data-org-2026-27-FL1-recorded.json.gz`
      and every value a `HomeTeam` football-data.co.uk stored for 2025-26 — sixteen in
      `F1` and the two promoted clubs in `F2` (Troyes, Le Mans). Eighteen against
      eighteen, nothing left over._

      _`F2` is committed too, so each value must be an identity one of the two stored
      divisions actually holds — the check 0036's review added after distinctness alone
      let a never-stored value through. The two `F1` names this map leaves behind are
      required to be exactly the two relegated out of it, `Metz` and `Nantes`._

      _**Eighteen and not twenty is what this league adds**, and the counts above are
      read off the two committed files rather than carried over from Serie A's shape._

      _Mutation-checked. `Toulouse FC`→`Metz` — a wrong value that is nonetheless in
      `F1`, so every count survives it — turns the leftover assertion red at
      `['Nantes', 'Toulouse']`. `Paris Saint-Germain FC`→`Paris FC` turns the distinct
      count and the `F1` membership red._
- [x] Both maps are reviewed and approved by a person **before** the backfill runs, the
      review recorded with what it was asked to decide.
      _**Reviewed and approved 2026-08-21, before the backfill ran.**_

      _What the review was actually asked to decide, on the live-source half: none of the
      eighteen is the same string on both sides except `Paris FC`, and a substring
      derivation over the stored names resolves sixteen of the rest on its own. It leaves
      exactly two for a person:_

      - _`Stade Rennais FC 1901`→`Rennes` — the stored name is the city, the official one
        the demonym, so no substring of either reaches the other._
      - _`Paris Saint-Germain FC`→`Paris SG` — **the pair this league can get wrong and
        still read**, because the other Paris club is in the same eighteen as
        `Paris FC`→`Paris FC`, the same string on both sides. Pointing the first at
        `Paris FC` is the swap that reads plausibly. This is spec 0016's named hazard,
        and it is the exact analogue of Serie A's two Milan clubs._

      _**What rules the swap out is not the reading.** Swapping the two would cost the
      **sixty-six** matches either club played — 34 each, less the two derbies counted
      twice, counted off the committed `F1` fixture rather than guessed. So the question
      left to a person was the one no arithmetic answers: whether these eighteen are
      Ligue 1's 2026-27 clubs at all._
- [x] `HISTORICAL_COMPETITION=FL1` backfills 2025-26 `F1` and `F2` history and the
      Understat xG, every response archived before it is read, and replayable.
      _Run 2026-08-21. 306 Ligue 1 results, **305** Ligue 2, 306 xG rows spanning
      2025-08-15 to 2026-05-17._

      ```sql
      select division, count(*)::int as rows from historical_matches
       where competition = 'FL1' and season = '2025-26' group by division;
      select count(*)::int as rows from understat_match_xg
       where competition = 'FL1' and season = '2025-26';
      ```

      _**305 and not 306 in Ligue 2 is the finding, not a shortfall.** The first backfill
      failed outright: `F2` row 137 is `Bastia v Red Star` of 05/12/2025 with **both**
      score cells empty — football-data.co.uk carrying a Match it has no result for — and
      `parseMatches` demanded a non-negative integer of every row. `E0`, `SP1`, `SP2`,
      `I1` and `I2` have no such row, which is why this arrived as a failed backfill
      rather than a review note._

      _Fixed at the root, in the shared parser rather than at the FL1 call: a row whose
      two score cells are both empty is skipped. Skipped and not stored, because a 0-0
      invented there is a result that never happened and every base rate the packet
      prints is an average over these rows._

      _A row with **one** score and not the other is a half-written row, not a Match
      without a result, and still fails. That half is what stops "skip the empties" from
      becoming "skip anything awkward", and it is asserted. Mutation-checked: widening the
      condition to `||` makes the half-written row stop rejecting._

      _**The first version of this skipped the row outright and took three other checks
      down with it.** The `continue` sat after the `Div` check but before the `Date`,
      `HomeTeam` and `AwayTeam` ones, so a resultless row with an unreadable date was
      dropped in silence where it used to raise — and the new test used only well-formed
      rows, so nothing said so. That is the failure mode this repo is built against, and
      it was in the parser every league shares. **Found by review.**_

      _Only the two score issues are withheld now; the row reaches every other check and
      is excluded from `matches` by the push guard that already required both figures. A
      resultless row carrying `not-a-date` and an empty `AwayTeam` is asserted to raise
      exactly those two issues and neither score one. Mutation-checked by putting the
      `continue` back above the `Date` check, which is the reviewed regression exactly:
      red at `promise resolved "undefined" instead of rejecting`._

      _**This changes what every Competition stores, so it is [ADR-0050](../adr/0050-a-row-the-source-has-no-result-for-is-not-corruption.md)**
      rather than a note in one league's ticket._

      _The claim that this row is rare is now checked instead of asserted: of the **six
      committed files** — `E0`, `E1`, `F1`, `F2`, `I1`, `I2` — only `F2` carries one, and
      only one. `SP1` and `SP2` are not committed, so the earlier version of this
      sentence named two files the repo cannot check; it no longer does._

      _Archived under `football_data:2025-26:F1`, `football_data:2025-26:F2` and
      `understat:2025-26:Ligue_1`, each stored before anything was read from it._

      _**The archive replay fetcher did need an edit, against 0036's expectation for its
      own league.** `UNDERSTAT_URL` matched `([A-Za-z_]+)` and `Ligue_1` ends in a digit,
      so every Ligue 1 snapshot the archive holds replayed as "no archived snapshot
      source is known". That degrades a dry run to "xG unavailable" rather than failing
      it (ADR-0019) — the quiet kind of miss — and it was found only because `Ligue_1`
      was pinned in the replay test alongside `Serie_A` rather than assumed. Now `(\w+)`._

      _It is **the same bug as the three-character division code** ticket 6 fixed for
      `SP1`: a source name this codebase chooses, and a pattern narrower than the names it
      chooses. The two now sit next to each other in the file and say so. Ticket 0033
      wrote that the bug could not recur here — true for `Serie_A`, and `Ligue_1` is why
      it was worth pinning anyway. **Found by review.**_
- [x] The xG join rate is read and recorded; a promoted club's prior Season renders from
      the second division the way the Championship does for `PL`.
      _**298 of 306**, read with `joinXg`'s own key — the UTC date of the kick-off and
      both names through the Understat map:_

      ```sql
      with x as (
        select (kicked_off_at at time zone 'UTC')::date as d,
               case home_team when 'Paris Saint Germain' then 'Paris SG'
                              else home_team end as h,
               case away_team when 'Paris Saint Germain' then 'Paris SG'
                              else away_team end as a
          from understat_match_xg
         where competition = 'FL1' and season = '2025-26')
      select count(*)::int as xg_rows, count(m.played_on)::int as joined
        from x left join historical_matches m
          on m.competition = 'FL1' and m.season = '2025-26'
         and m.division = 'Ligue 1'
         and m.played_on = x.d and m.home_team = x.h and m.away_team = x.a;
      ```

      _306 and 298. **The eight are a date disagreement, not a name.** Re-run the same
      query joining on the club pair alone and every one of the eight finds its stored
      Match, one or two days earlier: four on Understat's 2026-02-08 and four on its
      2026-05-03. Understat files those matchdays at a single nominal slot — five
      matches at `14:00` and five at `13:00` — where football-data.co.uk holds the real
      kick-offs spread across days and times (18:00, 16:00, 19:45, 20:05). Understat is
      the source that is wrong about the date; both agree on the result._

      _**The stronger check, which the join rate cannot make**, and it is a test rather
      than prose because both feeds are committed: pair every stored result with its
      Understat match by club pair, and all 306 resolve with **not one score the two
      sources disagree on**. That exonerates every name in both maps independently of any
      date, which no join rate could. The eight dates that differ are named in the same
      test rather than counted, so a ninth is something to read rather than a number to
      bump. Mutation-checked with the Paris swap, which turns it red at sixty
      disagreements. **Found by review**, which asked for this claim to be queryable._

      _The eight surface honestly rather than silently: the packet prints
      `xG unavailable` on those form lines and qualifies the prior-Season average with
      the coverage it actually had. **Ten of the eighteen read `(over 33 of 34 matches)`
      and two read `(over 32 of 34)`** — Lens and Lorient, each touched twice — and the
      remaining six carry no qualifier at all. Metz and Nantes are also short by two and
      never render it: they are the two relegated out of Ligue 1. An earlier version of
      this note said `33 of 34` for everybody. **Found by review.** Not fixed — a ±1-day
      join is a change to `joinXg`'s key that could reach a club playing twice, and it
      belongs to whichever ticket wants to argue for it._

      _A promoted club renders from the second division: Le Mans reads
      `Prior-Season final position: 2nd in 2025-26 Ligue 2; promoted: yes`, a
      `Ligue 1 history: none in stored data; promoted from the Ligue 2` line, and five
      Ligue 2 form lines carrying shots — the Championship's shape for `PL`._
- [x] An `FL1` packet rendered from the backfilled record shows history, the league table
      and xG; the contamination test covers it both directions.
      _Read whole on 2026-08-21 over the real record — 611 stored results, 306 xG rows,
      replayed into a temporary cluster through the real loader and the real builder with
      no production write, the way 0036's was. `FL1` has no `gameweeks` row until
      activation, so `context:show` cannot do it._

      _**The live-source spellings resolve**, which is the failure `PD` shipped and had
      to come back for: `Paris Saint-Germain FC` finds the history stored under
      `Paris SG` (1st, 2.24 points per game, xG 2.20-0.98), `Stade Rennais FC 1901` finds
      Rennes, and `Le Mans FC` finds Ligue 2. The two Paris clubs read apart — 1st and
      11th, with the derby in both head-to-heads — which is what a swapped pair could not
      do._

      _The league table reads "no result has been played yet this Season", correctly:
      it is 2026-27's table and Gameweek 1 kicked off 2026-08-21T18:45Z, after the Lock
      the packet is built behind._

      _The base rates the packet prints come straight out of the stored rows:_

      ```sql
      select count(*)::int as matches,
             round(100.0 * avg((home_goals > away_goals)::int), 1) as home_pct,
             round(100.0 * avg((home_goals = away_goals)::int), 1) as draw_pct,
             round(100.0 * avg((home_goals < away_goals)::int), 1) as away_pct,
             round(avg(home_goals + away_goals), 2) as goals
        from historical_matches
       where competition = 'FL1' and season = '2025-26' and division = 'Ligue 1';
      ```

      _306 matches, 46.1% / 24.5% / 29.4%, 2.82 goals — the line the packet prints._

      _`npm run dry-run` cannot render this packet either, for the reason 0036 recorded
      for `SA`: France's transfer list has no club map. That is 0038's, and the loud
      failure is correct._

      _The contamination test now carries four leagues, each contaminant still naming the
      clubs of the Competition it is trying to reach in that Competition's own Understat
      spelling: `SA` holds a row naming the two Paris clubs and `FL1` holds one naming
      Roma and Lazio. Mutation-checked by relaxing the `competition` filter on the xG
      read, which turns it red at `expected 9.9 to be undefined`._

      _**A contaminant has to carry the date of the Match it aims at, and the first
      version of the FL1-to-SA direction did not.** It named Serie A's `AC Milan`/`Inter`,
      whose stored result is the LATER of that league's two, while carrying EARLIER — and
      the join is keyed by date as well as by both names, so it could not have landed even
      with the `competition` filter deleted. That direction read as covered and was inert.
      **Found by review.** It now aims at Serie A's EARLIER result, the one whose only xG
      belongs to somebody else, which is the slot every other contaminant in this fixture
      aims at._

      _Two Competitions now hold a contaminant aimed at that one form line, `PD`'s and
      `FL1`'s, so the assertion cannot say which it caught. Each was checked live on its
      own: with the other row deleted and the filter relaxed, it is red both ways round._
- [x] `MATCH_PROMPTS.FL1`'s sha is re-pinned if the table's rendering moved, the
      documented once.
      _**It did not move** — read, not predicted. The pin hashes this suite's render,
      built from a literal that reads no database, so the backfill could not reach it,
      and nothing in this ticket touches the builder. The suite stayed green across the
      backfill and the real packet was read whole anyway, which is the point rather than
      the number. `dabac3c9` stands._

      _0036 corrected two comments that had predicted this move and deliberately said
      nothing about `FL1`. Both now record what happened rather than what was expected._
