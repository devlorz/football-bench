# A combined ranking sums the leagues and publishes what that costs

ADR-0035 made each Competition its own benchmark and closed with a sentence: "no combined
cross-league ranking is published". This supersedes **that sentence and nothing else in that
ADR**. A combined ranking is published, at `/overall`, as the raw sum of each Entrant's
season-to-date Match Points and Bet Points over every scored Competition. Its per-Competition
half is untouched: the schema's `competition` dimension, the per-league leaderboards, the
per-league benchmark question all stand exactly as ADR-0035 wrote them.

The sum is **raw**, and deliberately un-normalised. Points per settled Fixture and mean
within-league rank were both on the table and both rejected below; what they buy is a number
that survives leagues of different sizes, and what they cost is that the figure stops being
the figure each league publishes. A reader who adds up four leaderboards by hand gets this
page's number. That is the property being protected, and the price is that a league with more
settled Fixtures weighs more in the total than a league with fewer. The page says so rather
than correcting for it — see the qualification and the evidence line below.

## What a row is

The ten Season Roster seats, keyed by the seat's **slug** (`claude-opus-5`) rather than its
id. ADR-0039 already made the slug the identity that survives a crossing — every Competition
seats the roster that stood at the Season's first Lock (ADR-0034, ADR-0038), so the slug is
what one Base Model is called in four leagues while `match-pd/2026-27-v2/claude-opus-5` is a
storage key.

**Exhibition Runs are excluded.** An Exhibition Run is Competition-scoped by its Prompt Version
filter (ADR-0032) and exists in one league by construction; a row for one would be a total over
one Competition ranked beside totals over four, which is the confound this page already
tolerates between leagues and has no reason to invent inside a single column. Reference Lines
are unchanged: they are never ranked anywhere, and this is nowhere in particular.

Both columns are published — Match Points and Bet Points — under the `.seg` toggle the
per-league leaderboard already uses. Publishing one would be a new claim that one of them
matters more, which the per-league page deliberately declines to make and this page inherits
no standing to make either.

## Which Competitions are in the sum

A Competition enters the sum when it is Active **and scored** — a `competitions` row for the
Season, and a `throughGw` that is not null. An Active Competition with nothing scored answers
every figure with null; adding it would contribute nothing while implying a nought, and a
Competition that is not Active answers `active: false` and has no seats to contribute at all.

**Every row sums the same set of Competitions.** This is the load-bearing half of the decision
and the one a later edit is most likely to break: under a raw sum a Competition left out of one
row's total is a nought in it, so a table whose rows covered different sets would not be a
ranking of anything. The set is decided once, for the whole table, and the page names it and
its size.

The table therefore publishes over whatever is scored rather than waiting for the slowest
league. A seat that Gapped an entire scored Competition scores nought there and still ranks,
which is the leaderboard's existing reading of a Season-long Gap and not a new one.

La Liga's retired Gameweek 1 never enters. `rankedFrom` refuses it to every figure the
per-league ranking is built from (ADR-0042), and this page reads those figures — so the
exclusion arrives already made, from the one place it is written.

## Where the sum happens

In the reader's browser, over the four existing `/api/{code}/leaderboard` answers. There is no
`/api/overall/leaderboard`, no new query, no schema change and no edit to the scorer.

This keeps a property the write path holds on purpose. `scoreMatchCompetitions` runs one pass
per Competition specifically so that "no call ever holds two Competitions' rows at once", and
the read API takes its Competition from the path with no default (ADR-0039). Both stay literally
true. What is published here is a composition of four separately-published answers — which is
the "read-path exercise a future reader can run precisely because every row is labelled" that
ADR-0035 always permitted. What changes is that the dashboard performs it instead of leaving it
to the reader; the record's shape does not change at all.

What it costs, stated rather than discovered later: the summing rule lives in the page's script,
so it is proved by whatever proves a built page and not by the read API's suite. If the rule
grows past a sum — a weighting, an eligibility floor, anything with a branch in it — that cost
stops being acceptable and the rule moves behind an endpoint. It is a sum today.

Four fetches rather than one. Each is the same URL a per-league page already asks for, already
edge-cached under the scored-endpoint lifetime, so the fan-out adds cache entries no reader was
missing and no database read at all.

**A fetch that fails fails the page.** Not a table missing a league: the paragraph above makes
"every row sums the same set" the thing that makes this a ranking, and a page that quietly drops
La Liga because one response errored publishes a ranking of a set it cannot name. The existing
failure line is the state a reader is left in, which is the same fail-closed reading the
per-league leaderboard takes of a missing qualification.

