# Ticket: `match-unl/2026-27-v1` is frozen and says what a cup does not have

**What to build:** `UNL` has a frozen Prompt Version, `match-unl/2026-27-v1`, whose
rendering is the shared template with the Competition named "UEFA Nations League", the
two cup sections (recent internationals, who picks each team) present, and the league
table, Squad Changes and availability each a stated absence; its sha is pinned on first
read, before any Nations League row is stored. The dashboard's `/unl` routes exist from
the moment the version lands. Source:
[spec 0027](../specs/0027-the-nations-league-opens.md) stories 7–9, 38–40, 42.
Decisions:
[ADR-0038](../adr/0038-one-prompt-template-one-prompt-version-per-competition.md),
[ADR-0037](../adr/0037-a-new-competition-plays-the-v2-context-minus-availability.md),
[ADR-0026](../adr/0026-a-prompt-version-no-context-has-used-may-still-be-amended.md),
[ADR-0057](../adr/0057-the-nations-league-opens-as-the-first-cup-on-sources-nobody-documents.md).

**Blocked by:** 0072, 0073, 0074 — the pin hashes the render, and the render changes each
time a section arrives; pinning after the last section lands means pinning once, which
is the runbook's own advice about edit 6.

**Status:** ready-for-agent

---

## What is already known

**The pin is read, never predicted.** Every league's pin was read off the suite's render
after its sections were in place; La Liga's moved twice for builder changes and every
later league's moved once for the transfer-window gate. Here the gate is the registry:
a Competition whose entry names a history source renders the recent-internationals
section, one naming a head-coach source renders the coach section, and neither league
packet grows either. Read the sha after 0072–0074 have landed and pin it; if it moves
before the first Lock for a reason ADR-0026 allows, record why.

**What differs from `PL`'s render, by design and nowhere else**: the name; the
recent-internationals section replacing the historical-results section; the coach
section from the managers list rather than the Season article; and three stated
absences — "no league table for this Competition" (or the existing wording for a
Competition with no divisions, if it already reads honestly for a cup), "no Squad Change
data" replaced by an absence stating that a national team has no transfer window, and
availability absent as it is for every non-`PL` Competition. The competition-name
agreement test extends to `UNL`; the `PL`/`PD` pins do not move.

**`MATCH_PROMPT_COMPETITIONS` grows `UNL`**, so `competitionRoutes()` gives the dashboard
`/unl` and `/api/unl/*` with no dashboard edit (ADR-0039); the seven test sites that used
`BL1` as "a code the schema admits and nothing has opened" were resolved by ticket 0060
and are not this ticket's problem.

## Acceptance

- [ ] `MATCH_PROMPTS.UNL` is `match-unl/2026-27-v1` with `competitionName` "UEFA Nations
      League", and the render test pins its sha.
- [ ] The `UNL` render differs from `PL`'s only in the name, the two cup sections and
      the three stated absences (render seam); the `PL` and `PD` pins are unchanged.
- [ ] A Gameweek 1 `UNL` packet reads "no result has been played yet this Season" for
      the Season's results, as every league's Gameweek 1 does.
- [ ] The contamination test proves a `PL` packet reads no `UNL` row and a `UNL` packet
      no `PL` row.
- [ ] `/unl` and `/api/unl/*` answer on the dashboard with an unopened Competition's
      empty state.
- [ ] The pinned sha and the date it was read are recorded in the prompt registry's
      comment, the way every Competition's are.
