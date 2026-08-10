# Spec 0011 — Match track dashboard

**Status:** ready-for-agent
**Scope:** the read API and the three public pages of the match track — the first thing
downstream of the database
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:** [ADR 0001–0028](../adr/)
**Design of record:** [docs/design_handoff_match_track](../design_handoff_match_track/) —
`Match Track.dc.html` and `tokens/`
**Predecessors:** [spec 0002](./0002-match-track-scoring.md) and
[spec 0008](./0008-bet-points-ranking.md) write every number this spec renders; nothing here
computes a score

---

## Problem Statement

Everything the benchmark produces is invisible. Nine Entrants, a scorer that writes Match
Points, Bet Points, RPS, Brier, Coherence, Gaps and their season-to-date counterparts, an
immutable Prediction store with the Lock provable against a deadline — and the only way to
read any of it is a `psql` prompt held by the one person with the connection string. Every
spec so far has ended with the same line: the leaderboard, dashboard and read API are
downstream and nothing renders these rows. That is now the whole of what is missing.

The Season starts and there is nothing to point anyone at. A benchmark nobody can read is not
a benchmark; it is a database.

There is a sharper version of the problem underneath. The scorer deliberately carries
`MATCH_POINTS_QUALIFICATION` and `BET_POINTS_QUALIFICATION` in the detail of every row a
ranking can be read off, on the stated reasoning that a value must not be able to reach a
reader without its caveat. Today there is no reader, so the qualification has never had to
work. The first thing that renders these numbers is also the first thing that can strip that
caveat off them, and it must not.

## Solution

Three public pages on Cloudflare Pages, reading a read-only Cloudflare Worker at `/api/*`,
built to the Modernist design of record.

- **Leaderboard** — the nine Entrants ranked Season-to-date, by Match Points or Bet Points,
  with the qualification under it and the Fixture count behind it.
- **Fixtures** — the upcoming Gameweek and every Entrant's committed Prediction: the
  probability split, the Predicted Score, whether the two cohere, and the rationale on demand.
- **Entrant record** — one Entrant's history Gameweek by Gameweek: cumulative Match Points
  against the field, the 5/3/2/0 tier breakdown, per-market Bet Slip hit rates, and the table
  behind all of it.

The Worker reads Postgres directly as a select-only role (ADR-0027). The pages are a static
Astro build that fetches at runtime (ADR-0028). Nothing in this spec computes a score, derives
a metric, or writes a row: every number is read from `scores`, `predictions`, `fixtures`,
`gameweeks`, `contexts` and `models` as the write path already stores them.

Today is before the first Gameweek of the Season, so the state that ships on day one is the
pre-season one. It is the default path, not a fallback.

## User Stories

### Reading the leaderboard

1. As a visitor, I want to see the nine Entrants ranked by Match Points, so that I can tell at
   a glance who is leading the Season.
2. As a visitor, I want each rank shown as a numeral with the leader in the accent colour, so
   that the ordering is readable without me comparing values.
3. As a visitor, I want each Entrant's Match Points drawn as a bar against the leader's total,
   so that I can see the size of a gap and not just its existence.
4. As a visitor, I want to switch the ranking to Bet Points, so that I can see the second
   readable ranking and how differently it orders the same Entrants.
5. As a visitor, I want the ranks to recompute when I switch, so that position one always
   means first under the ranking I am looking at.
6. As a visitor, I want the ranking I chose to survive a page reload and be in the link I copy,
   so that I can send someone the Bet Points table and have them see the Bet Points table.
7. As a visitor, I want each Entrant shown with its id and its Base Model Class, so that I know
   whether I am reading an open-weight Base Model or a frontier one.
8. As a visitor, I want the number of scored Fixtures behind the ranking stated beside it — the
   Season's settled Fixtures, not any one Entrant's count — so that I know how much evidence
   the ordering rests on and a Gap by one Entrant does not silently move the figure the whole
   ranking is presented against.
9. As a visitor, I want to be told what Match Points do not prove, in the benchmark's own
   words and at full length, so that I do not read a leaderboard as a claim it is not making.
10. As a visitor, I want to be told the same about Bet Points, including that the slip is flat
    and oddsless, so that I understand a conservative slip can farm the high lines.
11. As a visitor, I want the Season, the count of scored Fixtures and the Gameweek reached
    shown together at the top, so that I know how current what I am reading is.
12. As a visitor, I want no Reference Line anywhere on the ranking, so that the leaderboard
    only ever contains things that compete.

