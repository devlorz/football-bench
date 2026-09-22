---
status: proposed
---

# Three seats sit out the Nations League before its first Lock

**DeepSeek V4 Pro, MiniMax M3 and Qwen3.8 Max are not seated in `UNL` for 2026-27.** The
cup's Season Roster is the other seven of the match track's ten. The five leagues keep
all ten, untouched. The door this walks through is ADR-0034's, as ADR-0047 walked it for
the FPL track: the Season Roster is what stands at a Competition's first Lock, and until
`UNL`'s first Lock (2026-09-24T14:30Z if it opens at Gameweek 1; 2026-09-27T11:30Z if at
Gameweek 2) there is no Nations League Season to remove anybody from. As of this note no
seat has been entered under `match-unl/2026-27-v1` on production, so nothing is withdrawn;
three seats are simply never entered.

## What was measured, 2026-09-22

Read off production's `attempts`, `predictions` and `scores` for the match track,
2026-27, every league, every Gameweek scored so far (twenty-six per seat):

| Seat | Season-to-date Match + Bet Points | Gaps / Locked Fixtures | Spend | Mean latency | Mean output tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| Claude Opus 5 | 1,435 | 69 / 269 | $7.66 | 6 s | 352 |
| Gemini 3.1 Pro Preview | 1,355 | 71 / 269 | $10.35 | 12 s | 1,324 |
| Kimi K3 | 1,342 | 71 / 269 | $15.44 | 76 s | 3,503 |
| Grok 4.6 | 1,334 | 69 / 269 | $4.46 | 31 s | 1,840 |
| GPT-5.6 Sol Pro | 1,314 | 69 / 269 | $8.22 | 15 s | 1,329 |
| Muse Spark 1.2 | 1,304 | 69 / 269 | $5.45 | 33 s | 4,109 |
| GLM 5.3 | 1,296 | 6 / 200 | $8.02 | 86 s | 6,269 |
| **DeepSeek V4 Pro** | **1,292** | 69 / 269 | $9.27 | **132 s** | **9,897** |
| **MiniMax M3** | **1,277** | 69 / 269 | $0.63 | 13 s | 1,322 |
| **Qwen3.8 Max** | **1,263** | 70 / 269 | $10.05 | **129 s** | **5,266** |

Three things the table says, stated because two of them cut against the decision:

- **The three are the bottom three of the ten on Season-to-date points, and that is the
  only thing that singles them out.** Their Gap rates are the roster's (69–70 of 269,
  the same as Claude's); their attempts succeed at the roster's rate. Nothing here is
  the failure ADR-0047 measured, where three seats produced no legal answer at all.
- **Cost is not the reason.** MiniMax M3 is the cheapest seat on the track by a factor of
  seven. DeepSeek and Qwen are the two slowest and the two heaviest on output tokens,
  which is where 72–83% of the bill sits (the 2026-08-25 price report), but they are
  third and fourth in spend, not first. Seating all ten in the cup would cost about
  three seats × 156 Fixtures × $0.03, some $14 a Season at the measured rate.
- **Reliability is not the reason either**, on this evidence. The one measurable
  difference of that kind — two-minute latencies against the six to thirty seconds of
  the rest — has not turned into Gaps.

So the reason is standing, and this note says so rather than dressing it as cost or
robustness: **the cup seats the seven Base Models that are ahead on the leagues' Season
to date, and leaves out the three that are behind.** What that buys and what it costs
are both below; the alternative readings are in *Considered options*.

## The decision

- `match-unl/2026-27-v1` seats seven: Claude Opus 5, Gemini 3.1 Pro Preview, GPT-5.6 Sol
  Pro, Grok 4.6, Kimi K3, Muse Spark 1.2, GLM 5.3. Three Frontier, two first-party, two
  open-weight.
- The five leagues seat ten, as they do today. Nothing about a league's roster,
  Predictions, Record or leaderboard moves.
- The exclusion is **per Competition, before that Competition's first Lock**, and is the
  first time the match track's rosters differ between Competitions. CONTEXT.md's Season
  Roster entry moves with this note: a Competition seats the roster its opening decision
  named, standing at its first Lock; the five leagues' opening decisions named all ten.
