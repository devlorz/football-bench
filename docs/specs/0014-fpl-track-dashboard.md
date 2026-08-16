# Spec 0014 — FPL track dashboard

The FPL track's three public screens — the points leaderboard, the latest Team Sheets, and
one Entrant's record — join the dashboard as its own section under `/fpl`, per ADR-0033.
The design is the handoff bundle in `docs/design_handoff_fpl_track/`: high-fidelity, final
tokens, three screens, Premier League purple accent. This spec turns that handoff and
ADR-0033's decisions into buildable, testable requirements.

Reads ADR-0003 (the ranking is a Demonstration), ADR-0027 (select-only role), ADR-0028
(static build, per-page fetch, URL state), ADR-0029 (one Worker), ADR-0033 (this section's
shape). Vocabulary follows `CONTEXT.md`; the handoff's "Model stats" is rendered
**Entrant record** throughout.

## Problem Statement

The FPL track has run, scored and stored its record since the Season opened, but none of it
is visible: the read API has no FPL endpoint and the dashboard has no FPL page. A reader who
wants to know how the ten Entrants' Squads are doing — who is top, what Team Sheet each
locked, how an Entrant's decisions have played out — has nothing to open. And the one way
the record *can* currently be read (querying the database) is exactly the path ADR-0003
worries about: a bare ranking that looks like evidence of which Base Model manages a Squad
better, when one seat per Base Model means it demonstrates only that the track ran.

## Solution

Three pages under `/fpl`, in the existing Astro project, served by the existing Worker,
each fetching its own new endpoint:

- **`/fpl` — FPL points ranking.** Ten Entrants by cumulative FPL points through the
  latest Settled Gameweek, in three presentation variants (Table, Race, Cards), with the
  Demonstration qualification as a footnote under the ranking.
- **`/fpl/squads` — Latest squads.** The Team Sheet each Entrant locked for the current
  Gameweek: pitch and list views, the six-cell stat strip, the Gameweek's Transfers, and
  the validation record (Repairs, Roll Over, last violation).
- **`/fpl/entrants` — Entrant record.** One Entrant's history: points per Gameweek, Squad
  value and bank, Chip usage across all 38 Gameweeks, captain picks, Transfer history, and
  the operator footer.

The section is a sibling of the Match track — its own layout and header, no track switcher,
purple accent in a track-scoped stylesheet — and everything it shows is already in the
database; no new tables, no new metrics.

## User Stories

### Reading the FPL points ranking

1. As a reader, I want the ten Entrants ranked by cumulative FPL points through the latest
   Settled Gameweek, so that I can see the state of the track at a glance.
2. As a reader, I want each row to show the Entrant's name over its Base Model id, so that
   I know which seat I am looking at without a second lookup.
3. As a reader, I want the latest Gameweek's own points beside the Season total, so that I
   can tell a good week from a good Season.
4. As a reader, I want a rank-movement marker (▲n / ▼n / –) against the previous Gameweek's
   cumulative snapshot, so that I can see who is climbing without opening two pages.
5. As a reader, I want Squad value and Chips remaining in the table, so that I can judge a
   points total against the resources left to defend it.
6. As a reader, I want totals shown net of Hits, so that the number I see is the number the
   ranking is ordered by.
7. As a reader, I want the Race variant — cumulative points per Gameweek as one line per
   Entrant — so that I can see how the ranking came to be, not just where it stands.
8. As a reader, I want the Cards variant, so that I can scan the field as ten summary
   tiles.
9. As a reader, I want my chosen variant reflected in the URL, so that I can link the view
   I am looking at.
10. As a reader, I want the ranking labelled with the Demonstration qualification, so that
    I do not mistake a sample of one Season path apiece for evidence about Base Models.
11. As a reader, I want the footnote to also tell me the movement marker's reference and
    that Reference Lines produce probabilities rather than a Squad, so that the table's
    edges are explained where I read them.

### Reading the latest Team Sheets

12. As a reader, I want an Entrant picker in leaderboard order, so that I can move through
    the field the way the ranking presents it.
13. As a reader, I want the selected Entrant's Team Sheet for the current Gameweek drawn on
    a pitch — four rows by position, captain in accent with an armband badge — so that I
    can read a Squad the way football is read.
14. As a reader, I want each starter's card to carry club, opponent with venue, and the
    Gameweek's points, so that the pitch view answers "how did this pick do" in place.
15. As a reader, I want the bench drawn beneath the pitch in bench order, so that I can see
    what the Entrant held in reserve and in what order it would have come on.
16. As a reader, I want a list view of all fifteen players with price, Selling Price,
    Gameweek points and role, so that I can read the Squad as a table when I want numbers.
17. As a reader, I want the stat strip — Gameweek points, Season total, Squad value, bank,
    Free Transfers, active Chip — so that the Manager State behind the Sheet is visible.
