# Ticket: The Bundesliga's history and xG land behind reviewed maps

**What to build:** one prior Season of German results and per-match xG stored under `BL1`,
mirroring exactly what the four open leagues hold — behind the two identity maps that
decide whether any of it can be read back. Source:
[opening a Competition](../runbooks/opening-a-competition.md) edit 5 and §2. Decisions:
[ADR-0054](../adr/0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md),
[ADR-0037](../adr/0037-a-new-competition-plays-the-v2-context-minus-availability.md)
(what the packet holds and what the curation costs).

**Blocked by:** 0058 — the divisions and the check constraint must exist before the first
insert, and a backfill without them fails on the first row.

**Status:** ready-for-agent

---

## What is already known

**Two maps, both derived and both reviewed by a person before the backfill runs.**

- *Understat name → football-data.co.uk name*, read out of the league's own Understat
  feed against the stored results' `HomeTeam` column, both sets the same size with nothing
  left over. The league slug is scoped per Competition on purpose: a wrong slug resolves
  every club, complains about nothing, and relabels another league's whole Season of xG
  away, because the writer's key does not carry `competition`.
- *Live-source name → football-data.co.uk name*, football-data.org's long official names
  against what the stored results spell. Without it every club's history section reads
  "none in stored data" over a complete backfill, and nothing fails.

**That second map has no row in the runbook's table.** It appears only in §2, and three
comments in the codebase each call opening a league "one entry" in their own file. The
table grows an eighth row here, so the next reader counts what the change is rather than
finding the gap the way this one was found.

**A name missing from a map fails loudly; a name mapped wrongly fails nothing, ever.** The
clock is not a reason to find that out in a packet.

**What the sources may not have yet.** football-data.co.uk publishes a new Season's files
late and answers a request for one it does not hold by redirecting to a near-miss filename,
which the per-file `Div` check refuses. Understat opens a Season with an empty `dates`, so
a promoted club cannot be mapped until it publishes and arrives as `unknown Understat team
name` at the first pre-Season fetch — which is where that failure is meant to land.
`HISTORICAL_COMPETITION` is required and has no default: the database refuses a Competition
left unset and nothing refuses one that is stated and wrong.

## Acceptance

- [x] Both maps are derived from the real feeds, each pair of sets the same size with
      nothing left over, and reviewed by a person before any backfill runs.

      *Understat name → football-data.co.uk name* (18/18): `getLeagueData/Bundesliga/2025`
      (fetched live, archived byte-for-byte as
      `test/fixtures/understat-2025-26-Bundesliga.json.gz`, 453,761 bytes,
      sha256 `c0a30b3e91fc…`) against `HomeTeam` in `mmz4281/2526/D1.csv`
      (`test/fixtures/football-data-2526-D1.csv.gz`, 159,944 bytes, sha256
      `618301a4b399…`). Seven of the eighteen are the same string on both sides.
      **Unlike the first pass of this ticket claimed, this league is not free of
      hazard pairs** — two share a source-side stem a wrong mapping would still read
      as plausible: `Bayer Leverkusen`/`Bayern Munich` (`Leverkusen`↔`Bayern Munich`,
      the classic German mix-up) and `Borussia Dortmund`/`Borussia M.Gladbach`
      (`Dortmund`↔`M'gladbach`). Both are asserted by name in
      `test/fetch-understat-season-xg.test.ts`, not left to the set arithmetic.

      *Live-source name → football-data.co.uk name* (18/18): `competitions/BL1/matches?season=2026`
      (already committed as `test/fixtures/football-data-org-2026-27-BL1-recorded.json.gz`
      by ticket 0057) against `D1` (fifteen stayers) and
      `D2` (`test/fixtures/football-data-2526-D2.csv.gz`, 157,989 bytes, sha256
      `8bfb275286d7…`; three promoted — Schalke 04, Paderborn, Elversberg). The same
      two hazard pairs recur here in their long official spelling
      (`Bayer 04 Leverkusen`/`FC Bayern München`, `Borussia Dortmund`/
      `Borussia Mönchengladbach`), asserted by name in
      `test/fetch-football-data-season.test.ts`. `1. FC Köln`/`1. FC Union Berlin`
      share the weaker `1. FC` stem but resolve to unrelated cities, so a swap there
      is caught on sight rather than needing its own assertion.

      Both tables were shown to the user for review before any code was written or the
      backfill ran; approved 2026-08-27. The stem-hazard miss above was caught by a
      Standards review after that approval and fixed in the same sitting — the map
      values themselves did not change, only what the comments and tests say about
      them.

