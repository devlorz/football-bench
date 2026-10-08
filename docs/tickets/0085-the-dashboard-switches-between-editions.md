# Ticket: The dashboard switches between Editions

**What to build:** a reader can move between three views — Edition 1 of the five leagues,
the Nations League's Edition 1, and Edition 2 of the five leagues — and every page in a
view (the Competition leaderboard, its Fixtures and Entrant record pages, `/overall`)
reads that view's Edition from the API. The current Edition keeps today's URLs; an
earlier Edition's pages live under `/edition-1/…`, carry the label "Edition 1 · Gameweek
1–N" with N from the data, and open with a frozen sentence saying why the Edition ends
there and naming ADR-0061 and the ADR that opened the next one. Before a second Edition
exists the site renders exactly as it does today, switcher and prefix included, with the
switcher offering one league set and the cup. Source:
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md), *What
the dashboard shows*. Decisions it must not bend:
[ADR-0051](../adr/0051-a-combined-ranking-sums-the-leagues-and-publishes-what-that-costs.md)
(`/overall`'s qualification is published beside the sum; it gains the Edition-set clause
and the roster-differs-between-Competitions clause ADR-0060 owes),
[ADR-0042](../adr/0042-the-match-track-restarts-under-amended-prompt-versions.md) (the
retired block's rendering is unchanged and appears on Edition 1's La Liga page only).

**Blocked by:** 0084 (the bodies carry the Edition and the prefixed routes exist).

**Status:** done, 2026-10-08

---

## What is already known

**Same pages, one more parameter.** The Astro pages are built once per route; the prefix
is a second route set pointing at the same components with the Edition fixed, and the
worker serves the same assets under both. No second build, no static snapshot of Edition
1 — a live read of a closed Edition equals a snapshot.

**The switcher reads the Editions table through the API**, not a constant: the set of
views is "for each distinct (Edition set) the leagues have, one entry" plus the cup's
own. Adding Edition 3 one day is a row, not a deploy.

**The frozen sentence is a constant, and the numbers on it are not.** ADR-frozen text
lives beside `RETIRED_GAMEWEEK_CAVEAT`; the Gameweek range on the label and in the
sentence's "through Gameweek N" comes from the body. The dashboard suite pins the
sentence's bytes the way it pins the other caveats.

**`/overall` says what it summed.** Its qualification gains one clause: which Edition of
which Competitions, and that the Nations League is not in the sum because its roster is
not the leagues'. The hero's settled-Fixture stat and the evidence line are the Edition's.

**Narrow viewports.** The switcher is one more control in the header; the
testing-narrow-viewports runbook's checklist runs over it.

## Acceptance

- [x] On a one-Edition record, the built site's HTML and the rendered pages are
      byte-identical to today's except for the switcher, which offers "2026-27" for the
      leagues and "UNL" for the cup and nothing else.
- [x] On a two-Edition record: `/pl` shows Edition 2 from its first Gameweek with a
      leaderboard, Fixtures and Entrant pages reading only Edition 2; `/edition-1/pl`
      shows Edition 1 through its last Gameweek with the label, the frozen sentence and
      the retired block where one exists; links between pages stay inside the view.
- [x] `/overall` and `/edition-1/overall` each sum their own set and say so in the
      qualification; neither includes the cup.
- [x] The Combined Ranking is summed on the page from the five leaderboard bodies, so the
      page is where an Edition set is checked: a set whose bodies carry different
      `edition` numbers is refused with the mismatch named, never summed (moved here from
      ticket 0084 on 2026-10-08 — there is no Combined Ranking route to refuse it in).
- [x] The switcher moves between the three views on every page, and the current view is
      marked; deep links into an earlier Edition work without visiting the switcher.
- [x] The frozen sentence's bytes are pinned by a test; the Gameweek numbers on the label
      are proven to come from the body by changing the fixture data.
- [x] Narrow-viewport checklist passes with the switcher present.

## Evidence, 2026-10-08

- **Seams, agreed before the first test.** The user agreed the closed Editions should be
  code, not a read: `CLOSED_LEAGUE_EDITIONS` in `dashboard/src/edition-note.ts`, `[]`
  today.
  - The frozen sentence names the ADR that opened the next Edition, so every boundary is
    a deploy whatever the switcher reads. The routes, both switchers and the sentence are
    therefore built from that one list. This departs from *What is already known* ("the
    switcher reads the Editions table through the API"), and ADR-0061's amendment of
    today records it.
  - The constant is not beside `RETIRED_GAMEWEEK_CAVEAT`. The Edition note's script is
    bundled, and `openrouter-entrant.ts` would bring `zod` into it. The module imports
    nothing, and `dashboard-competition-view.test.ts` asserts that, along with the
    script's one import.
- **Routes.** `[competition]` became `[...competition]` and `overall.astro` became
  `[...view]/overall.astro`. There is one page code. With `{ number: 1 }`,
  `competitionRoutes` adds `/edition-1/{pl,pd,sa,fl1,bl1}`, whose `api` is
  `/api/edition-1/<code>`, and `overallRoutes` adds `/edition-1/overall`. The cup gets
  no prefixed copy.
- **Switchers (`switchers` in `competition-view.ts`).**
  - The views are "2026-27" and "UNL" on one Edition, and "Edition 1", "Edition 2" and
    "UNL" on two. Each entry keeps the reader's page, and leaving the cup lands on the
    Premier League.
  - The Competition control lists only the view's set. The cup's view has none, because
    its one entry would repeat "UNL".
  - The view control is `aria-label="View"`.
  - On the cup's view the Overall link is `/unl` (ADR-0061: its `/overall` is its
    leaderboard).
