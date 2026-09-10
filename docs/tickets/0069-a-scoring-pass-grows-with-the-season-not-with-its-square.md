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

**Status:** open

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
- [ ] The targets one pass asks for are `min(locked Gameweek)` plus each locked Gameweek
      absent from `scores`, and the count matches the table above: 17 across the five
      Competitions where today it is 42
- [ ] A result corrected in an early Gameweek still rewrites every later published snapshot
      — the behaviour the quadratic shape was paying for — shown by a test that corrects a
      settled Fixture in Gameweek 1 and reads a changed season-to-date row at the last
      published Gameweek
- [ ] A locked Gameweek that `scores` has never held is bootstrapped by the same pass, and a
      second pass immediately after writes nothing new
- [ ] One pass still carries one `scored_at` per Competition, and an unchanged row keeps the
      stamp it had
- [ ] The stale-comparison cleanup still reaches every published Gameweek: a model that
      stops being declared has its season-to-date paired rows removed, as today
- [ ] Wall-clock for a full five-league pass before and after, measured against the same
      restored copy and written into `docs/reports`
- [ ] The `ponytail:` note above `scoreMatchSeason` is gone, because its ceiling is gone —
      not left describing a shape the code no longer has