18. As a reader, I want the Gameweek's Transfers shown as out → in with their cost (free or
    a −4 Hit), so that I can see what changed and what it cost.
19. As a reader, I want the validation record — Repairs used, whether the Gameweek Rolled
    Over, the last violation — so that I can see how cleanly the action landed.
20. As a reader, I want a Rolled Over Gameweek to say so and show the standing Team Sheet,
    so that a stale Squad is announced rather than passed off as a choice.
21. As a reader, I want the lock time shown against the Sheet, so that I know which
    deadline it answers.
22. As a reader, I want my selected Entrant carried in the URL and preserved when I switch
    to the Entrant record page, so that the two Entrant-scoped pages feel like one
    selection.

### Reading an Entrant record

23. As a reader, I want points per Gameweek as bars with the latest Gameweek emphasised,
    so that the shape of the Season is visible in one glance.
24. As a reader, I want Squad value and bank as two independently-scaled series, so that a
    flat bank line still reads against a moving value line.
25. As a reader, I want Chip usage as a 38-cell strip with the first set's expiry marked at
    the GW19 deadline, so that spent, expiring and remaining Chips are one picture.
26. As a reader, I want the strip's legend to name each played Chip and its Gameweek — or
    say plainly that none has been played and eight remain — so that absence is stated,
    not inferred.
27. As a reader, I want captain picks per Gameweek with the vice and the captain's return,
    so that the weekly judgement call is a readable series.
28. As a reader, I want the Transfer history per Gameweek — out, in, cost — so that the
    Squad's whole evolution is on one page.
29. As a reader, I want the operator footer — Repairs this Season, Roll Overs, Hits taken,
    Gaps, Prompt Version — so that the track's operational record sits with the sporting
    one.

### The record's honesty

30. As a reader, I want only Settled Gameweeks in every number and every chart, so that
    nothing provisional is dressed as final.
31. As a reader, I want a missing Gameweek announced rather than silently absent or
    interpolated, so that a hole in the record stays visible.
32. As a reader, I want the pre-Season state (no Settled Gameweek yet) to render the chrome
    with an honest empty state, so that the page's absence of numbers is explained.
33. As an operator, I want every ranking-readable response to carry the Demonstration
    qualification from the stored record, so that no reader of the API — browser or raw —
    receives a bare ranking.

### The page itself

34. As a reader, I want the FPL section to carry its own header — brand, three tabs, status
    line with Season, latest Settled Gameweek and Entrant count — so that I always know
    which track and which state I am reading.
35. As a reader, I want the Premier League purple accent throughout the section, so that
    the FPL track is visually its own thing beside the Match track's red.
36. As a reader, I want light and dark themes with my choice persisted and shared across
    both tracks, so that the site remembers how I read it.
37. As a reader, I want the pitch dark in both themes, so that the field reads as a field.
38. As a reader on a phone, I want the header to stay one row, the tabs to fold into a
    menu, the grids to stack, and the table to drop its least essential columns, so that
    the section works at 375px.
39. As a keyboard reader, I want visible focus states on every control, so that the pages
    are navigable without a pointer.
40. As a reader, I want a still, unanimated loading state and a single plain error line
    when a fetch fails, so that the page never pretends to have data it does not.

### Operating it

41. As an operator, I want the three endpoints cached at the edge for five minutes with an
    hour of stale-while-revalidate, so that the database sees the scoring cadence, not the
    traffic.
42. As an operator, I want `stale-if-error=0` on every FPL response, so that a Worker that
    has lost its database goes dark instead of serving old numbers that look current.
43. As an operator, I want the endpoints to read under the dashboard's select-only role, so
    that the read path cannot write and a missing grant fails loudly.
44. As an operator, I want a deploy to remain the only cache purge, so that the emergency
    runbook stays true for the new endpoints.

### Proving it

45. As a developer, I want the three endpoints tested through the existing read seam — a
    Request in, a Response out — so that routing, status, headers and body are one test
    surface.
46. As a developer, I want test numbers produced by running the real FPL scorer over seeded
    Manager States and player points, so that a test failure means the endpoint disagrees
    with the record, not with a hand-typed row.
47. As a developer, I want a test proving the match endpoints and FPL endpoints exclude
    each other's rows in both directions, so that neither ranking can leak into the other.
48. As a developer, I want the chart geometry — race-label de-overlap and the two-series
    independent scaling — in a pure module with its own tests, so that the pages stay
    logic-free.
49. As a developer, I want a test that the Demonstration qualification in a response equals
    the sentence frozen in the stored rows, so that the label cannot drift from the record.

## Implementation Decisions

### What this spec does not compute

