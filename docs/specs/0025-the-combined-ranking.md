# Spec 0025 — The combined ranking

**Status:** ready-for-agent
**Scope:** one new dashboard page and the pure module behind it. No read API, no schema, no scorer.
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:** [ADR-0051](../adr/0051-a-combined-ranking-sums-the-leagues-and-publishes-what-that-costs.md)

---

ADR-0035 closed with "no combined cross-league ranking is published" and three documents
repeated it. ADR-0051 supersedes that one sentence and nothing else, and this spec turns it
into buildable, testable requirements.

Reads ADR-0028 (a static build that fetches at runtime), ADR-0029 (one Worker serves the
assets and the API on one origin), ADR-0032 (Exhibition Runs are Competition-scoped),
ADR-0034 and ADR-0038 (every Competition seats the roster that stood at the Season's first
Lock, under one Prompt Version per Competition), ADR-0039 (every Competition owns a path, and
a seat's slug is its identity across leagues), ADR-0042 (a retired Gameweek is kept whole and
never merged) and ADR-0049 (Serie A and Ligue 1 open later than the leagues already scoring).

## Problem Statement

A reader who wants to know which Base Model is forecasting best across the whole benchmark has
to open four pages and add the columns up by hand. The record has always permitted that — every
row is labelled with its Competition — but the site has never done it, and four leaderboards
in four tabs is arithmetic a reader performs silently and wrongly: nothing on those four pages
tells them that La Liga has settled nine Fixtures where the Premier League has settled
twenty-four, so the sum they reach in their head is weighted by something they cannot see.

The four pages are also the only place the site says what a total means. A reader adding them
up leaves behind every qualification the scorer wrote, and arrives at a number carrying none of
them.

## Solution

A fifth page, `/overall`, that performs the addition and publishes what it costs. Each
Entrant's Match Points and Bet Points are summed raw across every Competition that is Active
and scored, ranked in the two columns the per-league leaderboard already has, under the same
sort toggle.

The sum happens in the reader's browser over the four existing `/api/{code}/leaderboard`
answers. No endpoint is added, no query is written, and neither the scorer's one-pass-per-
Competition loop nor the read API's no-default routing changes — so the property that no call
ever holds two Competitions' rows at once survives this page intact.

What the page adds beyond the number is the two sentences that make it publishable: an evidence
line that breaks the Fixture count down by league, so the weighting a raw sum applies is on the
page rather than in the reader's head; and a qualification, frozen in a module, naming the raw
sum, the weighting and the Prompt Version confound ADR-0038 identified.

## User Stories

### One page that adds the leagues up

1. As a reader, I want a single page ranking every Base Model across all the leagues, so that I
   do not have to open four tabs and add columns up in my head.
2. As a reader, I want that page to show both Match Points and Bet Points, so that neither
   ranking is quietly promoted over the other on the way from four pages to one.
3. As a reader, I want the same sort toggle I know from a league's leaderboard, so that learning
   one page taught me this one.
4. As a reader, I want each row to name the Base Model as the league pages name it, so that a row
   here and a row there are visibly the same competitor.
5. As a reader, I want the totals here to reconcile exactly with the four leaderboards, so that I
   can check the page's arithmetic by hand and find it right.
6. As a reader, I want the Base Model class shown beside each row as the league pages show it, so
   that I can see what kind of thing is being compared without leaving the page.

### What the sum is, and what it is not

7. As a reader, I want the page to tell me the total is a raw sum across leagues, so that I do not
   mistake it for a rate, an average or a normalised score.
8. As a reader, I want the page to tell me that a league with more settled Fixtures counts for more
   in the total, so that I can judge the ranking on what it actually measures.
9. As a reader, I want the page to tell me the leagues run under different Prompt Versions, so that
   I know the comparison carries a confound the project has already named.
10. As a reader, I want the evidence line to break the Fixture count down league by league, so that
    the weighting is a number I can see rather than a caveat I have to imagine.
11. As a reader, I want the same "ranks, does not prove" ending the league pages use, so that this
    page makes no larger claim than the pages it is built from.
12. As a maintainer, I want that qualification frozen in a module rather than typed into the page,
    so that the sentence has one home like every other frozen sentence in this repo.
13. As a maintainer, I want the qualification to be impossible to omit, so that a figure never
    reaches a reader without the sentence that qualifies it.

