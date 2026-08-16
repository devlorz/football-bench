# Tickets: The dashboard's per-Competition shape

Six tracer-bullet slices that take the Match track dashboard from one league to many — a
path per Competition, a switcher that holds the reader's page, a league that has not opened
saying so, and the read API's twenty-seven `PL` literals replaced by the path. Source:
[spec 0017](../../specs/0017-the-dashboard-per-competition-shape.md). Vocabulary:
[CONTEXT.md](../../../CONTEXT.md). Decisions:
[ADR-0039](../../adr/0039-the-dashboard-gives-every-competition-its-own-path.md).

Work the **frontier**: after ticket 1, three tickets open at once (2, 3, 5). Ticket 4 waits
on all three pages existing per Competition, and ticket 6 goes last on purpose — it is the
only step that breaks a URL that works today, so every state before it is deployable.

Nothing here writes, and nothing here changes the shape of the schema — no table, no column,
no key. No scorer or scheduler change either, and the FPL track is untouched throughout —
paths, chrome and both endpoints. The one migration in the set is ticket 5's, and it is a
`select` grant with the policy that has to come with it, for a table these reads reach and
`dashboard_read` was never granted.

---

## 1 — The Leaderboard is read per Competition

**What to build:** A reader opens `/pd` and sees La Liga's leaderboard, with La Liga's name
above it, read from La Liga's rows alone. `/pl` is the Premier League's, and neither can
show the other's Entrants. There is no switcher yet — a reader changes league by typing the
URL — and `/` still serves what it serves today.

**Blocked by:** None — can start immediately.

- [x] The read API takes the Competition as the first path segment of the leaderboard
      endpoint, with no default and no endpoint that omits it. The bare path stops existing.
- [x] The Competitions served are the ones with a frozen Prompt Version, the same list the
      build reads; a segment outside it answers 404, whether it is a typo or a league nobody
      has frozen a Prompt Version for.
- [x] A test seeds a second Competition's scored rows alongside the Premier League's and
      proves neither reaches the other's response. This is the failure ADR-0035 exists to
      prevent and the reason this ticket is first.
- [x] A Leaderboard page is generated per Competition, from the frozen-Prompt-Version list
      read at build time — no database on the build path.
- [x] Every place the page names the league — the opening sentence, the page title, the
      header — reads the name from the Prompt's `competitionName` and holds no second copy
      of it.
- [x] A pure view module carries the route list, tested without a DOM or a database,
      following the FPL track's view-module precedent. The build's page set is asserted
      there: a wrong list is a missing page, not an error.
- [x] Cache headers on the endpoint are unchanged.

## 2 — The Fixtures page is read per Competition

**What to build:** A reader opens `/pd/fixtures` and sees La Liga's Fixtures, including the
pre-Lock banner, which still reads the clock and still separates the pre-Lock view from the
committed one.

**Blocked by:** Ticket 1.

- [x] The Fixtures endpoint takes the Competition from the path on the same terms as the
      leaderboard: no default, 404 outside the served list.
- [x] A Fixtures page is generated per Competition and names its league from the same single
      source.
- [x] A test proves one Competition's Fixtures cannot appear in another's response.
- [x] The endpoint's cache lifetime, which is shorter than the others' for the reason spec
      0011 records, is unchanged.

## 3 — The Entrant record is read per Competition, and a selection survives the crossing

**What to build:** A reader opens `/pd/entrants`, picks an Entrant, and gets a link they can
send. Editing that link's `/pd/` to `/pl/` lands on the same Base Model's Premier League
record rather than on nothing — the selection is written as the seat's slug, not the seat's
full id, which carries the Competition in it.

**Blocked by:** Ticket 1.

- [x] The Entrant record endpoint takes the Competition from the path on the same terms as
      the other two.
- [x] An Entrant record page is generated per Competition.
- [x] `?entrant=` carries the part of the seat id after the Competition prefix, and the page
      resolves it against the seats that Competition returned.
- [x] A slug that resolves against no seat — an Exhibition Run that ran in one league only,
      or a hand-typed URL — leaves nothing selected. Not an error, and never a silent
      fallback to the first Entrant, which would show a reader a different Base Model than
      their link named.
- [x] The resolution is a pure function in the view module and is tested there, because it
      renders perfectly while being wrong.
- [x] A test proves one Competition's Entrant records cannot appear in another's response.

## 4 — The switcher crosses Competitions from the header