### Reading the fixtures

13. As a visitor, I want to see the upcoming Gameweek's Fixtures, so that I know what has been
    forecast and when it kicks off.
14. As a visitor arriving while a Gameweek's matches are being played, I want to still be on
    that Gameweek rather than the next one, so that the page does not hide the Predictions I
    came to check the moment the deadline passes.
15. As a visitor, I want the Lock deadline stated once at the top, so that I know the single
    moment every Fixture of the Gameweek was committed at — counted from the Gameweek in front
    of me, since rescheduling before a Lock can leave a Gameweek with more or fewer than ten.
16. As a visitor, I want each Fixture to say how many of the nine Entrants predicted it, so
    that a Gap is visible as absence rather than inferred from a short list.
17. As a visitor, I want every Entrant's Home / Draw / Away probabilities as one stacked bar
    plus the three numbers, so that I can compare shapes down the column and still read exact
    values.
18. As a visitor, I want each Entrant's Predicted Score beside its probabilities, so that I can
    see the two halves of one Prediction together.
19. As a visitor, I want to see whether a Prediction is Coherent, so that I can tell when an
    Entrant's likeliest outcome disagrees with the scoreline it named.
20. As a visitor, I want an incoherent Prediction marked in the danger colour, so that it reads
    as a flag and not as a data point.
21. As a visitor, I want to expand one Entrant's rationale, so that I can read why it forecast
    what it did.
22. As a visitor, I want the rationale labelled as display-only and never scored, so that I do
    not mistake prose for evidence.
23. As a visitor, I want the context hash and the Repair count beside a rationale, so that I
    can see the Prediction was built from a recorded context and how many Repairs it cost —
    with zero meaning it was valid first time, not that it was never asked for.
24. As a visitor, I want opening one rationale to close the one I had open, so that the page
    does not grow under me.
25. As a visitor, I want it stated that the Prediction was stored before the deadline, so that
    the Lock is something the page asserts rather than something I have to trust.

### Reading an Entrant Record

26. As a visitor, I want to pick one of the nine Entrants, so that I can look at its history
    rather than the field's.
27. As a visitor, I want the Entrant I picked to be in the link I copy, so that I can send
    someone one Entrant's record.
28. As a visitor, I want its Match Points, Bet Points, RPS and Gap count as four headline
    figures, so that I get the shape of its Season before any chart.
29. As a visitor, I want a cumulative Match Points line for my Entrant drawn over the other
    eight, so that I can see it pull away or fall back against the field rather than in
    isolation.
30. As a visitor, I want switching Entrant to redraw every chart, list and row at once, so that
    I am never looking at two Entrants' numbers on one screen.
31. As a visitor, I want the 5 / 3 / 2 / 0 tier breakdown as one bar plus counts and
    percentages, so that I can see whether points came from exact scorelines or from outcomes.
32. As a visitor, I want the Bet Slip hit rate broken down by market — result, over/under 2.5,
    3.5, 4.5, both teams to score — so that I can see which legs the Entrant actually wins.
33. As a visitor, I want a row per Gameweek with Fixtures, Match Points, Bet Points, exact
    hits, correct outcomes, RPS and Gaps, so that I can find the Gameweek behind any total.
34. As a visitor, I want a non-zero Gap count in the danger colour, so that absence is as
    visible as poor performance.
35. As a visitor, I want to be told nothing is back-filled, so that I read a missing Gameweek
    as a missing Gameweek.
36. As a visitor, I want a Gameweek the Entrant Gapped to remain in the table, so that the
    record does not quietly close over it.

### Before the Season starts

37. As a visitor arriving before the first Gameweek is scored, I want the leaderboard to say
    the table fills after the first Gameweek settles, so that an empty page is not read as a
    broken one.
38. As a visitor arriving before the first Gameweek, I want the Lock date stated, so that I
    know when there will be something to see.
39. As a visitor arriving before the first Gameweek, I want the nine entered Entrants listed
    with their ids, so that I can see who is competing before anyone has scored.
40. As a visitor, I want the Fixtures page before any Prediction run to show the Fixtures with
    a banner explaining the main run at deadline −6h and the Fill at −2h, so that I know
    predictions are pending rather than missing.
41. As a visitor, I want each Fixture in that state to say nine Entrants are pending and the
    context is not yet built, so that the absence is specific.

### The page itself

42. As a visitor, I want to move between the three pages from a nav that marks where I am, so
    that I always know which page I am on.
