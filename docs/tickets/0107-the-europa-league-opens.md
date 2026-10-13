# Ticket: The Europa League opens

**What to build:** `UEL` opens at its Gameweek 2 (Lock 2026-10-15T15:15Z) with every
section of ADR-0063's packet: table and bands, played Fixtures with xG, five recent
matches, Head Coach lines, and the Squad Changes absence. It does not inherit any cut
`UCL` took. It has its three reviewed maps: 365Scores names, competitor ids and article
titles. Its registry entry names every source, and `match-uel/2026-27-v1` is pinned from
a render read whole. It is activated by the runbook's *Opening a club cup*.

Source: ADR-0063, spec 0028 stories 59, 61, 75–80.

**Blocked by:** 0106 (the runbook), 0103 and 0104 (both sources green), and 0111 (history
lines carry their sheets' figures; ADR-0063 as amended 2026-10-13). If 0111 is not green by
2026-10-15T06:00Z, this ticket pins scores-only history lines and proceeds. Migration 0051
is applied on production after `db:rehearse` and before `UEL`'s insert.

**Hard deadline:** pinned and deployed by 2026-10-15T09:15Z. The fallback is Gameweek 3,
Lock 10-22T15:15Z.

**Status:** ready-for-agent

---

## What is already known

- `UEL` `MD1` was read 2026-10-12: 18 of 18 sheets carry xG for both sides.
- Its 36 sides cover 22 countries, 12 of them clubs in the five leagues. 365Scores'
  spellings were not compared for `UEL`, because the listing request timed out on the
  first try. Derive the map from the archive like `UCL`'s.
- Head Coach acceptance includes Lech Poznań (Frederiksen) and Viktoria Plzeň (Kováč).
- The pre-flight is paid: eight calls, roughly $0.30, and asked for separately.
- **From 0103**: club results read one page a side, and `previousPage` is not followed.
  Check that every side has five competitive matches on its page. `FRIENDLIES` in
  `src/365scores/fetch-club-results.ts` holds only the names in `UCL`'s 2026-10-12
  archive. Check this cup's archive for friendlies under other names, and check again
  in January for winter-break tournaments.

## Acceptance criteria

- [ ] The three `UEL` maps are derived from the archive with nothing left over.
- [ ] A `UEL` Gameweek 2 render holds every section, with history lines carrying their sheets' figures (or scores only, if 0111 missed its cut, recorded here); `MATCH_PROMPTS.UEL` is pinned; every other pin unchanged.
- [ ] The dry run over the hand-run first fetch shows `MD1` adopted with 18 sheets.
- [ ] Production answers `UEL` with eight seats and its caveat; the boundary is recorded.
