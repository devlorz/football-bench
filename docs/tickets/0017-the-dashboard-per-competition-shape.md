# Tickets: The dashboard's per-Competition shape

Six tracer-bullet slices that take the Match track dashboard from one league to many — a
path per Competition, a switcher that holds the reader's page, a league that has not opened
saying so, and the read API's twenty-seven `PL` literals replaced by the path. Source:
[spec 0017](../specs/0017-the-dashboard-per-competition-shape.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md). Decisions:
[ADR-0039](../adr/0039-the-dashboard-gives-every-competition-its-own-path.md).

Work the **frontier**: after ticket 1, three tickets open at once (2, 3, 5). Ticket 4 waits
on all three pages existing per Competition, and ticket 6 goes last on purpose — it is the
only step that breaks a URL that works today, so every state before it is deployable.

Nothing here writes. No schema change, no migration, no scorer or scheduler change, and the
FPL track is untouched throughout — paths, chrome and both endpoints.

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

- [ ] The Match track's chrome carries one entry per served Competition, built from the same
      list the routes are, and present in the built HTML rather than waiting on a fetch.
- [ ] Each entry is a real link: middle-clickable, copyable, openable in a new tab. Not a
      `<select>` and not a control written with `replaceState` — choosing a Competition is
      navigation.
- [ ] Each entry points at the same page of its Competition, so crossing from Fixtures lands
      on Fixtures.
- [ ] The current Competition is marked as the current page, the way the nav links already
      are, so it is announced and not merely coloured.
- [ ] It wears the styling of the Leaderboard's existing segmented control and adds no CSS.
- [ ] The href-building is a pure function in the view module and is tested there for every
      combination of current page and target Competition.
- [ ] The Leaderboard's existing "What this is not" footnote gains the sentence saying each
      Competition is its own benchmark and no ranking spans two. It goes there and not in the
      chrome, which also shows on pages with no ranking to qualify.

## 5 — A Competition that has not opened says so

**What to build:** A reader who reaches a Competition the benchmark has frozen a Prompt
Version for but has not opened is told it has not opened — not shown a broken page, and not
promised a table that is still gated.

**Blocked by:** Ticket 1.

- [ ] The leaderboard response can say the Competition is not Active — no row in
      `competitions` for the Season — and says it with a successful response, not a status
      the page reads as failure.
- [ ] The page renders a sentence of its own for it, distinct from the pre-season panel,
      which promises the table will fill, and distinct from the failure line, which says
      nothing could be read.
- [ ] Reaching this state never routes through the page's error path. A reader is not told to
      wait for something that is not coming.
- [ ] The two existing states are unchanged: an Active Competition with nothing scored is
      still the pre-season panel with its entered Entrants and its next Lock, and a scored
      one is still the ranking.
- [ ] Tests cover all three states through the read API seam, asserted by what the response
      says and not by its status alone.

## 6 — The single-league URLs redirect

**What to build:** Anyone arriving at the site's old front door — `/`, or a link to
`/fixtures` or `/entrants` made before the expansion — lands on the Premier League's copy of
what they asked for.

**Blocked by:** Tickets 1, 2 and 3.

- [ ] Three redirects, declared in the static asset directory's redirects file and applied by
      the platform at the edge. Not served by the Worker, which opens a database connection
      on every request it handles and would open one to emit a redirect that reads nothing.
- [ ] Each is a 302 and not a 301. A hub page at `/` is a decision ADR-0039 left open, and a
      301 is cached past the point where it could be taken.
- [ ] `/pl` remains the target of all three; no Competition is served at a bare page path.
- [ ] The FPL section's paths are untouched.
