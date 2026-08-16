# The dashboard gives every Competition its own path

ADR-0035 grew the record a Competition dimension and left the dashboard's shape undecided;
spec 0016 listed it Out of Scope. This is that decision.

Every Competition is a path prefix — `/pl`, `/pd`, `/pl/fixtures`, `/pd/entrants` — and no
Competition owns `/`. The three Match track pages are the same three pages they were, read
one Competition at a time. `/` redirects to `/pl`, and so do the two bare page paths the
single-league site served: `/fixtures` and `/entrants`. The redirects are three lines of a
`_redirects` file in the asset directory, which Workers static assets parses and applies at
the edge, and each is a **302**. Not a 301: ADR-0033's rejected track switcher was left open
to revisit and so is a hub page at `/`, and a 301 is cached by browsers past the point where
either could be introduced.

The Premier League does not keep `/`. Each Competition is its own benchmark asked the same
question (ADR-0035), and a URL space where one league is the root and the rest are prefixed
says the opposite — that one is the site and the others are additions to it. What the
Premier League keeps is being the Competition `/` lands on, which is a default and not a
claim.

A reader crosses Competitions through a switcher in the header that holds the current page:
`/pd/fixtures` to `/sa/fixtures`, not back to a hub and forward again. It is built from the
`.seg` control the Leaderboard already uses for its sort choice — the same one choice with
n answers, styled by the design system already — but its answers are `<a>` elements carrying
`aria-current="page"`, as the nav links are, because choosing a Competition is navigation
and not a view toggle. This is the switcher ADR-0033 declined for tracks, and its reason
does not carry: `match` and `fpl` are different games with different chrome, while two
Competitions are the identical page filtered differently.

The switcher's entries, and the routes themselves, come from `MATCH_PROMPT_COMPETITIONS` —
the Competitions with a frozen Prompt Version — read at build time, so the chrome is in the
built HTML and never waits on a fetch. The name each entry shows is
`matchPromptOf(code).competitionName`, the string the packet an Entrant reads is written
with, and not a second copy: `divisions.ts` already guards a league's name against having
two homes. Reading the active list from the database at build instead was rejected — it puts
a database on the build ADR-0028 made static, and makes opening a league a rebuild rather
than the insert ADR-0035 promised. Hardcoding the schema's five codes was rejected too:
`SA`, `BL1` and `FL1` have no frozen Prompt Version and therefore no name anywhere in the
repo, so the dashboard would have had to invent three.

A Competition therefore has three states on this dashboard, and they read differently. Not
Active — no row in `competitions` — is a leaderboard that has not opened, answered `200` by
the read API with a sentence of its own. Active with nothing scored is the pre-season panel
that already exists, which promises the table will fill. Scored is the ranking. The first
must never fall through to the existing failure line, "The leaderboard could not be read.
Nothing is being retried": nothing failed, and a reader told that will refresh and wait for
something that was never coming. Nor may it borrow the pre-season sentence, which promises a
table that ADR-0035 gates on a cost review and does not promise at all.

The read API takes the Competition as the first path segment — `/api/pl/leaderboard`,
`/api/pd/fixtures` — replacing the twenty-seven `competition = 'PL'` literals the module was
written with for exactly this. There is no default: a request that names no Competition names
nothing, and a default would restore the Premier League to the special place the paths just
took away from it. The Competitions it serves are `MATCH_PROMPT_COMPETITIONS`, the list the
build reads, and a segment outside it reaches the if-chain's existing `404` — whether it is a
typo or a Competition whose Prompt Version nobody has frozen. One list for both is what keeps
a route and its endpoint from disagreeing about which leagues exist, and it leaves the
not-opened state meaning one narrow true thing: frozen, not yet Active.
`/api/fpl/*` is untouched and keeps its literal — the FPL track is the Premier League by
nature, not by accident.

