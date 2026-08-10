# Tickets: Match track dashboard

Six tracer-bullet slices that put the first reader in front of the benchmark: a seeded Season,
a read-only API, three pages, and one deploy done by hand. Source:
[spec 0011](../specs/0011-match-track-dashboard.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md). Decisions: [ADR 0001–0028](../adr/), especially
[ADR 0027](../adr/0027-the-read-api-reaches-postgres-directly-under-a-select-only-role.md) and
[ADR 0028](../adr/0028-the-dashboard-is-a-static-build-that-fetches-at-runtime.md).
Design of record: [docs/design_handoff_match_track](../design_handoff_match_track/).

Work the **frontier**: the first three are a chain, and once the Leaderboard page lands the
last three open at once.

Nothing in this set computes a score or writes a `scores` row. Every figure is read from what
the write path already stores, and a figure the design asks for that cannot be read that way is
dropped rather than added to the scorer.

---

## A seeded Season with three stopping points

**What to build:** A developer with an empty local Postgres runs one command and gets the
Season the design was drawn against — fourteen settled Gameweeks and an unsettled fifteenth,
nine Entrants, every Prediction and result in place, with the real scorer run over it. The seed
stops at any of three points, so the same command produces the pre-season state, the pending
state and the design's state without three sets of data that can drift apart. It is a
development and test tool and never runs against a deployed database.

The seed is also where each Entrant gets its **Base Model Class** — Frontier, First-party or
Open-weight — written into the existing `models.config`, since nothing else in the repo creates
the roster in one place.

**Blocked by:** None — can start immediately.

- [x] One command against an empty database produces nine Entrants carrying the match Prompt
      Version, fourteen settled Gameweeks, and a fifteenth with Fixtures and Predictions and
      no results
- [x] Every `scores` row comes from running the real scorer; the seed writes none itself, and
      a test asserts no `scores` row exists until the scorer has run
- [x] Each of the three stopping points produces exactly the state the spec's table names —
      pre-season is the roster and Gameweek 1 Fixtures, pending adds fourteen settled
      Gameweeks and Gameweek 15's Fixtures, the design's adds Gameweek 15's contexts and
      Predictions
- [x] Each Entrant's row carries its Base Model Class, and the three classes across the roster
      match ADR-0014 — three Frontier, one First-party, five Open-weight
- [x] The seed leaves at least one Gap and one incoherent Prediction, so the states the pages
      must render are present rather than hypothetical
- [x] A Gameweek with other than ten Fixtures is present, so nothing downstream can quietly
      assume ten

## The read seam and the leaderboard endpoint

**What to build:** A `GET /api/leaderboard` over the seeded Season returns the nine Entrants
with their Match Points, Bet Points, Base Model Class, the Season's settled-Fixture count and
both qualification strings — served by a Worker that reaches Postgres as a role which can only
select. This is the tracer bullet: it proves the role, the policies, the driver, the seam and
the harness together, and every later endpoint is an addition to a path that already works.

**Blocked by:** "A seeded Season with three stopping points".

- [ ] A migration creates `dashboard_read` as a `nologin` role, grants it `select` on the
      tables the endpoint reads, and adds a select policy for it on each — and creating the
      role is guarded against `pg_roles`, so a second `resetSchema` in one run does not fail
- [ ] Tests `set role dashboard_read` before querying, and a table granted without a policy
      fails a test rather than returning an empty page
- [ ] One exported function takes a `Request`, a query interface, the Season and the instant,
      and returns a `Response`; the Worker entry point holds only the wiring
- [ ] The endpoint returns nine Entrants when the database also holds FPL seats and FPL
      `scores` rows — the roster filter is role plus the match Prompt Version, and every read
      of `scores` filters `track = 'match'`
- [ ] Both qualification strings appear byte-for-byte, compared in the test against the
      constants the scorer exports, so shortening either in the read layer fails
- [ ] The settled-Fixture count shown beside the Season is counted from Lock-owned Fixtures
      with a result, and differs from an Entrant's own `n` when that Entrant has Gapped —
      asserted with a Gap present
- [ ] `throughGw` is `null` on a Season with nothing scored, and the nine entered Entrants are
      still returned
- [ ] The response carries `public, s-maxage=300, stale-while-revalidate=3600`, and an unknown
      path is a `404`

## The Leaderboard page

**What to build:** A visitor opens the site and sees the nine Entrants ranked, switches
between Match Points and Bet Points, reads what neither ranking proves, and gets the same page
in dark mode and on a phone. Before the first Gameweek is scored the same page tells them the
table fills after the first Gameweek settles and lists who is entered.

This slice also lands everything the other two pages inherit: the Astro project, the vendored
design system sheet, the header, the nav, the theme toggle, the 760px breakpoint, and the
loading and error treatments.

**Blocked by:** "The read seam and the leaderboard endpoint".

- [ ] The nine Entrants render ranked with their bars, ids and Base Model Class, matching the
      design at 1440px in both themes
- [ ] The sort control reorders the table and recomputes the ranks; the choice is in the URL
      via `replaceState` and survives a reload; Back leaves the page rather than stepping
      through sort choices
- [ ] Both qualifications render at full length from the response — the panel grows to fit the
      text rather than the text being cut to fit the panel
- [ ] With `throughGw` null the pre-season state renders instead, with the Lock date and the
      nine entered Entrants
