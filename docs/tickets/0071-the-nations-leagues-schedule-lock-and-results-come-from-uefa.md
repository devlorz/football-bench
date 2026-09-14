# Ticket: The Nations League's schedule, Lock and results come from UEFA

**What to build:** with `UNL` listed for `2026-27`, the daily fetch reads UEFA's match
feed and lands the 156 league-phase Fixtures in six Gameweeks with derived deadlines,
then settles each one at its ninety-minute score as it is played. A dry run over the
recorded feed writes exactly that record. Source:
[spec 0027](../specs/0027-the-nations-league-opens.md) stories 10–20. Decisions:
[ADR-0057](../adr/0057-the-nations-league-opens-as-the-first-cup-on-sources-nobody-documents.md)
(the schedule decision, the Gameweek, the knockouts deferred, `ABANDONED`, team names),
[ADR-0036](../adr/0036-a-new-competitions-schedule-results-and-lock-come-from-football-data-org.md)
(everything about the Lock, kept unchanged).

**Blocked by:** 0070 — the registry entry for `UNL` is written here and needs the
registry to exist; the `UNL` code must be in the domain before the first Gameweek row.

**Status:** ready-for-agent

---

## What is already known

**The feed.** `https://match.uefa.com/v5/matches?competitionId=2014&seasonYear=2027&limit=100&offset=N`,
no key, a hundred matches a page; offsets 0 and 100 hold the 156 and offsets 200 and
300 answer `[]`, which is how the feed says the paging is over. Recorded on 2026-09-14 as
`test/fixtures/uefa-2026-27-UNL-recorded-offset-{0,100,200,300}.json.gz`; the 2024-25
edition (188 matches, every shape this Season has not shown yet) is
`uefa-2024-25-UNL-recorded-offset-{0,100}.json.gz`.

**Its shape.** `id` (the Fixture identity), `kickOffTime.dateTime` in UTC, `status`
(`UPCOMING`, `FINISHED`, `ABANDONED` seen; `LIVE` presumed), `matchday.name` (`MD1`–`MD6`
in the league phase, then `MD7`/`MD8` for two-legged rounds and `SF`, `3rd place`,
`Final`), `round.metaData.name`, `group.metaData.groupName` (`Group A1` … `Group D2`),
`homeTeam.internationalName`, `score.regular` (ninety minutes), `score.total` (with
extra time), `score.penalty`, `winner.match.reason`. The 2024-25 Romania–Kosovo match
stayed `ABANDONED` at `regular` 0–0 with `winner: null` forever, after UEFA awarded it
3–0.

**The algorithm is football-data.org's.** Derived deadline at earliest kickoff minus
ninety minutes, frozen once a Lock is observed; attachment by kickoff with `locked_in_gw`
written on insert and update; the withdrawn path for a withdrawn status or a Fixture
gone from the feed; the settled statuses; the stale-source guard on an empty response;
`KickoffInsideDeadlineError` on a breach; every response archived under its own source
name before validation. Copy that fetch's structure, do not generalise the two into one:
the paging, the matchday map, the score field and the status set are the four
differences, and a shared function with four switches is what the football-data.org
fetch's own comments warn against.

**The matchday map is six entries and refuses the rest.** `MD1`–`MD6` → Gameweek 1–6.
Any other name — including `MD7` the day the November draw puts it in the feed — is
refused with the name in the error, per Competition, so the knockouts are a loud fact
until the decision ADR-0057 deferred is taken.

**Team names.** UEFA's `internationalName`, with one normalisation: "Türki̇ye" (`i` +
U+0307) is stored as "Türkiye". The 54 names are stable across the Season; the group is
stored on the Fixture only if the schema already has a column for it — otherwise it is
read from the archived response and not stored (a group table is deferred).

**Clocks.** `MD1` 2026-09-24T16:00Z (deadline 14:30Z), `MD2` 09-27 13:00Z, `MD3` 10-01
16:00Z, `MD4` 10-04 13:00Z, `MD5` 11-12 17:00Z, `MD6` 11-15 14:00Z. `MD1`/`MD2` and
`MD3`/`MD4` are three days apart; the derived-deadline code already handles two rounds
in one week.

## Acceptance

- [ ] The registry names UEFA as `UNL`'s schedule source; the daily fetch dispatches
      `UNL` there and nowhere else for its schedule, and `PL`/`PD` still reach FPL and
      football-data.org respectively (the daily-fetch seam).
- [ ] Over the recorded 2026-27 pages, a dry run with `COMPETITION=UNL` lands 156
      Fixtures under their UEFA ids in Gameweeks 1–6, six `gameweeks` rows with the
      deadlines above, and four archived `raw_snapshots` rows.
- [ ] A `FINISHED` match settles at `score.regular`, never `score.total`; a `FINISHED`
      match with no regular score is a validation error naming the match.
- [ ] `ABANDONED` takes the withdrawn path: deleted if never Locked, `deferred` with its
      Prediction kept if Locked, never settled — proven over the 2024-25 Romania–Kosovo
      row.
- [ ] A matchday name outside `MD1`–`MD6` is refused by name (proven over the 2024-25
      recording's `MD7`, `SF` and `Final`), and the refusal is a `UNL` failure that
      costs no other Competition its day.
- [ ] The empty-response guard, the breach alert and the pulled-ahead attachment behave
      as the football-data.org fetch's tests prove them, at this fetch's own test seam.
- [ ] "Türki̇ye" is stored as "Türkiye"; the other fifty-three names are UEFA's verbatim.
- [ ] No Base Model is reached; the `competitions` row is inserted only inside tests
      and the dry run's throwaway database, never in production.