43. As a visitor, I want to switch to a dark theme, so that I can read the site at night.
44. As a visitor, I want my theme choice to hold across pages and reloads, so that I set it
    once.
45. As a visitor on a phone, I want the nav behind a hamburger and every grid stacked to one
    column, so that the site is usable at 375px.
46. As a visitor on a phone, I want picking a nav link to close the menu, so that I am not left
    with a menu over the page I asked for.
47. As a visitor on a phone, I want the per-Gameweek table to scroll inside its own wrapper, so
    that the page itself never scrolls sideways.
48. As a keyboard user, I want a 2px accent focus ring at 2px offset on everything I can reach,
    so that I can see where I am without the browser default.
49. As a visitor, I want the page chrome, headings and column headers to render immediately
    while the numbers are still loading, so that I see the structure before the data.
50. As a visitor, I want the loading state to be still, so that nothing on a site with no
    animation starts pulsing at me.
51. As a visitor, I want a single clear line in the danger colour when the data cannot be read,
    so that I can tell a broken API from an empty Season.

### Operating it

52. As an operator, I want the Worker to read Postgres as a role that can only select, so that
    the one internet-facing edge cannot write, delete or reach a table it was not granted.
53. As an operator, I want the Worker's login credential to live outside migrations, so that
    rotating it is a secret change and not a schema change.
54. As an operator, I want every endpoint to carry a cache lifetime matched to how often its
    data actually changes, so that the Fixtures page does not serve Gaps the Fill has closed.
55. As an operator, I want to deploy the Worker and the pages by hand the first time, so that I
    see it work before any automation depends on it working.
56. As an operator, I want the whole dashboard to be reachable at one hostname, so that there
    is no API origin to configure wrongly.

### Proving it

57. As a developer, I want one seam covering routing, status, headers and body, so that a
    change to any of them has exactly one place that fails.
58. As a developer, I want the read tests to run against a real Postgres through the harness
    every other module uses, so that the constraints being relied on are the real ones.
59. As a developer, I want the read tests to run under the dashboard's own role, so that a
    missing policy fails a test instead of silently returning nothing in production.
60. As a developer, I want a seeded Season I can build the pages against, so that I can see the
    full state before a real Gameweek exists.
61. As a developer, I want the seed's numbers produced by running the real scorer, so that what
    I am looking at is what the scorer would write and not what I imagined it writes.

## Implementation Decisions

### What this spec does not compute

Every figure on all three pages already exists in `scores`, or is derivable from a `scores`
row's `detail` without arithmetic the scorer does not already do:

| Page figure | Source |
|---|---|
| Match Points, Bet Points, RPS, Gaps | the `_season_to_date` metrics and their per-Gameweek counterparts |
| an Entrant's own evidence count | the `n` column on that Entrant's row |
| Match Points qualification | `detail.qualification` on the Match Points rows |
| Bet Points qualification | `detail.qualification` on the Bet Points rows |
| 5 / 3 / 2 / 0 tier counts | counting `points` over the flattened Match Points detail |
| exact hits, correct outcomes | counting `points === 5` and `points > 0` over the same |
| per-market hit rate | counting won legs over the flattened Bet Points detail |

No new metric, no new column on `scores`, no change to the scorer. If a figure in the design
cannot be read this way, the design's figure is dropped rather than the scorer extended.

**The qualifications have one documented exception.** They are normally read from the stored
ranking rows. If a scored Season has no ranking rows because no Entrant has settled a
Prediction, the read layer uses the scorer-exported canonical qualifications, so that a
visible zero ranking never loses its caveats.

**Which branch applies is decided once, and never per string.** The read layer asks whether
any ranking row was found at all: none and a scored Season is the exception; ranking rows
present means the stored string is the only answer, and its absence is a fault that fails
closed rather than one the constant papers over. A fallback asked per qualification would
answer a missing Bet Points caveat on a Season full of ranking rows with the constant —
silently, and looking exactly like the intended exception, which is how a storage fault
becomes invisible. A reader gets the page's error line instead, which is the state the design
already has for data that cannot be read.

That Season exists: an outage across the Prediction window can take all nine Entrants at once
— the roster reaches every Base Model through one provider (ADR-0009) — and if it takes the
Season's first settled Gameweek, the scorer writes no ranking row for anybody while the page
still ranks nine Entrants at nought. The exception is narrow by construction and stated in
full: it applies only where `throughGw` is not null and no ranking row carries a qualification
at all, which needs no Entrant to have settled one Prediction all Season, since a cumulative
row exists from the first Gameweek any Entrant settled one on.