- [x] The prior Season's results and per-match xG are stored under `BL1`, and the counts of
      each are recorded in this ticket the way Serie A's and Ligue 1's were.

      `HISTORICAL_COMPETITION=BL1 HISTORICAL_SEASON=2025-26 npm run fetch:history` and
      `fetch:xg-history` run by the user 2026-08-27 against `DATABASE_URL` — the
      production Supabase pooler; there is no other `DATABASE_URL` for this project's
      backfill scripts to write to, and this ticket does not pretend otherwise. Counts
      below read from that same database, 2026-08-27:

      ```sql
      select division, count(*)::int as rows from historical_matches
       where competition = 'BL1' and season = '2025-26' group by division;
      select count(*)::int as rows from understat_match_xg
       where competition = 'BL1' and season = '2025-26';
      ```

      612 `historical_matches` rows (306 `Bundesliga`, 306 `2. Bundesliga`) and 306
      `understat_match_xg` rows.

- [x] A real packet is read whole over the stored rows: the league table renders, every
      club's history section resolves, and the xG join rate is stated rather than assumed.

      Read directly against the production historical/xG rows with a synthetic `asOf`
      past the 2025-26 Season's close (`loadMatchContextData` itself needs a `BL1`
      Gameweek row, which does not exist yet — activation is ticket 0060's job, not this
      one's, so `context:show` cannot do this read either). Bayern Munich renders 1st,
      Dortmund 2nd, RB Leipzig 3rd in the 2025-26 table.

      Two checks, not one club spot-checked twice: a live-source-spelling check (Bayern
      Munich v RB Leipzig, FC Koln v Union Berlin — both `D1` clubs, both resolve full
      prior-Season position, base rates, last-five form and head-to-head with real
      shots/xG lines) and a **promoted-club** check, which the first pass of this ticket
      got wrong by using Wolfsburg — a club *relegated out of* `D1`, not promoted into
      the current roster, so it proves nothing about the `D2` half of the map. Re-run
      against Paderborn v Elversberg, both actually promoted for 2026-27: both render
      `Bundesliga history: none in stored data; promoted from the 2. Bundesliga` and
      `promoted: yes`, with five `2. Bundesliga` form lines each — the Championship's
      shape for `PL`, on `D2`'s terms. Their xG lines correctly read `unavailable`:
      Understat's `Bundesliga` feed covers only the top flight, the same known gap
      Ligue 1's Le Mans has for `Ligue 2`.

      Base rates, read the same way:

      ```sql
      select count(*)::int as matches,
             round(100.0 * avg((home_goals > away_goals)::int), 1) as home_pct,
             round(100.0 * avg((home_goals = away_goals)::int), 1) as draw_pct,
             round(100.0 * avg((home_goals < away_goals)::int), 1) as away_pct,
             round(avg(home_goals + away_goals), 2) as goals
        from historical_matches
       where competition = 'BL1' and season = '2025-26' and division = 'Bundesliga';
      ```

      306 matches, 43.8% / 24.5% / 31.7%, 3.24 goals — the line the packet prints.

      The xG join rate is **306 of 306** — every stored `D1` result pairs with an
      Understat row (joined on UTC kick-off date and both names through the map, the
      same key `joinXg` uses), every score agrees, every date agrees. No date-drift tail
      like Ligue 1's eight: Understat files each Bundesliga kick-off at its real slot
      rather than one nominal time per matchday, checked pair-by-pair over the whole
      Season (`test/fetch-understat-season-xg.test.ts`, "agrees with Understat on every
      Bundesliga result and date").

- [x] The runbook's table lists the live-source → football-data.co.uk map as its own row.

      `docs/runbooks/opening-a-competition.md` §1 grows an eighth row
      (`src/football-data/team-identity.ts` — `BY_COMPETITION`), and §2's own bullet for
      that map now cross-references it as edit 8.
