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

**Status:** implemented — boxes 1, 4, 5 and 6 green; 2, 3 and 7 stay open — 2 and 3 both on
the same gap (Ligue 1's two are transcribed from `F2.csv`, not read off its own feed, which
has not named them yet), 7 on the first live daily fetch.

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

- [x] Serie A's Understat map names the twenty clubs playing Serie A in 2026-27, each
      key read off `getLeagueData/Serie_A/2026` itself rather than transcribed, and the
      daily fetch of that feed stores its Fixtures instead of refusing them.
      _`src/understat/team-identity.ts` gained `Frosinone`, `Monza`, `Venezia`, merged
      alphabetically into the existing list. Keys read off the live feed 2026-08-22 (380
      fixtures, already the full season, all unplayed). Values checked against `I2.csv`
      (see box 3). Proven end to end by
      `stores xG for Serie A's promoted clubs under joinable names` in
      `test/fetch-understat-season-xg.test.ts`._

      _**Mutation-checked**: a value mutated to any other real Serie B 2025-26 club —
      `Monza` → `Modena` — is caught immediately, because `resolveUnderstatTeamName("SA",
      "Monza")` would then return `"Modena"` where the derivation test expects the club
      back unchanged; there is no swap among these three that reads plausibly, since
      Understat and football-data.co.uk spell all three identically._
- [ ] Ligue 1's map does the same for its eighteen against `getLeagueData/Ligue_1/2026`,
      before its feed starts refusing rather than after.
      _Gained `Le Mans`, `Troyes`, merged alphabetically — added ahead of the failure, as
      asked. **Not done the same way as Serie A's**, though: neither key is actually read
      off `getLeagueData/Ligue_1/2026` — that feed had one match played and neither club
      named as of 2026-08-22 (`Ligue 1's 2026-27 feed has not named its two promoted clubs
      yet`). Both keys are transcribed from `F2.csv` instead. Left open rather than
      checked, for the same reason box 3 is — this is the value-derivation half of the
      same gap._
- [ ] Every value is a name football-data.co.uk stores for that division, so a stored xG
      row can still find the Match it belongs to; the derivation is checked both
      directions with nothing left over on either side, the way ticket 0037's is.
      _True for Serie A's three (`derives Serie A's 2026-27 twenty, promoted clubs and
      all, from the committed feed`, checked against `I2.csv` — `I1.csv` 2026-27 is one of
      the three files out of scope below) — including the 114-issue count this ticket
      opens with, now asserted against the committed feed
      (`promotedAppearances` in that test) rather than left as a claim in prose._

      _True for Ligue 1's `Troyes` too — its key also matches Understat's own spelling the
      last time it played Ligue 1 (`getLeagueData/Ligue_1/2021`, checked live 2026-08-22),
      independent of the `F2.csv` value check._

      _**Not true for Ligue 1's `Le Mans`**: its key is unverified against any Understat
      feed, live or historical — the committed `understat-2026-27-Ligue_1.json.gz` has one
      match played and neither promoted club named yet, and Le Mans has no prior Understat
      Ligue 1 stint to check against the way `Troyes` does. Left open until that check is
      possible._

      _**Mutation-checked** (value side, both leagues): a value mutated to another real
      club from the same lower-division file — `Le Mans` → `Amiens`, or `Venezia` →
      `Sudtirol` — turns the corresponding `resolveUnderstatTeamName(...)` call away from
      the club name the test expects back, red immediately. This does not reach `Le Mans`'s
      actual gap, which is on the key side (unverified against Understat), not the value
      side (verified against `F2.csv`)._
- [x] The relegated clubs stay in the map. The five-match form window reaches back into
      2025-26 and a Season's xG is stored under the Season it was played in — removing
      them would strand rows already in the record.
      _Cremonese, Pisa, Verona, and Ligue 1's own relegated two, all untouched._

      _**Mutation-checked**: dropping one of the five relegated entries — `Verona`, say —
      is caught by the derivation tests' full-equality assertion (`Object.keys(map).sort()
      === [...titles, <promoted>].sort()`) for the wrong reason as much as the right one:
      the map would be short one key, and the equality fails either way. The two other
      tests that resolve `Cremonese`, `Pisa` and `Verona` directly
      (`derives Serie A's 2026-27 twenty...`) are what actually tie the failure to "a
      relegated club went missing" rather than leaving it as an unexplained count._
- [x] Both maps are reviewed by a person before any fetch stores a row under them, and
      the review records which pairs were judgement calls rather than the same string
      twice. Serie A's near miss is its two Milan clubs; Ligue 1's is its two Paris clubs.
      _Reviewed 2026-08-22. Serie A's three and Ligue 1's `Troyes` confirmed against a
      feed; `Le Mans` recorded as an unverified, deliberately deferred judgement call, not
      a confirmed one — revisit once Understat's Ligue 1 2026-27 feed actually names it
      (boxes 2 and 3 above stay open for the same reason)._
- [x] The committed Understat fixtures are refreshed or joined by 2026-27 ones, so the
      derivation is proved against bytes in the repository and not against a live feed
      that will have moved by the time anyone reads this.
      _Added, both live snapshots taken 2026-08-22. `sha256 (body)` is the decompressed
      bytes — the form 0036/0037 pin, since that is what `raw_snapshots.body` stores and
      so is what a real fetch's row can be checked against directly; `sha256 (gz)` only
      catches this committed file being re-fetched or re-compressed, not a mismatch with
      production:_

      | File | Decompressed bytes | `sha256` (body, first 12) | `sha256` (gz, first 12) |
      | --- | --- | --- | --- |
      | `understat-2026-27-Serie_A.json.gz` | 87,552 | `11070227a5fa` | `a1df6a71bad0` |
      | `understat-2026-27-Ligue_1.json.gz` | 10,753 | `b4c68cfe5a30` | `6c44678f7d37` |
- [ ] A re-runnable check records what landed: the xG row count per Competition for
      `season = '2026-27'`, beside the number the daily fetch should be storing.
      _Not done — needs a real daily fetch to have landed rows first. The query, with the
      count it should currently return given the committed feeds above:_
      ```sql
      select competition, count(*) from understat_match_xg
       where season = '2026-27' group by competition;
      -- expect SA  = 0 (0 of the 380 committed Fixtures are finished yet)
      -- expect FL1 = 1 (Marseille 4-0 Strasbourg, 2026-08-21 — the one finished
      --               Fixture in the committed understat-2026-27-Ligue_1.json.gz)
      ```
      _Both expected counts will already be stale by the time this runs for real — that is
      the point of naming them rather than leaving the query bare: a mismatch says exactly
      how many Fixtures were played between 2026-08-22 and whenever the fetch actually
      runs, not "something is wrong."_

## Out of scope

- **The three missing football-data.co.uk files.** `E0`, `I1`, `I2` and `F1` answer
  `300 Multiple Choices` for 2026-27 and fail the same daily run for a wholly different
  reason. Nothing in this repository can fix that; it waits on publication, and the
  pre-cron checklist §4 already carries the check.
- **The Bundesliga**, which has no map because it has no seat (ADR-0049).
