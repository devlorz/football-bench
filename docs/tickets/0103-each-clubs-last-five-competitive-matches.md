# Ticket: Each club's last five competitive matches

**What to build:** with `UCL` listed, the daily fetch reads 365Scores' results listing
for each of the cup's 36 sides and stores every settled match in `club_results`, apart
from friendlies. Each stored row keeps the competition's name as 365Scores gives it. A
`UCL` packet shows, for each side, its five most recent competitive matches before the
Lock, newest first. Each line gives the date, the competition, both sides and the score,
and scores only. A side with fewer than five stored matches shows what exists and says
so. `UCL`'s registry entry names the 365Scores club results for its history, and the
after-first-deadline guard asks this table for it. That name joins the `history` union
in this ticket, not before (ticket 0099), and names the source only, as
`"football-data.co.uk"` and `"365scores"` do — not the table.

Source: ADR-0063 *History*, spec 0028 stories 27–34 and 49–52.

Decisions it must not bend:
- ADR-0063: friendlies excluded, scores only on every line, FotMob not opened.
- ADR-0093: no row after the Lock reaches a packet.
- ADR-0057: a cup's history is not a Division's.

**Blocked by:** 0100 (the cup's sides are read off its stored Fixtures). **May be cut**
for `UCL` at 2026-10-13T06:00Z. If it is not green by then, ticket 0105 states the
section absent for `UCL`'s whole league phase, and this ticket carries on for `UEL` and
`UECL`.

**Status:** built 2026-10-13; its last box was ticked by 0105. `UCL`'s registry names `"365scores"`
for its history. `fetchClubResults` reads one page for each of the 36 sides from a
reviewed competitor-id map. Each page is read into rows whole before any row is written,
then upserted into `club_results` from 2026-07-01 forward (spec 0028). Friendlies are
dropped by a reviewed list of names: `Club Friendlies`, `Emirates Cup` and
`Joan Gamper Trophy`. 365Scores' competition metadata has no field that marks a
friendly. A match with a `-1` score (Postponed) is not settled. A page holding a game
under a competition id it does not name is refused whole. A side whose page fails is
named at the end of the run, and every other side is still stored. The guard asks
`club_results` for a match the cup's own sides kicked off since the Gameweek 1 deadline.
The packet section is `buildClubResultsContext`, which the registry chooses in
`buildMatchContext`. The dry-run replay reads a results URL back to its archived name.
The archive is `test/fixtures/365scores-UCL-club-results-recorded-2026-10-12.json.gz`:
the standings plus 36 pages.

The Gameweek 2 box stays unticked. `UCL` cannot render until 0105 adds its
`MATCH_PROMPTS` entry, so the section is proven through the loader, the builder and a PL
packet with `history` swapped. Walk it in 0105's render. Left open: `previousPage` is
not followed. Every `UCL` side had 12 or more competitive matches on one page. Re-check
this for `UEL` and `UECL` in 0107 and 0108. The same goes for `FRIENDLIES`: it holds only
the names in today's archive, and a friendly under a name not on it is stored as
competitive without an error, such as a winter-break tournament or a pre-season cup at a
`UEL`/`UECL` club. Re-check it against the `UEL` and `UECL` archives, and again in
January.

A cup opponent is stored under the record's spelling, not 365Scores'. The same
`source_match_id` is upserted from both sides' pages, so the two spellings would
otherwise overwrite each other. ADR-0063 is amended to say so (2026-10-13).
---

## What is already known

- **Endpoint**: `webws.365scores.com/web/games/results/?…&competitors=<id>`, with the same
  common parameters as the stats fetch.
  - One page held 29 matches for Levski, reaching back to April.
  - Read 2026-10-12: all 108 league-phase clubs answered. 107 had a settled match on
    10-09 to 10-11. Atalanta's latest is 09-20, which is real: no fixture since then,
    and football-data.org agrees.
  - Read one page. Follow `previousPage` only if a side comes back short of five
    competitive matches.
- **A competitor-id map**, UEFA side → 365Scores competitor id, for the 36 `UCL` sides.
  It is derived from the archived standings response (`web/standings/?competitions=572`
  lists all 36 with ids) joined through ticket 0101's name map. A club is never matched
  by a search.
- **Friendlies** are named "Club Friendlies" in the listings read and are dropped at the
  fetch, by competition name.
- **Opponents are stored as 365Scores spells them.** Only the cup's own sides are mapped.
- **The cup's own matches are already in the listing** (Levski's UEL `MD1` was there), so
  the renderer merges nothing from `fixtures`. A cup Fixture appears on a history line
  as a score, and in the played-Fixtures section with its figures.
- **The renderer parallels the internationals renderer and does not extend it.** That one
  carries `neutral`, the dataset-date line and a dedupe against `fixtures`, and none of
  the three applies here.
- About 0.4 s between requests, and 36 requests a day for `UCL`.

## Acceptance criteria

- [x] Over archived listings, the fetch stores each side's settled matches, drops friendlies, and upserts by match id without duplicating on a re-read.
- [x] A side missing from the competitor-id map is refused by name; one club's failed listing fails `UCL`'s day by name and no other Competition's.
- [x] A `UCL` Gameweek 2 packet shows five lines a side, newest first, competition named, scores only, nothing after the Lock.
- [x] A side with three stored matches shows three and says the list is short.
- [x] No cup row reaches a league packet and no league row reaches a cup packet (the coexistence tracer).
- [x] The competitor-id map test derives 36 pairs from the archive with nothing left over.
