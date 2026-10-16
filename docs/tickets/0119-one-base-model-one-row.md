# Ticket: One Base Model, one row

**What to build:** where a Base Model has both an Exhibition row and a Guest row in one
Competition and Edition, every page shows them as one row by default:
- the Competition ranking;
- `/overall`;
- the record.

The combined row names its parts ("Exhibition GW1–6 · Guest from GW7"), and carries the
Exhibition caveat while any replayed answer is in the range shown. `?rows=split` splits it
back into two rows on every page. The toggle appears only where something combines. Spec:
[0029](../specs/0029-guest-seats.md). Decision:
[ADR-0064](../adr/0064-a-guest-seat-answers-at-the-lock-without-joining-the-roster.md).

Decisions it must not bend:
- only Exhibition and Guest rows combine, never an Entrant or a Shadow, whatever their Base
  Model;
- combining is within one Competition and Edition on a Competition page, and never across
  Editions anywhere;
- a forecasting-skill claim reads only off the Guest's own row, in the split view.

**Blocked by:** [0115](0115-a-guest-is-ranked-with-its-label.md),
[0116](0116-a-guest-on-the-fixtures-and-its-own-record.md),
[0117](0117-a-guest-on-overall.md).

---

## What is already known

- **The read API keeps returning split rows.** Combining is a pure function beside the
  module that sums `/overall`. It takes a page's rows and returns them combined:
  - Match Points, Bet Points, exact scorelines and correct outcomes summed;
  - RPS as the `n`-weighted mean;
  - `n` summed;
  - Gap rate from the Guest part alone, since the Exhibition part's is withheld (ADR-0052).
    0115 put it at `guest.gapRate`, not beside the row's other figures. It is null when
    the Guest's Locks asked no Fixture, and the combined row passes that null through,
    never a nought;
  - the rank recomputed by the page's existing ordering.

  A combined row carries `parts: { exhibition: {firstGw, lastGw}, guest: {fromGw} }`.
- **The rows to combine are found by `base_model`**, which 0115 put on every row, so two
  snapshots of one Base Model stay one row.
- **A row without `baseModel` is never combined.** After the deploy that added `role` and
  `baseModel`, the edge can still serve a body cached before them, for up to about 65
  minutes (`SCORED_CACHE`, `src/dashboard/read-api.ts`: `max-age=300`,
  `stale-while-revalidate=3600`). The browser is sent `no-cache`, but the
  edge answers its revalidation. In such a body both fields are `undefined`. The combine
  function must not throw on it and must not match two rows on `undefined`: a row with no
  `baseModel` passes through as it is. Find rows by `exhibition` and `guest`, never by
  `role`, for the same reason `overall-view.ts` keys them that way (0117). `/overall`
  rows carry `role` and `baseModel` since 0117.
- **The record under the default** is one Gameweek-by-Gameweek history in which each row
  names its part. Under split, it is the two records 0116 built. The Fixtures page has no
  toggle: each Fixture was answered by one part at most.
- **The parts sentence** is a constant in the frozen-text module.

- **Carried from 0116–0118.** A Guest's record `gameweeks` holds only the Gameweeks its
  Locks asked, none before `fromGw`, and since 0118 the replay stops before `fromGw`. So a
  combined history concatenates the two parts' weeks and they never overlap. The record
  chart's x-axis spans the field's Gameweeks (`entrants.astro` `renderChart`), not the
  selected record's. `overall-view.ts` tests Exhibition against Guest in several places;
  the 0117 review left that until this ticket merges the two.
- **Agreed 2026-10-16 (AskUserQuestion):**
  - The leaderboard's `exhibition` gains `firstGw`/`lastGw`, read off the cumulative Match
    Points row's Edition-scoped `gameweeks`, and null when the part has no answer in range.
    A body cached without `firstGw` is never combined, the same rule as a missing
    `baseModel`. `dashboard-edition-api.test.ts` strips the two new fields.
  - An Exhibition part with no answer in range still combines. The row's figures are then
    the Guest's, its label is the Guest's, and it has no caveat. The toggle still shows.
  - The `/overall` label names Competitions, not Gameweeks: "Exhibition · PL, SA · Guest ·
    PL, SA, PD". Each Competition's page keeps the Gameweek ranges.
  - The ranking page's script moves from `is:inline` to a bundled `<script>` so it can
    import the combine module, as `/overall` and the record page already do.
- **Split record tabs.** Under split, the two records share a slug, so `entrantOf` picks
  the first and the second tab cannot be selected (latent since 0116). The split view has
  to select by id.

## Acceptance

- [x] A Base Model with both rows shows one combined row on the ranking, `/overall` and its
      record by default
- [x] The combined figures are the sums, the `n`-weighted RPS and the Guest-only Gap rate,
      tested as a pure function
