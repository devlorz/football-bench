# Handoff — FPL track dashboard, after "Race and Cards variants"

Repo: `/Users/leelorz/src/football-bench` · Branch: `claude/seeded-fpl-season` · Written 2026-08-14

## Where things stand

Fifth slice of [ticket 0014](0014-fpl-track-dashboard.md) — "Race and Cards variants" — is
done and committed as **`becd596`**, on top of `721afa2`. Working tree clean. All five
acceptance boxes ticked.

**None of the five slices is merged.** The repo's pattern is `git merge --no-ff` back to
`main` (see `732764a`).

**Read the commit message on `becd596` first.** Every design decision in the diff is argued
there in prose and is not repeated here. [ADR-0033](../adr/0033-the-fpl-track-joins-the-dashboard-as-its-own-section-under-fpl.md)
now records five deviations from the design files rather than three; the two new ones are
this slice's and are explained in the ADR itself.

## What this slice added

Seven files, +772/−65. Nothing under the Match track has a diff.

- `dashboard/src/pages/fpl.astro` — the `.seg` control, the Race and Cards variants, `?view=`.
- `dashboard/src/fpl-view.ts` — `spreadLabels`, `rankBand`, `chipsTag`, plus `settledGws`
  made public for the Race axis.
- `dashboard/public/styles/fpl.css` — race, cards, the loading stack, 760px stacking.
- `dashboard/src/dom.ts` — new: the namespaced `svg()` helper.
- `test/dashboard-fpl-view.test.ts` — 29 tests, nine describes, no database.

## Facts worth knowing before the next slice

- **`dom.ts` has one caller on purpose.** `dashboard/src/pages/entrants.astro` holds a
  character-for-character copy of `svg()` and does *not* import from `dom.ts`: **spec 0014
  line 308 puts "any change to the Match track's pages, endpoints, layout or styles" out of
  scope for the whole of this section's work**, and a one-line import is still a change to
  one. A review round asked for the extraction, it was made, and it was reverted when the
  spec line was read. The next ticket that legitimately touches `/entrants` collapses the
  copy. The reason is in `dom.ts`'s docstring.
- **The FPL section's own rule**: anything the page says in words rather than figures — and
  any position that can be wrong without looking wrong — lives in `fpl-view.ts` under test.
  The page builds no sentences and no geometry that can silently lie. Three review rounds
  enforced this; the hard findings were all things that had escaped the module.
- **Do not move FPL geometry into `chart-domain.ts`.** That module is the Match track's
  cumulative chart down to its docstring. Two reviews raised it, both were answered, and the
  second agreed. Reason is in `fpl-view.ts`. Importing `across` *from* it is fine and is the
  Gameweek-by-number rule, not FPL geometry moving in.
- **Vocabulary is enforced in identifiers, not only in copy.** `rankBand`, never `tier`
  (CONTEXT.md: "Tier is the Match Points tier and nothing else"); `.fpl-id`, never "model";
  "Entrant record", never "Model stats". A review round caught `tier` after it had passed
  two others.
- **The seeded Season is scored through Gameweek 5 with nothing at Gameweek 4**, so
  `missingGws` is `[4]` and every page must render a real hole. The Race axis reads
  `GW1 GW2 GW3 GW5`.
- **Seed commands** (`.env` points `DATABASE_URL` at the deployed Supabase database, so it
  must be overridden on the command line):

  ```bash
  DATABASE_URL=postgres://localhost/football_bench SEASON=2026-27 npm run seed -- --reset
  DATABASE_URL=postgres://localhost/football_bench SEASON=2026-27 npm run seed -- --reset pre-season
  ```

- **Walking the pages by hand needs two servers**, and `astro dev` proxies `/api` to 8787:

  ```bash
  DATABASE_URL=postgres://localhost/football_bench SEASON=2026-27 npm run dev:api
  cd dashboard && npm run dev     # http://localhost:4321/fpl
  ```

  Both were left running at the end of this session.
