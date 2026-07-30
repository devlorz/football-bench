# A single, rich context arm

> Status: the context contents listed here are superseded by ADR-0017 (per-match shots and
> xG, `match/2026-27-v2`). The single-arm decision itself stands.

The frozen Prompt Version hands every Entrant a full statistical dossier per Fixture: last
five results for each side, league position, goals for and against, home and away splits,
and availability flags. There is one context arm, not two — a minimal-context arm was
considered and rejected to keep the Season's scope contained.

## Consequences

- The benchmark measures reasoning from supplied data, and says nothing about what a Base
  Model knows about football on its own.
- Rich context pushes Entrants together. Every Entrant reads identical numbers and does
  similar arithmetic on them, so the Paired Differences between frontier Base Models will be
  smaller than they would be under a sparse context — which is the direction that makes them
  hardest to resolve within one Season.
- That makes the Positive Control load-bearing rather than a nicety. It is the only evidence
  that a confidence interval spanning zero between two flagship Entrants means they are
  genuinely close, rather than that the setup cannot tell anything apart.
- Whether the context builder earns its keep is now unmeasurable. Running a sparse arm in a
  later Season would answer it.
