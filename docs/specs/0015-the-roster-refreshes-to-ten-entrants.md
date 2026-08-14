# Spec 0015 — The roster refreshes to ten Entrants

**Status:** ready-for-agent
**Scope:** the 2026-27 Season Roster moves from ADR-0014's nine to ADR-0034's ten before
the Gameweek 1 Lock — two seat successions, one addition, and everything the size is
load-bearing for
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:** [ADR 0001–0034](../adr/),
especially [ADR-0034](../adr/0034-the-roster-refreshes-to-ten-entrants-before-the-first-lock.md)

---

## Problem Statement

ADR-0034 has decided the 2026-27 roster: Qwen3.7 Max's seat passes to Qwen3.8 Max, Grok
4.5's to Grok 4.6, and Meta's Muse Spark 1.2 joins as a tenth Entrant — all before the
Gameweek 1 deadline, 2026-08-21T17:30Z. The codebase still encodes ADR-0014's nine.
`SEASON_ROSTER` holds the old seats, `SEASON_ROSTER_SIZE` is the number half the system
checks itself against — the pre-flight's expected count, the FPL track's all-or-none
start, the rehearsal's seat script, the dashboard's loading skeleton — and none of it can
be entered, checked, or rehearsed at ten until the code says ten.

The refresh also has an ordering problem the ADR resolves and the operator must be able to
follow: the three incoming Base Models have never been observed answering this benchmark's
prompt, and the roster pre-flight refuses to run unless the Entrant count is exactly what
it expects — so an unproven candidate cannot be checked *as* an Entrant without first
performing the roster surgery it is supposed to precede. ADR-0034's road in threads this
through the Exhibition door: a candidate is checked alone as a temporary
`role = 'exhibition'` row, and only a candidate that has answered replaces anybody.

## Solution

Encode ADR-0034's ten seats as the new roster of record, sized and classed per
CONTEXT.md's Base Model Class criterion, and let every consumer of the size inherit the
change through `SEASON_ROSTER_SIZE` as it was built to. Add the tenth rehearsal seat the
size-guard now demands — the "faller", proving the one money path no scripted seat walks:
selling a player whose price has fallen. Update the dashboard skeleton and the prose that
says "nine". The road in itself needs no new code: the Exhibition pre-flight door
(ADR-0032) already checks one named row alone, and entering the final ten is what
`roster:enter` already does.

## User Stories

1. As the operator, I want the roster of record to hold ADR-0034's ten seats, so that
   entering the Season writes the roster the ADR decided and not the one it amended.
2. As the operator, I want to pre-flight one candidate Base Model alone through the
   Exhibition door before any Entrant row is touched, so that an unproven model is
   observed before the roster is operated on.
3. As the operator, I want walking away from a failed candidate to be nothing but
   deleting its temporary row, so that the fallback of ADR-0034 costs no roster surgery.
4. As the operator, I want the full-roster pre-flight to demand exactly ten Entrants at
   the frozen Prompt Version, so that a half-finished swap is refused before the first
   paid call rather than discovered after it.
5. As the operator, I want `roster:enter` to refuse a roster whose size disagrees with
   the recorded decision, so that a roster constant someone edited carelessly cannot be
   entered at all.
6. As the operator, I want the FPL track to start all ten seats or none, so that an
   Entrant missing from the insert-only `manager_states` is impossible rather than
   permanent.
7. As the operator, I want the entered rows to carry the `canonicalSlug` the pre-flight
   actually resolved and the date the catalog was checked, so that the written record
   states what was observed rather than what was expected.
8. As the operator, I want Muse Spark 1.2 entered as a first-party seat with provider
   pinned and nothing else, so that the seat matches CONTEXT.md's class criterion and
   ADR-0009's pinning rules.
9. As the operator, I want Qwen3.8 Max's seat to carry the same single-endpoint,
   no-quantization-pin justification its predecessor carried, so that the exception
   survives the succession with its reasoning attached.
10. As the operator, I want the DeepSeek and Gemini seats untouched, so that the two
    rejections ADR-0034 records are visible as an absence of change.
11. As the operator, I want the rehearsal to refuse a seat script that disagrees with the
    roster size, so that a roster that grows without its rehearsal growing is caught by
    the guard built for exactly that.
12. As the operator, I want a tenth scripted rehearsal seat that sells a player whose
    price has fallen, so that the Selling Price's losing side — current price, no
    half-rise — is proven by the rehearsal and not first exercised by a real Entrant.
13. As a dashboard visitor, I want the leaderboard's loading skeleton to hold ten rows,
    so that the page does not move when the real ten land.
14. As a future reader of the code, I want the prose that says "nine" and cites ADR-0014
    to say "ten" and cite ADR-0034, so that the comments state the decision in force.
15. As a future agent working this codebase, I want the roster constant's provenance
    comment to name the pre-flight report that resolved it, so that the chain from
    decision to observation to record stays walkable.