### Which leagues are in the sum

14. As a reader, I want the page to name which leagues its totals cover, so that I know what "all
    leagues" meant on the day I read it.
15. As a reader, I want every row to cover the same set of leagues, so that the column is a ranking
    rather than a list of unrelated totals.
16. As a reader, I want a league that has opened but scored nothing to be left out rather than
    counted as noughts, so that an unplayed league does not silently penalise every Entrant equally
    and change nothing while looking like it did.
17. As a reader, I want a league that has not opened at all to be left out, so that a league nobody
    has entered contributes nothing to a ranking.
18. As a reader, I want the page to publish as soon as any league has scored rather than waiting for
    the slowest, so that the page is useful in the weeks after a new league opens.
19. As a reader, I want La Liga's retired Gameweek 1 excluded here exactly as it is excluded there,
    so that a restart the record kept whole is not merged in by a page that adds things up.
20. As a reader on a Season where nothing anywhere has been scored, I want to be told the table
    fills later, so that an empty page is not mistaken for a broken one.
21. As an Entrant that Gapped an entire scored league, I want to score nought there and still be
    ranked, so that the page reads a Season-long Gap the way the league page already reads it.

### When something is missing or wrong

22. As a reader, I want the page to show its failure line if any league's figures could not be read,
    so that I am never shown a ranking that is silently missing a league.
23. As a reader, I want that failure to say nothing is being retried, so that I do not sit refreshing
    a page that will not fix itself.
24. As a reader, I want the page's structure — headings, columns, both explanations — to be there
    before the figures arrive, so that I can see what the page is while it loads.
25. As a reader, I want no Exhibition Run in this table, so that a total over one league is never
    ranked beside totals over four.
26. As a reader, I want the Reference Lines absent here as they are everywhere, so that the things
    that are never ranked stay never ranked.

### Where the page lives

27. As a reader, I want the combined ranking at its own path, so that I can link to it.
28. As a reader, I want it in the nav beside the three pages I know, so that I find it without being
    told it exists.
29. As a reader, I want it absent from the Competition switcher, so that the switcher's answers stay
    Competitions and this page does not read as a fifth league.
30. As a reader arriving at `/`, I want to land where I have always landed, so that this page's
    arrival does not move the site's front door.
31. As a maintainer, I want the hub page at `/` left undecided, so that the decision ADR-0039
    deliberately left open is still open after this ships.

### The documents that said this could not exist

32. As a maintainer, I want the per-league footnote to stop saying no ranking spans two Competitions,
    so that the site does not deny the existence of a page it links to.
33. As a maintainer, I want ADR-0035 to keep every decision but the superseded sentence, so that the
    Competition dimension it introduced is not reopened by a dashboard change.
34. As a maintainer, I want the two specs and ADR-0039's consequence updated in the same change, so
    that no document is left instructing a future reader that this page is out of scope.
35. As a maintainer, I want CONTEXT.md to distinguish a Combined Ranking from a Leaderboard, so that
    "leaderboard" does not quietly come to mean both.

## Implementation Decisions

### The page and its route

One new statically built page at `/overall`, emitted like every other page by the build
(ADR-0028): every heading, column header, footnote and both explanations are in the built HTML,
and only the figures wait on the fetch.

It joins the Match track's nav as a fourth link. It does **not** join the Competition switcher —
the switcher's entries come from `MATCH_PROMPT_COMPETITIONS` and its answers are Competitions,
which this page is not. `/`, `/fixtures` and `/entrants` keep the three `302`s they have; nothing
in the redirects file changes.

The nav link is built from the same place every other nav href is built, so no page holds a second
spelling of where this page lives.

### Where the sum happens

The page fetches `/api/{code}/leaderboard` once per Competition in `MATCH_PROMPT_COMPETITIONS` —
the same list the build emits pages from — and combines the four bodies client-side. No endpoint
is added. `handleDashboardRequest` is not edited. The scorer, the scheduler, the schema and every
migration are untouched.

The `LeaderboardBody` fields this page reads are the ones already published: `active`, `throughGw`,
`settledFixtures`, `entrants[].matchPoints`, `entrants[].betPoints`, `entrants[].baseModelClass`,
`entrants[].n` and `entrants[].exhibition`. Nothing new is added to the body.