- [x] The parts sentence and the Exhibition caveat show while a replayed answer is in
      range, and the caveat goes when none is
- [x] `?rows=split` shows the two rows on every page that combines
- [x] A page where nothing combines shows no toggle and is unchanged
- [x] Entrant and Shadow rows pass through untouched, and the roster-invariance assertion
      still holds

## What was verified

- **One pairing rule** (`pairUp` in `dashboard/src/combine-rows.ts`), used by the ranking,
  the record and `/overall`. A Base Model combines only when all of these hold:
  - it has exactly one Exhibition row and one Guest row;
  - `baseModel` is present;
  - on the leaderboard, `firstGw` is present (a body cached before 0119 has none), and the
    replayed range ends before `fromGw` (`isLeaderboardPair`);
  - on the record, no answered Exhibition week falls at or after `fromGw`.

  `/overall` refuses a Base Model when any covered Competition's page would refuse its
  pair, or when that Competition's body is stale. Its earlier copy of the pairing loop is
  gone, and so is the `summedRows` mode flag.
- **The combine function** (`test/dashboard-combine-rows.test.ts`, 19 tests):
  - Leaderboard: sums, `n`, and the Guest-only Gap rate (a null stays null). Null figures
    before anything is scored stay null. An empty Exhibition part gives the Guest's
    figures with no caveat.
  - Never combined: an Entrant or a Shadow of the same Base Model, two Base Models, a body
    without `baseModel` or `firstGw`, a doubled Exhibition row, a doubled Guest row, and
    overlapping ranges.
  - Record: tiers and markets summed over the union of both sides, so an entry only one
    side has is kept. The `n`-weighted RPS. The history with each week's part. The parts
    range is taken from the weeks actually answered, so a hole before `fromGw` is not
    counted. Overlapping records are not combined.
  - Frozen text: `EXHIBITION_LABEL` beside `GUEST_LABEL`, `partsLabel` and
    `combinedOverallLabel`. The record page uses the constants instead of spelling the
    words.
- **`/overall`** (`dashboard-overall-view.test.ts`, 7 new tests):
  - Combined by default, ranked by the combined total (125 passes GPT-5's 120 where
    neither part alone does).
  - Split, with the Entrant rows identical in both views.
  - An empty part leaves no caveat and no Exhibition clause.
  - Not combined: a stale body without `baseModel`; a body without `firstGw` in a
    Competition that holds no Guest (SA); one Competition whose parts overlap; a part
    doubled under the same slug where both parts sit.
  - A doubled Guest in a Competition with no Exhibition row still combines.
  - `splittable` is false where nothing combines.
- **Read API**: `exhibition.firstGw/lastGw` on the leaderboard, Edition-scoped: Edition
  2 gives 6–7 and Edition 1 gives 1–5 (`dashboard-edition-api.test.ts`). A run resumed
  inside Gameweek 1 gives 1–1 (`dashboard-read-api.test.ts`). The 0084 archive test
  passed without stripping anything, because that seed has no Exhibition row.
- **Bundle**: `dashboard-competition-view.test.ts` holds the ranking page's and the record
  page's imports, and holds `combine-rows.ts` to `import type` only. `astro build` passes,
  and no zod appears in `dist/_astro`.
- **Mutation check**, two rounds:
  - First round: 12 mutations, all killed (`settled > 0` survived until the hole test was
    added).
  - After the review: 11 more against the pairing rule and `refused`. Two survived until
    their tests were fixed: the stale-body check and the doubled-part check in `refused`.
  - One equivalent mutant is left: the `firstGw !== undefined` clause in
    `isLeaderboardPair`. With `firstGw` undefined, `lastGw` is undefined too, and the
    overlap test refuses the pair anyway. The clause stays because it states the rule.
- `guest-seat-coexistence.test.ts` (roster invariance) passes. Touched files: 163 tests.

**Not verified, or not done:**
- No page was looked at in a browser. The toggle, the labels, the split record tabs and
  the caveat rule in the DOM were checked only by `astro check` and `astro build`. The
  "show the toggle only where something combines" rule is tested only as `splittable` on
  `/overall` and as pass-through on `combineEntrants`/`combineRecords`.
- Story 38, taken literally, cannot be met now. Moving the ranking script from
  `is:inline` to bundled changes every ranking page's HTML, and every Exhibition row's
  leaderboard body gains `firstGw`/`lastGw`. What still holds is that a page where nothing
  combines draws the same rows and keeps the toggle hidden. Spec 0029 story 38 and testing
  seam 3 are amended to match, and the check by eye is 0121's acceptance ("a closed
  Edition's page looks as it did").
- The toggle's markup and its ~10-line `?rows=split` loop are repeated on three pages,
  and were not extracted: no queued edit has to change all three copies together yet
  (the repo's forced-edit rule).
- The "Overall ranking" link does not carry `rows=split`. The spec does not ask for it.
