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

## Amendment: a cup's rendering differs by its sections too (ticket 0075)

This ADR's opening sentence — the prompt text is one template "whose only variable is the
Competition's name" — was written when every Competition was a domestic league, and read
literally it refuses the first Competition that is not one. `match-unl/2026-27-v1` renders
sections the Premier League's does not and omits sections it has, and it is not an
exception to the rule but a case the rule never met.

What stands, unamended, is the claim the rule was for: **the template is one template and
its only variable is still the Competition's name.** The instruction block, the Fixture
line and the two ADR-0043 sentences are byte-identical across every Competition once that
name is substituted, and `test/openrouter-entrant.test.ts` asserts exactly that for every
code in `MATCH_PROMPT_COMPETITIONS`, cup included. No Competition is asked a differently
worded question.

What moves is the *context* the template carries, and it moves by source and never by
wording (ADR-0057):

- a Competition whose registry entry names the internationals dataset renders the
  recent-internationals section **instead of** the league history section;
- one whose entry names the current head coaches list renders that section **instead of**
  the season article's;
- one whose entry names no Squad Change source states that absence **instead of** the
  window's section;
- availability stays Premier League only, absent rather than stated (ADR-0037).

Each is the registry's answer and not a Competition code's, which is what keeps this from
becoming "independently worded prompts per league" — the rejected option above. Two
Competitions reading the same sources render the same sections; two reading different
sources render what their sources can answer, in the shared wording of whichever section
that is.

The freeze is unchanged: the sha is still over one fully rendered context, and a
Competition whose sections are decided by its registry entry must therefore have every
one of those entries settled before its pin is taken. Ticket 0075 is the worked example —
`UNL` was pinned only after the three tickets that opened its render gates had landed.