The invariant being protected is the one this spec's problem statement is built around: a
value must not reach a reader without its caveat. The alternative that keeps every
qualification inside Postgres is a scorer that writes zero-valued cumulative Match and Bet
Points rows with `n: 0` when the whole roster Gaps — which is a change to the scorer, and so
a change to the decision above rather than a detail of the read layer. It is not taken here:
the exported constant is the same source of truth the scorer itself writes from, so the two
cannot drift, and inventing rows would change what a `scores` row means for every reader of
the table.

**Cumulative detail is nested.** A per-Gameweek row holds `detail.fixtures[]`; a
`_season_to_date` row holds `detail.gameweeks[].fixtures[]`. Every count above is taken over
the flattening of the cumulative shape, and a read that assumes the flat shape on a cumulative
row silently counts nothing. Counts are counted, never reconstructed: `score_pct` and
`outcome_pct` are shares, and multiplying a float share by `n` to recover an integer is a
rounding bug waiting for the Gameweek that makes it visible. The shares are rendered as shares;
the counts come from the detail.

**The hero's scored-Fixture count is not any Entrant's `n`.** Each Entrant's `n` counts the
Fixtures it settled a Prediction on, so two Entrants differ whenever one Gapped. The figure
shown beside the Season — the evidence the whole ranking rests on — is counted independently:
Fixtures of the Season that a Lock owns and that have a result, without reference to any
Entrant. Per-Entrant `n` is kept separately and drives that Entrant's own record.

### Coherence per Prediction

The `coherence` metric is a share over an Entrant's Predictions. The Fixtures page needs the
flag for one Prediction, which is the argmax of `probs` against the Outcome the Predicted Score
implies. It is derived in the read layer from the Prediction alone, reads no result, and uses
the same comparison the scorer uses, so the page and the metric can never disagree.

### Three endpoints, one per page

| Endpoint | Body |
|---|---|
| `/api/leaderboard` | the nine Entrants with id, name, Base Model Class, Match Points, Bet Points, both qualifications, per-Entrant `n`, the Season's settled-Fixture count, `throughGw`, and `nextLock` |
| `/api/fixtures` | the current Gameweek, its deadline, its Fixtures, and per Fixture a slot for each of the nine Entrants |
| `/api/entrants` | all nine Entrants with their complete per-Gameweek series, tier counts and per-market hit counts |

`/api/entrants` returns the whole field rather than one Entrant because the cumulative chart
draws all nine lines at once; selecting an Entrant is therefore a re-render and not a fetch.
Each body is what one page renders, so no page composes two responses and none over-fetches.

**`nextLock` is the pre-season state's own fact**, and is on `/api/leaderboard` because story 38
asks the empty table to state the Lock a reader is waiting on, and no page composes two
responses — a leaderboard reaching for the Fixtures body to find a date would break exactly the
rule this section sets. It is `{ gw, deadlineAt }` or null, and it is null on any Season that
has been scored: a Season with a table to read has no use for a deadline, and a page carrying
both could put one beside the other.

Pre-season it is the Season's **earliest** Gameweek, not the earliest deadline still ahead of
the clock. Nothing scored is a Season the seed writes as the roster and Gameweek 1 alone, so
the state holds one Lock; and a clock would answer a Season whose first deadline has passed
while its scoring run has not yet landed with no date at all.

**`throughGw` is carried by `/api/leaderboard` and `/api/entrants`**, the two pages that gate
on it, because no page composes two responses and a page whose body lacks it has no way to ask.

**The Fixtures page does not gate on `throughGw`, and must not.** `throughGw` moves when the
scorer runs; Predictions exist from the main run at deadline −6h. Through the whole of
Gameweek 1 — committed Predictions on the page, the Lock provably passed, matches played —
`throughGw` is still `null`, and a Fixtures page reading it would call all of that pre-season
and hide the very Predictions it exists to show. Its state comes from its own body instead:
the Gameweek the rule selected, whether the Lock has passed, and how many of its Prediction
slots are filled. No Fixture at all is the pre-season state; Fixtures with every slot null is
the pending state and takes the −6h / −2h banner; anything else is the committed view.

### Which nine Entrants

