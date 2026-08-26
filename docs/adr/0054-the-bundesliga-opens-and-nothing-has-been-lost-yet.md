# The Bundesliga opens, and nothing has been lost yet

[ADR-0049](0049-serie-a-and-ligue-1-open-the-bundesliga-waits-on-hands-not-money.md)
left the Bundesliga (`BL1`) gated on curation capacity rather than on money, and said the
opening would be a new decision taken against however many Gameweeks had by then been
lost. This is that decision, and the count is **zero**: read off football-data.org on
2026-08-27, the Bundesliga's 2026-27 Season holds 306 Fixtures across 34 Gameweeks, 18
clubs, and every one of them is still unplayed. Gameweek 1's earliest kickoff is
2026-08-28T18:30Z, so its derived deadline (ADR-0036, earliest kickoff minus ninety
minutes) is 2026-08-28T17:00Z; Gameweek 2's is 2026-09-04T17:00Z.

**The Bundesliga opens for 2026-27.** It is the fifth and last code migration 0022's
`competition_code` domain holds, and the one league ADR-0035 named that has never been
opened or refused.

**It costs a full Season, and that is the point.** At the nearest measured analogue —
Ligue 1's $0.3003 per Fixture, the same 18 clubs and nine Fixtures a Gameweek, born on the
same current template ([the 2026-08-25 price report](../reports/2026-08-25-five-league-price.md))
— 306 Fixtures is **$91.89 per Season**, and it takes the match track's standing
commitment to **$506.90 per Season across five Competitions** (1,752 Fixtures). Both
numbers are this decision's to own. The four-league blended rate would say $87.82 and
Serie A's cheapest rate $82.47; the dearer figure is the one committed here, because a
league is priced against the league it most resembles and not against the average of four
it is not.

**That $91.89 supersedes ADR-0049's $56.46**, which rested on the $0.1845/Fixture read
before ADR-0042's restart and ADR-0043's additions grew every packet. It is still a
projection and not measured spend: the Bundesliga's own rate is unknown until it has
played a Gameweek under `match-bl1/2026-27-v1`, and ticket 0046's lesson is that a rate
goes stale the moment the packet moves. **A ticket re-reads it off real `attempts` rows
after the first Gameweek settles**, and this figure stands until it does.

**The gate's condition is answered because it is one league now, not three.** ADR-0049
rejected opening all three at once on capacity: three Competitions' curation — three
identity maps of roughly twenty clubs each, every one reviewed by a person before its
backfill may run ([opening a Competition](../runbooks/opening-a-competition.md)) — did not
fit clocks that read hours. This one has a week: missing 2026-08-28T17:00Z costs Gameweek
1 and nothing else, and Gameweek 2's deadline is seven days behind it.

**No target Gameweek, the same rule.** The Bundesliga opens at the first Gameweek whose
derived deadline has not passed when it is activated. A Gameweek whose deadline the
activation misses is let go — ADR-0035's accepted price — and its played Fixtures arrive
as Locked history through the mid-Season adoption path. No Lock is set by hand under any
clock, ever again (the ADR-0036 banner). Which Gameweek it actually opened at is the
ticket's to record, not this page's to predict.

**The curation is derived, never transcribed**, on the runbook's terms: Understat name →
football-data.co.uk name, live-source name → football-data.co.uk name, and live-source
name → Wikipedia club, each pair of sets required to come out the same size with nothing
left over, and each reviewed by a person before the backfill runs. Eighteen clubs, not
twenty. A name missing from a map fails loudly; a name mapped wrongly fails nothing, ever,
and the clock above is not a reason to find that out in a packet.

**Germany's transfer-list format is unknown and must be read before its window is written
down.** The runbook records three shapes — England's two wikitables, Italy's one, Spain's
and France's club sections — and which one a country uses is not guessable from the title.
Germany is a fourth country and may be a fourth shape. Its window dates are read off the
page's own lead where the page states them, and off the DFL's announcement where it does
not, as France's were.

## Considered Options

- **Leave the Bundesliga closed permanently and stand on four leagues** — rejected. The
  gate ADR-0049 set was capacity, and capacity is free; declining now would be a new
  reason, not the standing one, and there is no such reason. Four leagues is not a
  more honest benchmark than five, only a smaller one.
