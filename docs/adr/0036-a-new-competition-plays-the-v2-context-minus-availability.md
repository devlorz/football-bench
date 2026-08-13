# A new Competition plays the v2 context minus availability

A new Competition launches with every v2 context section that has a source, and only those.
For La Liga that is: historical results, shots, the league table and prior-season
points-per-game from football-data.co.uk (`SP1`, with `SP2` playing the Championship's role
for promoted clubs), per-match xG from Understat (which covers all four target leagues),
and squad changes from Wikipedia's Spanish transfer list.

Player availability does not ship. The current section is built from the FPL API's player
feed, and no free equivalent exists for the other leagues. Waiting for one, or buying one,
would trade real Gameweeks — which cannot be back-filled — for a section whose absence does
not touch the benchmark's claim. Fairness lives inside a Competition: every Entrant in a
league sees the identical packet, and ADR-0034 already made each league its own benchmark.
The absence is a recorded structural difference between Competitions, stated here, not a
Gap and not an apology.

The context builders become Competition-scoped before any second league's rows land. Two
queries today filter by date alone — `historical_matches` and `understat_match_xg` — and
would silently blend a second league's rows into the Premier League packet. The
`historical_matches.division` check grows the new source divisions, and every builder takes
the Competition it is building for.

## Considered Options

- **Full parity as a launch gate, availability included (paid injury feed)** — rejected per
  ADR-0035's reasoning: a paid dependency and a mapping layer for a section the claim does
  not need.
- **Removing availability from the Premier League context to equalise** — rejected; it
  would amend a context already frozen in use (ADR-0026) and damage the running benchmark
  to decorate a new one.

## Consequences

- Team identity is the standing hand-curated cost: per Competition, roughly twenty clubs
  across two to three maps (source name ↔ football-data name ↔ Understat name, plus the
  transfer list's club spellings), refreshed every season as clubs are promoted and
  relegated. A name missing from a map fails loudly rather than losing history — the
  existing rule, kept.
- If the curation and backfill are not done by La Liga's Gameweek 2, the escape hatch is to
  launch at Gameweek 3 with the sections that are ready rather than losing further
  Gameweeks. Whatever ships, the stored context records exactly what every Entrant saw, so
  the record stays honest about its own contents.
- Backfill scope per Competition: two seasons of football-data.co.uk history for the top
  and second division, and the same span of Understat xG — mirroring what the Premier
  League context reads today.