### The pure module, which is the seam

All of the combining lives in a new pure module under `dashboard/src/`, following `competition-view.ts`,
`fpl-view.ts` and `chart-domain.ts`. It takes the four fetched bodies, each labelled with its
Competition code, and returns everything the page renders: the covered Competitions in order, the
ranked rows for both columns, the per-league Fixture breakdown and the total, and which of the page's
states applies. The page's own script is a fetch and a render, as spec 0014 established, and holds no
arithmetic.

The module is where every rule below is enforced, because every one of them renders perfectly while
being wrong.

### Which Competitions are covered

A Competition is covered when its body says `active: true` **and** `throughGw` is not null. Anything
else is excluded: `active: false` is a league nobody has entered, and an Active league with a null
`throughGw` answers every figure with null and would contribute a nought that looks like a score.

The covered set is computed once for the table, not per row. Every row's total is a sum over that one
set. This is the rule most likely to be broken by a later edit and the one that makes the column a
ranking: under a raw sum, a Competition missing from one row's total is a nought in it.

The covered set and its size are rendered on the page.

La Liga's retired Gameweek needs no handling here. `rankedFrom` refuses it to every figure the
per-league body carries (ADR-0042), so the exclusion arrives already made.

### What a row is

One row per Season Roster seat, keyed by the seat's slug — `claude-opus-5`, not
`match-pd/2026-27-v2/claude-opus-5` — which ADR-0039 already established as the identity that
survives a crossing. The existing slug helper is reused; no second way of deriving a slug is written.

Rows whose body entry carries a non-null `exhibition` are dropped before anything is summed. An
Exhibition Run exists in one Competition by construction (ADR-0032), and the Exhibition caveat is not
rendered on this page because no row it qualifies reaches it.

A seat with no figure in a covered Competition contributes what the league page shows for it, which is
nought and not null: `scoredOrNull` has already resolved a Season-long Gap to a nought by the time the
body is published.

### The two columns

Match Points and Bet Points, both summed, under the `.seg` radio toggle the leaderboard already uses,
with the choice written to the URL with `replaceState` as it is there — sorting is a view toggle and
Back should leave the page. The existing sort-from-URL reading, including its `Object.hasOwn` guard, is
followed rather than rewritten.

The bars are drawn against the leader of the column, as they are on a league page.

### The two sentences

The **evidence line** renders the total and the breakdown together, ending in the same clause the
league pages end in: `n = 47 fixtures · PL 24 · PD 9 · SA 8 · FL1 6 · ranks, does not prove`. The
per-league figures are each body's `settledFixtures`; the total is their sum over the covered set only.

The **qualification** is a new exported constant in a module of its own, imported at build time the way
`EXHIBITION_CAVEAT` is, and rendered under the table where the league pages render theirs. It states
three things: the total is a raw sum across leagues; a league with more settled Fixtures weighs more; the
leagues run under different Prompt Versions, which ADR-0038 names as a confound for exactly this
comparison. The four per-league qualifications are not restated here — they qualify their own rankings on
their own pages.

Neither sentence is optional and neither is assembled from figures at render time beyond the counts above.

### The page's states

Three, exactly one at a time, matching the shape the leaderboard already uses:

- **Nothing covered** — no Competition is both Active and scored. A sentence saying the table fills once a
  league has been scored. Not the failure line: nothing failed.
- **Ranking** — at least one Competition covered. The table, the evidence line and the qualification.
- **Failure** — any of the fetches failed or answered something unreadable. The existing failure line and no
  table. A page missing a league silently would publish a ranking over a set it cannot name, so this fails
  closed, the way the leaderboard fails closed on a missing qualification.

### What does not change

`read-api.ts`, the scorer, the scheduler, the schema, every migration, the `_redirects` file, the Competition
switcher, the three per-league pages other than their footnote sentence, and the FPL track entirely.

### Documents updated in this change

ADR-0035's superseded sentence marked as such; ADR-0039's "no surface computes across it" consequence; the Out
of Scope line in spec 0016 and in spec 0017; the **What this is not.** footnote on the per-league leaderboard;
and CONTEXT.md, which gains **Combined Ranking** — one ranking over every scored Competition of a Season, by
raw season-to-date total — beside **Leaderboard**, which spans one Competition and still never two.

## Testing Decisions

