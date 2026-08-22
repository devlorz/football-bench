# Ticket: Serie A's history and xG land behind reviewed maps

**What to build:** the curation and backfill that make the `SA` packet real — one prior
Season (2025-26) of Italian first- and second-division history and one of Understat xG,
behind two identity maps derived from the real feeds and reviewed by a person before any
row lands. Demoable: an `SA` context renders its history, league table, prior-Season
points per game and xG. Source: [spec 0024](../../specs/0024-serie-a-and-ligue-1-open.md),
stories 9–10, 12–13, 20–22. Decisions:
[ADR-0049](../../adr/0049-serie-a-and-ligue-1-open-the-bundesliga-waits-on-hands-not-money.md),
[ADR-0037](../../adr/0037-a-new-competition-plays-the-v2-context-minus-availability.md).

**Blocked by:** 0033 (the captured `SA` response is the source of the live-source
spellings), 0034 (the divisions and the check must exist before the backfill's first
insert).

**Status:** done

- [x] The Understat league slug for `SA` is listed, and the Understat →
      football-data.co.uk map is derived, not transcribed: every key a title in the real
      Understat feed, every value a `HomeTeam` in the real `I1` file, both sets exactly
      twenty with nothing left over. Keyed by Competition, so a wrong slug resolves
      nothing and raises on the first match.
      _`UNDERSTAT_LEAGUES` gains `SA: "Serie_A"`. The map is read off
      `getLeagueData/Serie_A/2025` and `mmz4281/2526/I1.csv`: twenty titles onto twenty
      `HomeTeam`s, each set exactly twenty with nothing left over on either side._

      _**Both feeds are committed and the test derives from them**, which is the standard
      box 2 met by reading the recorded response and this box did not meet at first: its
      first test listed the twenty Understat names as a literal and asserted the map had
      twenty distinct values, which is the map agreeing with itself. A draft typed wrong
      would have passed. `test/fixtures/understat-2025-26-Serie_A.json.gz` and
      `test/fixtures/football-data-2526-I1.csv.gz` now hold the bytes, and the test
      requires the key set to equal the feed's titles and the value set to equal the
      file's `HomeTeam`s. **Found by review.**_

      _The two fixtures are the **archived bytes**, not a second capture: each gunzips to
      the length and `sha256` the backfill stored, which anyone can re-run:_

      ```sql
      select source, length(body) as bytes, substr(sha256, 1, 12) as sha
        from raw_snapshots
       where source in ('football_data:2025-26:I1', 'football_data:2025-26:I2',
                        'understat:2025-26:Serie_A');
      ```

      _`I1` must read 196,214 bytes and `bafbf14aacd7`, `I2` 190,963 and `88ec21c0bce5`,
      `Serie_A` 543,256 and `741bc56ed7f3` — the length and sha of `gunzip`ping each
      committed fixture. Both CSVs carried the BOM below; the Understat body did not._

      _One byte-level catch on the way: football-data.co.uk serves its CSVs with a UTF-8
      BOM and `fetch`'s `text()` strips it, so a fixture taken with `curl` is three bytes
      longer than the row the backfill stored. Stripped, and each pair now agrees exactly
      — which is the only reason the shas above are a check rather than a coincidence._

      _Mutation-checked: pointing `Verona` at `Hellas Verona` — a plausible "tidy-up" of a
      key, and a value football-data.co.uk does not hold — turns the derivation red. The
      first version of this test stayed green over it._

      _**Resolving the feed's twenty proves only one direction**, and the box asks for
      both: it says nothing about a twenty-first key naming a club Understat never lists.
      The key set is now compared against the titles as a set, which needed the map
      itself exposed — `understatTeamNamesOf`, the read the football-data side already
      has for the same reason. Mutation-checked with a twenty-first key `Bogus`, which
      the resolving form passed. **Found by review.**_

      _Eighteen are the same string on both sides and cannot be wrong. The two that are
      not are `AC Milan`→`Milan` and `Parma Calcio 1913`→`Parma`, and they are the whole
      of what the review was asked to decide on this half._

      _2026-27's promoted three are deliberately absent — Understat lists no 2026-27
      Serie A match yet — and arrive as `unknown Understat team name` at the first
      pre-Season fetch, which is where that failure belongs._

      _`test/fetch-understat-season-xg.test.ts` also moves its **no Understat league**
      case off `SA`, which this box opens, onto `BL1` — the same move ticket 0034 made in
      seven files, for the same reason._
