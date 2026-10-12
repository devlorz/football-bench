# Ticket: Each club's last five competitive matches

**What to build:** with `UCL` listed, the daily fetch reads 365Scores' results listing
for each of the cup's 36 sides and stores every settled match in `club_results`, apart
from friendlies. Each stored row keeps the competition's name as 365Scores gives it. A
`UCL` packet shows, for each side, its five most recent competitive matches before the
Lock, newest first. Each line gives the date, the competition, both sides and the score,
and scores only. A side with fewer than five stored matches shows what exists and says
so. `UCL`'s registry entry names the 365Scores club results for its history, and the
after-first-deadline guard asks this table for it.

Source: ADR-0063 *History*, spec 0028 stories 27–34 and 49–52.

Decisions it must not bend:
- ADR-0063: friendlies excluded, scores only on every line, FotMob not opened.
- ADR-0093: no row after the Lock reaches a packet.
- ADR-0057: a cup's history is not a Division's.

**Blocked by:** 0100 (the cup's sides are read off its stored Fixtures). **May be cut**
for `UCL` at 2026-10-13T06:00Z. If it is not green by then, ticket 0105 states the
section absent for `UCL`'s whole league phase, and this ticket carries on for `UEL` and
`UECL`.

**Status:** ready-for-agent

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

- [ ] Over archived listings, the fetch stores each side's settled matches, drops friendlies, and upserts by match id without duplicating on a re-read.
- [ ] A side missing from the competitor-id map is refused by name; one club's failed listing fails `UCL`'s day by name and no other Competition's.
- [ ] A `UCL` Gameweek 2 packet shows five lines a side, newest first, competition named, scores only, nothing after the Lock.
- [ ] A side with three stored matches shows three and says the list is short.
- [ ] No cup row reaches a league packet and no league row reaches a cup packet (the coexistence tracer).
- [ ] The competitor-id map test derives 36 pairs from the archive with nothing left over.