`role = 'entrant'` is not the roster: both tracks' seats hold that role, so it selects
eighteen. The match roster is the Season Roster as `CONTEXT.md` defines it — role plus the
track's Prompt Version — which here means `role = 'entrant'` and
`prompt_version = MATCH_PROMPT_VERSION`, the constant the predict path already exports. Every
read of `scores` additionally filters `track = 'match'`.

Both filters are load-bearing and neither substitutes for the other: the roster filter keeps
FPL seats off the leaderboard, and the track filter keeps an FPL demonstration metric from
being read as a match one for a seat that holds both. A read missing either mixes the tracks,
and it mixes them into a ranking, which is the one place ADR-0003 and the FPL track's
demonstration framing are careful never to let happen.

`throughGw` is `null` when no Gameweek has been scored. That single field, not an empty array,
is what the Leaderboard and Entrant record pages switch their pre-season state on — an empty
array cannot distinguish a Season that has not started from a request that returned nothing.
The Fixtures page reads its own body instead, for the reason set out above.

**A Gap is a slot, not a missing key.** Every Fixture in `/api/fixtures` carries all nine
Entrants, each as `{ entrant, prediction }` with `prediction` null when the Entrant has none.
An Entrant that Gapped must be visibly absent rather than quietly not in the list, which is the
same reasoning the scorer's `gap_rate` metric exists for: an Entrant that did not answer must
not be indistinguishable from one that answered badly. The "n of 9 predicted" tag is a count of
non-null slots, and the row order is the same nine in the same order on every Fixture.

Each non-null `prediction` carries `probs`, the Predicted Score, the coherence flag, the
rationale, the context hash, and the **Repair count** — `predictions.attempts_used`, which the
scorer itself aliases as `repairs` and which is `0` for a Prediction that was valid on the
first attempt. It is labelled Repairs on the page. Nothing renders it as "attempts", which
would make a clean Prediction read as never having been asked.

### The read seam

One exported function takes a `Request`, a query interface, the configured `season`, and the
instant it is answering at, and returns a `Response`. It owns routing, the three bodies, `404`,
and the cache header. The Worker entry point is the wiring that opens a `postgres.js`
connection, reads the Season from configuration, passes the real clock, and calls it; it holds
no logic worth a test.

Season and clock are parameters and not ambient, following
`run-scheduled-predictions`, which already takes both: every table is Season-scoped, and a test
that cannot pin the instant cannot assert the difference between before a Lock and after one.

### Which Gameweek the Fixtures page shows

The database stores no current-Gameweek marker and the FPL `is_next` flag is not retained, so
the rule is derived and stated here once:

**The current Gameweek is the earliest Gameweek of the Season owning a Fixture that is not
deferred and has no result. If every such Fixture has a result, it is the last Gameweek by
number.**

Ownership here is `coalesce(locked_in_gw, gw)`. `locked_in_gw` is assigned once the Prediction
run first locks the Fixture — the main run, around deadline −6h — so until then every Fixture's
is null, and a rule reading `locked_in_gw` alone would find nothing on exactly the page the
pre-season state exists for. The coalesce is not invented here: it is what the predict path
already selects due work by, and it is the write path's own reading of ADR-0015 — a Fixture
belongs to its Locked Gameweek once it has one, and to its scheduled Gameweek until then.

That one rule covers the cases that would otherwise each need their own:

- *Before a deadline* — the upcoming Gameweek, nothing settled, which is the design's state.
- *After a deadline, matches in play* — the Gameweek stays put rather than jumping forward the
  instant the Lock passes, so the page does not hide the Predictions it exists to show while
  their Fixtures are still being played.
- *After every Fixture settles* — it advances on its own, with no clock involved.
- *After the final Gameweek of the Season* — there is no later one to advance to, so it holds
  on the last, and the page reads as a finished Season rather than as an empty one.
- *A postponed or unscheduled Fixture* — excluded by the `deferred` flag, so a Fixture that
  never gets a result cannot pin the page to an old Gameweek forever.

The instant is used for one thing only: whether the Lock has passed, which is what separates
the pre-lock banner from the committed view. It never selects the Gameweek.

The query interface is the minimum both runtimes satisfy — a call taking SQL and parameters and
returning rows. It exists because ADR-0027 puts `postgres.js` on the Worker and `pg` everywhere
else, and it is what lets one seam cover both. Nothing else in the repo changes driver.

### Database access

