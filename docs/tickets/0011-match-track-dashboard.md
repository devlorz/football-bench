# Tickets: Match track dashboard

Six tracer-bullet slices that put the first reader in front of the benchmark: a seeded Season,
a read-only API, three pages, and one deploy done by hand. Source:
[spec 0011](../specs/0011-match-track-dashboard.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md). Decisions: [ADR 0001–0029](../adr/), especially
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

- [x] A migration creates `dashboard_read` as a `nologin` role, grants it `select` on the
      tables the endpoint reads, and adds a select policy for it on each — and creating the
      role is guarded against `pg_roles`, so a second `resetSchema` in one run does not fail
- [x] Tests `set role dashboard_read` before querying, and a table granted without a policy
      fails a test rather than returning an empty page
- [x] One exported function takes a `Request`, a query interface, the Season and the instant,
      and returns a `Response`; the Worker entry point holds only the wiring
- [x] The endpoint returns nine Entrants when the database also holds FPL seats and FPL
      `scores` rows — the roster filter is role plus the match Prompt Version, and every read
      of `scores` filters `track = 'match'`
- [x] Both qualification strings appear byte-for-byte, compared in the test against the
      constants the scorer exports, so shortening either in the read layer fails
- [x] The settled-Fixture count shown beside the Season is counted from Lock-owned Fixtures
      with a result, and differs from an Entrant's own `n` when that Entrant has Gapped —
      asserted with a Gap present
- [x] `throughGw` is `null` on a Season with nothing scored, and the nine entered Entrants are
      still returned
- [x] The response carries the scored lifetime with an hour of stale, and an unknown path is a
      `404` — the header was `public, s-maxage=300, stale-while-revalidate=3600` when this was
      ticked and is now `Cloudflare-CDN-Cache-Control: max-age=300, stale-while-revalidate=3600`
      with `Cache-Control: no-cache`; see the deploy slice and ADR-0029

## The Leaderboard page

**What to build:** A visitor opens the site and sees the nine Entrants ranked, switches
between Match Points and Bet Points, reads what neither ranking proves, and gets the same page
in dark mode and on a phone. Before the first Gameweek is scored the same page tells them the
table fills after the first Gameweek settles and lists who is entered.

This slice also lands everything the other two pages inherit: the Astro project, the vendored
design system sheet, the header, the nav, the theme toggle, the 760px breakpoint, and the
loading and error treatments.

**Blocked by:** "The read seam and the leaderboard endpoint".

- [x] The nine Entrants render ranked with their bars, ids and Base Model Class, matching the
      design at 1440px in both themes
- [x] The sort control reorders the table and recomputes the ranks; the choice is in the URL
      via `replaceState` and survives a reload; Back leaves the page rather than stepping
      through sort choices
- [x] Both qualifications render at full length from the response — the panel grows to fit the
      text rather than the text being cut to fit the panel
- [x] With `throughGw` null the pre-season state renders instead, with the Lock date and the
      nine entered Entrants
- [x] The design system sheet is vendored unmodified and every override lives in a second
      sheet beside it
- [x] Chrome, headings and column headers are in the built HTML; while the fetch is in flight
      the data region holds still blocks with no animation; a failed fetch is one line in the
      danger colour and nothing retries
- [x] At 375px the nav collapses behind the hamburger, picking a link closes it, the rows take
      the two-column form the design specifies, and the page does not scroll sideways
- [x] Tab reaches every control and the focus ring is the accent one at 2px offset, never the
      browser default — ticked once and unticked again: the ring that was walked was
      Modernist's inset one, clipped by `.seg`, and the ring at 2px offset that replaced it
      has not been seen. See the walk record below. **Re-walked and passed** during the
      Fixtures slice.
- [x] The manual acceptance checklist in spec 0011 has been walked and its result recorded on
      the ticket

### The manual acceptance walk

Walked by hand against the seeded Postgres (`the design's` and `pre-season`), in both themes,
at 1440px and 375px. Nine steps in spec 0011 §"The pages"; four of them are about pages this
slice does not build, and are deferred rather than passed.

