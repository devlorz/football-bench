# Ticket: The Champions League's schedule, Locks and results come from UEFA's league phase

**What to build:** with `UCL` listed, the daily fetch lands the 144 league-phase
Fixtures from UEFA's feed in eight Gameweeks:
- each Lock is derived as the earliest kickoff minus ninety minutes;
- each Fixture is stored under the group `League`;
- `MD1`'s 18 played Fixtures are settled at the ninety-minute score and adopted as
  Locked history with no Prediction;
- the qualifying rounds, which share the names `MD1`/`MD2` in the same feed, are skipped
  and never become Gameweeks.

The same fetch knows `UEL` and `UECL` (UEFA ids 14 and 2019), with `UECL` mapped over
six matchdays. `UNL` reads exactly what it reads today, and still refuses a matchday
outside its six.

Source: ADR-0063 *The decision* (first block), spec 0028 stories 10–20.

Decisions it must not bend:
- ADR-0036: derived deadline, attachment by kickoff, the withdrawn path; no hand-set Lock.
- ADR-0057: `ABANDONED` is withdrawn, and the result is `score.regular`.
- ADR-0015: mid-Season adoption.

**Blocked by:** 0099. **On the `UCL` critical path.**

**Status:** done, 2026-10-12. Each UEFA Competition has an entry in `src/uefa/fetch-competition.ts` with its id, the one round it is read in (none for `UNL`, whose knockouts are refused rather than skipped) and its matchday count. The recordings are `test/fixtures/uefa-2026-27-{UCL,UEL,UECL}-recorded-offset-*.json.gz`.

---

## What is already known

- Read 2026-10-12 (recorded responses to be archived into `test/fixtures`, gzipped):
  - `UCL`: 234 matches (144 `League Phase` + 90 qualifiers).
  - `UEL`: 224 (144 + 80).
  - `UECL`: 366 (108 + 258).
  - Paging is 100 a page, so `UCL` and `UEL` take three pages and `UECL` four.
- The league phase is `round.metaData.name = "League Phase"`, `round.phase =
  "TOURNAMENT"`. Every league-phase match carries `group.metaData.groupName = "League"`.
  The qualifiers' matchday names are `MD1`, `MD2`, `MD1 - PO` and `MD2 - PO`.
- **The filter skips; the map refuses.** A match from any other round is skipped,
  silently, because the qualifiers have been in the feed since July. A `League Phase`
  match whose matchday is outside its Competition's map is refused by name.
  `UNL`'s feed has no other rounds, and its map and refusal are unchanged.
- **The map is per Competition**: `UCL`/`UEL` `MD1`–`MD8`, `UECL` `MD1`–`MD6`,
  `UNL` `MD1`–`MD6`. Gameweek *n* is matchday *n*.
- Clocks: `UCL` `MD2` first kickoff 2026-10-13T16:45Z, so its Lock is 15:15Z. `MD8`'s 18
  Fixtures all kick off 2027-01-27T20:00Z.
- The adoption path has not yet been used for a UEFA-sourced Competition (`UNL` opened
  before its `MD1`). The daily-fetch test is where this is first shown.

## Acceptance criteria

- [x] Over the archived `UCL` feed, the daily fetch stores 144 Fixtures in Gameweeks 1–8, each Fixture with group `League`, and no qualifier.
- [x] Gameweek 1 is Locked with its 18 Fixtures settled at the ninety-minute score; Gameweek 2's Lock is 2026-10-13T15:15Z.
- [x] A `League Phase` match with a matchday outside the map is refused by name; a match from any other round is skipped.
- [x] `UECL`'s map stops at `MD6` and `UEL`'s at `MD8`, proven over their archived feeds.
- [x] `UNL`'s fetch tests pass unchanged, including the refusal of `MD7`.
- [x] With `UCL` listed beside `PD` and `UNL`, each reaches what it reaches today, and a `UCL` failure is named while the others land.
