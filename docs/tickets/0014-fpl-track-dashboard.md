# Tickets: FPL track dashboard

Ten tracer-bullet slices that put the FPL track in front of a reader: a seeded FPL Season,
three read endpoints, three pages under `/fpl`, the mobile collapse, and one verified deploy.
Source: [spec 0014](../specs/0014-fpl-track-dashboard.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md). Decisions: [ADR 0001–0033](../adr/), especially
[ADR 0003](../adr/0003-fpl-track-plays-full-rules-with-one-seat-per-base-model.md) and
[ADR 0033](../adr/0033-the-fpl-track-joins-the-dashboard-as-its-own-section-under-fpl.md).
Design of record: [docs/design_handoff_fpl_track](../design_handoff_fpl_track/).

Work the **frontier**: after the seed, the three endpoints open at once; the pages chain
through the section's first slice.

Nothing in this set computes a score or writes a row. Every figure is read from what the
track already stores, and the only derivations allowed are the three the spec names:
rank movement, Selling Price, and history replayed from Manager States.

---

## A seeded FPL Season

**What to build:** A developer with an empty local Postgres runs one command and gets the FPL
Season the pages must render — ten Entrants with Manager States across at least three
Settled Gameweeks, with the real FPL scorer run over it. Every state a screen has to show
exists in the seed rather than hypothetically. It is a development and test tool and never
runs against a deployed database.

**Blocked by:** None — can start immediately.

- [x] One command against an empty database produces ten Entrants with Manager States and
      Team Sheets across at least three Settled Gameweeks
- [x] Every FPL `scores` row comes from running the real scorer; the seed writes none itself
- [x] The seed contains at least one Transfer taken as a Hit, one banked Free Transfer, one
      played Chip, one Roll Over, one Repair spent, and one Gap
- [x] At least one player's price has risen and one has fallen since purchase, so Selling
      Price is exercised in both directions
- [x] A pre-Season stopping point exists, so the empty state the pages must render is
      producible from the same command

## The FPL leaderboard endpoint

**What to build:** A `GET /api/fpl/leaderboard` over the seeded Season returns the ten
Entrants ranked by cumulative FPL points through the latest Settled Gameweek — with the
Gameweek's own points, rank movement, Squad value, Chips remaining, the Race variant's full
cumulative series, and the Demonstration qualification — served through the existing read
seam under the select-only role.

**Blocked by:** "A seeded FPL Season".

- [x] The response carries the documented body: ten ranked rows, the Gameweek span, the
      per-Entrant cumulative series, and the qualification
- [x] Rank movement is computed against the cumulative snapshot at the previous Settled
      Gameweek, and the first Settled Gameweek shows no movement rather than inventing one
- [x] The qualification equals the sentence stored in the seeded rows' detail, and a record
      stripped of it is an error, not a blank
- [x] FPL reads exclude match rows and match reads exclude FPL rows, proven in both
      directions over one seed
- [x] Responses carry the scored-data cache lifetime with `stale-if-error=0` and browser
      `no-cache`
- [x] Before the first Settled Gameweek the endpoint returns the honest empty shape

## The FPL section and the ranking page

**What to build:** A reader opens `/fpl` and sees the FPL points ranking as the design's
Table variant — the track's own header with brand, three tabs and status line, the Premier
League purple accent, both themes, and the footnote ending in the Demonstration
qualification. The first demoable slice.

**Blocked by:** "The FPL leaderboard endpoint".

- [x] The section has its own layout and header; the Match track's layout, nav and styles
      are untouched
- [x] The purple accent and pitch tokens live in a track-scoped stylesheet loaded only by
      FPL pages; the vendored design-system sheet is unedited
- [x] The theme toggle uses the repo's existing attribute and storage key, so one choice
      follows the reader across both tracks, with no flash of the other theme on load
- [x] The Table variant renders per the design: rank, movement marker, Entrant over Base
      Model id, Gameweek points, total, Squad value, Chips-left tag
- [x] The footnote renders the movement reference, the Reference Lines sentence, and the
      qualification exactly as served — no copy of the sentence exists in the page
- [x] The page shows a still loading block, a single plain error line on a failed fetch, and
      the honest empty state before the first Settled Gameweek
- [x] The third tab reads "Entrant record", never "Model stats"

## Race and Cards variants

**What to build:** The segmented control on `/fpl` switches between Table, Race and Cards
without fetching, and the chosen variant is linkable.

**Blocked by:** "The FPL section and the ranking page".

- [x] The Race chart draws one cumulative line per Entrant with the design's rank-based
      weights, and its labels are positioned HTML de-overlapped to the minimum gap
- [x] The de-overlap is a pure function with its own tests: labels forced apart to the
      minimum gap, order preserved
- [x] The Cards variant renders the ten tiles with rank, movement, total and the three tags
- [x] The variant lives in the URL via `replaceState` and a shared link opens on the linked
      variant
- [x] Switching variants issues no network request

## The latest-squads endpoint

**What to build:** A `GET /api/fpl/squads` over the seeded Season returns all ten Entrants'
current-Gameweek state — the Team Sheet, all fifteen players with position, club, price,
Selling Price and Gameweek points, the stat strip's values, the Gameweek's Transfers with
costs, and the validation record — so the page's picker can switch without fetching.

**Blocked by:** "A seeded FPL Season".

- [x] The response carries all ten Entrants for the latest Settled Gameweek in one body
- [x] Selling Price is purchase price plus half of any rise rounded down, and a fall passes
      through in full — both proven against the seed