Per ADR-0027, a migration creates `dashboard_read` as a `nologin` privilege role, grants it
`select` on the tables the three endpoints read, and adds a `for select to dashboard_read
using (true)` policy to each of them — under the row level security migration 0003 enabled,
a grant without a policy returns zero rows and reports no error. The Worker authenticates as a
separate login role granted membership in `dashboard_read`, provisioned by an operator outside
migrations with its password held as a Worker secret.

**Creating the role is guarded.** A role is a cluster object and the test harness resets only
the `public` schema, so the role outlives every reset while its grants and policies go with the
tables and are rebuilt. An unguarded `create role` therefore succeeds once and fails on the
second `resetSchema` of the same run. Postgres has no `create role if not exists`, so the
migration guards it with a `do` block against `pg_roles` — the same shape migration 0003
already uses to skip `anon` and `authenticated` when they are absent. The grants and the
policies below it are unguarded, because those really are recreated from nothing each time.

Any later migration adding a table the dashboard reads carries its grant and its policy in the
same file, alongside the `enable row level security` migration 0003 already requires.

### Caching

Per ADR-0028, lifetimes are per endpoint because the three do not change on the same clock:

- `/api/leaderboard` and `/api/entrants` — `public, s-maxage=300, stale-while-revalidate=3600`;
  they move when the daily scoring run writes.
- `/api/fixtures` — `public, s-maxage=60`, no stale window; Predictions land at deadline −6h
  and again at −2h, and an hour of stale would show Gaps the Fill has already closed.

Caching must be enabled in the Worker's configuration; the header alone does not cache a
Worker's response.

### The pages

Astro, `output: 'static'`, three routes, deployed to Pages. A Worker route claims `/api/*` on
the same hostname so the browser fetches a relative path and no origin is a build input. Local
development reaches the same path through a dev proxy.

Interactivity is local to the element it sits in: the sort control, the Entrant selector, the
rationale disclosure, the theme toggle and the mobile menu share no state. Sort order and
selected Entrant are written to the URL with `history.replaceState`; the open rationale is not.

`replaceState` and not `pushState`: these are view toggles, not navigation. The stories they
serve are the link being copyable and the choice surviving a reload, and both hold without a
history entry. Pushing one per toggle would make Back walk a reader out of a page one sort
click at a time. Back therefore leaves the page rather than restoring the previous sort, and
the acceptance checklist expects exactly that.

Charts are hand-written SVG to the geometry the design gives — the cumulative chart is
`viewBox="0 0 880 260"`, inset left 44 / bottom 30 / top 8 / right 6. No chart library.

The axes the design shows — GW1–GW14, y fixed 0–260 with ticks every 65 — are the mock's
snapshot and not the domain. A Season runs to Gameweek 38 and cumulative Match Points pass 260
well before it, so both domains are computed: **x runs from Gameweek 1 to `throughGw`; y runs
from 0 to a ceiling at or above the field's highest cumulative total.** The ceiling and its
ticks are chosen deterministically — the same data gives the same axis on every render, and a
tick count in the region of four keeps the design's density. At `throughGw` 14 with the design's
numbers this reproduces the mock; at Gameweek 30 it does not clip the leader off the top.

The design system sheet is vendored whole and never edited, so the next version of it can be
merged; every override — the purple accent, the `--tier-*` ramp, the dark theme — lives in a
second sheet beside it.

### Loading and error

Chrome, headings and column headers are real HTML from the build. While a fetch is in flight
the data region holds still blocks in `--color-surface` laid over the same grid the real rows
use — the design system has no animation and no radius, and the loading state does not
introduce either. A failed fetch is one `--danger` line under the heading. Nothing retries.

### Vocabulary

Two terms were added to `CONTEXT.md` during design and the pages use them:

- **Base Model Class** — Frontier, First-party or Open-weight. Shown as `claude/v1 · Frontier`,
  `deepseek/v1 · Open-weight`. Stored in the existing `models.config`, needing no migration,
  and read by
  nothing but this dashboard. `Tier` is not used for it: Tier is the Match Points tier.
- **Entrant Record** — the name of the third page, replacing the design's "Model stats", which
  the glossary forbids.

The Season identifier stays `2026-27`; the design's `2026/27` is display formatting applied at
render.

## Testing Decisions

### What makes a good test here

A test drives the seam the way the Worker does — a `Request` in, a `Response` out — and asserts
on what a reader of the API can observe: status, headers, and the body's shape and values. It
does not assert on which SQL ran, how many queries were issued, or the internal shape of a read
function.