- **Box 1, met with three named exceptions.** A build at `548ee8a` was kept and compared by
  hand, with a script in the scratchpad rather than a test in the repo:
  - The file list is identical, except `/overall`'s bundled script, because
    `overall-view.ts` changed.
  - With the switcher markup stripped, every other HTML page is byte-identical, apart from
    these differences:
    - **`/overall` no longer sums UNL.** This is a behaviour change that moves the
      published numbers. At `548ee8a` the cup was added in once it was scored (ticket
      0076, spec 0027 story 51). Box 3 requires the change. ADR-0051 is amended, and story
      51 is marked as superseded.
    - On the three `/unl*` pages the Overall link is `/unl`.
    - The `scrollIntoView` selector names the Competition control.
    - The leaderboard and the Entrant record carry empty `qual-edition` and
      `pre-qual-edition` elements. They fill only on a later Edition, the same way
      `qual-roster` was added in 0081.
- **Box 2.** A build with `{ number: 1, openedBy: "ADR-0062" }` (bytes restored with
  `cp`/`cmp`) emits 16 `/edition-1/` pages.
  - Every nav, switcher and footnote link stays under `/edition-1/`.
  - `/edition-1/pd` fetches `/api/edition-1/pd/retired`, and `/pd` builds no block, as
    0084 handed over.
  - What each body holds is 0084's (`dashboard-edition-api.test.ts`).
  - It was not run against a live two-Edition API: the local database has Edition 1 only.
- **Box 3.** `overallRanking` checks every body's `edition.number`, covered or not, and
  returns `{ kind: "mixed-editions", editions }`. The page names each Competition's
  Edition and sums nothing. The qualification opens with "Edition N of PL, PD, and SA is
  summed here; " + `COMBINED_RANKING_CUP_CLAUSE`.
- **Box 6.**
  - `dashboard-edition-note.test.ts` pins both sentences' bytes. The league one now reads
    "Its Gameweeks stay here whole", since the note opens the page. `/overall`'s names no
    Gameweek, because each league may close at its own.
  - It also proves the numbers follow the body (5, then 7), and that no note is shown
    while `lastGameweek` is null.
  - In the browser, the two-Edition build was served with a stub
    `/api/edition-1/pd/leaderboard`. Headless Chrome rendered "Edition 1 · Gameweek 1–5",
    then "1–7" after the stub changed, and kept the note hidden for `lastGameweek: null`.
- **Box 7.** The runbook's iframe method was used: a 375px iframe in headless Chrome,
  over 7 pages of both builds.
  - The review caught a problem the first check missed: with the whole row scrolling,
    bringing the league into view pushed the current view out of sight.
  - Now only the Competition control scrolls, and `.switcher` has `min-width: 0`. Its
    absence was measured at a `scrollWidth` of 672.
  - After the fix, `scrollWidth` ≤ 375 on every page, and both current entries are on
    screen.
- **"Ran after Gameweek N" (0084's open item).** It stays capped at a closed Edition's
  last Gameweek, recorded in ADR-0061's amendment.
- **Also.** CONTEXT.md gains **Edition set**, and ticket 0086 gains the deploy step after
  inserting Edition 2.
- **Review (Standards and Spec in parallel).** Eleven findings were fixed and eight
  declined, each with the user's "ตกลง".
- **Mutation checks.** Every new test was red before its code. The import-free assertion
  was also mutated (a `zod` import added): red, then restored with `cp`/`cmp`.
- **Checks.** `tsc --noEmit` and `astro check`: no errors. 31 targeted files: 564 passed,
  6 skipped, 0 failed.

## Second review, 2026-10-08

The user accepted every verdict, and changed #14.
- **`editionQualification` was never rendered.** This broke ADR-0012: the 0097 → 0084 →
  0085 chain stopped one step short of the reader. It is now shown in `qual-edition`
  (ranking) and `pre-qual-edition` (pre-season) on the leaderboard, and in `qual-edition`
  on the Entrant record. A source test holds both pages, as the `rosterCaveat` test does.
- **`/edition-1/overall`'s note showed unconditionally.** That was a real bug in the window
  between the deploy and the insert. It now shows only when *every* league body that
  `/overall` already fetches has a `lastGameweek`. The leagues' boundaries fall days apart
  (ADR-0061 opens an Edition per Competition), so the user did not accept relying on PL
  alone. `overallEditionNote(closed, scopes)` returns null otherwise. That test was red
  first.
  - In the browser, the two-Edition build was served with five stub bodies. With PL, SA,
    FL1 and BL1 closed at Gameweek 5 and PD still open, the note stayed hidden. Once PD
    closed at Gameweek 8, it read "Edition 1".
- **Data clump.** Page takes one `view: PageView` prop (`prefix`, `overallPath`,
  `closedEdition`, `editionEndpoint`), which every route carries. This commit had edited
  all four pages the same way, which is the forced edit the dedup rule waits for.
  `switchers` looks routes up through one `routeOf`.
- **Documents.**
  - The two stale rest-route comments are corrected.
  - ADR-0061's amendment records where the constant lives.
  - ADR-0051 gains the amendment that `/overall` sums one Edition set and no cup, as a
    named change of numbers.
  - Spec 0027's story 51 is marked as superseded.
  - 0086's ADR-0051 item says it is done.
- **Checks.** `tsc --noEmit` and `astro check`: no errors. 31 targeted files: 566 passed,
  6 skipped, 0 failed.
- **Declined:**
  - The mixed-set message in the page script.
  - `SEASON_LABEL`.
  - Deriving `route`'s `edition` from `closed`.
  - `isLeague` reading `ROSTER_CAVEATS`.
  - The note's silent `catch`.
  - Box 2 and Box 6 tests that would need an Astro build in the suite.