| # | Step | Result |
|---|---|---|
| 1 | Each nav link reaches its page and marks itself current | **Partial.** Leaderboard reaches its page and takes `aria-current`. `/fixtures` and `/entrants` 404 until their slices land. |
| 2 | Sort reorders and recomputes ranks; URL updates; reload holds; Back leaves the page | Pass |
| 3 | Picking an Entrant redraws everything | Deferred — the Entrant Record page |
| 4 | Opening a rationale closes the one already open | Deferred — the Fixtures page |
| 5 | The theme toggle flips both ways and holds across a nav and a reload | Pass |
| 6 | Tab reaches every control and the focus ring is the accent one, never the browser default | **Pass**, on the re-walk during the Fixtures slice |
| 7 | At 375px the nav collapses, picking a link closes it, every grid is one column, the page does not scroll sideways | Pass. The per-Gameweek table in this step belongs to the Entrant Record page. |
| 8 | With the Worker stopped, each page shows the one error line and no spinner | Pass |
| 9 | With the seed stopped at `pre-season`, each page shows its pre-season state | Pass |

Three things changed after the walk and were unseen at the time. All three were re-walked
during the Fixtures slice and passed: the ring draws outside `.seg` and is not clipped, the
column headers are in the accessibility tree at 375px, and the toggle's name says which theme
the click leads to. The record of what changed is kept below.

- **Step 6.** The ring on the sort control was Modernist's inset `-2px` one, clipped by
  `.seg`'s `overflow: hidden`. Both halves were moved; the ring at 2px offset is unwalked.
- **Step 6 and the screen reader.** The ruled list now carries `table` / `row` /
  `columnheader` / `cell` roles, and at 375px the column headers are clipped rather than
  `display: none` so they stay in the accessibility tree.
- **Step 5.** The theme toggle's accessible name now says which theme the click leads to.

## The first deploy, by hand

**What to build:** The dashboard is reachable on the internet at one hostname, with the Worker
answering `/api/*` on it, and an operator knows how to rotate the credential that makes it
work. Doing it by hand once means the deploy is understood before anything automates it.

**Blocked by:** "The Leaderboard page".

- [x] The Pages site and the Worker are deployed, and a Worker route claims `/api/*` on the
      Pages hostname so the browser fetches a relative path and nothing is cross-origin —
      **met by a different shape, reported below:** one Worker serving both, no Pages site
- [x] The Worker runs with `nodejs_compat` and a compatibility date recent enough for
      `postgres.js`; if the driver proves awkward the Hyperdrive fallback is reported before it
      is taken, not taken quietly — `postgres.js` reached Supabase on the first deploy and the
      fallback was not needed
- [x] Caching is enabled in the Worker configuration and the endpoint's `Cache-Control` is
      observed in a real response — the header alone does not cache a Worker's response
- [x] The Worker's login role is provisioned outside migrations, granted membership in
      `dashboard_read`, and its password held as a Worker secret; the schema names it nowhere
- [x] A runbook entry covers provisioning and rotating that credential, and states that
      revoking access is one `revoke dashboard_read from`
- [ ] A hosted preview renders chrome and the error line — previews carry no live data, and
      this is confirmed rather than assumed — **not delivered.** Chrome and the error line are
      both confirmed, but on the production hostname, which is not a preview. A preview that
      carries no live data does not exist on this topology; see below

### The deploy

Live at **<https://football-bench.leelorz6.workers.dev>**, against the production Supabase.
Runbook: [docs/runbooks/dashboard-deploy.md](../runbooks/dashboard-deploy.md).

Production was at migration 0016, so `0017_dashboard_read_role.sql` was applied as part of
this. `dashboard_worker` was then created by hand with a generated password, granted
`dashboard_read`, and its connection string put in as a Worker secret — the password is in no
file in this repository and was never printed.

Production holds the real Season and nothing scored: 38 Gameweeks, nine Entrants, no `scores`
row. Every page therefore renders its pre-season state, which is the correct state and was
confirmed in a driven Chrome on the hosted URL — the Leaderboard's Lock and entered roster,
the Fixtures page's Gameweek 1 with the "No predictions stored" banner and nine pending slots,
and the Entrant record's "No settled gameweeks". `baseModelClass` is null throughout, because
it is written by the seed and the seed never runs against a deployed database.

**One Worker, not Pages plus a route.** A Worker route needs a zone and `*.pages.dev` is not
one, so `/api/*` on a Pages hostname requires a custom domain this deploy does not have. The
Worker serves `dashboard/dist` as static assets and `run_worker_first = ["/api/*"]` sends the
API to the script — which gets the whole property the route existed for: one hostname, a
relative fetch, nothing cross-origin. Reported rather than taken quietly, as the ticket's own
rule for the Hyperdrive fallback requires.

