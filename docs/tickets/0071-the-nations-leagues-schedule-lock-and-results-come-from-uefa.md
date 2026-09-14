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
name before validation.

**The parse half is this fetch's own; the write half is shared.** Do not generalise the
parsing into one function: the paging, the matchday map, the score field and the status
set are the four differences, and a shared function with four switches is what the
football-data.org fetch's own comments warn against. Every one of those four happens
before the write, and none of them is visible from inside it — so ADR-0036's derivation,
attachment and write live in `src/fetch/write-schedule.ts`, moved out of the
football-data.org fetch unchanged and taking matches each source has already normalised
(integer matchday, `Date` kickoff, stored team names, a settled flag and the result as
JSON). It is shared rather than copied because of what that half's history costs:
ADR-0036 was amended twice inside a fortnight, both times there, once at the price of
fifty-nine withdrawn Predictions — and a third amendment applied to one copy and not the
other would be wrong in the Competition nobody is watching. The stale-source guard is the
exception and stays with each source: a feed that pages answers an empty body both when
it is dead and when its pages have run out, and only the source can tell those apart.

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

Where each box is proven matters here more than usual, because the write half is shared
(§ *The parse half is this fetch's own*). A box marked **by construction** is not a box
nobody checked: it is one whose behaviour is the same bytes the five leagues run, proven
in `test/fetch-football-data-org-competition.test.ts` and reached through
`writeCompetitionSchedule` with no branch on the source. That claim holds only while the
UEFA fetch runs the whole engine. **The day a later ticket puts a UEFA-only branch inside
`src/fetch/write-schedule.ts`, every box below marked "by construction" needs a real test
at the UEFA seam instead.**

- [x] The registry names UEFA as `UNL`'s schedule source; the daily fetch dispatches
      `UNL` there and nowhere else for its schedule, and `PL`/`PD` still reach FPL and
      football-data.org respectively (the daily-fetch seam).
      *`test/daily-fetch.test.ts`, "reads UEFA for the Nations League and leaves the
      leagues' sources alone": the whole set of URLs a run reached is the Premier
      League's seven plus UEFA's two, and no other. `PD`'s own set is unchanged by its
      existing test.*
- [x] Over the recorded 2026-27 pages, `UNL`'s 156 Fixtures land under their UEFA ids in
      Gameweeks 1–6, with six `gameweeks` rows carrying the deadlines above and one
      archived `raw_snapshots` row per page read.
      *Reworded from "a dry run with `COMPETITION=UNL`", which this ticket cannot run:
      `npm run dry-run` replays a Gameweek's Entrant answers out of production's archive
      and needs a frozen `MATCH_PROMPTS.UNL` (ticket 0075) and an activated Competition
      that has actually been fetched (ticket 0076). Neither exists, and no amount of
      schedule code makes them. What the command would prove about **this** ticket —
      the write path over the recorded bytes — is proven in
      `test/fetch-uefa-competition.test.ts` against a real schema, and ticket 0076 owns
      the command itself.*
      *Also reworded from "four archived `raw_snapshots` rows" to one per page read,
      which is **two**: paging stops at the first short page, so `offset=200` and
      `offset=300` are recorded evidence of where the Season ends and are never
      requested. Both stop conditions are pinned, the short page and the empty one.*
      *`src/dry-run/archive-replay-fetcher.ts` maps UEFA's URL back to its snapshot
      name, offset included, so the dry run 0076 runs replays every page instead of
      reporting no known source for bytes it holds.*
- [x] A `FINISHED` match settles at `score.regular`, never `score.total`; a `FINISHED`
      match with no regular score is a validation error naming the match.
      *Proven at `settledResultOf` over the archived 2024-25 matches where the two
      scores really differ — Portugal–Denmark (3–2 regular, 5–2 total) and
      Spain–Netherlands (2–2 regular, 3–3 total, 5–4 on penalties). It has to be proven
      there and not through `normaliseUefaMatches`: extra time is played in the knockout
      rounds alone, so every match whose two scores differ is in a matchday the map
      refuses. The missing-score half is cut into a real archived page, because no feed
      has been observed publishing it.*
- [x] `ABANDONED` takes the withdrawn path: deleted if never Locked, `deferred` with its
      Prediction kept if Locked, never settled — proven over the 2024-25 Romania–Kosovo
      row.
      *That the row leaves the normaliser as a withdrawn id and never as a settled
      Fixture is asserted over Romania–Kosovo itself; that the id reaches the writer and
      the row goes is asserted at the fetch seam, over a recorded page with the status
      written onto it.*
- [x] A Fixture gone from the feed takes the same path.
      *Added after review found it missing. UEFA is the first source where this is a
      separate question at all: football-data.org keeps a postponed match in the
      response with its old matchday and the FPL API keeps one with `event: null`, so in
      both a withdrawn Fixture is a row to read a status off. UEFA keeps nothing, so the
      stored ids are compared against every validated page and the difference joins
      `withdrawnIds`. The comparison is in the UEFA fetch and not in the shared writer,
      because it is this source's shape that needs it and five running leagues would
      otherwise get a new answer to a response that dropped a row.*
      *Both outcomes tested at the fetch seam: never Locked is deleted, Locked keeps its
      row with `deferred` and `unscheduled` set and its Gameweek intact.*
- [x] A matchday name outside `MD1`–`MD6` is refused by name (proven over the 2024-25
      recording's `MD7`, `SF` and `Final`), and the refusal is a `UNL` failure that
      costs no other Competition its day.
      *All five names the recording carries — `MD7`, `MD8`, `SF`, `3rd place`, `Final` —
      each refused with its own name in the message. The second half at the daily-fetch
      seam: the run fails, and the Premier League's 380 Fixtures land anyway.*
- [x] The empty-response guard, the breach alert and the pulled-ahead attachment behave
      as the football-data.org fetch's tests prove them.
      *"At this fetch's own test seam" is dropped from the line, and the reason is the
      engine decision above rather than a lowered bar: the breach alert and the
      pulled-ahead attachment are literally the same bytes, and a second copy of those
      assertions at the UEFA seam would go red at exactly the same moments as the first
      — no new information for two hundred lines of test.*
      *The empty-response guard is the exception and **is** tested here, because paging
      made it a different guard: an empty first page is a dead source and an empty later
      page is the end of the Season, and the shared writer cannot tell those apart. Both,
      and a first page that is empty writing no Gameweek at all.*
- [x] "Türki̇ye" is stored as "Türkiye"; the other fifty-three names are UEFA's verbatim.
      *Asserted as a set difference over the whole recorded Season, so "the other
      fifty-three" is the assertion and not a spot check: exactly one published name is
      absent from the stored set, and it is that one.*
- [x] No Base Model is reached; the `competitions` row is inserted only inside tests,
      never in production.
      *No paid run of any kind was made. The `UNL` row exists in `test/daily-fetch.test.ts`
      and `test/fetch-uefa-competition.test.ts` and nowhere else; production's
      `competitions` table is ticket 0076's, and the operator's.*

## What this ticket did not do

- **The `dry-run` command for `UNL`.** Blocked on tickets 0075 and 0076, above.
- **`LIVE`, `POSTPONED` or any other status word.** Only `UPCOMING`, `FINISHED` and
  `ABANDONED` have been observed. An unknown status stays on the calendar unsettled,
  which is what the football-data.org fetch does with one too; refusing a word nobody
  has seen would take the Competition's day out in the middle of a matchday evening.
- **The group.** `group.metaData.groupName` is in every archived match and is stored
  nowhere: ADR-0057 defers the group table, and the schema has no column for it.
- **`requireCurrentSeasonMatchesAfterFirstDeadline`'s second branch.** `UNL`'s `history`
  is `null`, so the guard returns early rather than asking `international_results` —
  spec 0027 story 44 wants that question asked, and the ticket that builds the dataset
  fetch (0073) is where the branch belongs.