**What to build:** A reader on La Liga's Fixtures page clicks once and is on the Premier
League's Fixtures page — same page, other league. The switcher says which league they are on
now, and the leaderboard says in words that the leagues are separate benchmarks.

**Blocked by:** Tickets 1, 2 and 3.

- [x] The Match track's chrome carries one entry per served Competition, built from the same
      list the routes are, and present in the built HTML rather than waiting on a fetch.
- [x] Each entry is a real link: middle-clickable, copyable, openable in a new tab. Not a
      `<select>` and not a control written with `replaceState` — choosing a Competition is
      navigation.
- [x] Each entry points at the same page of its Competition, so crossing from Fixtures lands
      on Fixtures.
- [x] The current Competition is marked as the current page, the way the nav links already
      are, so it is announced and not merely coloured.
- [ ] It wears the styling of the Leaderboard's existing segmented control and adds no CSS.
      **Deviation: it wears the styling and adds four lines of CSS to `overrides.css`.** A
      segmented control says which segment is chosen with
      `.seg-opt:has(input:checked)`, and a link holds no radio, so built from links the
      control never showed a chosen segment at all: the league being read was told apart
      only by the accent text `.nav a:hover` also sets, and Modernist's hover rule painted
      it as unchosen under the pointer — the one question the control answers, answered
      wrongly in the state every click passes through. The rule draws it from
      `aria-current` in the colours `:has(input:checked)` was already handed off with, so
      it adds no look; it needs `.nav` in front and its own `:hover` to outrank two
      Modernist selectors, measured in the browser and not counted off the sheet.
- [x] The href-building is a pure function in the view module and is tested there for every
      combination of current page and target Competition.
- [x] The Leaderboard's existing "What this is not" footnote gains the sentence saying each
      Competition is its own benchmark and no ranking spans two. It goes there and not in the
      chrome, which also shows on pages with no ranking to qualify.

**Left standing:**

- **The switcher does not collapse on a phone.** `overrides.css` hides `.navlinks` below
  760px behind the burger, and the switcher is a different element, so it stays. Two
  leagues wrap and nothing breaks; five will not fit, and spec 0017 says `SA`, `BL1` and
  `FL1` arrive "with no further work in this area" — which this makes false at the third
  league, not at this one. Its own ticket, and it is CSS either way.

Crossing a Competition drops `?entrant=` on purpose, and ADR-0039 now says so rather than
claiming the switcher carries it: ADR-0035 permits comparing an Entrant across leagues by
hand and declines to publish the affordance, and the href could not read the current URL
anyway. Not carried debt — a decision, recorded where it was made.

## 5 — A Competition that has not opened says so

**What to build:** A reader who reaches a Competition the benchmark has frozen a Prompt
Version for but has not opened is told it has not opened — not shown a broken page, and not
promised a table that is still gated.

**Blocked by:** Ticket 1.

- [x] The leaderboard response can say the Competition is not Active — no row in
      `competitions` for the Season — and says it with a successful response, not a status
      the page reads as failure. It is a field, `active`, and not the shape of the body:
      every other field is empty in this state and empty pre-season too, so a page reading
      the shape could not tell them apart. Answered before the four reads below it, which
      would each return nothing and compose into exactly the pre-season body.
- [x] The page renders a sentence of its own for it, distinct from the pre-season panel,
      which promises the table will fill, and distinct from the failure line, which says
      nothing could be read.
- [x] Reaching this state never routes through the page's error path. A reader is not told to
      wait for something that is not coming.
- [x] The two existing states are unchanged: an Active Competition with nothing scored is
      still the pre-season panel with its entered Entrants and its next Lock, and a scored
      one is still the ranking.
- [x] Tests cover all three states through the read API seam, asserted by what the response
      says and not by its status alone.

**The grant this needed, which the ticket did not foresee.** `competitions` was not one of
the six tables migration 0017 granted `dashboard_read`, and under the Row Level Security
migration 0022 enabled on it at creation a grant without a policy selects zero rows and
reports no error — so without both halves this endpoint would have answered "has not opened"
for *every* league, including the one being scored daily.
[Migration 0028](../../../migrations/0028_dashboard_reads_the_competition_list.sql) carries the
grant and the policy together, in the form migration 0017 required and 0020 and 0021 have
each used since. It changes no table, column or key, which is the line spec 0017's Out of
Scope now draws — it drew a wider one when this ticket was written.

It also makes this the first deploy whose Worker depends on a migration having run: the
grant has to reach the database before the Worker that reads it, or every page shows its
error line. `docs/runbooks/dashboard-deploy.md` said nothing about migrations at all and now
says this, under "What this deploy does not do".