**`/api/*` is edge-cached, and the first account of this on the ticket was wrong.** The claim
that a Worker on `*.workers.dev` cannot cache came from the Cache API page, which describes
the `caches.default` *runtime* API. It does not describe `[cache] enabled = true`, the Worker
configuration that makes Cloudflare check the cache before invoking the Worker at all
(Wrangler 4.69.0+; this repository pins 4.120.1). With it set, `/api/leaderboard` returns
`cf-cache-status: MISS` and then `HIT`, and a repeated unique query key answers in ~0.04s
against ~0.25s for a fresh one. Caught by review, and the criterion is met.

**The `stale-while-revalidate` had never once taken effect.** Cloudflare disables stale-serving
entirely on a response carrying `s-maxage`, `must-revalidate` or `proxy-revalidate` (RFC 9111
4.2.4), and the header was `public, s-maxage=300, stale-while-revalidate=3600`. The lifetime is
now on `cloudflare-cdn-cache-control` with `max-age`, where the stale window works, and
`Cache-Control` is `no-cache` so the browser holds nothing — which also closes the trap below
at its source. Recorded in ADR-0029.

**No hosted preview exists, and this criterion is not met.** `wrangler versions upload` gave a
public preview URL holding the *production* secret, answering `/api/leaderboard` with
production data — the opposite of the data-free preview the criterion and ADR-0028 assume,
which was true of Pages previews on their own origins and is not true of a Worker version.
`preview_urls = false` is set and that URL 404s, but disabling a preview is not delivering one.
Chrome and the error line were confirmed on the production hostname instead, which is worth
having and is not the same claim. A custom domain plus a Pages project is what would restore a
real preview environment.

**The deployed topology now has an ADR.** ADR-0028 mandated Pages plus a Worker route and was
left standing against a deploy that does neither.
[ADR-0029](../adr/0029-the-dashboard-deploys-as-one-worker-serving-both-the-assets-and-the-read-api.md)
supersedes its topology and its preview consequence; ADR-0028 carries the status note, and the
`dashboard/README.md` opening and the `astro.config.mjs` comment no longer describe Pages.

**The error line was confirmed on the hosted site, by revoking.** With permission, and on a
site with no readers yet, `revoke dashboard_read from dashboard_worker` was run against
production. All three endpoints turned 500 and the Leaderboard rendered its one error line —
*"The leaderboard could not be read. Nothing is being retried."* — with the chrome intact, the
headline strip empty and no spinner. `grant dashboard_read to dashboard_worker` restored it
and all three endpoints returned 200. Roughly a minute dark. This walks the runbook's revoke
claim as well as the criterion, and both are now demonstrated rather than asserted.

**The browser cache caught it a third time, and this time against a real edge** — which is the
confirmation the Entrant slice asked for. With the grant revoked, an *ordinary* reload of the
hosted page rendered the cached pre-season body and no error line at all. Only
cache-bypassing reload showed the truth. The response carries `s-maxage` and no `max-age` and
the browser heuristically caches it; deploying changed nothing about that. **Fixed since, at
the source:** `Cache-Control` is now `no-cache` and the lifetime moved to
`Cloudflare-CDN-Cache-Control` (ADR-0029), so the browser revalidates every load and this trap
is closed. The walk above was done before that.

**Two things the deploy found and fixed.** Both were invisible until it was deployed, which is
the argument for doing the first one by hand.

- Every nav click cost a 307. Astro's directory build gives `/fixtures/index.html`, the nav
  links to `/fixtures`, and the asset router redirects one to the other. `build.format: "file"`
  removes the hop. The old redirect survived in the edge cache for a few minutes after the fix
  deployed, which is its own small lesson about verifying a fix through a cache.
- Nothing kept a log. A single 500 from `/api/entrants` minutes after the first deploy could
  not be explained afterwards; twenty sequential and twenty-four concurrent requests since have
  all returned 200. `[observability]` is now on, so the next one is diagnosable. Recorded as
  unexplained rather than written off.

## Fixtures and the committed Predictions

**What to build:** A visitor sees the Gameweek in front of them, every Fixture in it, and what
all nine Entrants committed before the Lock — the probability split, the Predicted Score,
whether the two cohere, and the rationale on demand with the context hash and Repair count
beside it. Before the Prediction run the same page tells them predictions are pending and when
the two runs happen.

