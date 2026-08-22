# Ticket: The two real responses are captured

**What to build:** the real `competitions/SA/matches` and `competitions/FL1/matches`
responses for 2026-27, captured off the wire, archived in `raw_snapshots` under their own
source names, and joined to the recorded test fixtures — so that every identity map this
expansion needs is derived from the live source's own spellings, and the parser is proven
against the bytes the API really returns. Source:
[spec 0024](../../specs/0024-serie-a-and-ligue-1-open.md), stories 8 and 21. Decisions:
[ADR-0049](../../adr/0049-serie-a-and-ligue-1-open-the-bundesliga-waits-on-hands-not-money.md),
[ADR-0036](../../adr/0036-a-new-competitions-schedule-results-and-lock-come-from-football-data-org.md).

Spec 0016's lesson, learned twice: a constructed fixture carried twelve wrong clubs of
twenty, and a map drafted from it would have been "a guess wearing a fixture's clothes".
The captures come first because everything human-reviewed downstream reads them.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] Both responses are captured from the live API and archived under their own
      source names, whole and before validation, replayable like every other source.
      _Captured 2026-08-21, both HTTP 200 off `competitions/<code>/matches?season=2026`
      with the live token: `SA` 358,215 bytes, `FL1` 291,346 bytes, kept whole as they
      arrived. **Replayable needed no code**: `archive-replay-fetcher`'s
      `FOOTBALL_DATA_ORG_URL` already reads `([A-Z0-9]+)`, so both codes translate to
      `football_data_org:2026-27:SA` and `:FL1` — the same `sourceName` the fetch writes
      under. The `SP1` two-character bug spec 0016 ticket 6 found cannot recur here._

      _Both archived in production 2026-08-21 through `storeRawSnapshots` — the same
      function and the same transaction the daily fetch uses, so this is the insert path
      the record already trusts and not a hand-written row. `football_data_org:2026-27:SA`
      at 358,215 bytes (sha `973bc09eb3cf`) and `:FL1` at 291,346 (sha `d98de691cd57`),
      the captured byte counts exactly._

      _**A first pass deferred this to activation and was wrong to**, which review caught.
      The argument for deferring was that the first daily fetch after each `competitions`
      row makes the same insert anyway. It does — but not with **these** bytes: a later
      fetch archives a later day's response, and today's are only in the test fixtures,
      which the dry run does not read. Spec 0024 story 27 wants `COMPETITION=SA npm run
      dry-run` green against archived snapshots **before** each league's first Lock, and
      deferring left that with no margin — insert, fetch, dry run, Lock, in that order and
      no other. Archived now, 0039 and 0040 can rehearse the whole write path before the
      `competitions` row exists._

      _Archived from the committed fixtures rather than a second live request, so the rows
      hold the audited bytes and the step is repeatable from a clean checkout with no
      token. The insert was run by the operator and both rows read back at the time; the
      standing check is that the stored `sha256` equals the fixture's, which anyone can
      re-run without trusting this note:_

      ```sql
      select source, length(body) as bytes, sha256 from raw_snapshots
       where source in ('football_data_org:2026-27:SA', 'football_data_org:2026-27:FL1');
      ```

      _`SA` must read 358,215 bytes and `973bc09eb3cf…`, `FL1` 291,346 and `d98de691cd57…`
      — the sha of `gunzip`ping each committed fixture._
- [x] Both join the recorded test fixtures, and a parser test asserts each league's whole
      Season parses — 380 Serie A matches over 38 Gameweeks, 306 Ligue 1 matches over 34.
      _`test/fixtures/football-data-org-2026-27-SA-recorded.json.gz` and
      `-FL1-recorded.json.gz`, read through `archivedBody` from a table of both leagues and
      asserted at `parseFootballDataOrgMatches` — the seam `PD`'s recorded response is
      already tested at. Both counts are the published shape exactly: Serie A ten Fixtures
      in each of 38 Gameweeks, Ligue 1 nine in each of 34. Nothing constructed can make that
      claim, which is the whole point of the box._
