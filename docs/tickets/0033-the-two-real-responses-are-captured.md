# Ticket: The two real responses are captured

**What to build:** the real `competitions/SA/matches` and `competitions/FL1/matches`
responses for 2026-27, captured off the wire, archived in `raw_snapshots` under their own
source names, and joined to the recorded test fixtures — so that every identity map this
expansion needs is derived from the live source's own spellings, and the parser is proven
against the bytes the API really returns. Source:
[spec 0024](../specs/0024-serie-a-and-ligue-1-open.md), stories 8 and 21. Decisions:
[ADR-0049](../adr/0049-serie-a-and-ligue-1-open-the-bundesliga-waits-on-hands-not-money.md),
[ADR-0036](../adr/0036-a-new-competitions-schedule-results-and-lock-come-from-football-data-org.md).

Spec 0016's lesson, learned twice: a constructed fixture carried twelve wrong clubs of
twenty, and a map drafted from it would have been "a guess wearing a fixture's clothes".
The captures come first because everything human-reviewed downstream reads them.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Both responses are captured from the live API and archived under their own
      source names, whole and before validation, replayable like every other source.
- [ ] Both join the recorded test fixtures, and a parser test asserts each league's whole
      Season parses — 380 Serie A matches over 38 Gameweeks, 306 Ligue 1 matches over 34.
- [ ] The day-one live-source checks pass for both leagues: no null matchday (or the
      withdrawn set handled where there is one), kickoff timestamps timezone-sound
      against the published slots, and any deferred opening Fixtures noted with their
      round numbers.
- [ ] Each league's twenty (Serie A) and eighteen (Ligue 1) club names are extracted and
      recorded where the map tickets can read them.