`?entrant=` carries the seat's slug (`claude-opus-5`) rather than its full id
(`match-pd/claude-opus-5`), so a link naming an Entrant stays valid when its Competition is
edited. Every Competition seats the roster that stood at the Season's first Lock (ADR-0034,
ADR-0038), which is what makes the slug the stable identity across leagues while the prefix
is a storage key. A slug that resolves against no seat in the Competition — an Exhibition
Run that only ever ran in one, or a hand-typed URL — leaves the page with nothing selected,
which is not an error.

The switcher does not carry the selection across a crossing, and deliberately. Building that
affordance would make comparing one Entrant across two leagues a single click, which is a
thing ADR-0035 permits a reader to do by hand — "a read-path exercise a future reader can
run precisely because every row is labelled" — and declines to publish; the leaderboard's
own footnote says in the same breath that no ranking spans two Competitions. Permitting an
edit of a URL is not the same as building the button, and the button would pull against
both. It also could not be built the way the rest of the chrome is: the href would have to
be read from the reader's current URL, which the built-HTML rule above forbids and spec
0017 forbids in as many words.

## Considered Options

- **The Premier League stays at `/`, the rest under prefixes** — rejected above: the URL
  space would claim a hierarchy between benchmarks that ADR-0035 refused.
- **`?competition=PD` as a query parameter** — rejected. The page's existing query state
  (`?sort=`, `?entrant=`) is written with `replaceState` precisely because it is a view of one
  page and Back should leave; a Competition written the same way makes Back walk through
  league choices, and written with `pushState` it sits beside two parameters that behave
  differently. It also needs a default, and the default is the Premier League.
- **A hub page at `/` listing the Competitions, with no switcher** — rejected for costing two
  clicks and the reader's current page on the commonest move. It had the one real advantage
  the switcher gives up: it would walk a reader past the sentence saying these are separate
  benchmarks on every crossing. That sentence lands in the Leaderboard's existing
  "What this is not." footnote instead, beside the numbers it qualifies rather than in chrome
  that would also show on `/fixtures`, where there is no ranking to qualify.
- **Track-first paths, `/match/pl` beside `/fpl`** — rejected. It buys a segment on every URL
  forever to remove a collision only a routing table sees: ADR-0033 separated the tracks by
  path alone and gave the FPL section its own chrome and no cross-track switcher, so `/pl` and
  `/fpl` are never offered to a reader in the same place.
- **The redirect served by the Worker** — rejected. `run_worker_first = ["/api/*"]` is the
  whole routing rule, and the Worker opens a Postgres connection on every request it handles
  (`worker.ts`); routing `/` through it would open a connection to emit a redirect that reads
  nothing. An Astro `redirect` was rejected in turn for answering `200` with a document that
  renders before it jumps.
- **An accent colour per Competition, as the FPL section has** — rejected for now. It is five
  colour decisions with no design handoff behind any of them, and the Competition is already
  named in the header and in the page's opening sentence. Revisit if a reader is actually
  found to have mistaken one league's table for another's.

## Consequences

- The three single-league URLs stop resolving to content and start redirecting. Nothing has
  linked to them for long, and the redirects are permanent fixtures of the `_redirects` file
  rather than a migration window.
- `read-api.ts` stops being a module with one Competition compiled into it. Every Match query
  takes the Competition from the path, and the test that proves an FPL row cannot leak into a
  Match ranking gains its Competition counterpart: a `PD` row must not reach a `PL` response.
- A Competition appears on the dashboard the deploy after its Prompt Version is frozen. This
  is the freeze's deploy in practice, and it means the site never advertises a league whose
  cost review ADR-0035 gated has not happened.
- The switcher makes flipping between two leagues one click, which makes reading one Entrant
  across leagues easy. ADR-0035 permits exactly that as a read-path exercise and publishes no
  combined ranking; the footnote states the separation and no surface computes across it.
- The switcher has no design handoff, unlike every other control in either section. It is
  assembled from `.seg` and the nav's `aria-current` and adds no CSS, which is what keeps the
  deviation small enough to state in one line.
- CONTEXT.md gains **Active Competition**: a Competition the benchmark is running for a
  Season, distinct from one whose first Gameweek is merely unscored.
- The FPL track is untouched, in paths, chrome and endpoints.