The scorer already computed everything rankable. The endpoints read `scores` rows
(`fpl_points`, `fpl_points_season_to_date`, `repairs`, `roll_over_rate`,
`violation_profile` and their season-to-date forms), `manager_states`, and the per-player
Gameweek points and locked player snapshots. No endpoint re-scores anything, and nothing
new is written. Three derivations are allowed, because they are presentation over stored
values, not scoring: the rank-movement marker (rank at the latest Settled Gameweek versus
rank at the one before, from the same cumulative metric), Selling Price (purchase price
plus half of any rise rounded down, a fall passed through — the Manager State holds the
purchase price precisely so this can be derived), and the captain/Transfer/Hit history
(read by replaying the stored Manager States across Gameweeks, which ADR-0003 already
establishes as the system of record).

### Three endpoints, one per page

Per ADR-0033: `/api/fpl/leaderboard`, `/api/fpl/squads`, `/api/fpl/entrants`, three new
branches in the Worker's existing routing chain, behind the same select-only role.

- **Leaderboard** returns one ranked row per seated Entrant for the latest Settled Gameweek — Entrant,
  Base Model id, Gameweek points, Season total, movement, Squad value, Chips remaining —
  plus the Race variant's full cumulative series per Entrant (the variants are one page;
  switching them must not fetch), the Gameweek span the ranking covers, and the
  Demonstration qualification read from the detail of the rows the ranking was read off.
- **Squads** returns every seated Entrant's current-Gameweek state: the Team Sheet, the
  fifteen players with position, club, price, Selling Price and Gameweek points, the stat
  strip's values, the Gameweek's Transfers with costs, and the validation record. All of them,
  so the picker is a re-render.
- **Entrants** returns every seated Entrant's full history: per-Gameweek points, Squad value
  and bank series, Chips played and remaining, captain picks with returns, Transfer history
  with costs, and the operator footer's totals including Gaps and the Prompt Version.

Every FPL read filters to the FPL track's rows, mirroring how the match endpoints filter to
theirs, so the two rankings stay disjoint by construction.

Since ADR-0035 those reads also carry `competition = 'PL'`. The Competition is part of the
key on `scores` and the tables beside it, so a read that omits it is a read of every league
at once; and Fantasy Premier League is the Premier League by nature rather than by argument,
so the literal is stated at this boundary the way the other Premier-League-by-nature callers
state theirs. Spec 0017 confirms it: the FPL endpoints keep their paths and their `PL`
literal rather than being given a Competition they cannot have a second of.

### Only Settled, and absence is announced

The two rules the handoff restates bind all three endpoints: only Settled Gameweeks appear
anywhere, and a Gameweek missing from the record inside the Settled span is announced in
the body rather than skipped. Before the first Settled Gameweek the endpoints return the
honest empty shape and the pages render chrome plus an empty state, mirroring the Match
track's pre-Season behaviour.

### The Demonstration qualification

ADR-0003 requires the label; ADR-0033 fixes its delivery. The sentence travels in the
leaderboard response, read from the stored rows' detail — not from a constant in the
Worker, not hardcoded in the page — so the wording a reader sees is the wording frozen with
the Season's record. The page renders it as the final sentences of the footnote under the
ranking, in the footnote style the design already defines. A response whose rows lack the
sentence is an error, not a blank.

### Caching

All three endpoints carry the scored-data lifetime: five minutes at the edge, an hour of
stale-while-revalidate, `stale-if-error=0`, browser `no-cache` — the same split-header
scheme ADR-0029 settled. Squads deliberately does not get the fixtures-style sixty
seconds: a Team Sheet appears once at the Lock and then holds still, so the five-minute
worst case after a Lock is accepted (ADR-0033).

### The pages

The section has its own layout — the handoff's header with brand, three tabs and the status
line — and does not touch the Match track's layout or nav. There is no track switcher; the
sections are separated by path alone. The purple accent and pitch tokens live in a third,
track-scoped stylesheet loaded only by FPL pages; the vendored design-system sheet stays
unedited and the Match track's override sheet stays the Match track's. Theming keeps the
repo's `data-theme` attribute and existing storage key, so one toggle follows the reader
across tracks. The responsive behaviour is the handoff's 760px collapse implemented with a
media query, not the handoff's container query — the deliberate deviation ADR-0033 records.

URL state, all via `replaceState`: `?view=` for the leaderboard variant and for the squad
page's pitch/list; `?entrant=` for the selected Entrant on the two Entrant-scoped pages,
carried by the tab links between them so the selection survives the switch. Theme stays out
of the URL; which panel is expanded stays out of everything, matching ADR-0028's line.

Chart behaviour the handoff fixes and the pages must honour: race-chart Entrant labels are
positioned HTML, de-overlapped to a minimum 17-unit gap in viewBox space; the value/bank
chart scales each series independently from its own min and max; the points bars emphasise
the latest Gameweek; the Chip strip is one cell per Gameweek of the whole Season with the
first set's expiry marked at the GW19 deadline. The label de-overlap and the two-series
scaling are pure functions in a chart-domain module, not inline page script.

