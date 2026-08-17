# Handoff — FPL track dashboard, after "The Entrant-record endpoint"

Repo: `/Users/leelorz/src/football-bench` · branch `main` · written 2026-08-16

## Where things stand

Seventh slice of [ticket 0014](0014-fpl-track-dashboard.md) — "The Entrant-record endpoint"
— is done and committed as **`6475b00`**, on top of `f300c93`. All seven acceptance boxes
ticked. Working tree clean. **Not pushed.**

**Read the commit message on `6475b00` first.** Every decision in the diff is argued there
in prose and is not repeated here. [ADR-0033](../adr/0033-the-fpl-track-joins-the-dashboard-as-its-own-section-under-fpl.md)
now records **nine** deviations from the design files and one correction.

The slice went through one code review round (two axes). Three findings were declined with
reasons written into the code or the ADR; the rest were fixed before the commit.

## What is left of ticket 0014

- **"The Entrant-record page"** — unblocked by this slice. The next frontier.
- **"The mobile collapse"** — blocked on the page.
- **"First deploy of the section"** — blocked on the collapse. Needs migration 0029 applied
  to the deployed database.

## The one thing this slice deliberately left for the page

**`hitPoints` is points, not a count of Hits, under a design block labelled `Hits taken`.**
The reasoning for serving the cost is in the field's docstring in `read-api.ts` and in
`6475b00`. The page must either print "Hit points" and take a **tenth ADR-0033 deviation**,
or the field must change. **It must not divide by four** — that restates a rule of the game
at a boundary that cannot check it, and the game moved the Free Transfer allowance for
2026/27 already. This was raised in review and explicitly parked here so it does not fall
between the endpoint and the page.

## Facts worth knowing before the next slice

- **`/api/fpl/entrants` serves no `provider`.** It was cut in review: the provider belongs
  to the sub-line under a Team Sheet, and Screen 3 has none. If the record page turns out
  to want it, add it back deliberately rather than assuming it was an oversight.
- **Four rules now have exactly one home each in `read-api.ts`**, and both FPL endpoints
  read them: `transfersBetween` (the Squad diff, including the Free Hit stash rule),
  `qualificationAt` (ADR-0003's sentence and its fail-closed guard), `holesIn` (a span's
  missing Gameweeks — it takes the span, and the docstring explains why it must),
  `squadValueAt`, and `byTotalPoints` (the order both Entrant-scoped pages list the field
  in). **A page or endpoint that writes its own version of any of these is the thing three
  review rounds across two slices kept finding.**
- **`listedPool` changed shape.** It now holds every listing through the Gameweek rather
  than the standing one alone, and answers `priceAt(fplId, gw)` beside `player(fplId)`. The
  row-count ceiling is on record in a `ponytail:` comment. Any new caller wanting a price at
  a Gameweek uses `priceAt` and does not filter `fpl_players` itself.
- **`manager_states` rows are immutable against update *and* delete** (migration 0001, the
  `reject_immutable_row_change` trigger). This bit during this slice: the Free Hit probe's
  first two designs were both impossible. The only writable Manager State in the whole seed
  is **the Gameweek the Gapping Entrant stored none for**, which is Gameweek 4. Do not
  weaken the trigger for a test; see the `describe` docstring in
  `test/dashboard-fpl-entrants-api.test.ts` for what that costs and what it therefore
  does not assert.
- **The seed's field is nine, the roster of record is ten.** Spec 0015 refreshed the roster
  to ten before the first Lock and deliberately held the design-mock seed roster where it
  was. Spec 0014 and ticket 0014 were corrected in this commit to stop stating a count in
  acceptance criteria — an endpoint answers for whoever is seated. **Every FPL test asserts
  nine.** Do not "fix" a nine to a ten anywhere without reading spec 0015's exception.
- **The seeded Season is scored through Gameweek 5 with nothing at Gameweek 4**, and that
  hole announces itself twice: in `missingGws`, and in the Gapping seat's
  `transfersSinceGw` reading 3 where the other eight read 4.
