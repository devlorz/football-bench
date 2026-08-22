# Spec 0018 — The Bet Slip's Handicap leg

**Status:** ready-for-agent
**Scope:** two markets added to the Bet Slip, the qualification sentence that describes
them, and one rescore covering every Competition
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:**
[ADR-0040](../adr/0040-the-bet-slip-gains-a-handicap-leg-that-pays-only-for-covering.md),
amending [ADR-0023](../adr/0023-a-second-readable-ranking-reads-a-bet-slip-off-the-predicted-score.md)

---

## Problem Statement

The Bet Points ranking pays for caution. Its five markets are flat and oddsless, so the
cheap goal-total lines carry most of the score — under 4.5 lands in roughly nine Fixtures
of ten — and an Entrant that names 1-1 every week collects them without ever committing to
a result. ADR-0023 recorded this in its own Considered Options when the slip was designed:
Bet Points "reward playing the percentages, not boldness".

La Liga's opening Gameweek is that sentence in the record. Nine of ten seats named 1-1 for
Alavés v Getafe, which finished 3-0. All ten named 1-1 for Sevilla v Rayo, which finished
2-1. Every seat scored zero Match Points, and the Bet Slip rewarded the same caution that
produced them.

A reader looking at the second leaderboard cannot currently tell a forecaster who commits
from one who hedges, because nothing in the slip costs anything to hedge.

## Solution

One market joins the slip: a **Handicap** at 1.5 goals, asking which side — if either —
wins by more than that. It is read off the same Predicted Score as every other leg and
Entrants are still never asked a market.

The leg **pays only for covering**. A Predicted Score backs a side by naming it a two-goal
win; a scoreline naming neither side has taken no position and cannot win the market,
whatever the result does. A 1-1 Prediction therefore scores nothing on this leg against a
3-0 result, and nothing against a 2-1 result either.

Because the slip is derived from stored Predictions and results, the whole Season is
rescored — every Competition together — so no Season holds two meanings of `bet_points`.

## User Stories

### Reading the ranking

1. As a reader, I want an Entrant that names decisive scorelines and gets them right to
   out-score one that hedges, so that the betting leaderboard distinguishes commitment
   from caution.
2. As a reader, I want a Predicted Score that backs neither side to score nothing on the
   Handicap, so that hedging has a price rather than a consolation.
3. As a reader, I want Bet Points to run zero to seven per Fixture, so that the maximum
   matches the markets actually stated.
4. As a reader, I want the qualification sentence beside the ranking to say seven markets
   and to say that the cheap lines are now weighed against one that pays only for calling
   a decisive result, so that the caveat I am given is the caveat that is true.
5. As a reader, I want the Handicap's hit rate to appear beside the other markets in the
   per-market breakdown, so that I can see which markets an Entrant actually wins.
6. As a reader, I want Bet Points to keep saying it supports no claim on its own, so that
   a livelier ranking is not mistaken for evidence.

### The leg's own rules

7. As an operator, I want the Handicap settled from the Predicted Score alone, never from
   the probabilities, so that the slip remains one decision and cannot contradict itself
   (ADR-0023).
8. As an operator, I want a Predicted Score of a two-goal home win to back the home side,
   and a two-goal away win to back the away side, so that the market names a side.
9. As an operator, I want any Predicted Score with a margin of 0 or 1 to back nothing, so
   that the leg cannot be won by predicting a tight match.
10. As an operator, I want a backed side to win the leg only when the result covers the
    same way, so that a decisive call that names the wrong winner loses.
11. As an operator, I want the line fixed at 1.5 goals for every Fixture and every
    Competition, so that no bookmaker's number and no post-Lock information enters a
    metric read off a pre-Lock commitment.
12. As an operator, I want the leg to settle without pushes, so that it behaves like the
    goal-total lines: the line is a half and margins are integers.
12a. As an operator, I want the goal-total lines to be 1.5, 2.5, 3.5 and 4.5, with the new
    one settling exactly as the other three do, so that adding it is adding a number and
    not a special case.
12b. As a reader, I want a Predicted Score of 0-0 or 1-0 to cost something on the 1.5 line,
    so that the very low scorelines are no longer free.

### The rescore

13. As an operator, I want every Competition rescored in one pass, so that a Season never
    holds two meanings of `bet_points`.
14. As an operator, I want the rescore to read only stored Predictions and results, so
    that no Prediction is rewritten and no Entrant is asked anything again.
15. As an operator, I want Match Points, the probability metrics, Coherence, Gap rate and
    attempts-to-valid to come back byte-identical after the rescore, so that a change to
    one readable ranking is provably a change to one readable ranking.
16. As an operator, I want the rescore to be safe to run more than once, so that a partial
    run is repaired by running it again.

### What the change costs, stated

17. As a reader, I want `bet_hit_pct` to divide by seven markets per settled slip, so that
    the rate describes the slip that was actually placed.
18. As an operator, I want it recorded that hit rates fall across the board after this
    change and that figures read before the rescore are not comparable with figures read
    after, so that the drop is read as the signal it is rather than as a regression.
19. As a reader, I want a Fixture with no result and a Gapped Fixture to stay out of the
    denominator, so that the Handicap does not change which slips count.

### Proving it

20. As a developer, I want the leg proven through the scorer over a real database, so that
    what is tested is the stored `scores` row a reader will be served.
21. As a developer, I want a case where a decisive Predicted Score covers and the result
    covers the same way, so that the winning path is pinned.
22. As a developer, I want a case where a decisive Predicted Score covers and the result
    covers the other way, so that a bold wrong call is proven to lose.
23. As a developer, I want a case where a hedged Predicted Score meets a decisive result
    **and** one where it meets a tight result, both scoring zero on this leg, so that the
    behaviour that motivated the change is the behaviour that is tested.