- [x] The football-data.org → football-data.co.uk map is derived the same way from the
      captured response — twenty long official names against twenty stored short ones,
      nothing left over on either side.
      _Every key is a `homeTeam.name` in `football-data-org-2026-27-SA-recorded.json.gz`
      and every value a `HomeTeam` football-data.co.uk stored for 2025-26 — seventeen in
      `I1` and the three promoted clubs in `I2` (Monza, Frosinone, Venezia). Twenty
      against twenty, nothing left over._

      _The test is against the fixture's own bytes rather than a list somebody typed: the
      map's keys must equal the recorded clubs exactly. A dropped club, an invented one,
      or two live names pointed at one stored name all fail there._

      _**Distinctness was not enough on the value side**, and that was the whole claim
      this box makes: twenty distinct values can still include one football-data.co.uk
      has never stored, which is precisely the failure that fails nothing — every club's
      history section reads as though the club had none. `I1` and `I2` are now committed
      too, byte-for-byte the archived snapshots, and each value must be an identity one
      of them holds: seventeen in `I1`, and `Frosinone`, `Monza` and `Venezia` in `I2`.
      **Found by review.**_

      _Mutation-checked: `Torino FC`→`Torino Calcio`, a unique value that no stored row
      carries, leaves the key set and the distinct count untouched and turns the `I1`
      membership count red at sixteen._

      _**Counting seventeen does not say which seventeen**, and a live name pointed at
      the wrong stored club passes a count so long as the wrong club is also in `I1`.
      `Torino FC`→`Verona` is that mutation, and it survived every assertion here — Torino
      would have read Verona's history. The three `I1` names this map leaves behind are
      now required to be exactly the three relegated out of it, `Cremonese`, `Pisa` and
      `Verona`, which turns that mutation red. **Found by review.**_
- [x] Both maps are reviewed and approved by a person **before** the backfill runs, and
      the review records what it was actually asked to decide — which pairs were
      judgement calls, and what rules a swap out.
      _**Reviewed and approved 2026-08-21, before the backfill ran** — the order ticket
      0016's Understat half asked for and did not get._

      _What the review was actually asked to decide. On the live-source half none of the
      twenty is the same string on both sides, so every one is a judgement; nineteen are
      the club with its legal form taken off. The twentieth is the only pair in this
      league that can be got wrong and still read:
      `FC Internazionale Milano`→`Inter`, whose official name ends in the city that is
      the **other** Milan club's stored identity, with `AC Milan`→`Milan` beside it. A
      substring derivation over the stored names finds exactly one ambiguous live name,
      and it is that one._

      _**The join rate is what rules a swap out, not the reading.** A swapped pair
      misaligns every fixture of both clubs and shows as tens of missing joins rather
      than one — `PD`'s 379 of 380 is not a number a mis-mapped club can produce. So the
      question left to a person was the one no arithmetic answers: whether these twenty
      are Serie A's 2026-27 clubs at all._
- [x] `HISTORICAL_COMPETITION=SA` backfills 2025-26 `I1` and `I2` history and the
      Understat xG, every response archived under its own source name before anything is
      read from it, and replayable through the archive fetcher.
      _Run 2026-08-21, both commands concurrently — they share no table, take separate
      connections, and `historical_matches` is cleared by
      `(competition, season, division)` before its insert, so neither can reach the
      other's rows. 380 Serie A results, 380 Serie B, 380 xG rows spanning
      2025-08-23 to 2026-05-24._

      _The counts and the archive, re-runnable without trusting this note:_

      ```sql
      select division, count(*)::int as rows from historical_matches
       where competition = 'SA' and season = '2025-26' group by division;
      select count(*)::int as rows from understat_match_xg
       where competition = 'SA' and season = '2025-26';
      select source, length(body) as bytes, substr(sha256, 1, 12) as sha
        from raw_snapshots where source like 'football\_data:2025-26:I_'
           or source = 'understat:2025-26:Serie_A';
      ```

      _Serie A 380 and Serie B 380; 380 xG rows. `I1` 196,214 bytes and `bafbf14aacd7`,
      `I2` 190,963 and `88ec21c0bce5`, `Serie_A` 543,256 and `741bc56ed7f3` — the first
      and third are byte-for-byte the fixtures box 1 commits._

      _Archived under `football_data:2025-26:I1`, `football_data:2025-26:I2` and
      `understat:2025-26:Serie_A`, each stored before anything was read from it. The
      archive fetcher needed **no edit**: `[A-Z]{1,2}\d` already admits `I1`, and the
      Understat slug pattern already admits an underscore. That is worth a test rather
      than a shrug, because the miss it would produce is the quiet kind — an unreachable
      Understat is a reported outcome, not a failure — so `Serie_A` is now pinned
      alongside `La_liga` and `EPL` in the replay test._