- The three may enter the cup only as Exhibition Runs (ADR-0032), which support no
  claim of forecasting skill — the same terms ADR-0047 set for the FPL track.

## What it costs, stated rather than discovered later

- **The cup's leaderboard ranks seven and every league's ranks ten.** Every reading
  across a league and the cup carries that from the first Gameweek, and the dashboard
  shows two different n. `/overall` sums whatever each Competition contributes and
  already treats a seat absent from one Competition as adding nothing there (ADR-0051),
  so the three sum over five Competitions and the seven over six; the page's
  qualification names Prompt Versions as the confound and will have to name this one too.
- **The cup cannot say anything about the three.** Whether an open-weight seat that trails
  on club football trails on national teams — the corner of the question ADR-0057 opened
  the whole pyramid to ask — is a question this decision closes for 2026-27.
- **Selection on the outcome.** The seven were chosen by the score the leagues have
  produced so far, twenty-six Gameweeks into a thirty-eight-Gameweek Season, with 172
  points between first and tenth and 29 between seventh and tenth. A reader comparing the
  cup's seven to the leagues' ten should know the cup's field was cut by the leagues'
  standings, and the leaderboard page says so in its qualification.
- **The class mix moves** from ADR-0034's three Frontier, two first-party, five open-weight
  to three, two, two in the cup. The open-weight side is the one this benchmark exists to
  keep in the picture (ADR-0047 said the same of the FPL track's cut).
- **It is irreversible for the cup's Season.** ADR-0034 closes the door at the first Lock.

## What it takes, which is not nothing

The match track has no per-Competition roster today. `enterSeasonRoster` seats all ten of
`SEASON_ROSTER` for every listed Competition, the only withdrawal mechanism is the FPL
track's `FPL_WITHDRAWALS`, and — the one that costs money if missed — the match predict
path selects seats by `prompt_version` alone with no `withdrawn_at` filter, so a seat
merely stamped withdrawn would still be called and paid for every Gameweek while the
leaderboard hid it. A ticket lands, before the insert: a per-Competition exclusion in the
roster module, the predict path reading `withdrawn_at`, the dashboard's n and
qualification, and the tests that hold the cup at seven and every league at ten. The
`competitions` insert does not happen until it has.

## Considered options

- **Seat all ten, as every league did.** The default, and the one ADR-0057 assumed when
  it priced the cup at 156 × ten. Rejected by this note on standing alone; if the reason
  above does not hold for the reader, this is the option that stands instead.
- **Withdraw the three from the leagues too, from the next Gameweek.** Rejected. Every
  league's first Lock has passed; ADR-0034 and ADR-0047 make a Season Roster irreversible
  from that point, and a mid-Season cut would leave three Season-to-date totals frozen
  beside seven that keep moving, remove three rows from every Paired Difference, and put
  half-Season rows into `/overall`'s sum. That is a different and much dearer decision,
  and this note does not take it.
- **Cut on a measured failure, as ADR-0047 did.** Not available: the measurements above
  show no failure to cut on. Writing one in would be the dishonest version of this note.
- **Cut on cost.** Not available either: the cheapest seat on the track is one of the
  three.
- **Wait for the cup's own Gameweek 1 and cut on that.** Rejected: after the first Lock
  the door is shut (ADR-0034), and one Gameweek of twenty-six Fixtures is a smaller sample
  than the twenty-six league Gameweeks the table above already holds.

## Consequences

- CONTEXT.md, Season Roster: "every Competition seats the roster that stood at the first
  Lock of the Season's standing Prompt Versions" becomes "the roster its opening decision
  named, standing at its first Lock", and the entry records that the leagues' and the
  cup's rosters differ from 2026-27.
- ADR-0057's cost line ($47 at ten seats) is read as seven-tenths of itself until ticket
  0077 re-reads the real rate; the ceiling stands as a ceiling.
- The next Competition to open decides its own roster in its own opening ADR, which is
  what "per Competition" means from here.