## Where it lives

`/overall`, a fourth entry in the Match track's nav. Not in the Competition switcher: the
switcher's answers are Competitions and this is not one, and an entry there would make the
combined table read as a fifth league.

`/` keeps its `302` to `/pl`. ADR-0039 declined to let one league own the root because a URL
space where one benchmark is the site says the others are additions to it; putting the combined
ranking there says something worse and newer — that the combined number is what this site is
for, and the four leagues are its inputs. They are the benchmarks. This is a page that adds
them up.

## What the page must say

Two sentences, neither optional.

The **evidence line** carries the per-league breakdown and not only the total —
`n = 47 fixtures · PL 24 · PD 9 · SA 8 · FL1 6 · ranks, does not prove`. Under a raw sum the
imbalance between leagues is not a footnote about the figure, it is the thing driving it, and a
single total is exactly the presentation that hides it.

The **qualification** is a new exported constant in a module of its own, imported at build time
the way `EXHIBITION_CAVEAT` is. Every other figure this dashboard publishes reads its
qualification back out of the row the scorer wrote it into, and this one has no row to read: the
figure is computed in a browser from four rows that each carry their own. A constant is the
repo's existing form for a sentence an ADR freezes, and the alternative — having the scorer write
a combined row — would put two Competitions in one call to obtain a string.

It must say three things: that the total is a raw sum across leagues; that a league with more
settled Fixtures therefore weighs more; and that the leagues run under different Prompt Versions,
which ADR-0038 named as a confound the moment anyone compares an Entrant across leagues. The four
per-league qualifications keep their own meaning and are not restated here.

## Considered Options

- **Mean within-league rank** — the honest normalisation: it never adds a Premier League point to
  a Serie A point, it composes places, and both league difficulty and unequal `n` cancel because a
  rank is taken within its own league. Rejected because the answer stops being points. A reader
  arriving from a leaderboard showing 8 and 8 gets a column of 2.75 that reconciles with nothing
  on the page it came from, and the figure's own definition — "average of four places" — is a
  scoring rule this record does not otherwise contain. It also weighs a league with two settled
  Fixtures exactly as heavily as one with twenty-four, which is a distortion in the other
  direction and a quieter one.
- **Points per settled Fixture** — rejected for the same reason with less to show for it: a rate is
  a second scoring rule nothing in the record publishes, and it makes a two-Fixture league as loud
  as a twenty-four-Fixture one on evidence nobody would defend if it were the whole page.
- **A new `/api/overall/leaderboard`** — rejected. It would put two Competitions' rows in one call,
  which is the property the scorer's one-pass-per-Competition loop exists to hold and the read API's
  no-default routing exists to hold. Buying a tested seam by giving that up is the wrong trade while
  the rule is addition. Revisit if the rule ever branches.
- **The combined table at `/`** — rejected above. The `302` stays a `302`, and the hub page ADR-0039
  left open stays open; this decision does not take it.
- **Waiting until every Active Competition is scored** — rejected. It leaves the page blank on the
  slowest league's clock, and Serie A and Ligue 1 opened later than the two leagues already scoring
  (ADR-0049), so the blank would be the normal state rather than the edge case.
- **Publishing one column** — rejected; see above.

## Consequences

- ADR-0035 is superseded in one sentence and stands in every other. Its Competition dimension, its
  per-league benchmark question and its per-league leaderboards are unchanged, and this ADR creates
  no reason to revisit them.
- Five documents state the retired rule and each needs the edit this ADR makes true: ADR-0039's
  consequence that "no surface computes across it"; the Out of Scope line in spec 0016; the Out of
  Scope line in spec 0017; the per-league leaderboard's **What this is not.** footnote, which
  currently reads that no ranking spans two Competitions; and CONTEXT.md.
- CONTEXT.md gains **Combined Ranking**: one ranking over every scored Competition of a Season, by
  raw season-to-date total. Distinct from a **Leaderboard**, which spans one Competition and still
  never two. The distinction is the point of the term — a page that called both a leaderboard would
  lose it in a week.
- The dashboard computes across Competitions for the first time. Nothing else does, and the two
  places that structurally prevent it — the scorer's per-Competition pass and the read API's
  per-path Competition — keep preventing it.
- The write path, the scorer, the scheduler and the schema are untouched. This ADR is a read.