- [x] The day-one live-source checks pass for both leagues: no null matchday (or the
      withdrawn set handled where there is one), kickoff timestamps timezone-sound
      against the published slots, and any deferred opening Fixtures noted with their
      round numbers.
      _Every claim below is **asserted, not just recorded** — the audit is one table-driven
      test over both Competitions. A first pass wrote these numbers into this file while
      testing only the counts, so the file claimed more than the suite held. **Found by
      review.**_

      _**A second pass found three of the assertions still weaker than the sentence above
      them**, and they were strengthened rather than the sentence narrowed,
      because the claims were true and merely unpinned. The score check read `home` alone,
      so a response settling one side only would have passed it; it now reads both sides of
      every match. `resultSet.played` was quoted here and asserted nowhere, so the
      envelope's own statement that the Season has not started is now held against the
      match list it describes. And "no deferred opener" was tested as "before Gameweek 2",
      which a Fixture held to 26 August would have satisfied — Gameweek 1 now has to occupy
      exactly the dates named. All three were mutation-checked against the recorded bytes:
      a non-null away score, a non-zero `played`, and a Gameweek 1 Fixture moved to 26
      August each fail the test, and the fixture was restored byte-identical afterwards.
      Those mutations were a one-off check while the assertions were being written, not a
      standing gate — nothing in the repo re-runs them, and this note is the only record
      that they were made. **Found by review.**_

      _**No `matchday` is null**, on any of the 380 or any of the 306, and **no status is
      withdrawn** — Serie A reads 50 `TIMED` and 330 `SCHEDULED`, Ligue 1 40 and 266. So
      neither the ADR-0024 `null` path nor `WITHDRAWN_STATUSES` is exercised by either
      response, and the box's parenthesis has nothing to handle. Nothing has settled:
      `played: 0` on both, every `fullTime` null, which is the state a first fetch of a
      Season has and the state the Lock guard reads._

      _**Timezone-sound.** Italy and France are UTC+2 in August. Serie A's kickoffs read
      16:30Z and 18:45Z — 18:30 and 20:45 local, the two published Serie A slots. Ligue 1's
      read 13:00Z, 15:15Z and 18:45Z — 15:00, 17:15 and 20:45 local, the three published
      Ligue 1 slots. No third value appears in either league's Gameweek 1 — asserted as the
      exact slot set, so a response an hour out would parse and still fail._

      _**No deferred opening Fixtures, in either league** — the shape `PD` had and these do
      not. Serie A's `matchday` 1 is ten Fixtures across 22–24 Aug and `matchday` 2 opens 28
      Aug; Ligue 1's is nine across 21–23 Aug with `matchday` 2 opening 28 Aug. Every opener
      sits inside its own weekend, so Gameweek 1 does not span thirteen days the way La
      Liga's did and `deriveDeadline` has the ordinary case to work on. Asserted as the
      property rather than the prose: every Gameweek 1 kickoff precedes Gameweek 2's
      earliest, which a Fixture held back to late August would sort past._

      _Worth carrying to the activation tickets: **Ligue 1's Gameweek 1 kicks off
      2026-08-21T18:45Z**, which is the day of capture. Its Lock is ninety minutes earlier
      and has passed. Ligue 1 opens at whichever Gameweek is still open at activation
      (spec 0024 story 25), not at 1._
- [x] Each league's twenty (Serie A) and eighteen (Ligue 1) club names are extracted and
      recorded where the map tickets can read them.
      _Extracted from the captured responses' own `homeTeam.name`/`awayTeam.name`, which is
      the spelling `fixtures` will carry and therefore the spelling tickets 0036, 0037 and
      0038 must key their maps by._

      _**Both lists are asserted in full in the test**, not merely counted, after review
      pointed out they were pinned in this ticket's prose and nowhere a machine reads. A
      count catches a club that vanished; nothing catches one that is misspelt, and a
      misspelt key is precisely the failure those maps have no alarm for — renaming
      `FC Internazionale Milano` to `Inter Milan` across all 38 of its Fixtures leaves the
      count at twenty and now fails the test. The list below is the readable copy; the
      fixture is the source of truth and the test is what holds them together._

      _**Serie A, twenty:** AC Milan, AC Monza, ACF Fiorentina, AS Roma, Atalanta BC,
      Bologna FC 1909, Cagliari Calcio, Como 1907, FC Internazionale Milano, Frosinone
      Calcio, Genoa CFC, Juventus FC, Parma Calcio 1913, SS Lazio, SSC Napoli, Torino FC,
      US Lecce, US Sassuolo Calcio, Udinese Calcio, Venezia FC._

      _**Ligue 1, eighteen:** AJ Auxerre, AS Monaco FC, Angers SCO, ES Troyes AC, FC
      Lorient, Le Havre AC, Le Mans FC, Lille OSC, OGC Nice, Olympique Lyonnais, Olympique
      de Marseille, Paris FC, Paris Saint-Germain FC, RC Strasbourg Alsace, Racing Club de
      Lens, Stade Brestois 29, Stade Rennais FC 1901, Toulouse FC._

      _Both carry the legal form the way `PD`'s did, so both maps will be judgement on
      nearly every line rather than transcription — and both hold a near miss the review
      has to be pointed at: Serie A's two Milan clubs (`AC Milan`, `FC Internazionale
      Milano`) and Ligue 1's two Paris clubs (`Paris FC`, `Paris Saint-Germain FC`). As
      with `PD`'s two `Ath`s, the join rate is what rules a swap out — a swapped pair
      misaligns every Fixture of both clubs, which shows as tens of missing joins rather
      than one._
