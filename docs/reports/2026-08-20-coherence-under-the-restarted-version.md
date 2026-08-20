# Coherence under the restarted version, confirmed on the record

The bench that preceded the restart found something it could only call noise at its size,
and named the mechanism behind it anyway. La Liga's Gameweek 2 — the first Gameweek
actually asked under `match-pd/2026-27-v2` — is the second look, on the record rather
than on a scratch cluster, and the mechanism is now unmistakable.

Source of the question:
[ADR-0043](../adr/0043-base-rates-xg-rates-and-two-instruction-lines-join-the-restarted-match-versions.md),
whose "Coherence changes meaning, and that is accepted" section expected one thing and
got another. The bench's own reading is in
[ticket 0020](../tickets/done/0020-the-match-track-restart.md), slice 3.

## What was expected, and what three readings show

ADR-0043: "The expected effect is a lower incoherence rate across the board."

| | v1, Gameweek 1 | The bench, amended | **v2, Gameweek 2** |
| --- | ---: | ---: | ---: |
| Predictions | 60 | 50 | **116** |
| Incoherent | 18 (30%) | 17 (34%) | **27 (23%)** |
| Draw ranked likeliest | 5 | 0 | **0** |
| Highest draw probability anywhere | 0.380 | 0.300 | **0.320** |

The rate did fall this time, by seven points against v1 and eleven against the bench. But
the fall is not the finding, because the number has now moved in both directions across
three readings of the same amendment, and none of the three is large enough to carry a
claim. What carries is the shape underneath, which has not varied at all.

## Incoherent and 1-1 are the same set, exactly

Counted by the scorer's rule — the likeliest outcome under `probs` against the outcome the
Predicted Score implies — over all 116 Predictions:

| Scoreline | Predictions | Incoherent |
| --- | ---: | ---: |
| 2-1 | 31 | 0 |
| **1-1** | **27** | **27** |
| 1-0 | 21 | 0 |
| 2-0 | 19 | 0 |
| 1-2 | 13 | 0 |
| 0-2 | 3 | 0 |

Every incoherent Prediction is a 1-1, and every 1-1 is incoherent. Not a tendency — the
two sets are identical, across ten Base Models and fourteen Fixtures. The bench saw the
same thing at n = 50 and could not tell it from a small-sample artefact; at n = 116 with
no exception in either direction, it is the metric's definition meeting a statistical fact.

**The fact.** A draw concentrates its probability on very few scorelines, 1-1 above all,
while a home win spreads across 1-0, 2-0, 2-1, 3-1 and further. So the single likeliest
*scoreline* is often 1-1 in a Fixture whose likeliest *outcome* is a home win. Both
statements can be true of one distribution, and a seat that reports both honestly is
scored incoherent for it.

**The instruction.** ADR-0043 added `score is the exact final scoreline you judge most
likely — not expected goals rounded`, which asks for the modal scoreline outright, and
beside it `Probabilities are scored with the ranked probability score`, which pushes the
distribution toward calibration rather than toward the named score. The two sentences ask
for exactly the pair Coherence counts as a contradiction. No seat ranked a draw first in
either run under the amendment, where v1 did five times — the probabilities went to the
outcome distribution and the scoreline went to the mode, which is what was asked.

## What this is not

It is not a defect in a rendered sentence. Both instruction sentences are ADR-0043's own
words, frozen, and nothing here argues they should move; the restart's Prompt Versions are
unamendable from their first use in any case.

It is not evidence about forecasting. Coherence supports no claim on its own, and the
probability layer carries the benchmark's evidential weight (ADR-0012).

It is not a seat-level finding. All ten seats produce 1-1s and all ten are counted
incoherent for them.

## What it is

Coherence was defined to catch an Entrant contradicting itself. Under the amended prompt
it catches an Entrant answering two different questions correctly — the modal scoreline and
the outcome distribution — and calling the pair a contradiction. The metric still measures
something stable and worth reading; it no longer measures what its glossary entry
describes.

That is a question about a metric and its decision, and it belongs to whoever revisits
Coherence rather than to the restart that surfaced it. Recorded here so the next reader
starts from three readings and a mechanism rather than from one Gameweek's percentage.
