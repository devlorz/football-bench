# Ticket: A club cup's history lines carry their sheets' figures

**What to build:** in a `UEL` or `UECL` packet, each line of a side's five most recent
competitive matches carries the shots, shots on target and xG that match's 365Scores
sheet holds, in the played-Fixtures section's own wording.
- A sheet with shots and no xG shows its shots beside "xG unavailable".
- A match with no sheet stored shows its score alone and says nothing more.
- A `UCL` packet is unchanged: its history lines print scores only, even when a shared
  row carries figures read for another cup.

The daily fetch reads the sheets:
- once a match is a day old;
- once per match, however many cups need it;
- only for rows touching a side of a Competition whose packet renders figures;
- a sheet without xG is final, and a failed request is read again the next day.

Source:
[ADR-0063](../adr/0063-the-three-uefa-club-cups-open-at-their-league-phases-second-matchday.md)
*Amendment: the Europa and Conference Leagues' history lines carry their sheets'
figures*, and [spec 0028](../specs/0028-the-uefa-club-cups-open.md) stories 50–50h and
the `club_results` and history-renderer decisions.

Decisions it must not bend:
- ADR-0026: `match-ucl/2026-27-v1` is frozen and used. No byte of a `UCL` render moves.
- ADR-0058: the wording of a hole ("xG unavailable"), and the Nations League's rule
  that a dataset line says nothing where no sheet was read.
- ADR-0093: nothing stored after the Lock reaches a packet.
- The policy-from-data rule: whether a Competition's history lines show figures is a
  per-Competition constant, never a flag.

**Blocked by:** 0103 (done). **Blocks 0107 and 0108.**

**Cut lines** (ADR-0063, spec story 50h):
- for `UEL`, green by **2026-10-15T06:00Z**, or `match-uel/2026-27-v1` pins scores-only;
- for `UECL`, green by **2026-10-22T03:45Z**, on the same terms.

Each cup's miss is its own.

**Status:** done, with two boxes moved to 0107 (green 2026-10-13T12:07Z, targeted suites)

---

## What is already known

- **Migration 0051** adds to `club_results`:
  - nullable `home_shots`, `away_shots`, `home_shots_on_target`, `away_shots_on_target`,
    `home_xg` and `away_xg`, with the same checks as `team_match_stats`;
  - the instant the sheet was read (nullable).

  A row with the instant and no xG has been read and found empty, which is final. A row
  with no instant has never been read. A migration is five filename-list edits across
  two suites. Run `rehearse-migration.test.ts` by name, because targeted runs never find
  it. The operator applies 0051 on production after `db:rehearse`, before `UEL`'s
  insert.
- **The sheet** is `webws.365scores.com/web/game/stats/?…&games=<id>`, the endpoint the
  stats fetch already reads, keyed by the same `source_match_id` `club_results` stores.
  - The figures are "Total Shots", "Shots On Target" and "Expected Goals", per side.
  - The sheet's home/away order is the listing's order. Map by competitor id, not by
    position, and refuse a sheet whose sides do not match the row's.
  - Archive each sheet before validating it, as every source does.
- **What 365Scores holds.** Read 2026-10-12/13, one club each on its latest league
  match:
  - xG present: the five leagues, Portugal and Israel.
  - xG absent (a sheet of 14–90 rows without the line): Czech, Slovak, Ukrainian,
    Azerbaijani, Belgian, Norwegian, Greek, Austrian, Bulgarian, Cypriot and Armenian.
  - A UEFA match's sheet carries xG for every club: 36 of 36 for `UCL` and `UEL` `MD1`.
- **Eligibility** is read off the data:
  - a row touches a side of a listed Competition whose registry `history` is the
    365Scores club results;
  - and whose figures constant says yes;
  - and whose match kicked off at least a day before the fetch's clock;
  - and whose sheet instant is null.

  `UCL`'s constant says no, so a `UCL`-only row is never read. A row shared by a `UCL`
  side and a `UEL` side is read for `UEL`.
- **The renderer** gains the per-Competition constant beside the bands line:
  - `UCL` no, `UEL` yes, `UECL` yes;
  - the figures reuse the played-Fixtures section's wording, built by the same code
    that renders it (the Nations League path), so a hole and a full sheet read the same
    in both sections;
  - a `UCL` render must be byte-identical to today's with or without figures on its
    rows. The `UCL` pin test plus a new `UCL` packet test over an enriched row prove it.
- **Request budget.**
  - The first read is about 180 sheets a cup at 0.4 s spacing, the results fetch's
    `pause`.
  - After that, about fifty a week per cup.
  - The dry-run replay must map the sheet URLs to their archived names, as ticket 0103
    did for the listings.
- **Precedent**: ADR-0058's 2026-09-23 amendment and `stats:backfill`, which put sheet
  figures on the Nations League's dataset lines. Read how those lines render a missing
  sheet before writing this one's.

## Acceptance criteria

- [x] Migration 0051 adds the seven columns. The schema test holds their checks, all five filename lists name it, and the rehearsal passes when run by name.
- [x] Over archived sheets, the fetch stores figures for a day-old row, and stores a sheet without xG as read with null xG and does not request it again.
- [x] A failed sheet request leaves the row unread, and the next day's fetch reads it.
- [x] A row younger than a day is not read.
- [ ] A row shared by a `UCL` side and a `UEL` side is read once. A `UCL`-only row is never read. *Moved to 0107: needs `UEL`'s maps and registry entry. The `UCL`-only half is proven here through `runDailyFetch`.*
- [x] A sheet whose sides do not match its row is refused by name. The Competition's day fails by name, and other Competitions land.
- [ ] A `UEL` packet shows figures on a line whose sheet has them, shots and "xG unavailable" where it has no xG, and the score alone where no sheet is stored. Nothing observed after the Lock appears. *Moved to 0107: needs `UEL`'s maps and registry entry. Proven here at the renderer only (`test/build-club-results-context.test.ts`).*
- [x] A `UCL` packet over a row enriched for `UEL` prints the score alone. `match-ucl/2026-27-v1` and every other pin are unchanged.
- [x] The dry-run replay maps the sheet URLs.
- [x] The ticket records the time it went green against each cup's cut line.

## Outcome

Green 2026-10-13T12:07Z: ahead of `UEL`'s cut line (2026-10-15T06:00Z) by about 42
hours and `UECL`'s (2026-10-22T03:45Z) by about eight and a half days.

- `fetchClubResultSheets` (`src/365scores/fetch-club-results.ts`) is tested over `UCL`'s
  archived sheets, because `UEL` and `UECL` have no competitor-id or name map until
  0107 and 0108. The daily fetch calls it only where `historyCarriesFigures` says yes,
  and the registry's `history` for `UEL` and `UECL` is still null. So no sheet is read
  in production until 0107 or 0108 names that source.
- "Read once" is `sheet_read_at`: whichever cup reads a row first marks it, and every
  cup skips a marked row. The two boxes that need `UEL` end to end moved to 0107
  word for word, with two more from the review: the guard inside
  `fetchClubResultSheets`, and other Competitions landing at `runDailyFetch` level.
  The guard could not move here: the function names a sheet's non-cup side through
  `storedTeamName`, which throws for a cup without a name map, so a `UEL` call has
  nothing to run on until 0107 reviews that map.
- The dry-run replay needed no change. Sheets are archived as
  `365scores:<season>:<cup>:stats:<id>`, an ending the replay already maps.
- A sheet's sides are named the way `fetchClubResults` names a listing's: a cup side
  by competitor id, anyone else through the cup's name map. A sheet that disagrees
  with its row is refused by source name.
