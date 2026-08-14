# One prompt template, one Prompt Version per Competition

The ten Entrants of the Season Roster (ADR-0014, refreshed by ADR-0034) are seated in
every Competition. The
prompt text is one template whose only variable is the Competition's name — "Predict this
La Liga Fixture." differs from the Premier League's line by exactly those words — and each
Competition freezes its own Prompt Version from it: `match-pd/2026-27-v1` for La Liga, and
so on. The Premier League keeps `match/2026-27-v2` exactly as it is: that version has been
used, and a used version is unamendable (ADR-0026).

Per-Competition versions fit the machinery that already exists. A seat is a `models` row
carrying a Prompt Version, and every read path — prediction runs, gap alerts, the
dashboard, exhibitions — already filters Entrants by that string. Ten seats per
Competition means the seating, the filters and the leaderboards all work unchanged, and
the season-scoped version prefix rule extends to carry the Competition.

A Competition opening later is not a second door for a late Base Model. ADR-0034 closes
the roster at the first Lock and sends every arrival after it to an Exhibition Run
(ADR-0032); because La Liga's first Lock falls after the Premier League's, the rule needs
saying in Competition terms: the seats of every Competition are the same Season Roster
that stood at the Season's first Lock, whenever that Competition opens. A Base Model that
missed the cutoff misses the Season, not merely the league that happened to start first.

Rendering the template per Competition yields a constant text per version, so the frozen
sha256 mechanism is unchanged: each version's hash is the hash of its fully rendered text,
and the freeze binds at first use exactly as before.

## Considered Options

- **One shared new version (`match/2026-27-v3`) for all Competitions, Premier League
  included** — rejected; it would move the Premier League to a new Prompt Version
  mid-Season, breaking the continuity of the benchmark this whole expansion is forbidden
  to touch.
- **Independently worded prompts per league** — rejected; any wording difference between
  Competitions becomes a confound the moment anyone compares an Entrant across leagues,
  and there is no reason for one.

## Consequences

- `models` grows ten rows per Competition. The Season Roster definition stays one roster;
  what multiplies is seats, not Entrants.
- The complete-case pairing (ADR-0011) and Comparison Anchors (ADR-0016) operate within a
  Competition, like everything else downstream of the per-Competition benchmark decision
  in ADR-0035.
- An Exhibition Run (ADR-0032) is Competition-scoped for the same reason: it replays one
  Competition's stored contexts under that Competition's Prompt Version.
