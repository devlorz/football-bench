# FPL track plays full rules with one seat per Base Model

The FPL track exists to measure how an Entrant recovers from a bad position, not how well it
drafts an opening Squad. Recovery only exists as a capability if the recovery mechanisms are
present, so the track plays the complete 2026/27 ruleset: a persistent Squad, banked Free
Transfers to a maximum of five, -4 point Hits for extra transfers, and both sets of Chips
(Wildcard, Free Hit, Triple Captain, Bench Boost per half-season, the first set expiring at
the GW19 deadline).

Each Base Model gets one Entrant on this track.

## Consequences

- One Entrant per Base Model means one season path each, so the FPL ranking is a
  demonstration and must be labelled as such on the leaderboard. It cannot separate skill
  from luck — the plausible skill gap between Base Models is of the same order as the
  season-to-season variance of a single path. The Match track carries the evidential claims.
- Whether any Entrant ever reaches a genuinely bad position is left to chance. If none of
  them stumbles, the capability this track was built to measure goes unobserved.
- Squad validation is no longer a pure function of one Squad. Checking Gameweek 20 requires
  replaying Gameweeks 1-19 to know the bank, the Free Transfers banked, the Chips already
  spent, and each player's purchase price. Tests must cover sequences, not single Squads.
- Manager State must be persisted per Entrant per Gameweek and is the system of record for
  Selling Price, which depends on what was paid rather than the current price.