## Implementation Decisions

- The roster of record moves to ten entries: seven carried unchanged (Claude Opus 5,
  GPT-5.6 Sol Pro, Gemini 3.1 Pro Preview, Kimi K3, GLM 5.2, DeepSeek V4 Pro,
  MiniMax M3), two successions (Qwen3.8 Max for Qwen3.7 Max, Grok 4.6 for Grok 4.5), one
  addition (Muse Spark 1.2). Ids name Base Models, so a succession is a new id — the
  Entrant is a new Entrant, per ADR-0034.
- `SEASON_ROSTER_SIZE` becomes 10 and remains the single number every counting consumer
  reads; no consumer grows a count of its own.
- Muse Spark 1.2 is First-party (CONTEXT.md's criterion: a vendor serving its own Base
  Model as the sole endpoint): provider pinned, `quantization: null`, nothing else to
  pin. Grok 4.6 likewise. Qwen3.8 Max is Open-weight with the inherited single-endpoint
  exception: provider pin only, quantization pinned the day a second endpoint appears.
- The `canonicalSlug` of each new seat is filled from what the pre-flight resolves, not
  from the catalog's expectation; the catalog-checked date moves to the day of that
  pre-flight. The expected dated ids (for the operator's cross-check, not for entry) are
  `qwen/qwen3.8-max-20260803`, `x-ai/grok-4.6-20260810`,
  `meta/muse-spark-1.2-20260805`.
- The road in is operational, not code: temporary `role = 'exhibition'` rows inserted by
  the operator, checked one at a time through the existing Exhibition pre-flight target,
  deleted along with the outgoing Qwen3.7 and Grok 4.5 rows once their replacements have
  answered. The existing pre-flight already refuses a roster whose count is wrong, which
  is the guard that makes the half-done state unrunnable.
- The tenth rehearsal seat, "faller", scripts a sale after a price fall: the Selling
  Price is the lower current price, no half-rise applies, and the seat's expected bank
  and squad values prove the arithmetic. The rehearsal's seat count stays derived from
  the roster size — that coupling is the guard, not an accident.
- The dashboard's leaderboard skeleton renders ten placeholder rows. No other dashboard
  change: entrants, rankings and comparisons are read from the data and scale on their
  own.
- Prose sweep: comments and docstrings stating "nine" or citing ADR-0014 as the size in
  force move to ten and ADR-0034. The design-mock seed roster is not the roster of
  record and does not move.
- No request-envelope change for the reasoning model; ADR-0034 rejected a per-seat
  envelope. No read-API change; roles and prompt versions already filter everything.
- Both tracks' seats are entered before the Gameweek 1 deadline; the FPL seats at their
  own frozen Prompt Version, one per Base Model, ten in all. The 2026-08-19 walk-away
  cutoff is the operator's calendar, not code.

## Testing Decisions

A good test here asserts external behavior at existing seams: rows written to `models`,
refusals raised at the doors, rehearsal verdicts — never the shape of private helpers.
No new seam is needed; the highest existing ones already cover every change:

- **Roster entry** — the existing entry-door suite: entering writes ten rows at the
  frozen Prompt Version with merged config; the size guard refuses a roster constant of
  the wrong length; re-entry is idempotent. Prior art: the current season-roster suite.
- **Pre-flight** — the existing injected-HTTP suite: a ten-seat roster passes at count
  ten, an eleven-row table (old seats not yet deleted) is refused, a single Exhibition
  row is checked alone. Prior art: the current pre-flight suite, which already tests
  both targets of the union.
- **FPL start and run** — the suites already derived from `SEASON_ROSTER_SIZE` scale to
  ten by recompilation; what to verify is that no expectation was hand-written as nine.
- **Rehearsal** — the rehearsal runner and verifier suites gain the faller's
  expectations: its Gameweek path, its bank after selling at the fallen price, and the
  verifier's seat count following the roster size. Prior art: the trader seat's
  sell-into-a-rise expectations.
- The full suite exceeds five minutes and runs in the background; single files stay
  fast.

## Out of Scope

- Running the real pre-flights against OpenRouter, inserting or deleting the production
  rows, and writing the resulting report in `docs/reports` — operational work the road
  in sequences, recorded there, not here.
- Muse Spark as an Exhibition Run should it miss the Season — ADR-0032's machinery
  already covers it, unchanged.
- Any envelope, prompt, or context change; the Prompt Versions are frozen.
- Reference Lines, the seed's design-mock roster, and the read API.

## Further Notes

The one ordering fact an implementing agent must not lose: the pre-flight's count check
makes the intermediate states loud. Twelve entrant rows (new entered, old not deleted)
and nine (old deleted, new not entered) both refuse a full pre-flight; only the finished
ten passes. That is the road in working, not a bug to relax.