- **Wait for the winter window, or for 2027-28** — rejected. The wait buys nothing that
  the next four days do not, and costs a full Season of sample. This is the one opening in
  this project's history where the accepted price of waiting is the entire league.
- **Target Gameweek 1 and hand-set the Lock if the curation misses 2026-08-28T17:00Z** —
  rejected outright. The ADR-0036 banner calls La Liga's hand-set Lock a decision taken
  once under a clock and not a precedent, and a Gameweek is worth less than the rule.
- **Transcribe the three maps rather than derive them, to make Gameweek 1's clock** —
  rejected. It trades a Gameweek that costs one Gameweek for a silent mislabelling that
  costs a Season and never raises anything.
- **Price it at the four-league blended $87.82** — rejected. The blend averages two
  20-club leagues into an 18-club one; Ligue 1 is the comparison that shares the shape.

## Consequences

- **Eight code edits, not seven.** The runbook's table lists seven and omits
  `src/football-data/team-identity.ts`, the live-source → football-data.co.uk map, which
  appears only in its §2. Without it every club's history section reads "none in stored
  data" over a complete backfill and nothing fails. **The runbook's table grows that
  eighth row as part of this opening**, so the next reader counts what the change is.
- Edit 1 is already done: `BL1` has been in the `competition_code` domain since
  migration 0022. The rest are `MATCH_PROMPTS` (`match-bl1/2026-27-v1`, competition name
  matching the division list character for character), `divisions.ts` with `D1`/`D2`, a
  new migration growing `historical_matches_division_check` to ten names, the Understat
  slug and club map, the transfer windows and Wikipedia club map, the Season article for
  Head Coach changes, and the football-data.co.uk map above.
- **Edit the transfer window before the prompt sha is pinned.** Writing a Competition's
  windows down opens the Squad Changes gate and moves the render, which is legitimate only
  while the version is unused (ADR-0026, ADR-0042).
- **The dashboard needs no edit, but it advertises the league at the freeze and not at the
  insert.** `competitionRoutes()` is built from `MATCH_PROMPT_COMPETITIONS`, so `/bl1` and
  `/api/bl1/*` exist from the moment the Prompt Version lands and before any row does —
  the same way Serie A and Ligue 1 appeared (ADR-0039). ADR-0049's "it reads the
  `competitions` table" named the wrong mechanism for the right outcome; the outcome holds.
- **`/overall` sums five leagues with no edit, and its prose stops being true.** Read
  rather than assumed: the combined ranking's arithmetic takes whatever leaderboards the
  page fetched and keeps the ones that are Active *and* scored, its "Leagues covered" stat
  is computed, and its qualification already says "every league covered here" rather than
  naming a number — so a fifth league enters the sum the Gameweek it is first scored, and
  an opened-but-unscored one contributes nothing in the meantime. What says four is
  ADR-0051's prose and several code comments, which become wrong the day this lands and
  are corrected with the price re-read.
- **The last unopened Competition code is spent.** Seven test sites use `BL1` precisely
  because it is a code the schema admits and nothing has opened — the two dashboard tests,
  `openrouter-entrant`, `season-roster`, `fetch-understat-season-xg`,
  `fetch-football-data-season`, `build-historical-context` and `build-head-coach-context`.
  There is no sixth code to move them to. Each becomes a test against a code outside the
  domain, or stops being a test; the choice is the ticket's, and losing the "valid but
  unopened" case silently is not one of the options.
- `FOOTBALL_DATA_SEASON` is one variable over five leagues now. The pre-cron checklist's
  advance check grows from eight files to ten (`D1`, `D2` join), and a Season in which the
  sources publish at different times fails more fetches more loudly before it can move.
- The `competitions` insert is the activation and comes last — after the curation, its
  human review and the backfill — then `roster:enter` seats ten Entrants under
  `match-bl1/2026-27-v1`. The insert is the point the scheduled runs begin to spend, and
  it is the operator's act alone.
- CONTEXT.md does not move: **Competition** has named all five codes since ADR-0035. With
  this opening the vocabulary and the record finally hold the same set.