Numbers under test come from running the real scorer over seeded Predictions and results, never
from hand-written `scores` rows. A test that inserts its own `scores` row proves the endpoint
can echo a row; it cannot notice the day the endpoint reads the wrong metric name.

### What gets tested

- **The seam, over a real Postgres.** Each endpoint returns the documented body over a seeded
  Season; an unknown path is a `404`; each endpoint carries its own documented `Cache-Control`.
- **The pre-season branch.** With no scored Gameweek, `/api/leaderboard` returns `throughGw:
  null` and the nine entered Entrants.
- **Gameweek 1, locked but unscored.** Predictions committed, the Lock passed, nothing scored:
  `/api/fixtures` returns filled slots and the leaderboard still returns `throughGw: null`.
  This is the case a Fixtures page gating on `throughGw` would get wrong, and it exists for
  a real four days of every Season.
- **The qualifications survive the round trip.** On a Season with ranking rows, both
  qualification strings appear in the leaderboard body byte-for-byte as the scorer wrote them
  — the constants are exported and the test compares against them, so shortening one in the
  read layer fails. This is the storage round trip, and it is what the normal Season proves.
- **The canonical fallback keeps the caveats on a ranking with no rows.** With the whole roster
  Gapping the Season's first settled Gameweek, both strings still appear. This test proves the
  exception, not the round trip: there is no stored string in this state, and the assertion it
  makes is that a visible zero ranking does not reach a reader bare. The two tests are kept
  apart deliberately, so that neither is read as evidence for the other.
- **A qualification missing where ranking rows exist fails closed.** With the Bet Points
  caveat stripped from a scored Season's rows, the endpoint raises rather than returning the
  constant — the case that separates the documented exception from a storage fault wearing its
  clothes.
- **Derived figures agree with their source.** Tier counts sum to the Match Points row's `n`;
  per-market hit counts sum to what the slips in `detail` hold.
- **Coherence.** A Prediction whose argmax disagrees with its Predicted Score is flagged; one
  that agrees is not.
- **Gaps are absences, not omissions.** An Entrant with no Prediction for a Fixture appears in
  the Fixtures body as a slot with a null Prediction, every Fixture carries nine slots
  whatever happened, and the Entrant's Gameweek stays in its record.
- **Cumulative detail is read through its nesting.** Tier and market counts taken from a
  `_season_to_date` row match the same counts summed over that Season's per-Gameweek rows. A
  read that assumed the flat shape returns zero and fails here.
- **The Gameweek selection rule, at each of its cases.** Before any Prediction run, when no
  Fixture has a `locked_in_gw` at all; before a deadline; after a deadline with Fixtures
  unsettled; after every Fixture settles; at the final Gameweek; and with a deferred Fixture
  that never settles.
- **The roster is the match roster.** With an FPL seat present in `models` and FPL rows
  present in `scores`, every endpoint still returns nine Entrants and no match figure moves.
- **A Gameweek with other than ten Fixtures.** The Lock note and the per-Fixture tag count
  what is there rather than asserting ten.
- **The chart domains follow the data.** The axis at `throughGw` 14 and at `throughGw` 30
  differ, and no cumulative total is clipped by the ceiling at either.
- **The hero count is not an Entrant's `n`.** With one Entrant Gapping a Fixture the whole
  field settled, the hero count and that Entrant's `n` differ, and each is the right number.
- **The role is the one production uses.** Tests `set role dashboard_read` before querying, so
  a table granted without a policy fails here rather than returning an empty page in
  production.

### The pages

`astro build` and `tsc --noEmit` prove the pages compile. They prove nothing about a dozen of
the stories above — URL state surviving a reload, sorting recomputing ranks, one disclosure
closing another, theme holding across pages, the focus ring, the 375px layout. A slice that
touches a page is not complete until this list has been walked by hand against the seeded
Postgres, in both themes, at 1440px and 375px:

1. Each nav link reaches its page and marks itself current.
2. The sort control reorders the leaderboard and the ranks recompute; the URL updates; a reload
   holds the choice; Back leaves the page rather than stepping through sort choices.
3. Picking an Entrant redraws every chart, list and table row; the URL updates; a reload holds
   it.
4. Opening a rationale closes the one already open.
5. The theme toggle flips both ways and holds across a nav and a reload.
6. Tab reaches every control and the focus ring is the accent one, never the browser default.
7. At 375px the nav collapses, picking a link closes it, every grid is one column, the
   per-Gameweek table scrolls inside its wrapper and the page does not scroll sideways.
