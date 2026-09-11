# Ticket: A scoring pass grows with the Season, not with its square

**What to build:** one scoring pass writes exactly the rows it writes today, while asking
`scoreMatchGameweek` for a number of targets that grows with the Season's Gameweeks rather
than with their square. Today `scoreMatchSeason` walks every locked Gameweek and each walk
rewrites that Gameweek and every later published one, so a Competition at N Gameweeks costs
N(N+1)/2 target-passes and the most expensive thing inside one is a 10,000-resample
bootstrap per published comparison. The shape that produces the same rows is already
written down in the `ponytail:` note above `scoreMatchSeason`: score `min(locked)` once,
which sweeps a correction through every published snapshot on its own, plus each locked
Gameweek that `scores` does not yet hold, which bootstraps the genuinely new ones.

**Blocked by:** None — can start immediately.

**Status:** built 2026-09-11, reviewed the same day. The pass is linear and its equivalence
to the quadratic one is proven row for row in `test/score-match-season.test.ts`. Three boxes
stay open and all three want the same thing: a restored copy of production, which this
session cannot take — the operator's commands are written under the first of them.

---

## What is already known

**The arithmetic, read 2026-09-10 against production.** `scoreMatchGameweek(gw)` rewrites
`gw` plus every already-published Gameweek after it (`targetGameweeks`), and
`scoreMatchSeason` calls it once per locked Gameweek:

| Competition | locked Gameweeks | target-passes today | under the new shape |
| --- | --: | --: | --: |
| BL1 | 2 | 3 | 2 |
| FL1 | 3 | 6 | 3 |
| PD | 6 | 21 | 6 |
| PL | 3 | 6 | 3 |
| SA | 3 | 6 | 3 |
| **total** | **17** | **42** | **17** |

Two and a half times the work today, and the gap widens with the Season: at 38 Gameweeks a
league costs 741 target-passes against 38, and the five together 3,705 against 190. This is
what the note means by "minutes rather than seconds by May".

**Why the quadratic shape exists, and what has to survive.** A result that settles late or
is corrected changes its own Gameweek's row and every cumulative snapshot taken after it,
so those snapshots are recomputed rather than left describing a Season that no longer
happened. Scoring `min(locked)` keeps exactly that: its `targetGameweeks` is `min` plus
every published Gameweek above `min`, which is every published Gameweek there is. What it
does not cover is a Gameweek nobody has scored yet — absent from `scores`, so absent from
that list — which is why the second half of the shape exists. Scored in ascending order,
each new Gameweek's cumulative rows read stored Predictions and Fixtures rather than earlier
`scores` rows, so nothing depends on the order beyond a Gameweek not being published twice.

**What must not move.** The rows themselves: `value`, `n` and `detail` for every metric,
Reference Line and comparison, under every Competition. The conditional upsert
(`where scores.value is distinct from excluded.value or ...`) means an unchanged row keeps
its `scored_at`, so an equivalent pass is one after which no `scored_at` moves that a
full pass would not have moved either. One pass still stamps one instant per Competition —
`scoreMatchSeason` reads the clock once and hands the same value to every call.

`writeComparisons` deletes the season-to-date paired rows of models it did not declare, per
target Gameweek. Every published Gameweek is still a target under the new shape, so that
cleanup still reaches all of them; a shape that skipped published Gameweeks would leave
stale comparison rows behind, which is the failure to watch for.

**How to prove it.** Not by reasoning — by scoring the same rows twice. Take a copy of
production's `2026-27` record, run the pass as it stands, snapshot `scores`, restore, run
the new pass, and diff the two snapshots on everything but `scored_at`. Ticket 0050 used
the same technique in the other direction to show the Exhibition rows moved no roster figure.

## Acceptance

- [ ] For every Competition of `2026-27`, a pass under the new shape writes a `scores` table
      identical to the one a pass under the old shape writes — same rows, same `value`, `n`
      and `detail` — proven by running both over the same restored copy and diffing

      The diff is done, but over a constructed Season rather than production's:
      "writes what naming every Lock wrote, over the same record" in
      `test/score-match-season.test.ts` replays the same two Gameweeks under each shape and
      then hands each the same day — a third Gameweek arriving in the same pass as a
      correction to the first, which is the day a pass has both a snapshot to sweep and a
      Gameweek to bootstrap and so the most room to disagree — and compares every column of
      every row but `scored_at`, the bootstrap intervals inside `detail` among them. It is a
      real diff and not a re-reading of one run: the old shape is rebuilt from
      `scoreMatchGameweek` in the test itself, the record is truncated and replayed from the
      same Fixtures between the two, and with `seasonScoringGameweeks` mutated back to
      naming every Lock this box's test still passes while only the rule's own test fails.
      That is the equivalence claim, checked from both sides.

      What it is not is production's five leagues. Taking that copy needs `pg_dump`
      against the pooler, which this session's classifier denies (the same wall ticket
      0068's rehearsal met). For the operator, against a restored copy and never against
      production:

      ```
      npm run match:score                      # on the copy, at the old commit
      pg_dump --data-only --table=scores ...   # snapshot one
      # restore the copy, check out this commit
      npm run match:score
      pg_dump --data-only --table=scores ...   # snapshot two
      diff  # on everything but scored_at
      ```