**Blocked by:** "The Leaderboard page".

- [x] The current Gameweek is the earliest owning a Fixture that is not deferred and has no
      result, ownership read as `coalesce(locked_in_gw, gw)`; if all are settled it is the last
      Gameweek by number
- [x] That rule is asserted at each of its cases: before any Prediction run when no Fixture has
      a `locked_in_gw` at all, before a deadline, after a deadline with Fixtures unsettled,
      after every Fixture settles, at the final Gameweek, and with a deferred Fixture that
      never settles
- [x] Every Fixture carries nine Entrant slots in the same order, a Gapped Entrant appearing as
      a slot with a null Prediction rather than as a missing entry, and the "n of 9" tag counts
      the filled ones
- [x] Coherence is derived from the Prediction alone — the argmax of `probs` against the
      Outcome the Predicted Score implies — and an incoherent Prediction renders in the danger
      colour
- [x] The Repair count is labelled Repairs and reads `attempts_used`, so zero means valid on
      the first attempt; nothing on the page calls it attempts
- [x] Expanding a rationale closes the one already open, and the panel carries the display-only
      label, the context hash and the note that the Prediction was stored before the deadline
- [x] The Lock note counts the Fixtures actually in the Gameweek rather than asserting ten
- [x] The page does not read `throughGw`: with Gameweek 1 locked and unscored it shows the
      committed Predictions, not the pre-season state
- [x] The response carries sixty seconds with no stale window — `public, s-maxage=60` when this
      was ticked, now `Cloudflare-CDN-Cache-Control: max-age=60` with `Cache-Control: no-cache`
- [x] The manual acceptance checklist has been walked and its result recorded on the ticket

### The manual acceptance walk

Fourteen tests in
[test/dashboard-fixtures-api.test.ts](../../test/dashboard-fixtures-api.test.ts) cover the
endpoint over a real Postgres under `dashboard_read`; `astro check`, `astro build` and
`tsc --noEmit` are clean; `modernist.css` is still byte-for-byte the vendored file.

Walked in a driven Chrome against the seeded Postgres (`the design's`), in both themes and in
both layouts. Nine steps in spec 0011 §"The pages".

| # | Step | Result |
|---|---|---|
| 1 | Each nav link reaches its page and marks itself current | **Partial.** Leaderboard and Fixtures both reach their page and take `aria-current`. `/entrants` 404s until its slice lands. |
| 2 | Sort reorders and recomputes ranks; URL updates; reload holds; Back leaves the page | Passed on the Leaderboard slice; not re-walked, nothing in this slice touches it |
| 3 | Picking an Entrant redraws everything | Deferred — the Entrant Record page |
| 4 | Opening a rationale closes the one already open | Pass. Exclusive within a Fixture and across two, and the button it closes goes back to `Why`. |
| 5 | The theme toggle flips both ways and holds across a nav and a reload | Pass. Its name reads `Switch to dark theme` / `Switch to light theme` — the re-walk the Leaderboard slice was waiting on. |
| 6 | Tab reaches every control and the focus ring is the accent one, never the browser default | Pass. Nav links, theme toggle, every `Why`, and the sort control all take a 2px accent ring at 2px offset with `:focus-visible` matching; the sort control's ring draws **outside** `.seg` and is not clipped, which is the other re-walk the Leaderboard slice was waiting on. |
| 7 | At 375px the nav collapses, picking a link closes it, every grid is one column, the page does not scroll sideways | Pass, with one caveat below |
| 8 | With the Worker stopped, each page shows the one error line and no spinner | Pass |
| 9 | With the seed stopped at `pre-season`, each page shows its pre-season state | Pass. The leaderboard states the Lock and lists the nine entered Entrants; the Fixtures page shows Gameweek 1 with the banner and nine pending slots per Fixture. Walked at `pending` as well, which is the state that state's banner was written for. |

**The 375px caveat.** Chrome will not size its own window below about 757 CSS pixels, so the
breakpoint's branch was exercised at 757 and the 375 case was checked by squeezing the document
to 375 within it: `scrollWidth` stayed at 375 and the only elements past the edge were the
column headers inside their clipped 1px box. Nothing was seen at a real 375-pixel viewport.

