# Per-player Gameweek performance joins the FPL context for 2026-27-v2

The FPL track's frozen context showed each pool player as name, club, position, price and
status — no performance at all. Every Base Model's knowledge cutoff predates the 2026-27
season, so an Entrant managing on that context is blind to in-season form: a breakout
player is invisible, and the recovery this track exists to measure cannot start because an
Entrant cannot see that it is in a hole. Before the season's first FPL Lock, each pool line
gains two aggregate windows — the whole Season and the last five Settled Gameweeks — of raw
per-player signals: `total_points`, `minutes`, appearances, goals, assists, clean sheets,
bonus, yellow and red cards, saves, and FPL's per-Gameweek xG, xA and xGC. The change ships
as a new frozen Prompt Version, `fpl/2026-27-v2`, for the same reason ADR 0019 gave the
Match track a v2: a Prompt Version is a frozen pair, and anything recorded under v1's hash
stays attributable to v1.

`total_points` is admitted under ADR 0018's raw-signals line because in this track it is a
result, not a forecast — the very currency the Entrant is asked to optimise. The digested
layer stays out: `form` and `ict_index` are FPL's own averages and ratings, `ep_next` is a
forecast outright, and `selected_by_percent` is crowd wisdom — the same market signal the
odds exclusion already keeps outside the context.

## Considered options

- **Per-match lines, as ADR 0019 chose for the Match track**, were rejected here on scale:
  the Match track renders five lines per team, this pool renders six hundred players every
  Gameweek, and per-match rows would multiply an ~18k-token addition several-fold for
  little decision-relevant information beyond the two windows. Aggregation over Settled
  Gameweeks is summation of raw events, not digestion; averaging remains the Entrant's job.
- **Filtering the pool to cut cost** was rejected twice over. The stored context's pool is
  parsed back as the priced universe of legal transfers, so an omitted player is not merely
  undescribed but unbuyable — a silent change to the full ruleset ADR 0003 commits to. And
  any filter criterion is itself a digested recommendation of who deserves attention, which
  ADR 0018 keeps out of the context. Compression is lossless instead: players with no
  Settled minutes carry no stat block (a fact, not a curation), zero-valued fields are
  omitted, and keys are abbreviated behind a legend.
- **Provisional numbers for an unsettled Gameweek** were rejected. The context states the
  Gameweek its windows run through; a Gameweek FPL has not settled is announced as absent,
  never estimated, so the stored hash never depends on the minute the fetch ran. This is
  the context-side twin of the scoring rule that an unsettled Gameweek is skipped, never
  scored as zero.
- **A JSONB stats envelope** in the per-player points table was rejected in favour of typed
  columns: the stat set is frozen with the Prompt Version for the Season, so the
  flexibility JSONB buys would go unused, and typed columns let the context builder and
  scoring read the same audited shape. Gameweeks fetched before this change are
  back-fillable from the archived `fpl_live` snapshots, so widening the fetch loses
  nothing already collected.
- The projected cost of the addition — roughly 18k input tokens per call at its late-season
  worst, on the order of $15–25 across the nine-Entrant roster for the Season — was judged
  no grounds to narrow the design. Per spec 0003, the real figure is measured from
  `attempts.tokens_in` after the first Gameweek rather than estimated.
