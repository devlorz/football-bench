# Ticket: The Nations League seats seven

**What to build:** `roster:enter` for `UNL` under `match-unl/2026-27-v1` writes seven
seats — Claude Opus 5, Gemini 3.1 Pro Preview, **GPT-6 Astra**, **Grok 4.7**, Kimi K3,
Muse Spark 1.2, GLM 5.3 — from a roster of record *per Competition*: the Season Roster
less the seats ADR-0060 excludes plus the two it substitutes, each substitute a whole
Entrant identity with its catalog facts. Every league still seats ten, checked field for
field against the Season Roster as today; the cup is checked field for field against its
own roster of record. The cup's leaderboard page carries ADR-0060's frozen sentence — the
field was cut by the leagues' standings and two seats are Base Models the leagues never
seated — and draws a seven-row skeleton. Nothing here inserts the `competitions` row,
enters a seat on production, or reaches a Base Model: the two pre-flights and the insert
are the operator's, in ticket 0076, and this ticket makes its `roster:enter` step
possible. Source:
[ADR-0060](../adr/0060-three-seats-sit-out-the-nations-league-before-its-first-lock.md)
as amended 2026-09-22. Decisions it must not bend:
[ADR-0034](../adr/0034-the-roster-refreshes-to-ten-entrants-before-the-first-lock.md)
(the roster is checked as whole identities; the check does not weaken, it gains a second
roster of record to check against),
[ADR-0009](../adr/0009-six-entrants-frontier-and-open-weight-all-through-openrouter.md)
(every Entrant through OpenRouter, provider pinned, fallbacks off — the two new seats are
entered on the catalog's word and confirmed by pre-flight, as ADR-0034's arrivals were),
[ADR-0047](../adr/0047-three-seats-leave-the-fpl-track-before-its-first-lock.md) (a
Competition's roster is a fact about that Competition's rows only; no league, no FPL seat
moves),
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md) (the
cup is its own Edition 1; its cutoff is ADR-0060's date, rule 4 as amended).

**Blocked by:** None — can start immediately. It spends nothing.

**Status:** drafted 2026-09-22; redrafted the same day when ADR-0060 gained the two
substitutions. **Before starting, read the note on the test file below.**

---

## A test file is already on disk, and it encodes the first draft

`test/season-roster.test.ts` carries an uncommitted edit, made by another session on
2026-09-22 against this ticket's first draft: a `describe("a Competition the roster is
cut for")` block importing `MATCH_EXCLUSIONS`, `matchRosterOf` and `matchRosterSizeOf`,
expecting the cup's seven to be the ten less three — with `gpt-5.6-sol-pro` and
`grok-4.6` among the seven. That is no longer the decision. Whoever takes this ticket
reconciles that block rather than writing beside it: the exclusion tests are still right
in shape (an exclusion names a Season Roster seat and carries ADR-0060's ground; the size
is derived), and the roster test changes its expected seven and gains the substitution
cases. Do not `git checkout` the file; the edit is somebody's work.

## What is already known

**Per Competition, a roster of record: exclusions and substitutions, both by name.** The
`FPL_WITHDRAWALS` shape is the pattern for exclusions: an id from the Season Roster and
the ground it is left out on. A substitution is a pair — the Season Roster id it stands
in for, and a full `Entrant` for the seat that takes its place — so that the class mix
and the count are derived, and so that the identity check has a whole identity to check.
The cup's roster of record is the Season Roster in order, with the three removed and the
two replaced in place; a league's is the Season Roster. Nothing is written as a second
ten-entry list.

**The identity check keeps its teeth and points them at the right list.** Today
`enterSeasonRoster` compares the roster it is handed with `SEASON_ROSTER` entry by entry.
After this ticket it compares with the Competition's roster of record — so a substitution
that is not in that record is still refused as a transplant, and a league handed a
substitute is refused exactly as before. The stored-record guard (a seat already stored
under any match Prompt Version as a different Base Model) runs unchanged; the two new
ids have no stored row anywhere, so it has nothing to say about them until it does.

**The two new Entrants, as the catalog gave them on 2026-09-22** (ADR-0060's table):
`openai/gpt-6-astra` resolving to `openai/gpt-6-astra-20260903`, provider `openai`,
quantization null, Frontier; `x-ai/grok-4.7` resolving to `x-ai/grok-4.7-20260916`,
provider `xai`, quantization null, First-party. `catalogCheckedAt` 2026-09-22 on both. Ids
follow the roster's shape: `match/gpt-6-astra`, `match/grok-4.7`, which `roster:enter`
prefixes to `match-unl/…` as it does the rest. The seat's `name` is what the leaderboard
shows: "GPT-6 Astra", "Grok 4.7".

**No FPL seat and no league seat is named twice.** `match/gpt-6-astra` is a new id on the
match track only; no `fpl/` row is written and no existing row is touched. A test holds
that entering the cup leaves every league's ten and the FPL track's seven byte-for-byte
where they were.

**Everything downstream reads what is stored and needs no edit.** The scorer's expected
roster, the Gap alert, the dry-run's archive and the Comparison Anchor's N−1 read the
Competition's stored seats. The pre-flight's count is `EXPECTED_ENTRANT_COUNT` from the
environment, 7 for the cup; the runbook line saying so is this ticket's. The
`withdrawn_at` filter (ticket 0083) is not needed here — the five absent seats never have
a `match-unl/…` row.

**The dashboard has two spots that assume ten.** The competition page's loading skeleton
draws `SEASON_ROSTER_SIZE` rows and reads the Competition's roster size instead; the
page's qualification block gains, for `UNL` only, a frozen sentence (a constant beside the
retired-Gameweek caveat, never a row) served with the leaderboard body and rendered
beside the two stored qualifications. The sentence says both things ADR-0060 owes: the
field was cut by the leagues' standings, and two of its seats are Base Models no league
seats.

## Acceptance

- [ ] `enterSeasonRoster(db, "UNL", "2026-27")` writes exactly seven rows under
      `match-unl/2026-27-v1`, whose slugs are `claude-opus-5`, `gemini-3.1-pro-preview`,
      `glm-5.3`, `gpt-6-astra`, `grok-4.7`, `kimi-k3`, `muse-spark-1.2`; the two new rows
      carry the catalog facts above in `config` as every seat does. The same call for each
      of the five leagues still writes ten with no substitute among them.
- [ ] The roster of record for `UNL` is derived: exclusions of three by id with ADR-0060's
      ground, substitutions of two by Season Roster id with a whole Entrant; the size is
      computed, and the Base Model Class mix is asserted three–two–two.
- [ ] Refusals hold by name: an exclusion or a substitution naming a Season Roster id
      that does not exist; a league handed a substitute; a cup roster with a substitute
      whose identity differs from the record's on any field.
- [ ] The uncommitted test block on disk is reconciled, not duplicated, and the whole
      roster suite is green.
- [ ] Entering the cup leaves the five leagues' and the FPL track's stored seats
      byte-for-byte unchanged; a test proves it.
- [ ] `/api/unl/leaderboard` carries the frozen sentence and no league's does; `/unl`
      renders it beside the two qualifications and its skeleton has seven rows; the
      dashboard suite pins the sentence's bytes.
- [ ] The opening-a-Competition runbook's cup column says `EXPECTED_ENTRANT_COUNT=7` and
      names the two pre-flights (each substitute alone as a temporary `exhibition` row,
      then the seven) as the operator's steps before the insert, each marked as paid.
- [ ] Ticket 0076's `roster:enter` step points here; its remaining boxes are untouched.
- [ ] Nothing in this ticket inserts a `competitions` row, writes to production or reaches
      a Base Model.
