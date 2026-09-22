---
status: proposed
---

# Three seats sit out the Nations League before its first Lock

> **Amended 2026-09-22, the same day, before any seat was entered.** The first draft
> seated the seven that remained of the ten after the cut below. The operator then
> decided that two of those seven are replaced by their houses' successors: **GPT-5.6 Sol
> Pro by GPT-6 Astra, and Grok 4.6 by Grok 4.7.** The cut of three stands as measured and
> reasoned; the substitution is a second decision with a different ground, recorded in
> *The two substitutions* below rather than folded into the cut. It is the first time a
> Base Model released after ADR-0034's cutoff joins a Season Roster anywhere, and it
> needs ADR-0061's rule 4 amended to allow it — that amendment is dated the same day.
> The title keeps its three; the cup seats seven, five of them the leagues' and two not.

**DeepSeek V4 Pro, MiniMax M3 and Qwen3.8 Max are not seated in `UNL` for 2026-27, and
neither are GPT-5.6 Sol Pro and Grok 4.6, whose places go to GPT-6 Astra and Grok 4.7.**
The cup's Season Roster is seven: Claude Opus 5, Gemini 3.1 Pro Preview, GPT-6 Astra,
Grok 4.7, Kimi K3, Muse Spark 1.2, GLM 5.3. The five leagues keep all ten, untouched. The
door the cut walks through is ADR-0034's, as ADR-0047 walked it for the FPL track: the
Season Roster is what stands at a Competition's first Lock, and until `UNL`'s first Lock
(2026-09-24T14:30Z if it opens at Gameweek 1; 2026-09-27T11:30Z if at Gameweek 2) there
is no Nations League Season to remove anybody from. The door the substitution walks
through did not exist until ADR-0061 and is opened by this note. As of this note no seat
has been entered under `match-unl/2026-27-v1` on production, so nothing is withdrawn;
three seats are never entered, two are never entered, and two are entered for the first
time.

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
robustness: **the cup leaves out the three Base Models that are behind on the leagues'
Season to date.** What that buys and what it costs are both below; the alternative
readings are in *Considered options*.

## The two substitutions

Nothing in the table above is the reason for these; GPT-5.6 Sol Pro and Grok 4.6 are
fourth and fifth of ten and nothing about them is measured as wanting. **The reason is
that their houses have shipped successors and the operator wants the cup — the one
Competition that has not opened — to seat the newest Base Model of each house rather
than the one the leagues were frozen on in August.** That is a preference about what the
cup is for, not a finding about either seat, and it is written here as such.

What was read off OpenRouter's public catalog on 2026-09-22, which is the whole of what
is known about either seat before its pre-flight:

| Seat | `baseModel` | Canonical slug | Listed | Provider pin | Quantization | Class | Price in / out per M tokens |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GPT-6 Astra | `openai/gpt-6-astra` | `openai/gpt-6-astra-20260903` | 2026-09-04 | `openai` | none (`unknown` on every endpoint) | Frontier | $10 / $50 |
| Grok 4.7 | `x-ai/grok-4.7` | `x-ai/grok-4.7-20260916` | 2026-09-21 | `xai` | none | First-party | $1.60 / $4.80 |

Two things a reader should have in front of them:

- **GPT-6 Astra is five times the price of the seat it replaces on output** ($50 against
  $10 per million) and five times on input. At GPT-5.6 Sol Pro's measured 1,329 output
  tokens and a ~1,500-token context, that is roughly $0.08 a Fixture against $0.02 —
  some $13 over the cup's 156 Fixtures for this seat alone, more if it reasons longer.
  `openai/gpt-6-astra-pro` also exists in the catalog at the same date; this note seats
  the plain one, because that is what the operator named.
- **Grok 4.7 was listed the day before this note.** No pre-flight has observed it, no
  latency is known, and its `canonicalSlug` above is the catalog's word and not yet the
  harness's. Both seats' `catalogCheckedAt` is 2026-09-22 and both are entered on the
  catalog's expectation exactly as ADR-0034's three arriving seats were, to be confirmed
  or refused by the pre-flight.

Neither substitution touches a league or the FPL track. GPT-5.6 Sol Pro and Grok 4.6 keep
every seat they hold; GPT-6 Astra and Grok 4.7 hold seats in the cup and nowhere else in
2026-27. No Entrant name covers two Base Models anywhere, which is what the runbook's
"both tracks move together" forbids and this does not do.

## The decision

- `match-unl/2026-27-v1` seats seven: Claude Opus 5, Gemini 3.1 Pro Preview, GPT-6 Astra,
  Grok 4.7, Kimi K3, Muse Spark 1.2, GLM 5.3. Three Frontier, two first-party, two
  open-weight — the same class mix the first draft had, since each successor is its
  predecessor's class.
- The five leagues seat ten, as they do today. Nothing about a league's roster,
  Predictions, Record or leaderboard moves.
- The exclusion and the substitution are both **per Competition, before that
  Competition's first Lock**. This is the first time the match track's rosters differ
  between Competitions, and the first time they differ in *which* Base Models and not
  only in how many. CONTEXT.md's Season Roster entry already says a Competition seats
  the roster its opening decision named; this is what that sentence now covers.
- The cup is its own Edition 1 (ADR-0061) and stays there whatever the leagues do at
  their Edition 2 boundary.