- [x] Transfers report out, in, and cost, including a −4 Hit where the seed took one
- [x] The validation record reports Repairs used, whether the Gameweek Rolled Over, and the
      last violation; a Rolled Over Gameweek presents the standing Team Sheet
- [x] Responses carry the scored-data cache lifetime — deliberately not the sixty-second
      fixtures lifetime
- [x] Before the first Settled Gameweek the endpoint returns the honest empty shape

## The latest-squads page

**What to build:** A reader opens `/fpl/squads`, picks an Entrant, and reads the Team Sheet
it locked — as a pitch with jerseys, captain armband and bench strip, or as a fifteen-row
list — with the stat strip above and the Gameweek's Transfers and validation record below.

**Blocked by:** "The FPL section and the ranking page", "The latest-squads endpoint".

- [x] The picker lists the ten Entrants in leaderboard order and switching is a re-render,
      not a fetch
- [x] The pitch view renders four position rows and the bench strip per the design — jersey
      clip-path, captain in accent with the armband badge, opponent and points per plate
- [x] The list view renders all fifteen with price, Selling Price, Gameweek points and role
      tags, bench rows dimmed
- [x] The stat strip shows Gameweek points, Season total, Squad value, bank, Free Transfers
      and the active Chip, with the Chip cell dimmed when none is active
- [x] The selected Entrant and the pitch/list choice live in the URL via `replaceState`
- [x] The tab link to the Entrant record page carries the current selection

## The Entrant-record endpoint

**What to build:** A `GET /api/fpl/entrants` over the seeded Season returns all ten
Entrants' full histories — per-Gameweek points, Squad value and bank series, Chips played
and remaining, captain picks with returns, Transfer history with costs, and the operator
footer's totals — with the captain and Transfer history read by replaying the stored
Manager States.

**Blocked by:** "A seeded FPL Season".

- [ ] The response carries all ten Entrants' full per-Gameweek histories in one body
- [ ] Captain picks and Transfer history replayed from Manager States match the seed's
      known actions, including the Hit's cost
- [ ] Chips played report their Gameweek; Chips remaining count both halves
- [ ] The operator footer totals — Repairs, Roll Overs, Hits taken, Gaps, Prompt Version —
      match the seed
- [ ] A Gameweek missing inside the Settled span is announced in the body, not skipped
- [ ] Responses carry the scored-data cache lifetime
- [ ] Every read filters `track = 'fpl'` and `competition = 'PL'`, as the two shipped FPL
      endpoints do: the Competition is part of the key on `scores` since ADR-0035, and the
      FPL track is the Premier League by nature rather than by argument (spec 0017)

## The Entrant-record page

**What to build:** A reader opens `/fpl/entrants` and reads one Entrant's Season: points per
Gameweek as bars, Squad value and bank as two independently-scaled lines, Chip usage across
all 38 Gameweeks with the first set's expiry marked, captain picks, Transfer history, and
the operator footer.

**Blocked by:** "The FPL section and the ranking page", "The Entrant-record endpoint".

- [ ] The points bars emphasise the latest Gameweek and label every bar
- [ ] The value/bank chart scales each series independently from its own min and max — a
      pure function with its own tests proving a flat series still spans its band
- [ ] The Chip strip renders one cell per Gameweek of the Season, colours played Chips,
      distinguishes past-unplayed from future, and marks the GW19 expiry
- [ ] The no-Chips-played legend states the absence and the count remaining
- [ ] Captain picks show the vice and the captain's return, emphasised at the design's
      threshold; Transfer history shows out, in and cost
- [ ] The picker and `?entrant=` behave as on the squads page, and the selection survives
      switching between the two pages in both directions

## The mobile collapse

**What to build:** A reader on a phone gets the whole section working at 375px — one-row
header with the menu behind a hamburger, stacked grids, a stacked full-width Entrant picker,
and the leaderboard dropping its two least essential columns.

**Blocked by:** "Race and Cards variants", "The latest-squads page", "The Entrant-record page".

- [ ] At the design's breakpoint the header stays one row and the tabs fold into a
      full-width menu that closes on selection
- [ ] The leaderboard hides Squad value and Chips left; every two- and three-column grid
      stacks; the stat strip goes to two by three
- [ ] The Entrant picker becomes a stacked full-width list on both Entrant-scoped pages
- [ ] The collapse is driven by the repo's existing media-query convention — the deliberate
      deviation ADR-0033 records
- [ ] Every interactive control keeps a visible focus state at every width

## First deploy of the section

**What to build:** The section is live: one build and deploy by hand, then the new endpoints
and pages verified against the real edge rather than trusted from configuration — the lesson
ADR-0029 records is that cache behaviour is walked, not read.

**Blocked by:** "The mobile collapse".

- [ ] The deploy follows the runbook — build first, then deploy — and all three pages render
      over production data
- [ ] Each FPL endpoint's cache headers are observed on the live edge: a warmed request
      HITs, and the browser header is `no-cache`
- [ ] A deploy empties the cache for the new endpoints, keeping the runbook's revoke step
      true
- [ ] The Demonstration qualification is visible under the live leaderboard
- [ ] The Match track still renders untouched at the paths spec 0017 moved it to — `/pl`,
      `/pl/fixtures`, `/pl/entrants` and the same three for `/pd` — and the three redirects
      that replaced its old URLs (`/` → `/pl`, `/fixtures`, `/entrants`) still answer