- **`overrides.css` is loaded by the FPL pages and is not to be edited**; `modernist.css` is
  vendored and never edited. Look in both before writing CSS — `.table`, `.tag`, `.seg`,
  `.skeleton`, `.kicker`, `.error`, `[hidden]` and the 760px header collapse are all there.

## Deliberately not done — do not "fix" without a decision

- **Sharing the axis thinning and end-anchor logic with the Match chart.** Six duplicated
  lines; unifying them needs a module parameterised over two viewBoxes and two anchoring
  rules, and touching the Match page is out of scope per the spec line above.
- **`entrant.rank === 1` in the Cards tile.** It reads `rankBand(...).band === "1"` instead,
  because the whole point of the classifier is that the line, the label and the tile cannot
  disagree about who the leader is. Raised as a shrink, declined with that reason.
- **Dropping Squad value and Chips left at 760px**, and the rest of the mobile collapse —
  that slice's own acceptance boxes. What this slice did was stop the two new grids from
  pushing the document sideways.

## Verification notes

- `npm run check` (`tsc --noEmit`), `cd dashboard && npx astro check`, `npx astro build`, and
  `npx vitest run test/dashboard-fpl-view.test.ts` (29 tests, ~1.3s, no database) are the
  loop. There is no lint script — **do not `npx eslint`**, the repo has no config and npx
  will install one.
- The full suite takes ~190–300s; background it. It sweeps `.claude/worktrees/` copies left
  by review agents, so counts are inflated and two pre-existing transform failures appear
  there. A path filter does not help — worktree paths contain `/test/` too.
- **Chrome's page zoom pins the CSS viewport**, so a real 375px render still cannot be
  produced and `resize_window` does not shrink it. Media-query work is verified by
  enumerating the CSSOM instead (`[...document.styleSheets]` → the `fpl.css` media rules).
- Claims about the DOM were checked with `javascript_tool` rather than by eye: mark count and
  band classes, label count, axis text, `?view=bogus` correction, `history.length` unchanged.
  `read_network_requests` proves the no-fetch box (zero requests across two switches).
- Leaked shared-memory segments from temp Postgres clusters eventually break `initdb` with
  "No space left on device" (nothing to do with disk):

  ```bash
  ipcs -mp | awk '$1=="m" {print $2, $7}' | while read -r id cpid; do
    ps -p "$cpid" >/dev/null 2>&1 || ipcrm -m "$id"
  done
  ```

## Next slice

Two are unblocked and independent of each other:

- **"The latest-squads page"** — its endpoint landed in `1b9ce62`, `--pitch` is already
  defined, and `docs/design_handoff_fpl_track/README.md` Screen 2 has the jersey `clip-path`
  and every measurement. The picker and the pitch/list choice go in the URL under the same
  rule this slice used.
- **"The Entrant-record endpoint"** — reads the same tables, no page work.

"The mobile collapse" needs both of those plus the Entrant-record page first.

## Suggested skills

- `ponytail:ponytail` — the user works in it by default; every decision above was made under
  it. The wins in this slice were rung-2 calls: `across` reused from `chart-domain.ts`,
  `.seg` and `.skeleton` taken from the vendored sheets rather than written.
- `tdd` — the pure functions went in with their tests before the page used them.
- `anti-overengineer` — the bar the review rounds enforced.
- `code-review` before handing work back. Expect it to find real things: this slice took four
  rounds, and three P1s (an invisible one-point polyline, a de-overlap that escaped the top
  edge, an Entrant silently dropped from the chart) came out of them.
- `claude-in-chrome` — needed to walk the pages; see the zoom caveat above.

## Working preferences observed

- Reply in Thai; code, identifiers and domain terms stay English.
- **Commit only when asked.** The message follows `becd596`/`721afa2`: explain every decision
  in the diff, in prose, ending with the `Co-Authored-By` trailer.
- No long polling loops — check once and report.
- Decline a review finding when it is wrong, say why in one paragraph, and write the reason
  into the code or the ADR so it is not re-litigated. Equally: when a review cites a spec
  line, read the line — one round of this slice was spent defending a change the spec had
  already ruled out.
- Report the check that was actually run and its limits. When a check could not be performed
  (the 375px render), say so and say what was verified instead.