- The five who are not seated may enter the cup only as Exhibition Runs (ADR-0032),
  which support no claim of forecasting skill — the same terms ADR-0047 set for the FPL
  track.

## What it costs, stated rather than discovered later

- **The cup's leaderboard ranks seven and every league's ranks ten**, and now five of the
  seven are the leagues' Base Models and two are not. A reading across a league and the
  cup carries both from the first Gameweek; `/overall` does not sum the cup into any
  Edition set (ADR-0061), and the cup's own page says whose field it is.
- **The cup cannot say anything about the five it left out**, and it cannot compare its
  two new seats to anything on club football — GPT-6 Astra and Grok 4.7 have no league
  record, so "does the newer Base Model forecast better" is not a question 2026-27 can
  answer either way.
- **Selection on the outcome, for the three.** The cut was made by the score the leagues
  have produced so far, with 172 points between first and tenth and 29 between seventh
  and tenth. The cup's page says so.
- **ADR-0034's arrival cutoff is crossed for the first time.** Both substitutes were
  released after 2026-08-19. ADR-0034 said a Base Model released after that date "does
  not join this Season's roster however new it is", and the roster module's identity
  check exists to refuse exactly the substitution of a Base Model that missed the Season
  behind a seat that did not. This note does what that sentence forbade, on the ground
  that the cup's Season has no first Lock yet and ADR-0061 gives a Competition's first
  Edition its opening decision's date as its own cutoff. A reader who holds ADR-0034's
  original line will hold that the cup's two new seats should not be there; this note
  does not argue them out of that, it records the crossing.
- **Two paid pre-flights before 2026-09-24T14:30Z**, each alone and then the seven
  together, on a seat listed one day before this note. If either refuses, the cup opens
  at Gameweek 2 with whatever the pre-flight admitted, and this note is amended.
- **The class mix moves** from ADR-0034's three Frontier, two first-party, five open-weight
  to three, two, two in the cup, as the first draft already accepted.
- **It is irreversible for the cup's Season.** ADR-0034 closes the door at the first Lock;
  ADR-0061 closes it at the Edition's, which for the cup's Edition 1 is the same Lock.

## What it takes, which is not nothing

The match track has no per-Competition roster today. `enterSeasonRoster` seats all ten of
`SEASON_ROSTER` for every listed Competition and refuses by name any seat whose identity
is not one of the ten — the substitution above is precisely what that refusal was built
for. The only withdrawal mechanism is the FPL track's `FPL_WITHDRAWALS`, and the match
predict path selects seats by `prompt_version` alone with no `withdrawn_at` filter. So
before the insert, ticket 0081 lands a roster of record *per Competition* — the Season
Roster less named exclusions plus named substitutions, each substitute a whole Entrant
identity with its catalog facts — and the identity check runs each Competition against
its own roster of record. The `withdrawn_at` filter is ticket 0083's and is not needed
for the cup, because the five absent seats never have a `match-unl/…` row. The
`competitions` insert does not happen until 0081 has landed and both pre-flights have
been read.

## Considered options

- **Seat all ten, as every league did.** The default, and the one ADR-0057 assumed when
  it priced the cup at 156 × ten. Rejected by this note on standing alone; if the reason
  above does not hold for the reader, this is the option that stands instead.
- **Seat the seven that remain, without substitution** — the first draft of this note.
  Overtaken the same day by the operator's decision to seat the successors; recorded so
  that the two decisions are not mistaken for one.
- **Put the two successors into the leagues' Edition 2 instead of the cup**, which is the
  door ADR-0061 was written for and which both would pass without amending anything.
  Rejected by the operator: the cup opens in two days and should open on the newest Base
  Models. This note records that the mechanism that did not need bending was available.
- **Withdraw the three from the leagues too, from the next Gameweek.** Rejected. Every
  league's first Lock has passed; ADR-0034 and ADR-0047 make a Season Roster irreversible
  from that point, and a mid-Season cut would leave three Season-to-date totals frozen
  beside seven that keep moving, remove three rows from every Paired Difference, and put
  half-Season rows into `/overall`'s sum. That is a different and much dearer decision,
  and this note does not take it. (ADR-0061 later gave that decision a door of its own —
  an Edition boundary — which is where such a cut now belongs if it is ever made.)
- **Cut on a measured failure, as ADR-0047 did.** Not available: the measurements above
  show no failure to cut on. Writing one in would be the dishonest version of this note.
- **Cut on cost.** Not available either: the cheapest seat on the track is one of the
  three, and the dearest seat the cup will have is one it is adding.
- **Wait for the cup's own Gameweek 1 and cut on that.** Rejected: after the first Lock
  the door is shut (ADR-0034), and one Gameweek of twenty-six Fixtures is a smaller sample
  than the twenty-six league Gameweeks the table above already holds.

## Consequences

- CONTEXT.md, Season Roster: already says a Competition seats the roster its opening
  decision named; the entry's "the Nations League's names seven" stands, and the seven
  are these.
- ADR-0061 rule 4 is amended the same day: a Competition whose first Lock has not passed
  takes its opening decision's date as its Edition 1 cutoff.
- ADR-0057's cost line ($47 at ten seats) is re-read: seven seats, one of them at five
  times its predecessor's price, lands near the same figure; ticket 0077 reads the real
  rate.
- Ticket 0081 changes shape from "exclusions" to "a roster of record per Competition".
- The next Competition to open decides its own roster in its own opening ADR, which is
  what "per Competition" means from here.