**Left standing:**

- **The hero paragraph still speaks in the present tense on an unopened league** — "Every
  Entrant sees the same context for every La Liga Fixture and commits a scoreline …", above
  a panel saying nothing has been entered. It is the page's standing description of what the
  benchmark is and it is true of the benchmark; it reads as a claim about this league. Not
  fixed here because the fix is a decision about what that paragraph is for, and this ticket
  is about the state below it.
- The Fixtures and Entrant record pages answer this Competition with their own empty states
  and say nothing about it not having opened. Ticket 5 is the leaderboard's, and spec 0017
  asks for it there; whether the other two owe a reader the same sentence is unasked.

## 6 — The single-league URLs redirect

**What to build:** Anyone arriving at the site's old front door — `/`, or a link to
`/fixtures` or `/entrants` made before the expansion — lands on the Premier League's copy of
what they asked for.

**Blocked by:** Tickets 1, 2 and 3.

- [x] Three redirects, declared in the static asset directory's redirects file and applied by
      the platform at the edge. Not served by the Worker, which opens a database connection
      on every request it handles and would open one to emit a redirect that reads nothing.
- [x] Each is a 302 and not a 301. A hub page at `/` is a decision ADR-0039 left open, and a
      301 is cached past the point where it could be taken.
- [x] The Premier League remains the target of all three — `/` to `/pl`, and each bare page
      path to that page's copy under `/pl`, so a Fixtures link answers with Fixtures. No
      Competition is served at a bare page path. *(Written "`/pl` remains the target of all
      three", which reads as the URL `/pl` and would answer a Fixtures link with a
      leaderboard. The intent was the league; the words are now the league. ADR-0039 said it
      the same short way and has been corrected too.)*
- [x] The FPL section's paths are untouched.

**What the three route lists were actually about.** Tickets 1 to 3 built three lists — two
spellings of the empty segment, two names for the rest parameter — and argued all of it as
Astro's handling of the front door's empty segment, which is what
`NoMatchingStaticPathFound` looked like from where it was found. It was never the empty
segment. Astro claims the `params` objects a `getStaticPaths` returns, so two pages returning
the *same* objects build one page and fail the other on a path the surviving page has just
emitted; handing the second page a copy moves the failure to the first. Removing the front
door made both pages return one list and the build failed again with the segment gone, the
rest parameters gone and the directories merged — which is what said so. The list is now the
function `competitionRoutes()`, every call builds its own `params`, and the three pages are
plain `[competition]` segments in one directory. A test asserts two calls share no object,
because the build only fails while two pages hold one list.

**Deviation: the `_redirects` file carries a test, which spec 0017 says it deliberately would
not.** The spec's ground is that three lines of configuration are proved at deploy; the
deploy check it assumes did not exist, and has been added to
`docs/runbooks/dashboard-deploy.md` — it is the only thing that proves the platform applies
them. The test is one assertion over the parsed file, and it is there because nothing
type-checks that file and a build with a wrong rule in it succeeds: proving it only at deploy
proves it after a reader could already have hit it. Spec 0017 now carries both this and
ticket 4's CSS as stated deviations rather than as clauses that quietly stopped being true.

**The league's name now comes off the route with the path and the endpoint.** Every page
carried the comment "the league's name has one home" while calling `matchPromptOf` for it
itself — three callers, and a fourth in the switcher's own parallel list. `competitionName`
is a prop of the route, `SWITCHER_COMPETITIONS` and its type are gone (the chrome maps the
routes), and the three pages import nothing to name their league. Found by review; it is the
comment made true, and it is twelve lines shorter.

`.gitignore` gains `.wrangler/`, which is the local state `wrangler dev` writes and which the
redirect walk below produced.

The redirects were walked under `wrangler dev`, which runs the same asset router as the edge:
`/`, `/fixtures` and `/entrants` each answered `302` with the Location above, `/pl`,
`/pl/fixtures` and `/fpl` answered `200`, and `/_redirects` itself answered `404` — it is
parsed by the platform and not served.

`docs/runbooks/dashboard-deploy.md` named `/api/leaderboard`, `/api/entrants` and
`/api/fixtures` in its rotation and revocation steps, which have answered 404 since ticket 1.
They are the served paths now, with the cache window restated: the edge caches by URL, so
every Competition holds its own entry and clearing one clears nothing else. The one place the
old path is a statement about the past — the unexplained 500 that turned observability on —
is left as it was said.