8. With the Worker stopped, each page shows the one error line and no spinner.
9. With the seed stopped at its pre-season stage, each page shows its pre-season state — an
   emptied database is not that state, since pre-season still holds the roster and the
   Gameweek 1 Fixtures the empty leaderboard lists its Entrants from.

This is a checklist, not a suite, because Q17's answer stands: a browser driver is more
machinery than these nine steps are worth today. If the list starts being skipped, that is the
signal to make it a suite rather than to shorten it.

### Prior art

`test/score-match-gameweek.test.ts` is the closest existing test: a real Postgres through
`test/schema-fixture.ts` and `test/temporary-postgres.ts`, rows seeded, the real function
called, assertions on stored values against exported metric-name constants. The read tests are
the same shape with a `Request` at the front. `test/schema.test.ts` is the prior art for
asserting a migration's effect on privileges and constraints, and is where the `dashboard_read`
grant-and-policy pairing is checked.

## Out of Scope

- **Any change to the scorer, or any new metric.** If the design asks for a number the write
  path does not produce, the number is dropped.
- **The FPL track tab.** Task 3.5 of the roadmap, and a demonstration rather than a ranking.
- **The ops dialog and the `stB` alternate layout.** Both present in the design file, both
  already switched off in it.
- **Reference Lines on any ranking.** They belong to the probability layer.
- **A deploy workflow.** First deploy is by hand; CI is its own slice with nothing yet to
  protect.
- **Cache purging on write.** Sixty seconds on the endpoint that moves is shorter than the
  machinery a purge hook would cost.
- **Live data on hosted Pages previews.** They render chrome and the error line and prove the
  build; anything to be looked at is looked at locally against the seeded Postgres.
- **Browser and visual regression tests.**
- **Paired Difference intervals, Brier, accuracy and the Comparison Anchor.** Written by the
  scorer, not on any of these three pages.

## Further Notes

### Order of work

Five slices, each a vertical one:

1. Seed, the read seam, the Worker, `/api/leaderboard`, and the `dashboard_read` migration.
   This is the tracer bullet: it proves the role, the driver, the seam and the harness together.
2. Base Model Class into `models.config`.
3. The Leaderboard page — chrome, nav, theme, the 760px breakpoint, and both Season states.
4. `/api/fixtures` and the Fixtures page.
5. `/api/entrants` and the Entrant record page.

### The seed

There is no scored Season to build against, so slice 1 seeds a local Postgres with fourteen
settled Gameweeks of Fixtures, results and Predictions for all nine Entrants and then runs the
real scorer over it. The seed writes no `scores` row itself. It exists for development and for
the read tests; it is never run against a deployed database.

Fourteen settled Gameweeks alone reproduce the design's leaderboard and not its Fixtures page:
under the selection rule, a Season with nothing unsettled holds on the last Gameweek, so the
page would show a finished GW14 where the design shows an upcoming GW15. The seed therefore
carries **a fifteenth Gameweek with Fixtures and Predictions and no results**, which is the
state the design was drawn in — through GW14 on the leaderboard, GW15 on the Fixtures page.

Three states, each the previous one plus one thing:

| State | Seed holds | Pages show |
|---|---|---|
| pre-season | the roster and GW1 Fixtures; no Predictions, no results | every empty state; `throughGw` null; Fixtures pending |
| pending | fourteen settled Gameweeks, plus GW15 Fixtures with no Predictions | leaderboard through GW14; Fixtures on GW15 with the −6h / −2h banner and nine Entrants pending |
| the design's | pending, plus GW15 contexts and Predictions | the design of record |

Each is the previous plus one addition, so there is one seed with three stopping points rather
than three fixture files that can drift apart.

### Two things already changed

`CONTEXT.md` gained **Base Model Class** and **Entrant Record** during the design session. The
comment block at the head of migration 0003 was corrected in the same pass: it claimed a holder
of the anon key could truncate the attempt ledger, which PostgREST does not expose. The
migration's reasoning and its SQL are unchanged — the grant is still the load-bearing fix — but
the mechanism is now stated accurately, and `attempts` and `scores` carrying no immutability
trigger is named, since that is what makes ordinary `DELETE` sufficient.

### What to verify early

`postgres.js` on Workers needs `nodejs_compat` and a recent enough compatibility date. If it
proves awkward, the recorded fallback is Hyperdrive with `pg` — the queries take an injected
client, so the driver is the only thing that would change. That is a slice-1 finding to report,
not a decision to take quietly.