**The banner's two wordings both walked.** It carries the −6h / −2h sentence while the Lock is
ahead and swaps it once the Lock has passed, because saying two runs *fire* when both are
behind the deadline is false. Walked at `pending`, the second wording by moving Gameweek 15's
deadline behind the clock on a database that was re-seeded straight after.

**Two defects found and fixed during the walk.**

- The phone row put the Predicted Score on its own line under the probability bar; the design
  has it beside the Entrant's name. Source order is name, split, score, coherence, so the fix
  is `order` on the split and what follows it rather than a second DOM order for one layout.
- The pending banner's prose was invisible in the dark theme. `--color-accent-100` is the one
  token whose light value is a background rather than an ink, and the dark theme had not
  overridden it — so a near-white paragraph sat on a near-white panel. Fixed on the token, not
  on the banner, because `.tag-accent` is filled from the same one.

**One thing to know before the next walk.** After re-seeding, a page can render the *previous*
Season's numbers: the endpoint's `Cache-Control` carries `s-maxage` and no `max-age`, and a
browser will heuristically cache such a response. A reload with the cache bypassed shows the
truth. **Confirmed against a real edge in the deploy slice and then fixed there:**
`Cache-Control` is now `no-cache` (ADR-0029), so this no longer applies to a walk done today.

Two additions the design does not name, both stated here rather than left to be found:

- **A Fixture with every slot empty says so in its own block** — `9 entrants pending · context
  not yet built`, which is the design's per-Fixture pending line, shown per Fixture rather than
  only when the whole Gameweek is pending. A Gameweek half-filled by the Fill run would
  otherwise show an empty table under a banner that says predictions have not run.
- **A deferred Fixture stays on the page if it was Locked** and is dropped if it was not. Its
  Predictions were committed under this Gameweek's Lock and are what a reader came for; one
  that left the schedule before any run reached it would render as nine Gaps. Both branches are
  asserted, and the rule's *fallback* counts the same Fixtures the listing shows rather than
  merely the undeferred ones — a Season whose last Gameweek is entirely deferred and unlocked
  would otherwise select a Gameweek the page then renders none of, which is exactly the empty
  state the fallback exists to prevent.

## The Entrant record

**What to build:** A visitor picks one of the nine Entrants and reads its Season Gameweek by
Gameweek — its cumulative Match Points drawn against the other eight, where its points came
from across the 5 / 3 / 2 / 0 tiers, which Bet Slip markets it actually wins, and the table
behind all of it. Switching Entrant redraws everything at once and costs no second request.

**Blocked by:** "The Leaderboard page".

- [x] `/api/entrants` returns all nine with their complete per-Gameweek series, so selecting an
      Entrant is a re-render and not a fetch
- [x] Tier counts and per-market hit counts are taken over the flattened
      `detail.gameweeks[].fixtures[]` of the cumulative rows, and match the same counts summed
      over that Season's per-Gameweek rows
- [x] Counts are counted from the detail, never recovered by multiplying `score_pct` or
      `outcome_pct` by `n`
- [x] The cumulative chart's domains follow the data — x from Gameweek 1 to `throughGw`, y to a
      deterministic ceiling at or above the field's highest total — and no line is clipped at
      `throughGw` 14 or at `throughGw` 30
- [x] The selected Entrant is in the URL and survives a reload; switching redraws the chart,
      the tier bar, the market list and every table row together
- [x] A non-zero Gap count renders in the danger colour, a Gapped Gameweek stays in the table,
      and the page states that nothing is back-filled
- [x] The response carries the scored lifetime with an hour of stale — as the leaderboard's,
      and moved to `Cloudflare-CDN-Cache-Control` with it
- [x] At 375px the per-Gameweek table scrolls inside its own wrapper and the page does not
      scroll sideways
- [x] The manual acceptance checklist has been walked and its result recorded on the ticket

### The manual acceptance walk

Ten tests in
[test/dashboard-entrants-api.test.ts](../../test/dashboard-entrants-api.test.ts) cover the
endpoint over a real Postgres under `dashboard_read`, one of them through the Worker's own
driver — this is the first body carrying whole `jsonb` columns across the seam, and a driver
handing `detail` back as text would empty every series, tier and market without an error
anywhere. Four more in
[test/dashboard-entrant-chart.test.ts](../../test/dashboard-entrant-chart.test.ts) cover the
chart's two domains, which are the one part of the page's script that can be wrong while still
rendering as a chart. `astro check`, `astro build` and `tsc --noEmit` are clean;
`modernist.css` is still byte-for-byte the vendored file.

