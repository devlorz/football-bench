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

## Acceptance

- [ ] A Base Model with both rows shows one combined row on the ranking, `/overall` and its
      record by default
- [ ] The combined figures are the sums, the `n`-weighted RPS and the Guest-only Gap rate,
      tested as a pure function
- [ ] The parts sentence and the Exhibition caveat show while a replayed answer is in
      range, and the caveat goes when none is
- [ ] `?rows=split` shows the two rows on every page that combines
- [ ] A page where nothing combines shows no toggle and is unchanged
- [ ] Entrant and Shadow rows pass through untouched, and the roster-invariance assertion
      still holds