- [x] The join rate between xG and stored results is read and recorded, `PD`'s way: a
      mis-mapped club shows as tens of missing joins, and the number is the check.
      _**380 of 380**, against `PD`'s 379 of 380 — read with `joinXg`'s own key, the UTC
      date of the kick-off and both names through the Understat map. Not one row
      unjoined, so the two sources agree on every date of the Season as well as on every
      club. The two names the map moves are inlined so the query needs nothing but a
      database:_

      ```sql
      with x as (
        select (kicked_off_at at time zone 'UTC')::date as d,
               case home_team when 'AC Milan' then 'Milan'
                              when 'Parma Calcio 1913' then 'Parma'
                              else home_team end as h,
               case away_team when 'AC Milan' then 'Milan'
                              when 'Parma Calcio 1913' then 'Parma'
                              else away_team end as a
          from understat_match_xg
         where competition = 'SA' and season = '2025-26')
      select count(*)::int as xg_rows, count(m.played_on)::int as joined
        from x left join historical_matches m
          on m.competition = 'SA' and m.season = '2025-26'
         and m.division = 'Serie A'
         and m.played_on = x.d and m.home_team = x.h and m.away_team = x.a;
      ```

      _Both columns must read 380. Swapping the two Milan clubs would cost the
      **seventy-four** matches either of them played — 38 each, less the two derbies
      counted twice, counted off the committed `I1` fixture rather than guessed — leaving
      380 and 306. That is the shape a mis-mapped club makes, and why a single unjoined
      row would not be one._

      _This is what rules the Milan swap out. A swapped `Milan`/`Inter` pair misaligns
      every fixture either club played — seventy-four — and would show here as tens of
      missing joins rather than none._
- [x] An `SA` packet rendered from the backfilled record shows history, the league
      table and xG; the contamination test extends to prove it holds no other league's
      rows, both directions.
      _Read whole on 2026-08-21 over the real record: prior-Season base rates across 380
      matches, both clubs' final position and points per game home and away, five form
      lines each carrying shots, shots on target and **xG**, and the head-to-head. The
      live-source spelling resolves — `Udinese Calcio` finds Udinese's history — which is
      the failure mode `PD` shipped and had to come back for._

      _The league table reads "no result has been played yet this Season", correctly: it
      is 2026-27's table and Serie A opens on 22 August. The prior Season is what the
      backfill is for and it is all present._

      _A reading is not re-runnable, but the numbers it printed are. The packet's base
      rates and Udinese's prior-Season points per game come straight out of the stored
      rows:_

      ```sql
      select count(*)::int as matches,
             round(100.0 * avg((home_goals > away_goals)::int), 1) as home_pct,
             round(100.0 * avg((home_goals = away_goals)::int), 1) as draw_pct,
             round(100.0 * avg((home_goals < away_goals)::int), 1) as away_pct,
             round(avg(home_goals + away_goals), 2) as goals
        from historical_matches
       where competition = 'SA' and season = '2025-26' and division = 'Serie A';
      ```

      _380 matches, 38.9% / 26.1% / 35.0%, 2.43 goals — the line the packet prints. The
      same table gives Udinese 1.32 points per game over its 38, which is the figure
      under its name in the reading above._

      _**`npm run dry-run` cannot render this packet yet, and that is ticket 0038's, not
      a fault here.** It walks every source, and Italy's transfer list has no club map, so
      it fails with twenty `unknown SA club spelling` issues before any context prints —
      loudly, which is what that map's absence is supposed to do. The reading above was
      taken by replaying the production record into a temporary cluster through the real
      loader and the real builder, with no production write._

      _The contamination test now carries three leagues. Each new contaminant keeps the
      construction the docblock insists on — it names the clubs of the Competition it is
      trying to reach, in that Competition's own Understat spelling — so `PD` holds a row
      naming Roma and Lazio and `SA` holds one naming Arsenal and Chelsea. Both
      directions: Serie A's own xG lands on its own form line, neither foreign 9.9
      arrives, and the `SA` packet is headed by Serie A's table and neither of the other
      two. Mutation-checked by relaxing the `competition` filter on the xG read, which
      turns it red._
- [x] `MATCH_PROMPTS.SA`'s sha is re-pinned if the table's rendering moved, the
      documented once.
      _**It did not move, and the prediction that it would was the mistake.** Ticket 0034
      wrote that each new pin moves once when the backfill lands. The pin hashes *this
      suite's* render, and a backfill is production data — it cannot reach it. What moved
      `PD`'s pin twice was the **builder**: an empty history section over 842 stored rows,
      then a league table reading `unavailable`. Both were code changes, and both were
      found by reading a real packet._

      _Serie A's divisions were curated before its first render, so there was no such fix
      to make. The real packet was read anyway — that reading is the point, not the
      number — and it says what the pinned render says. `c82e6850` stands._

      _Two comments carried the prediction, not one: the constant's own doc block and the
      one above the pin test. Both are corrected. **Found by review**, which caught the
      second still saying the pin would move — and caught the first version of the
      correction predicting `FL1`'s outcome in the same breath as retracting a
      prediction. It says nothing about `FL1` now; 0037 will read its render._