24. As a developer, I want the per-market breakdown asserted to carry the Handicap key
    alongside the existing five, so that the market list cannot silently drift.
25. As a developer, I want a test that the qualification sentence stored with the rows
    states seven markets, so that the label cannot fall out of step with the slip.

## Implementation Decisions

### Two markets: one read off the margin, one off the total

The slip's construction gains a Handicap leg and a fourth goal-total line at 1.5. Both
market names carry their line, as the existing goal-total legs do.

The 1.5 line needs no new machinery. It settles the way 2.5, 3.5 and 4.5 already settle,
against the same Predicted Score, and adding it is adding a number to the list of lines.

The Handicap is the one that needs care. Its position is the side the Predicted Score's
margin backs, or the absence of a side; its settled value is the side the result's margin
backs, or the same absence. The leg is won when a side was backed and the result backed
the same one. It is the one place in the slip where equality of position and settled is
not enough, because the shared value "neither" must not win.

This is the only leg that can be lost without being wrong, and ADR-0040 records that
asymmetry as its purpose rather than an accident.

### Nothing else about the slip moves

The result leg still reads the scoreline and not the probabilities, stakes stay flat,
odds stay unstored, and `reference-odds` stays deferred. The Handicap's line is a
constant, which is what keeps the leg derivable from the Predicted Score alone.

### The qualification sentence is rewritten, not extended

`BET_POINTS_QUALIFICATION` currently states five markets and asserts that the slip rewards
played percentages over boldness. Both halves stop being true. The replacement states seven
markets, keeps the flat-and-oddsless caveat, keeps the sentence that only the probability
layer's Paired Differences support a claim about forecasting skill, and replaces the
boldness clause with what is now true: the cheap goal-total lines are weighed against one
market that pays only for naming a decisive result. It continues to travel in the detail
of every row a ranking can be read off.

### `bet_hit_pct` moves underneath its own name

The metric is won markets over bet markets, so its denominator follows the slip from five
to seven per settled Fixture with no code change of its own — and its per-market breakdown
gains the Handicap key. Which slips count is unchanged: a Fixture with no result and a
Gapped Fixture stay out, for the reason the existing behaviour gives, that an absent slip
would otherwise pull the rate down as though its markets had lost.

### One rescore, every Competition, at the cheapest moment

The scorer is idempotent per `(model_id, competition, season, gw, track, metric)`, so the
rescore is a re-run of the existing Season scorer for every listed Competition rather than
new machinery. It must cover every Competition in the same change.

Timing is worth stating because it only gets more expensive: at the time of writing La
Liga holds two settled Fixtures and the Premier League has not opened, so the rows being
rewritten number in the dozens. Every Gameweek that passes multiplies them.

### The dashboard reads a maximum it never stated

The read API and the pages carry Bet Points through as a number and do not assert its
range, so nothing there breaks. What changes is the meaning a reader brings, which is the
qualification sentence's job.

## Testing Decisions

### What makes a good test here

A test drives `scoreMatchGameweek` over a real Postgres with seeded Fixtures, Predictions
and results, and asserts on the stored `scores` row — the same row the read API serves.
Nothing asserts on the slip-building function directly: the leg is a claim about what a
reader is told, and the stored row is where that claim lands.

### What gets tested

- **The four settlement paths**, each as its own seeded case: backed and covered the same
  way; backed and covered the other way; hedged against a decisive result; hedged against
  a tight result. The last two are the motivating behaviour and must score zero.
- **The 1.5 line both ways.** A Prediction of 0-0 or 1-0 is the only kind that takes the
  under, and no case in the suite has needed one before.
- **The per-market breakdown** carries seven keys, so a market cannot be added or lost
  silently.
- **`bet_hit_pct` over a known slip**, extending the existing case that fixes the
  denominator at five markets per settled slip.
- **The qualification sentence** stored in the rows states seven markets, on the same terms
  the FPL dashboard's qualification test uses: the sentence a reader receives equals the
  sentence the record froze.
- **Isolation**, as a single behavioural assertion: over one seeded Season, every metric
  other than `bet_points` and `bet_hit_pct` is identical before and after the leg exists.

### Prior art

`test/score-match-gameweek.test.ts`'s "divides Bet hit % by the markets actually bet" is
the pattern for all of it — seeded Fixtures including an unplayed one and a Gap, a scoring
pass, and assertions on the stored value with its `n` and its detail. The scoring
rehearsal tests show how a whole Season is scored and compared.

## Out of Scope

- **A second Handicap line at 2.5.** ADR-0040 records it as addable later without
  disturbing the first, and adding the 1.5 goal-total line does not change that: the two
  are different markets that happen to share a number.
- **Odds of any kind**, including a per-Fixture bookmaker handicap. Unchanged from
  ADR-0023.
- **Match Points, the probability metrics, Coherence, Gap rate and attempts-to-valid.**
  This spec changes one readable ranking, and story 15 exists to prove it.
- **The FPL track**, which has no Bet Slip.
- **Any change to what an Entrant is asked.** No prompt, no context, no Prompt Version.
- **Dashboard presentation.** The number and its qualification already flow; how a page
  frames a seven-market slip is its own decision if anyone wants one.

## Further Notes

### Order of work

The leg and its tests first, since everything else is downstream of the slip being right.
Then the qualification sentence with its test. Then the rescore, last, when the code that
produces the new rows is proven — and in one pass across every listed Competition.

### The one thing to get right

"Neither side backed" is a value that appears on both sides of the comparison and must
never settle as a win. Every other leg in the slip is won by equality, so the obvious
implementation is the wrong one here, and story 23's two hedged cases are what catch it.
