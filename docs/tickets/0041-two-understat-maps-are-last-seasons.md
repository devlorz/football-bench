# Ticket: Two Understat maps are last Season's

**What to build:** Serie A's and Ligue 1's Understat identity maps carry the clubs playing
in 2026-27, not the ones that played in 2025-26, so the daily fetch stores their
current-Season xG instead of refusing it. Source:
[spec 0024](../specs/0024-serie-a-and-ligue-1-open.md) story 9. Decisions:
[ADR-0037](../adr/0037-a-new-competition-plays-the-v2-context-minus-availability.md), whose
curation is "refreshed every Season as clubs are promoted and relegated" — this is the
first time that sentence has come due for a Competition this benchmark runs.

**Blocked by:** None — can start immediately. Serie A is failing its Understat fetch every
day until this lands.

**Status:** ready-for-agent

---

## What is already known

The daily fetch of 2026-08-22T06:00Z refused `understat:2026-27:Serie_A` with **114**
`unknown Understat team name` issues. That is exactly three clubs over thirty-eight
Fixtures each, and the three are the ones promoted into Serie A for 2026-27:

| League | Map holds (2025-26) | 2026-27 plays |
| --- | --- | --- |
| `SA` | Cremonese, Pisa, Verona | **Monza, Frosinone, Venezia** |
| `FL1` | (its own eighteen) | **Le Mans, Troyes** are not in it |

**Ligue 1 has not failed yet and will.** Its map is 2025-26's eighteen and holds no entry
for either club Understat will name once its 2026 feed carries their Fixtures. Nothing
about that is a different bug; it is the same one, one league behind.

The Premier League's and La Liga's maps hold twenty-three names apiece — more than a
Season's twenty, because they have already been through this — which is why neither
refuses today.

**This is the map working.** Ticket 0036 wrote the failure down before it happened: the
promoted clubs are "deliberately absent … and they arrive as `unknown Understat team name`
at the first pre-Season fetch, which is where that failure belongs". A map that guessed
would have filed a promoted club's xG under nobody and reported nothing.

## Acceptance

- [ ] Serie A's Understat map names the twenty clubs playing Serie A in 2026-27, each
      key read off `getLeagueData/Serie_A/2026` itself rather than transcribed, and the
      daily fetch of that feed stores its Fixtures instead of refusing them.
- [ ] Ligue 1's map does the same for its eighteen against `getLeagueData/Ligue_1/2026`,
      before its feed starts refusing rather than after.
- [ ] Every value is a name football-data.co.uk stores for that division, so a stored xG
      row can still find the Match it belongs to; the derivation is checked both
      directions with nothing left over on either side, the way ticket 0037's is.
- [ ] The relegated clubs stay in the map. The five-match form window reaches back into
      2025-26 and a Season's xG is stored under the Season it was played in — removing
      them would strand rows already in the record.
- [ ] Both maps are reviewed by a person before any fetch stores a row under them, and
      the review records which pairs were judgement calls rather than the same string
      twice. Serie A's near miss is its two Milan clubs; Ligue 1's is its two Paris clubs.
- [ ] The committed Understat fixtures are refreshed or joined by 2026-27 ones, so the
      derivation is proved against bytes in the repository and not against a live feed
      that will have moved by the time anyone reads this.
- [ ] A re-runnable check records what landed: the xG row count per Competition for
      `season = '2026-27'`, beside the number the daily fetch should be storing.

## Out of scope

- **The three missing football-data.co.uk files.** `E0`, `I1`, `I2` and `F1` answer
  `300 Multiple Choices` for 2026-27 and fail the same daily run for a wholly different
  reason. Nothing in this repository can fix that; it waits on publication, and the
  pre-cron checklist §4 already carries the check.
- **The Bundesliga**, which has no map because it has no seat (ADR-0049).