- **`?entrant=` is shared between the two Entrant-scoped pages.** Unchanged from the
  previous handoff: `entrantOf` / `entrantSlug` in `entrant-link.ts` resolve it, and the
  squads page writes the selection onto the `[data-tab="entrants"]` link in `FplPage.astro`.
  The record page must read it the same way **and write the selection back onto the squads
  tab**, or the "one selection across two pages" story only works in one direction.
- **`dom.ts` is `svg`, `el`, `byId`, `text`** and must keep importing nothing —
  `dashboard-competition-view.test.ts` asserts that, because it is on every page of both
  sections. The same test holds a whole-list assertion of page imports that has drifted
  twice now; expect to update it.
- **Seed and dev servers**: `.env` points `DATABASE_URL` at the deployed Supabase database
  and must be overridden for every local command. `npm run dev:api` must be started **from
  the repo root** — a stale API process silently serves a body missing newly added fields.
- **`overrides.css` is loaded by the FPL pages and is not to be edited**; `modernist.css` is
  vendored and never edited.

## Deliberately not done — do not "fix" without a decision

- **The per-Transfer cost the design draws**, on either Transfers list. ADR-0033 deviation.
- **Chip accounting in the Free Hit probe** — see the immutability note above.
- **Seeding a Blank or a Double Gameweek.** Unchanged. `SHORT_GAMEWEEK = 14` in
  `src/seed-season.ts` is the Match track's and `GAPPED_FIXTURES` is written against its
  Fixture ids; moving it into the FPL window relocates the Match track's Gap. Open decision.
- **Sharing the Race chart's axis thinning with the Match chart.**

## Verification notes

- `npm run check`, `cd dashboard && npx astro check && npx astro build`, and the touched
  vitest files are the loop. There is no lint script — **do not `npx eslint`**.
- **Pass `--exclude '**/.claude/**'` to vitest.** The stale worktree at
  `.claude/worktrees/nifty-euclid-8ac73d/` is swept up otherwise and fails on a tsconfig it
  cannot resolve. Safe to delete; the user has not said to.
- **The full suite has not been run on `6475b00`.** Touched files only: 173 passing across
  the two shipped FPL endpoints, the new one, both dashboard views, the Match track's record
  endpoint and the read API.
- **The Free Hit probe was mutation-checked** by reverting the stash rule in
  `transfersBetween` — the two empty Transfer lists become four out and four in. Bytes were
  restored from a copy, never `git checkout`.

## Loose ends the user has been asked about and has not answered

1. **Full suite as a gate** before pushing.
2. **Pushing at all** — `main` is now two commits ahead of `origin`.
3. **Deleting `.claude/worktrees/nifty-euclid-8ac73d/`.**

## Suggested skills

- `ponytail:ponytail` — the user works in it by default; every decision above was made under
  it. This slice's wins were rung-2 calls: four rules extracted rather than re-answered, and
  a clever `gaps` expression rewritten as a span argument the moment it read as clever.
- `tdd` — the endpoint's shape was settled by dumping a real body before asserting on it.
- `anti-overengineer` — the bar the review rounds enforce.
- `code-review` before handing work back. It found real things again this slice; the most
  useful were a type named `FplTransfer` publishing captain picks, and a footer with three
  different spans and only two of them explained.
- `claude-in-chrome` — needed to walk the page. **Chrome's page zoom pins the CSS viewport**,
  so a real 375px render still cannot be produced; media-query work is verified by
  enumerating the CSSOM instead.

## Working preferences observed

- Reply in Thai; code, identifiers and domain terms stay English.
- **Commit only when asked.** The message follows `6475b00`/`f4ce803`: explain every decision
  in the diff, in prose, including the ones declined and why, ending with the
  `Co-Authored-By` trailer. Commits go to `main` directly.
- No long polling loops — check once and report.
- **Never run the full suite unprompted** (~190–300s); touched files only, and ask before a
  gate run.
- Decline a review finding when it is wrong, say why in one paragraph, and write the reason
  into the code or the ADR. Equally: **when a review cites a spec line, a column or a
  migration, go and read it.** This slice's reviewer opened by retracting one of its own
  findings after reading spec 0015, and the retraction was right.
- Report the check that was actually run and its limits. When a check could not be
  performed, say so and say what was verified instead.
