# Serie A and Ligue 1 open, and the Bundesliga waits on hands, not money

> Amended 2026-08-25 by ticket 0046. **The $0.1845/Fixture rate below, and the $266.79 and
> $56.46 figures derived from it, are superseded: the corrected standing cost for the four
> open Competitions is $415.01/Season**, per
> [the 2026-08-25 price report](../reports/2026-08-25-five-league-price.md).
>
> What was wrong: $0.1845/Fixture was read off La Liga's Gameweek 1 on 2026-08-15, one
> Gameweek before ADR-0042's restart and ADR-0043's additions grew every Competition's
> packet. This ADR cited that report correctly; the report's own number had already gone
> stale by the time this ADR spent it, and nothing re-measured it before the spend was
> committed here.
>
> The corrected per-Fixture rates, read from real `attempts` rows played under each
> Competition's current, unretired Prompt Version: $0.2982 (`PL`), $0.2827 (`PD`), $0.2695
> (`SA`), $0.3003 (`FL1`) — 55.6% above the rate this ADR committed at.
>
> What does not change: the decision to open Serie A and Ligue 1, and to leave the
> Bundesliga gated on curation capacity rather than money — neither turned on the exact
> dollar figure, both turned on the price being acceptable at all, and $415.01 across four
> Competitions is still the operator's call to make, not this amendment's. The Bundesliga's
> $56.46 rests on the same stale rate and is unresolved until it opens and has its own
> Gameweek to price.

ADR-0035 gated the three remaining Competitions on two conditions and left the gate for
the operator to take. Both conditions are answered: La Liga has completed a full
fetch → Lock → predict → score cycle, and the per-Fixture cost is read off its Gameweek 1
— $0.1845 per Fixture (superseded — see the banner above)
([the price report](../reports/2026-08-15-five-league-price.md)), which the report
deliberately declined to call acceptable or not. This ADR is that call, for two of the
three.

**Serie A (`SA`) and Ligue 1 (`FL1`) open for 2026-27.** At the report's rate that is
$126.57 per Season more — 686 Fixtures, 380 Italian and 306 French — and it takes the
match track's standing commitment to **$266.79 per Season across four Competitions**
(1,446 Fixtures — superseded, $415.01, see the banner above). Both numbers are this
decision's to own: the increment is what it spends, the total is what stands committed
after it.

**The Bundesliga (`BL1`) stays gated, and the reason is hands, not money.** Its price
would be $56.46 per Season (superseded, see the banner above), which changes nothing
above. What is scarce is curation: a Competition costs three identity maps of roughly
twenty clubs each, every one reviewed by a person before its backfill may run
([opening a Competition](../runbooks/opening-a-competition.md)), and at this decision's
drafting the clocks read hours — Ligue 1's Gameweek 1 derived deadline is
2026-08-21T17:15Z and Serie A's is 2026-08-22T15:00Z. Two leagues' curation under those
clocks is the capacity; a third is not. The price the Bundesliga pays is the one
ADR-0035 already accepted: Gameweeks it loses while gated are gone permanently.

**Opening the Bundesliga later is a new decision, not a deferred half of this one.**
Nothing here pre-authorizes it: whoever opens it writes its own ADR and accepts its own
price, against however many Gameweeks will by then have been lost. That is CONTEXT.md's
reading of Active — opening a Competition is an act, and nothing records an intention to
open one.

**Neither league gets a target Gameweek; both get a rule.** Each Competition opens at the
first Gameweek whose derived deadline has not passed when it is activated. A Gameweek
whose deadline the activation misses is let go — the accepted price, again — and its
played Fixtures arrive as Locked history through the mid-Season adoption path ticket 0016
built. La Liga Gameweek 1's hand-set Lock is not the alternative: ADR-0036's banner calls
it a decision taken once under a clock, not a precedent, and this ADR agrees. Which
Gameweek each league actually opened at is the ticket's to record, not this page's to
predict.

## Considered Options

- **Open all three at once** — rejected. The third league's curation does not fit the
  clocks above, and rushing a map is the one failure mode the runbook warns has no alarm:
  a name mapped wrongly fails nothing, ever.
- **Pre-authorize the Bundesliga for whenever hands free up** — rejected. It would make
  this ADR accept the five-league $323.24 while committing to spend $266.79, and it would
  hand a future opening a stale cost basis and a pre-answered question about Gameweeks
  that had not yet been lost.
- **Name target Gameweeks the way ADR-0035 named La Liga's** — rejected. That shape is
  what the hand-set Lock grew out of when the target slipped; the rule form needs no
  amendment whichever way the clock falls.
- **Wait for a calmer week and open all three together** — rejected. Lost Gameweeks are
  permanent and two leagues' curation is feasible now; the third league's wait costs the
  third league only.

## Consequences

- The two `competitions` inserts are the activations, and they come last — after the
  curation, its human review and the backfill, per the runbook. The insert is the point
  the scheduled runs begin to spend.
- Each new Competition seats ten Entrants under its own first Prompt Version —
  `match-sa/2026-27-v1`, `match-fl1/2026-27-v1` — rendered from the current template, so
  ADR-0043's additions are in both from birth (ADR-0038, ADR-0042). Each sha is pinned
  once its rendering is read.
- The per-Competition stale-source guard must exist before each league's first derived
  deadline — the instruction ticket 0016's ticket 8 left open ("the first thing to write
  for Serie A") comes due here.
- `FOOTBALL_DATA_SEASON` is one variable over four leagues now. The pre-cron checklist's
  advance check grows from four files to eight (`I1`, `I2`, `F1`, `F2` join), and a
  Season in which the sources publish at different times fails more fetches more loudly
  before the variable can move.
- The dashboard needs no edit: it reads the `competitions` table (ADR-0039,
  migration 0028), so both leagues appear when their rows do.
- CONTEXT.md does not move: **Competition** has named all five codes since ADR-0035.