**This page's script is bundled rather than `is:inline`**, unlike the other two, because an
inline script can import nothing and the domains had to be importable to be tested. Being
bundled it is also type-checked, so it now reads the seam's exported `EntrantsBody` — a page
cannot go on describing a shape the endpoint has left, which is the rule the Fixtures slice
put the tests under and this puts the page under too.

Walked in a driven Chrome against the seeded Postgres (`the design's` and `pre-season`), in
both themes and in both layouts. Nine steps in spec 0011 §"The pages".

| # | Step | Result |
|---|---|---|
| 1 | Each nav link reaches its page and marks itself current | **Pass, and complete for the first time.** All three pages now exist; each takes `aria-current` and the other two do not. |
| 2 | Sort reorders and recomputes ranks; URL updates; reload holds; Back leaves the page | Passed on the Leaderboard slice; not re-walked, nothing in this slice touches it |
| 3 | Picking an Entrant redraws everything | Pass. One click swaps the four headline figures, the chart's accent line, the tier bar and its four counts, the five market rows and all fourteen table rows. The id is in the URL, a reload holds it, and Back from two selections landed on the Leaderboard rather than stepping through them. |
| 4 | Opening a rationale closes the one already open | Passed on the Fixtures slice; this page has no rationale |
| 5 | The theme toggle flips both ways and holds across a nav and a reload | Pass, including across a nav from the Leaderboard into this page |
| 6 | Tab reaches every control and the focus ring is the accent one, never the browser default | Pass. The nine Entrant buttons take the 2px accent ring at 2px offset with `:focus-visible` matching; nothing on the page is unreachable. |
| 7 | At 375px the nav collapses, picking a link closes it, every grid is one column, the page does not scroll sideways | Pass, with the same caveat and one note below |
| 8 | With the Worker stopped, each page shows the one error line and no spinner | Pass — after a cache-bypassing reload; see below |
| 9 | With the seed stopped at `pre-season`, each page shows its pre-season state | Pass. `throughGw` null renders "No settled gameweeks" and the record region is hidden entirely. |

**The 375px caveat is unchanged**, and it is the same one the Fixtures slice recorded: Chrome
will not size its own window below about 757 CSS pixels. The breakpoint's branch was exercised
at 757 — burger shown, nav links hidden, the headline strip at two columns, the charts row at
one — and the 375 case was checked by squeezing the document within it: `body.scrollWidth`
stayed at 375, and the per-Gameweek table scrolled inside its own wrapper (560px of table in a
343px box) rather than moving the page.

**The chart's axis labels are small on a phone**, and this is stated rather than fixed. The
SVG keeps its 880-unit viewBox and scales to the column, so at 375px the 11px tick labels
render at about 4px. The design squashes the same chart at the same width, every figure the
chart draws is in the table beneath it, and the alternatives — a second horizontal scroller, or
a font size recomputed against the rendered width on every resize — are both worse than the
thing they fix. Worth a look if the phone layout is ever revisited.

**The browser cache cost time again**, exactly as the Fixtures slice recorded. With the Worker
stopped, an ordinary reload rendered the *cached* body and no error line at all; the error
state only appeared on a cache-bypassing reload. The response carries `s-maxage` and no
`max-age` and a browser heuristically caches it. **Confirmed at the edge in the deploy slice
and fixed there** — `Cache-Control` is now `no-cache` (ADR-0029).

**Three things the walk found and fixed.**

- The last x-axis label was cut in half. The first and last Gameweeks sit on the plot's own
  edges, so a centred label hangs outside the viewBox; the ends now anchor `start` and `end`.
- The Outcome column read `3 / 9` for an Entrant that answered eight of the Gameweek's nine
  Fixtures — an Entrant-scoped numerator over a Lock-scoped denominator. The body now carries
  the Entrant's own settled count per Gameweek beside the Lock's, and the column reads `3 / 8`.
  The Fixtures column still says what the Lock owned, which is the figure the Gaps are against.
- The pre-season block was the Leaderboard's two-column grid with nothing in its right half.
  That state has a panel of entered Entrants to put there and this one does not, so it is one
  column here.

A fourth thing was fixed unprompted: an `?entrant=` id that is not on the roster falls back to
the first Entrant *and rewrites the URL to it*, so a stale link is not copied onward still
naming a seat that is not being shown.