### Vocabulary

**Entrant record** is the third page's name and `entrants` its path segment — the glossary
forbids "model stats" and spec 0011 already renamed it once. The UI says Entrant, Base
Model, Squad, Team Sheet, Chip, Hit, Repair, Roll Over, Settled — never model, team,
lineup. The Season identifier stays `2026-27`; the design's `2026/27` is display
formatting applied at render.

## Testing Decisions

### What makes a good test here

A test drives the seam the way the Worker does — a Request in, a Response out — and asserts
on the documented body, status and headers. Numbers under test come from running the real
FPL scorer over seeded Manager States, actions and player points, never from hand-written
`scores` rows: a test that inserts its own rows proves the endpoint can read a table, not
that the dashboard agrees with the record. Chart geometry is tested as pure functions on
their documented behaviour, not by rendering.

### What gets tested

- **The three endpoints, over a real Postgres, under the dashboard's role.** Documented
  body per endpoint over a seeded multi-Gameweek Season; cache headers per endpoint; 404
  for unknown paths unchanged.
- **Mutual exclusion, both directions.** The existing match-side test seeds an FPL row to
  prove the match endpoints exclude it; the FPL endpoints get the reverse seed and the
  same assertion.
- **The Demonstration qualification.** The leaderboard response carries the sentence and it
  equals the one stored in the seeded rows' detail; a seeded record stripped of it fails
  rather than serving a bare ranking.
- **The derivations.** Movement markers against the previous cumulative snapshot, Selling
  Price's round-half-down rise and full fall, Transfer costs including Hits, and a Rolled
  Over Gameweek presenting the standing Team Sheet — each driven through the seam over a
  seed that exercises it.
- **Absence.** The pre-Season empty shape, and a Gameweek missing inside the Settled span
  being announced in the body.
- **Chart geometry.** The de-overlap function (labels forced to the minimum gap, order
  preserved) and the independent two-series scaling (a flat series still spans its band),
  as pure-function tests.

### Prior art

The match-track endpoint tests are the pattern for the seam tests — same driver, same
harness, same role — and the existing chart-domain test is the pattern for the geometry
module. The FPL scorer's own tests show how a multi-Gameweek FPL seed is built and scored.

## Out of Scope

- Any change to the Match track's pages, endpoints, layout or styles.
- A track switcher or any shared navigation chrome between the two sections.
- Container queries and embed support (ADR-0033's recorded deviation).
- New tables, new metrics, or any write from the read path.
- Live or provisional numbers — nothing renders before a Gameweek is Settled, and nothing
  updates between scoring runs faster than the cache allows.
- Hosted previews (off per ADR-0029), analytics, and SEO beyond the chrome.
- The Match track's Fixtures-page equivalent for FPL — deadline countdowns, Gap warnings
  before a Lock — which would need the sixty-second cache and is its own feature if wanted.

## Further Notes

### Order of work

The seam first: the three endpoints over a seeded Season, proven through the driver, since
everything on the pages is a rendering of those bodies. Then the section's layout and the
leaderboard page (Table variant, footnote, qualification), then the squads page, then the
Entrant record page, then the mobile collapse. The chart-domain functions land with the
first page that needs them.

### The seed

One seed serves all three endpoints: nine Entrants with Manager States across at least
three Settled Gameweeks, including at minimum one Transfer taken as a Hit, one banked Free
Transfer, one played Chip, one Roll Over, one Repair spent, one Gap, and one price rise
and fall (to exercise Selling Price both ways). Movement markers need at least two
cumulative snapshots; the GW19 expiry marker needs no seed — it is a fixed calendar fact.

**Nine and not the roster of record's ten**, deliberately: spec 0015 refreshed the roster to
ten before the first Lock and held the design-mock seed roster where it was, so the seed's
field is nine and the endpoints' tests assert nine. Nothing above states a field size for
that reason — an endpoint answers for whoever is seated, and a spec that counted them would
be re-counted every time the roster moved. The count belongs to the roster of record
(ADR-0034), which is what the user stories above describe.

### What to verify early

- That the stored `manager_states` replay yields captain and Transfer history for the
  seeded Season without ambiguity — it is the one derivation with no precedent in the
  match endpoints.
- That the demonstration sentence is present in the seeded rows the same way the scorer
  writes it in production, so the equality test is against the real shape.
- The race chart's label de-overlap against the nine-line placeholder data in the handoff
  prototype, where the collisions are known. Nine is the prototype's own invented field and
  not the roster's ten (ADR-0034); the de-overlap must hold at ten, which is where the
  labels have less room, not less.