- [ ] The targets one pass asks for are `min(locked Gameweek)` plus each locked Gameweek
      absent from `scores`, and the count matches the table above: 17 across the five
      Competitions where today it is 42

      The rule half is done. It is `seasonScoringGameweeks(locked, published)`, split out of
      the pass so it can be read as arithmetic — no row it writes betrays which shape
      produced it, so a regression to the quadratic one would pass every other test in the
      file. Its own test states four cases: nothing published names every Lock (the
      bootstrap, which both shapes always agreed on), published through the Season names
      one, the daily case names the earliest Lock and the new one, and an unordered `locked`
      still names the earliest — `Math.min` rather than the first element, because a rule
      that meant "whichever Lock happens to be first" would drop the correction sweep on an
      unordered list without failing anything.

      The count half is not. 17 and 42 are readings of production's five leagues taken
      2026-09-10, and nothing here has re-taken them: the test's Season is three constructed
      Gameweeks. They follow from the rule by arithmetic — `min` alone targets every
      published Gameweek, so a Competition at N published Locks costs N target-passes rather
      than N(N+1)/2 — but arithmetic from a table is not a measurement, and this box asks
      for the measurement. It comes off the same operator run as the two boxes below, which
      is where the Locks of all five are in front of a process that can count them.
- [x] A result corrected in an early Gameweek still rewrites every later published snapshot
      — the behaviour the quadratic shape was paying for — shown by a test that corrects a
      settled Fixture in Gameweek 1 and reads a changed season-to-date row at the last
      published Gameweek

      "recomputes an earlier Gameweek whose result was corrected" was already there and ran
      over two Gameweeks, where the corrected Gameweek is adjacent to the last published one
      and a sweep that reached only one Gameweek forward would have passed. It now runs over
      three: Gameweek 1 is re-settled 5-1 against a predicted 2-0 and Gameweek 3's
      season-to-date falls from 10 to 7, with Gameweek 2's 5 checked on the way.
- [x] A locked Gameweek that `scores` has never held is bootstrapped by the same pass, and a
      second pass immediately after writes nothing new

      "bootstraps a Lock `scores` has never held": a third Fixture is locked, settled and
      predicted after the Season has been scored; the next pass returns `[1, 2, 3]` and
      writes Gameweek 3's 2 and the Season's 10. The pass after that is given a third clock
      reading and leaves every row of `scores` byte for byte where it was.
- [x] One pass still carries one `scored_at` per Competition, and an unchanged row keeps the
      stamp it had

      Both halves were already tested — "stamps every row of one run with a single scoring
      instant" and "re-running over unchanged rows duplicates nothing" — and both still
      hold, because the clock is still read once in `scoreMatchSeason` and handed to every
      call. The new bootstrap test carries the second half again at the point it is now
      easiest to break: the pass after a Gameweek is added stamps nothing it did not change.
- [x] The stale-comparison cleanup still reaches every published Gameweek: a model that
      stops being declared has its season-to-date paired rows removed, as today

      "clears the paired rows of a seat that stopped being declared, at every published
      Gameweek": three Gameweeks are scored with both seats declaring, then the second seat
      leaves the roster the way ADR-0038 tells seats apart — its Prompt Version — and the
      next pass leaves no Paired Difference row at Gameweek 1, 2 or 3. This is the box that
      pins why the earliest Lock is named whether or not it is published; a pass that named
      only the unscored Locks would leave all three sets standing, and this test is what
      says so.
- [ ] Wall-clock for a full five-league pass before and after, measured against the same
      restored copy and written into `docs/reports`

      Waits on the same copy as the first box, and on the same denial. Time the two
      `npm run match:score` runs that box already asks for and the figure is a by-product;
      it wants no separate run.
- [x] The `ponytail:` note above `scoreMatchSeason` is gone, because its ceiling is gone —
      not left describing a shape the code no longer has

      Replaced by two paragraphs that describe the shape the code has: why the earliest Lock
      covers every published Gameweek, why a Gameweek absent from `scores` has to be named
      on its own, and why nothing depends on the order beyond not publishing one twice. The
      `ponytail:` note inside `bootstrapInterval` is left alone — it is about the 10,000
      resamples themselves, and this ticket changed how often they are paid for, not how
      many there are.
- [x] **The review's own findings, applied.** The `select distinct gw from scores` the new
      pass read was byte for byte the one `targetGameweeks` reads eleven lines below it, so
      the two would have had to be edited together forever; they are now one
      `publishedGameweeks`, and its comment says why the two answers must be the same list.
      `seasonScoringPasses` returned Gameweek numbers rather than passes and is
      `seasonScoringGameweeks`; not the reviewer's `seasonTargetGameweeks`, because
      `targetGameweeks` beside it means the Gameweeks one call *rewrites*, and these are the
      ones a pass *names* — a name that made them read as a pair would make them read as the
      same thing. The earliest Lock is `Math.min` rather than index 0. `published` narrowed
      from `Iterable<number>` to `number[]`, since nothing passes anything else. In the
      tests, the new whole-row helper replaced the two copies that were already inlined in
      this file rather than joining them.
