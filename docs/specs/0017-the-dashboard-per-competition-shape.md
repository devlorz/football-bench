# Spec 0017 — The dashboard's per-Competition shape

**Status:** ready-for-agent
**Scope:** the Match track dashboard and its read API, from one league to many
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:** [ADR-0039](../adr/0039-the-dashboard-gives-every-competition-its-own-path.md)

---

ADR-0035 grew the record a Competition dimension and left the dashboard's shape for a later
decision; spec 0016 listed it Out of Scope and left `read-api.ts` serving `PL` through
twenty-seven `competition = 'PL'` literals written to be replaced. ADR-0039 is that
decision. This spec turns it into buildable, testable requirements.

Reads ADR-0027 (the read API reaches Postgres under a select-only role), ADR-0028 (a static
build that fetches at runtime, with the reader's state in the URL), ADR-0029 (one Worker
serves the assets and the API on one origin), ADR-0033 (the FPL track is a sibling section
separated by path alone), ADR-0034 and ADR-0038 (every Competition seats the roster that
stood at the Season's first Lock, under one Prompt Version per Competition), and ADR-0035
(each Competition is its own benchmark and no ranking spans two — the second half
superseded by ADR-0051, which sums the leagues at `/overall`; the benchmark question
stays per-league).

## Problem Statement

La Liga is about to write rows the dashboard cannot show. Every Match query in the read API
has `competition = 'PL'` compiled into it, so `PD`'s Gameweeks, Fixtures, Predictions and
scores land in the record and reach no reader — and the site has no URL, no control and no
vocabulary for saying which league is being looked at, because until now there was only one.

Removing the literals is not enough on its own. A reader has to be able to say which
Competition they mean, arrive at a league that has not opened without being told the site is
broken, and carry the Entrant they are reading across a league boundary that renames every
seat. None of those has a place to live in a site built for one league.

## Solution

Every Competition becomes a path prefix — `/pl`, `/pd`, and `/pl/fixtures`, `/pd/entrants`
under them — and no Competition owns `/`, which redirects. A switcher in the header crosses
between Competitions while holding the reader's current page. The route set and the
switcher's entries come from `MATCH_PROMPT_COMPETITIONS` at build time, so the chrome is in
the built HTML and a Competition appears the deploy after its Prompt Version is frozen. The
read API takes the Competition as its first path segment with no default, replacing every
literal. A Competition that is not Active answers `200` with a sentence of its own, distinct
both from the pre-season panel that promises a table and from the failure line that says
nothing could be read. `?entrant=` carries the seat's slug rather than its full id, so the
selection survives the crossing.

## User Stories

### Every Competition has its own path

1. As a reader, I want La Liga's leaderboard at `/pd`, so that I can link someone directly to
   the league I am talking about.
2. As a reader, I want the Premier League at `/pl` rather than at `/`, so that no league's URL
   claims to be the site itself when each is a separate benchmark.
3. As a reader, I want `/pd/fixtures` and `/pd/entrants` to be the same two pages I know from
   the Premier League, so that learning the site once is learning it for every league.
4. As a reader arriving at `/`, I want to land on a working leaderboard rather than an empty
   page, so that the site has a front door.
5. As a reader following an old link to `/fixtures` or `/entrants`, I want to arrive at the
   Premier League's copy of that page, so that a link made before the expansion still works.
6. As a maintainer, I want those redirects to be temporary rather than permanent, so that `/`
   can become a hub page later without every returning browser having cached its way past it.
7. As a reader of the FPL section, I want `/fpl` and everything under it unchanged, so that
   the expansion of one track does not move the other.

### Crossing between Competitions

8. As a reader on La Liga's Fixtures page, I want to reach Serie A's Fixtures page in one
   click, so that changing league does not cost me the page I was reading.
9. As a reader, I want the switcher to say which Competition I am currently on, so that I can
   tell two identically laid-out leagues apart.
10. As a reader, I want each of the switcher's entries to be a real link, so that I can
    middle-click it, copy it, or open it in a new tab.
11. As a reader on a slow connection, I want the switcher present in the first paint rather
    than appearing when a fetch lands, so that the page does not move under my cursor.
12. As a reader, I want the switcher to name leagues the way the benchmark names them to
    Entrants — "Premier League", "La Liga" — so that the site and the packet agree.
13. As a keyboard or screen-reader user, I want the current Competition announced as the
    current page, so that the switcher reads as navigation and not as decoration.

### A Competition that has not opened

14. As a reader visiting a Competition the benchmark has not opened, I want to be told it has
    not opened, so that I do not sit refreshing a page waiting for a table.
15. As a reader, I want that message to differ from the pre-season panel, so that I am not
    promised a table for a league whose opening is still gated on a cost review.
16. As a reader, I want that message to differ from the failure line, so that I am not told
    something could not be read when nothing failed.
17. As a reader of an Active Competition whose first Gameweek is not scored yet, I want the
    existing pre-season panel with its entered Entrants and its next Lock, so that the state
    that already reads correctly keeps reading correctly.
18. As a maintainer, I want a Competition to appear on the site only once its Prompt Version
    is frozen, so that the site never advertises a league nobody has committed to running.

### The read API takes a Competition

19. As a reader of `/api/pd/leaderboard`, I want only La Liga's rows, so that a ranking never
    spans two benchmarks.
20. As a maintainer, I want `/api/pl/leaderboard` to be unable to return a `PD` row and the
    reverse, so that the failure ADR-0035 exists to prevent cannot reach a reader.
21. As a maintainer, I want no endpoint that omits the Competition, so that no request can
    fall back to the Premier League by default.
22. As a maintainer, I want a request naming a Competition the dashboard does not serve to be
    answered `404`, so that a typo is a missing thing and not an empty league.
23. As a maintainer, I want `/api/fpl/leaderboard` and `/api/fpl/squads` untouched, keeping
    their `PL` literal, so that the FPL track — the Premier League by nature — is not given a
    dimension it does not have.
24. As a maintainer, I want every Match endpoint to keep the cache headers it has today, so
    that this change moves no cache lifetime.

### Reading one Entrant

25. As a reader looking at one Entrant's record in the Premier League, I want to switch to La
    Liga and still be looking at that Base Model, so that I can read one Entrant across the
    leagues the record labels.
26. As a reader, I want a link with an Entrant selected to still work when I send it to
    someone, so that the selection stays in the URL as it does today.
27. As a reader whose selected Entrant does not exist in the Competition I switched to — an
    Exhibition Run that ran in one league only — I want the page to show nothing selected, so
    that a league that never seated it is not an error.
28. As a reader who hand-typed a nonsense Entrant into the URL, I want the same nothing
    selected, so that the page does not break on input it never wrote.

### What the pages say

29. As a reader, I want the page's opening sentence to name the Competition I am reading, so
    that the Premier League's name does not appear above La Liga's table.
30. As a reader of any leaderboard, I want a sentence saying each league is a separate
    benchmark, so that the ease of switching does not read as an invitation to compare across
    them.
31. As a maintainer, I want that sentence in the footnote that already says what the ranking
    is not, so that a qualification sits beside the numbers it qualifies and not in chrome
    that also shows on pages with no ranking.
32. As a reader, I want the page title and the header to name the Competition, so that a tab
    among many tabs is identifiable.

## Implementation Decisions

### The route set and where it comes from

The Astro pages become Competition-scoped routes generated from `MATCH_PROMPT_COMPETITIONS`
— the Competitions with a frozen Prompt Version, today `PL` and `PD`. The list is read in the
page's frontmatter at build time, so it costs the build no database access and puts the
chrome in the built HTML, per ADR-0028's rule that a reader sees the structure of the page
before its data.

The display name for a Competition is `matchPromptOf(code).competitionName` and nothing else.
`divisions.ts` already carries a comment guarding a league's name against having two homes;
this keeps that true.

### The redirects

Three lines in a `_redirects` file in the asset directory — `/`, `/fixtures` and `/entrants`
to their `/pl` equivalents, each `302`. Workers static assets parses this file and applies
its rules to static asset responses rather than serving it. It is not the Worker's job: the
`run_worker_first` rule sends only `/api/*` to the Worker, and the Worker opens a Postgres
connection on every request it handles, so routing a redirect through it would open a
connection to read nothing.

### The switcher

A group of `<a>` elements in the Match track's page chrome, carrying `aria-current="page"` on
the current Competition exactly as the nav links do, and wearing the `.seg` styling the
Leaderboard's sort control already uses. No new CSS. Each link points at the same page of
another Competition, so the href is built from the current page's role and the target's code,
not from the current URL string.

The Competition is navigation and not view state: these are links a browser follows, not a
control written with `replaceState` like `?sort=` and `?entrant=`.

### The read API's paths

`handleDashboardRequest` parses the Competition out of the pathname's second segment for the
three Match endpoints — `/api/{code}/leaderboard`, `/api/{code}/fixtures`,
`/api/{code}/entrants` — and passes it to the query functions in place of the literal. There
is no default and no endpoint without a Competition; the three bare paths stop existing.

The codes the API serves are `MATCH_PROMPT_COMPETITIONS`, the same list the build reads. A
second segment outside it falls to the if-chain's existing `404`, whether it is a typo or a
Competition whose Prompt Version nobody has frozen. This is narrower than ADR-0039's prose,
which speaks of the schema's five codes; one list serving both the build and the API is what
keeps a route and its endpoint from disagreeing about which leagues exist.

The two FPL endpoints keep their exact paths and their `PL` literals. `/api/fpl/entrants`,
which ADR-0033 named and which has not been built, stays unbuilt here.

### The three states in one response

The leaderboard response gains a way to say the Competition is not Active — no row in
`competitions` for the Season — and the page renders its own sentence for it. The two states
already distinguished stay as they are: `throughGw === null` is pre-season, and anything else
is a ranking. The page must reach the not-Active state through a successful response, never
through the `catch` that writes "The leaderboard could not be read."

The invariant that makes this three states and not four: seating a roster refuses a
Competition with no frozen Prompt Version, so an Active Competition always has one. A
Competition can be frozen and not yet Active — that is the launch window — but not the
reverse.

### The Entrant slug

`?entrant=` carries the part of the seat id after the Competition prefix. `seatSlug` already
computes it. The Entrant record page resolves the slug against the seats the response
returned for that Competition and selects nothing when it does not resolve — not an error
state, not a fallback to the first Entrant, which would silently show a reader a different
Base Model than their link named.

### What does not change

Cache headers, the theme toggle and its storage key, the burger menu, the FPL section
entirely, the `modernist.css` and `overrides.css` split, the chart modules, and every
existing page's layout and copy other than the Competition's name.

## Testing Decisions

A good test here drives external behaviour through the highest seam that exists and asserts
what a reader would notice. Two seams, one existing and one new:

**`handleDashboardRequest(request, query, season, now)`** — the whole read API, already
driven by `test/dashboard-read-api.test.ts`, `dashboard-fixtures-api.test.ts` and
`dashboard-entrants-api.test.ts` against a temporary Postgres, seeded with `seedSeason` and
read through `workerDriver` under the select-only role the Worker holds in production. Every
API story tests here and no new seam is opened for them. The leak test is the one that must
exist: the existing suite already seeds an FPL row to prove it cannot reach a Match ranking,
and this adds the Competition counterpart — a `PD` row seeded alongside `PL`, asserted absent
from every `PL` response and vice versa, on all three endpoints. Alongside it: the three
states, each asserted by what the response says rather than by its status alone; `404` for a
code the dashboard does not serve; and the two FPL endpoints asserted unchanged.

**A pure view module under `dashboard/src/`** — following `fpl-view.ts` and its test, which
exists because each function in it "renders perfectly while being wrong". The same is true of
all three pieces of new page logic: resolving a slug against a Competition's seats, building
the switcher's entries and hrefs for a given current page and Competition, and the route list
the build generates. No DOM and no database; the module is imported by the pages and by
`test/dashboard-competition-view.test.ts`.

Not covered by a test, deliberately: the `_redirects` file, whose three lines are
configuration proved at deploy rather than in a unit test, and the CSS, of which there is
none.

**Both clauses were deviated from while building, and both deviations are stated in the
tickets rather than left to be discovered.** Ticket 4's switcher adds a rule to
`overrides.css`, because a segmented control built from links holds no radio and the
vendored sheet says "chosen" with `:has(input:checked)`. Ticket 6's `_redirects` gained one
assertion in the view-module suite as well as the deploy check this asks for: nothing
type-checks that file and a build with a wrong rule in it succeeds, so proving it only at
deploy proves it after it has shipped. The deploy check exists —
`docs/runbooks/dashboard-deploy.md` — and is what proves the platform applies them; the test
proves only what the file says.

## Out of Scope

- The FPL track, entirely — paths, chrome, endpoints and the unbuilt `/api/fpl/entrants`.
- A hub page at `/`, and any cross-track switcher. Both stay where ADR-0033 and ADR-0039 left
  them: available to revisit, which the `302` protects.
- An accent colour or any other visual identity per Competition (ADR-0039).
- ~~Any combined cross-league ranking or comparison, in any surface.~~ Superseded by ADR-0051:
  `/overall` publishes one, client-side over the per-Competition endpoints this spec built.
  `read-api.ts`, its per-path Competition and its no-default routing are unchanged.
- Activating `SA`, `BL1` or `FL1`. When their Prompt Versions are frozen they appear here
  with no further work in this area, which is the point of reading the list rather than
  writing it.
- A design handoff for the switcher. It is assembled from controls that already have one.
- Changes to the write path, the scorer, the scheduler, or the schema's **shape** — tables,
  columns, keys, constraints. This spec reads. A `select` grant and the policy that has to
  come with it, where a read this spec makes reaches a table `dashboard_read` was never
  granted, is this spec's own work and not an exception to this line: migration 0017 wrote
  that form in advance and every migration since that widened the dashboard's reach has used
  it. Ticket 5 is the first place in this spec to need one, for `competitions`.

## Further Notes

### Order of work

The read API first and alone: the leak test between two Competitions is what proves the
change, and it can pass before a single page moves. The pages follow, then the switcher, then
the redirects last — the redirects are the only step that breaks a URL that works today, and
doing it last keeps every intermediate state deployable.

### What to verify early

That the built output actually contains a page per Competition. The list is read at build
time from a module, and a wrong list is a missing page rather than an error — the quietest
failure this change can have, and the reason the route list is in the tested view module
rather than inlined in each page's frontmatter.
