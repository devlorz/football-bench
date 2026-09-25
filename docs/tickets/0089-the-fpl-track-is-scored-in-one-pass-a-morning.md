# Ticket: The FPL track is scored in one pass a morning, not one per settled Gameweek

**What to build:** the daily fetch — and `npm run fpl:score` — score every settled FPL
Gameweek in one replay of the Season instead of calling the scorer once per Gameweek, each
call of which already replays the Season from its first Gameweek. The rows written are the
rows written today. Match scoring made the same change in ticket 0069 ("grows with the
Season, not with its square"); the FPL track never did.

**Blocked by:** None — can start immediately. Independent of ticket 0088.

**Status:** ready-for-agent

---

## What is already known

**The cost is quadratic in the Season.** The daily fetch loops over `settledGameweeks` —
every Gameweek that has finished, not only the one that finished today — and calls
`scoreFplGameweek` for each. Each call begins at the track's starting Gameweek and replays
every Gameweek through the latest published one, writing a record for its target and for
every published Gameweek after it. Five settled Gameweeks is fifteen replayed Gameweeks;
Gameweek 38 would be more than seven hundred. On 2026-09-25 it took from 06:37:54 to
06:43:48, and the run was cancelled eleven minutes later.

**One call cannot simply take the earliest Gameweek.** The scorer's targets are the
Gameweek it is given plus every Gameweek already *published* after it. A Gameweek that has
settled but not yet been published — the one that finished yesterday — is not in that set
unless it is the one given. So "call once with the earliest" would silently stop writing
the newest Gameweek. What one pass needs is a set of targets: every settled Gameweek it is
handed, plus every published Gameweek after the earliest of them, written in a single walk
from the starting Gameweek.

**What must not change.**

- The rows in `scores` for the FPL track, value for value, including `detail`.
- One transaction for the whole pass, as each call is one today: a record half-written is
  worse than none (the scorer's own docstring).
- The refusals: a Gameweek that is already published and has lost its points or a Manager
  State still throws and changes nothing; a target that has not settled, or that some
  Entrant has not played, is still skipped rather than written. The one difference to
  state in the change: today a refusal fails one call of five and the other four still
  write; after this, the refusal fails the pass. Every one of those refusals is about a
  published Gameweek, and every per-Gameweek call replays through every published
  Gameweek, so today's four "successful" calls hit the same refusal on the way — read the
  code before accepting this paragraph, and correct it in the ticket if it is wrong.

## Acceptance

- [x] The scorer takes a set of Gameweeks and writes each of them, and every published
      Gameweek after the earliest, in one replay from the starting Gameweek. The
      single-Gameweek call remains as a set of one, so nothing else has to change.
- [x] The daily fetch and `npm run fpl:score` each call it once with every settled
      Gameweek, after every Gameweek's points are stored — the order both keep today.
- [x] Equivalence: over a seeded Season of at least four settled Gameweeks, the `scores`
      rows after one pass equal the rows after the per-Gameweek calls in ascending order,
      compared as whole rows. Plus the case above: a Gameweek settled but not yet published
      is written by the one pass.
- [x] `score-fpl-gameweek`, `fpl-demonstration-record`, `daily-fetch` and the other FPL
      suites are green; any assertion that counted calls is updated to count passes and
      says why.
- [ ] Measured on production after deploy: the gap from the last `fpl_live` snapshot to
      the first `football_data_org` snapshot on the next scheduled daily fetch, recorded
      in this ticket with the run's id.

**How the ticked boxes are proven (2026-09-25, after review).** `scoreFplGameweeks` in
`src/fpl/score-fpl-gameweek.ts` walks the Season once. `scoreFplGameweek` now calls it
with a set of one. Both tests are in `test/fpl-demonstration-record.test.ts`, and both
compare every `scores` row, all columns except `scored_at`, against
`test/fixtures/fpl-demonstration-rows-before-0089.json.gz`. That fixture was captured by
running the same two tests at `b02d930`, where the scorer is unchanged since `ce7befe`,
with the one pass replaced by one `scoreFplGameweek` call per Gameweek in ascending order.
A baseline taken from the new code would share any fault in the walk.

- "writes in one pass the rows the Gameweek-by-Gameweek calls wrote": two Entrants and
  four settled Gameweeks, with Repairs, a Roll Over and violations. Nothing is published
  beforehand. 64 rows.
- "rewrites in one pass the published Gameweeks after the earliest asked for": Gameweeks
  1, 3 and 4 are published while 2 is unsettled. Then 2 settles late and 5 settles for the
  first time, and the pass is given `[2, 5]`. It has to rewrite 3 and 4, which were
  published and not asked for, and write 5, which was asked for and not published. 40 rows.

Three mutants of the target set each fail at least one of the two tests: `Math.min` made
`Math.max`; only the earliest Gameweek asked for kept as a target; and the published
cutoff moved from the earliest Gameweek asked for to the latest.

The FPL suites and `daily-fetch` pass (136 tests across nine files). No assertion counted
scorer calls, so none needed updating.

**The refusal paragraph above holds.** It was checked against the code. Every walk starts
at the starting Gameweek and runs at least through the latest published Gameweek, so every
per-Gameweek call reached the refused Gameweek and threw. The "four still write" in that
paragraph was already false before this change. The one exception was a call whose own
target was unscoreable and unpublished: that call returned before the walk got there.

**One change to the single-Gameweek call.** An asked-for Gameweek that is unscoreable and
unpublished used to end the call silently with nothing written. Now it is skipped and the
walk goes on, which a set of targets needs. So `scoreFplGameweek` on such a Gameweek also
rewrites the published Gameweeks after it, and it can throw if one of them meets a
refusal. The rows it writes come from the same stored inputs through the same fold, so
their values do not change.

## What this ticket does not do

- **Batch the scorer's own writes.** Inside one replay it still reads and writes metric by
  metric; one pass makes that linear in the Season, which is enough. Batching them is the
  next lever if a later Season needs it.
- **Skip Gameweeks whose points did not change.** Same boundary as ticket 0088.
- **Player points and the daily FPL fetch.** Ticket 0088.