A good test here drives external behaviour through the highest seam that exists and asserts what a reader would
notice. This spec opens **one** new seam and reuses no others, because it adds no server-side behaviour to drive.

**The pure combining module under `dashboard/src/`**, imported by the page and by a new
`test/dashboard-overall-view.test.ts`. No DOM, no database, no fetch: the test hands it hand-built
`LeaderboardBody` values and asserts what comes out. Prior art is `test/dashboard-competition-view.test.ts` and
`test/dashboard-entrant-chart.test.ts`, and the rule they follow is spec 0014's: "a page's own script is a fetch
and a render and has no test; these functions do."

What must be asserted, each because it renders perfectly while being wrong:

- Totals are the sum of the covered Competitions' figures, for both columns, and reconcile with the inputs.
- A Competition with `active: false` is excluded, and a Competition with `active: true` and a null `throughGw` is
  excluded — separately, since they are different states and one fix can hide the other.
- Every row's total covers the same Competitions, asserted on a fixture where one Entrant is missing figures that
  another has.
- A row carrying `exhibition` is absent from the output entirely.
- Rows are keyed by slug, so the same Base Model under four Competition-prefixed ids is one row and not four.
- The evidence line's per-league breakdown and its total are drawn from the covered set only, and the total equals
  the breakdown's sum.
- The covered-Competition list is reported, in the order the page renders it.
- The nothing-covered state is distinguishable from the ranking state by what the module returns, not by an empty
  array a caller has to interpret.
- The fetch URL list is derived from `MATCH_PROMPT_COMPETITIONS`, so a league that gains a frozen Prompt Version is
  fetched here with no edit — the same list the build and the read API already share.
- Ties rank as the league pages rank them.

Not covered by a test, deliberately, and stated here rather than left to be discovered: the page's own fetch and
render; the nav link, which is one href built by the existing helper; and the CSS, of which there is none — the
table reuses `.lbbody`, `.lbrow`, `.seg` and `.qualifications` unchanged. If a rule in the module grows a branch
that the page's script has to duplicate to render, that is the signal the split has gone wrong and the module
should return the rendered decision instead.

No new read API test is required, because no read API behaviour is added. The existing suites — including the leak
test proving a `PD` row cannot reach a `PL` response — must stay green unchanged, and a diff that touches them is a
diff that has left this spec's scope.

## Out of Scope

- Any normalisation of the total: points per settled Fixture, mean within-league rank, league weighting, an
  eligibility floor. ADR-0051 considered and rejected each; the rule is addition.
- A combined evidential figure of any kind — RPS, Brier, Paired Differences, Comparison Anchors or intervals across
  Competitions. The evidential layer stays within a Competition (ADR-0012, ADR-0016).
- A new read API endpoint, and any change to `read-api.ts`, the scorer, the scheduler, the schema or any migration.
- Exhibition Runs on this page, in any form.
- The FPL track, entirely — paths, chrome, endpoints and its leaderboard.
- A hub page at `/`, and the `302`s that protect the decision. Still open, still undecided, and this spec does not
  take it.
- Charts of any kind on this page. The league pages' cumulative chart is per-Competition and stays there.
- An accent colour or any visual identity for this page (ADR-0039's reasoning carries).
- `BL1`, which has no frozen Prompt Version and therefore no name in the repo. It appears here the deploy after its
  freeze, with no edit, because the fetch list is the shared one.
- Any per-Entrant drill-down from this page. `/{code}/entrants` remains the Entrant record, per Competition.

## Further Notes

### Order of work

1. The qualification constant and its module, so nothing downstream is built against a sentence that does not exist.
2. The pure combining module and its test, complete, against hand-built bodies. This is the whole of the logic and it
   is finished before any page exists.
3. The page: markup, three states, fetch fan-out, render. Nav link.
4. The five documents, in one change, so no window exists where the site links to a page its footnote denies.

### What to verify early

Read a real response from a league that is Active with nothing scored before building the covered-set gate — the
gate's whole shape rests on that body answering `active: true` with a null `throughGw`, and it is one `npm run
context:show`-class read against production to confirm rather than assume. Serie A or Ligue 1 is the league to look
at (ADR-0049).

Also worth reading early: whether all four leagues currently return a body at all, since the fan-out's failure path
is the page's most reachable state on day one and the least interesting to discover after the table is built.
