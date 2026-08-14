---
status: proposed
---

# The roster refreshes to ten Entrants before the first Lock

Three changes to ADR-0014's nine, all landing before the 2026-27 Gameweek 1 deadline
(2026-08-21T17:30Z): the Qwen seat moves from Qwen3.7 Max to Qwen3.8 Max, the Grok seat
moves from Grok 4.5 to Grok 4.6, and Meta's Muse Spark 1.2 joins as a tenth Entrant. Both
moves are like-for-like successors in the same tier; the addition is a first-party seat
(Meta serves it itself, one endpoint, nothing to pin). The mix becomes three Frontier
(Claude, GPT, Gemini), two first-party (Grok, Muse Spark) and five open-weight —
CONTEXT.md now states the criterion the classes were assigned by, so the next arrival is
classified by reading rather than by relitigating.

A swapped seat is a new Entrant, not an edited one: the id names the Base Model
(`match/qwen3.7-max` → `match/qwen3.8-max`), and everything an Entrant is — its
Predictions, its Record, its place in a published interval — hangs off that id. The
outgoing Qwen3.7 and Grok 4.5 rows are deleted by hand before the Season, which no stored
fact yet references and which does not contradict CONTEXT.md's "removing an Entrant
requires a new recorded decision": the Season Roster is what stands at the first Lock, and
before that Lock there is no Season to remove anybody from. This ADR is that recorded
decision regardless. After the first Lock this door closes and a late Base Model enters
only as an Exhibition Run (ADR-0032).

The refresh trades observation history for recency, knowingly. The nine seats it amends
have three pre-flight reports behind them (2026-07-29, 2026-08-07, 2026-08-12) showing
stable resolution; the three incoming Base Models have none, and Grok 4.6 reached the
catalog two days before this decision. The road in below is shaped to buy back what can
be bought: two observations per new seat before the Lock instead of one.

## The road in

1. Each candidate is inserted as a temporary `role = 'exhibition'` row and pre-flighted
   alone through the `exhibitionModelId` door — the same door ADR-0032 built, aimed at a
   row that competes for nothing yet. The Entrant rows it might replace stay untouched
   until their replacement has answered. This is also what makes the fallback cheap:
   walking away from a candidate is deleting its temporary row, not surgery on the
   roster.
2. Candidates that pass: the outgoing Qwen3.7 and Grok 4.5 rows and the temporary rows
   are deleted, the ten are entered on both tracks (`match/2026-27-v2` and
   `fpl/2026-27-v2`), and a full ten-seat pre-flight — the second observation — is
   reported in `docs/reports` before the FPL track starts.
3. A candidate still not parseable by **2026-08-19** is walked away from, leaving two
   clear days for the final full pre-flight and the FPL start. A failed Qwen3.8 or
   Grok 4.6 reverts its seat to the predecessor this ADR would have retired. A failed
   Muse Spark reverts nothing — it has no predecessor — and the Season starts with nine;
   the swaps do not hostage on the addition, and Muse Spark may still arrive later as an
   Exhibition Run.

The cutoff binds arrivals as well as candidates: a Base Model released after 2026-08-19,
or after the FPL track has started — whichever comes first — does not join this Season's
roster however new it is. The FPL start is the harder of the two edges, because
`manager_states` is insert-only: once a seat has a Season path, reassigning it to a
different Base Model is not representable, and moving only the Match seat would leave one
Entrant name covering two Base Models across the tracks. A newer model that misses these
edges is worth less than an incumbent with pre-flights behind it — a swap resets a seat's
observation history to zero, which is the trade this ADR makes knowingly for three seats
and declines to keep making as the Lock approaches. The late arrival's door is
ADR-0032's. The steps for all of this, including the next Season's, are in
[docs/runbooks/a-new-base-model-arrives.md](../runbooks/a-new-base-model-arrives.md).

## Considered and rejected

- **DeepSeek `deepseek-v4-pro-0813`.** A dated snapshot published as its own slug, not a
  successor model; the undated `deepseek/deepseek-v4-pro` still resolves to `20260423`.
  The roster pins undated names on purpose — a vendor moving a snapshot under a stable
  name is detectable only if the name is stable — and one seat pinned to a dated slug
  would be the one seat where that check reads nothing. If DeepSeek repoints the undated
  name, pre-flight records the move, and the `novita`/`fp8` pin survives it (Novita
  serves `-0813` at fp8 today).
- **Gemini 3.7 Flash in place of 3.1 Pro Preview.** A higher version number in a lower
  tier: every Gemini release since 3.1 Pro Preview is Flash or Flash-Lite, and no newer
  Pro exists in the catalog (checked 2026-08-14). Swapping a Frontier seat for a
  mid-tier model would falsify "three frontier Base Models" while appearing to update it.
  The seat waits for Google's next Pro.
- **A per-seat envelope for the reasoning model.** Muse Spark 1.2 reasons before it
  answers, and the request envelope sets no `max_tokens` and no reasoning configuration
  for anybody. It stays that way: every seat gets the same envelope or the difference
  between seats stops being the Base Model (ADR-0008), and the pre-flight is where an
  unusable default would surface. The cost of default reasoning is paid, not tuned away.

## Consequences

- The complete-case intersection shrinks again. At a 2% Gap rate per Entrant, the share
  of Fixtures where all ten produced a Prediction falls from about 83% to about 82%
  (0.98¹⁰ ≈ 81.7%).
- The chance that *some* Entrant loses a whole Gameweek to its pinned provider rises from
  about 17% to about 18% per Gameweek — roughly seven Gameweeks a Season where the
  intersection loses everything, up from six. Still the accepted cost of ADR-0011.
- Ten Entrants make 45 pairs. ADR-0016's rule is unchanged and its number moves: the
  leaderboard publishes intervals against the current leader only — now nine comparisons,
  declared in advance.
- Qwen3.8 Max inherits Qwen3.7 Max's situation exactly: OpenRouter lists a single
  endpoint (Alibaba) at quantization `unknown`, so the seat pins provider only, with the
  same justification and the same obligation to pin quantization the day a second
  endpoint appears.
- The expected dated ids from the 2026-08-14 catalog check are
  `qwen/qwen3.8-max-20260803`, `x-ai/grok-4.6-20260810` and
  `meta/muse-spark-1.2-20260805`; the `canonicalSlug` entered in the roster is whatever
  the pre-flight actually resolves, not these expectations.
- The pre-flight refusal check now covers ten Base Models, one of them (Muse Spark) from
  a vendor whose content policy near betting-adjacent forecasting is unobserved — which
  is what step 1 of the road in exists to observe first.
- Both tracks move together: the FPL track's ten seats are entered by hand at
  `fpl/2026-27-v2`, and the track starts all ten or none — `manager_states` is
  insert-only, so a seat that misses the start has no way in later.
- The FPL rehearsal's scripted seats are counted against the roster size on purpose, so
  the guard now demands a tenth script. It proves the one money path no seat yet walks:
  selling a player whose price has fallen, where the Selling Price is the lower current
  price and no half-rise applies.
- Cost rises by roughly one ninth per Gameweek on the Match track, plus whatever Muse
  Spark's default reasoning spends at $4.25 per million completion tokens — bounded by
  the pre-flight's observed usage before the Season pays it 380 times. Not expected to be
  a constraint.