- [ ] The design system sheet is vendored unmodified and every override lives in a second
      sheet beside it
- [ ] Chrome, headings and column headers are in the built HTML; while the fetch is in flight
      the data region holds still blocks with no animation; a failed fetch is one line in the
      danger colour and nothing retries
- [ ] At 375px the nav collapses behind the hamburger, picking a link closes it, the rows take
      the two-column form the design specifies, and the page does not scroll sideways
- [ ] Tab reaches every control and the focus ring is the accent one at 2px offset, never the
      browser default
- [ ] The manual acceptance checklist in spec 0011 has been walked and its result recorded on
      the ticket

## The first deploy, by hand

**What to build:** The dashboard is reachable on the internet at one hostname, with the Worker
answering `/api/*` on it, and an operator knows how to rotate the credential that makes it
work. Doing it by hand once means the deploy is understood before anything automates it.

**Blocked by:** "The Leaderboard page".

- [ ] The Pages site and the Worker are deployed, and a Worker route claims `/api/*` on the
      Pages hostname so the browser fetches a relative path and nothing is cross-origin
- [ ] The Worker runs with `nodejs_compat` and a compatibility date recent enough for
      `postgres.js`; if the driver proves awkward the Hyperdrive fallback is reported before it
      is taken, not taken quietly
- [ ] Caching is enabled in the Worker configuration and the endpoint's `Cache-Control` is
      observed in a real response — the header alone does not cache a Worker's response
- [ ] The Worker's login role is provisioned outside migrations, granted membership in
      `dashboard_read`, and its password held as a Worker secret; the schema names it nowhere
- [ ] A runbook entry covers provisioning and rotating that credential, and states that
      revoking access is one `revoke dashboard_read from`
- [ ] A hosted preview renders chrome and the error line — previews carry no live data, and
      this is confirmed rather than assumed

## Fixtures and the committed Predictions

**What to build:** A visitor sees the Gameweek in front of them, every Fixture in it, and what
all nine Entrants committed before the Lock — the probability split, the Predicted Score,
whether the two cohere, and the rationale on demand with the context hash and Repair count
beside it. Before the Prediction run the same page tells them predictions are pending and when
the two runs happen.

**Blocked by:** "The Leaderboard page".

- [ ] The current Gameweek is the earliest owning a Fixture that is not deferred and has no
      result, ownership read as `coalesce(locked_in_gw, gw)`; if all are settled it is the last
      Gameweek by number
- [ ] That rule is asserted at each of its cases: before any Prediction run when no Fixture has
      a `locked_in_gw` at all, before a deadline, after a deadline with Fixtures unsettled,
      after every Fixture settles, at the final Gameweek, and with a deferred Fixture that
      never settles
- [ ] Every Fixture carries nine Entrant slots in the same order, a Gapped Entrant appearing as
      a slot with a null Prediction rather than as a missing entry, and the "n of 9" tag counts
      the filled ones
- [ ] Coherence is derived from the Prediction alone — the argmax of `probs` against the
      Outcome the Predicted Score implies — and an incoherent Prediction renders in the danger
      colour
- [ ] The Repair count is labelled Repairs and reads `attempts_used`, so zero means valid on
      the first attempt; nothing on the page calls it attempts
- [ ] Expanding a rationale closes the one already open, and the panel carries the display-only
      label, the context hash and the note that the Prediction was stored before the deadline
- [ ] The Lock note counts the Fixtures actually in the Gameweek rather than asserting ten
- [ ] The page does not read `throughGw`: with Gameweek 1 locked and unscored it shows the
      committed Predictions, not the pre-season state
- [ ] The response carries `public, s-maxage=60` with no stale window
- [ ] The manual acceptance checklist has been walked and its result recorded on the ticket

## The Entrant record

**What to build:** A visitor picks one of the nine Entrants and reads its Season Gameweek by
Gameweek — its cumulative Match Points drawn against the other eight, where its points came
from across the 5 / 3 / 2 / 0 tiers, which Bet Slip markets it actually wins, and the table
behind all of it. Switching Entrant redraws everything at once and costs no second request.

**Blocked by:** "The Leaderboard page".

- [ ] `/api/entrants` returns all nine with their complete per-Gameweek series, so selecting an
      Entrant is a re-render and not a fetch
- [ ] Tier counts and per-market hit counts are taken over the flattened
      `detail.gameweeks[].fixtures[]` of the cumulative rows, and match the same counts summed
      over that Season's per-Gameweek rows
- [ ] Counts are counted from the detail, never recovered by multiplying `score_pct` or
      `outcome_pct` by `n`
- [ ] The cumulative chart's domains follow the data — x from Gameweek 1 to `throughGw`, y to a
      deterministic ceiling at or above the field's highest total — and no line is clipped at
      `throughGw` 14 or at `throughGw` 30
- [ ] The selected Entrant is in the URL and survives a reload; switching redraws the chart,
      the tier bar, the market list and every table row together
- [ ] A non-zero Gap count renders in the danger colour, a Gapped Gameweek stays in the table,
      and the page states that nothing is back-filled
- [ ] The response carries `public, s-maxage=300, stale-while-revalidate=3600`
- [ ] At 375px the per-Gameweek table scrolls inside its own wrapper and the page does not
      scroll sideways
- [ ] The manual acceptance checklist has been walked and its result recorded on the ticket
