# Spec 0019 — Amending fpl/2026-27-v2 before its first use

The FPL track's Prompt Version is amended in place — duties into the pool, the Entrant's own
record into the context, a required Rationale out of the action — through the door ADR-0026
holds open for a version no context has used. Production holds no FPL context, and the door
closes when the Season's first Lock stores one: **2026-08-21T17:30Z**. Source of every
decision here: [ADR-0041](../adr/0041-duties-the-entrants-own-record-and-a-required-reason-join-fpl-2026-27-v2-before-its-first-use.md).
Vocabulary: CONTEXT.md — including the two entries ADR-0041 moved, **Rationale** and the
widened **Entrant Record**.

This spec exists under a deadline, so it says plainly what its ADR decided: the work ships
under a **ship-or-freeze rule**. The gate is everything merged, `fpl:rehearse` green and the
pre-cron checklist walked before the Lock's cron takes over. Whatever is frozen when the
Lock arrives is the Season's version; anything unfinished waits for the next one. Nobody
holds the Season, and nobody amends past the gate.

## Problem Statement

Three days before the Season opens, the FPL track's context and action carry two gaps a
review found undecided rather than decided. An Entrant is never told how its own Season is
going — not its points, not the Team Sheet it locked, not whom it captained — so a track
built to measure recovery starves its Entrants of the one signal that says recovery is
needed. And the FPL action collects no Rationale while the Match track's Prediction always
has, so when a Season path goes wrong there will be no record of what the Entrant thought
it was doing. Separately, FPL publishes each club's set-piece and penalty takers in the
same bootstrap the Lock already archives, and the context never shows them. Once the first
Lock stores a context, the version freezes and all three wait a full Season.

## Solution

Amend `fpl/2026-27-v2` in place, before its first use:

- **Duties join the pool.** Each player's line gains the penalty, direct-free-kick and
  corner/indirect orders FPL publishes, where FPL publishes them.
- **The context reads the Entrant its own record.** The Manager State block gains the
  latest Settled Gameweek's own Team Sheet with what each pick returned and what the
  armband contributed, and the Season's points to date — always naming the Gameweek it
  reads.
- **The action carries a required Rationale back.** Stored with the Gameweek's record,
  never scored, never rendered into any later context.

Same version string, same ten seats, no roster re-entry. The freeze that moves is the
version's render tests — the FPL track pins no sha — and the rehearsal replays the whole
loop before the Season does.

## User Stories

### Reading the pool's duties

1. As an Entrant, I want each player's line to carry his club's penalty and set-piece
   orders where FPL publishes them, so that a captaincy or transfer choice can weigh who
   actually takes the kicks.
2. As an Entrant, I want a player FPL lists no duty for to simply carry no duty keys, so
   that the source's silence is not dressed up as a fact.
3. As an analyst, I want the duties read from the same archived bootstrap the Lock already
   stores, so that what an Entrant was shown is replayable byte for byte.

### Reading its own record

4. As an Entrant, I want the Team Sheet I locked for the latest Settled Gameweek shown back
   to me with what each pick returned, so that I can evaluate my own selections instead of
   reconstructing them wrongly.
5. As an Entrant, I want the armband's contribution stated — who wore it and what it
   returned — so that the one decision the multiplier doubles is attributable, not guessed.
6. As an Entrant, I want my Season's points to date, so that I know whether I am recovering
   or sliding without being shown anyone else's total.
7. As an Entrant, I want the record block to name the Gameweek it reads, so that after a
   Gap I am not misled by a "last Gameweek" that is actually two back.
8. As an Entrant at the Season's opening, I want the block to say plainly that nothing has
   settled yet, so that absence is announced rather than rendered as a blank.
9. As an Entrant whose Gameweek Rolled Over, I want the standing Team Sheet shown as what
   played, so that the points beside it belong to the Sheet that earned them.
10. As an operator, I want the block built from the stored record — player points, Manager
    States, the scorer's own detail — so that the context never computes a score the scorer
    did not.

### Giving a reason

11. As an analyst, I want every legal action stored with the Rationale the Entrant gave, so
    that when a Season path goes wrong the record shows what the Entrant said it was doing.
12. As an operator, I want a response without a Rationale to fail as a schema refusal and
    cost a Repair, exactly as on the Match track, so that attempts-to-valid keeps one
    definition across both tracks.
13. As an analyst, I want the Rationale never scored, so that no prose metric leaks into a
    record no rule of the game backs.
14. As an operator, I want the Rationale never rendered into any later context, so that the
    track's no-memory boundary holds and adherence to old plans is never what is measured.
15. As an analyst, I want a Rolled Over Gameweek to store no Rationale — the refused
    attempts already hold their bodies verbatim — so that the column means "the legal
    action's reason" and nothing else.

### The amendment window

16. As an operator, I want the amendment landed as one change, so that the template moves
    once and is reviewed once before it freezes for thirty-eight Gameweeks.
17. As an operator, I want `fpl:rehearse` green on the amended template before the Lock's
    cron takes over, so that the whole loop — build, call, validate, store — is walked
    before the Season walks it.
18. As an operator, I want the ship-or-freeze rule written down, so that at the deadline
    nobody improvises: what is frozen at the Lock is the Season's, and the rest waits.
19. As an operator, I want the ten seats untouched — same version string, no roster
    re-entry — so that the amendment cannot become a seating mistake.

### The record's honesty

20. As a reader of the stored record, I want contexts stored before the amendment to be
    impossible — the door closes at the first stored context — so that no Season mixes two
    templates under one version name.
21. As an Entrant, I want the rules list unchanged in meaning — the amendment adds data and
    a required field, never advice — so that what separates Entrants stays the reasoning,
    not the prompt author's strategy.
22. As an analyst, I want the seeded Season to exercise every new surface, so that the
    states the pages and the record must handle exist rather than hypothetically.

### Proving it

23. As a developer, I want the render covered at the pure seam — duties present and absent,
    and the record block's four states — so that every sentence the context can say is a
    test's expected string.
24. As a developer, I want the Rationale driven through the Gameweek loop over a real
    Postgres — stored when legal, refused when missing, null on a Roll Over — so that the
    tracer is the run itself, not a unit around it.
25. As a developer, I want the duties projection driven through the fetch seam replaying an
    archived bootstrap, so that the columns are proven from the same bytes production
    reads.
26. As a developer, I want the rehearsal suite passing on the amended template, so that the
    gate the ADR names is a test result and not a judgment call.

## Implementation Decisions

### The amendment is one change, in place

`fpl/2026-27-v2` keeps its name; the ten seats and their `prompt_version` do not move. The
door this walks through is ADR-0026's, and it closes at the first stored FPL context. The
work lands as one reviewed change — a template amended twice in three days is two reviews
of a Season-long freeze. Ship-or-freeze governs the deadline, with `fpl:rehearse` and the
pre-cron checklist as the gate.

### Duties

One migration adds three nullable columns to the Gameweek-scoped player rows — the
penalty, direct-free-kick and corner/indirect orders — projected by the Lock's fetch from
the same bootstrap it already validates and archives, following the club-code precedent.
The pool line renders them as optional keys; an absent key is the source's own silence.
No backfill now: the archive makes one legitimate whenever a reader exists (ADR-0041
records why the club-code refusal does not bind here), and a backfill without a reader is
rows written to gather dust.

### The own-record block

Rendered inside the Manager State block, from stored facts only: the latest Settled
Gameweek's own Team Sheet, each pick's Gameweek points from the settled player record, the
armband wearer and contribution from the scorer's stored detail, and the Season total from
the scorer's cumulative row. Nothing is recomputed — the same principle the dashboard's
endpoints hold to, for the same reason: a second answer to a scored number is a place for
the two to disagree.

Four states, all explicit: the block names the Gameweek it reads, always — after a Gap that
name is how the Entrant learns its record sits further back; at the opening the block
announces that nothing has settled, in the sentence family the context already uses; a
Rolled Over Gameweek renders the standing Sheet, which is the Sheet that played.

Out, deliberately: other seats' totals, any ranking, any digest of the numbers. The
boundary sentence is now the glossary's: an Entrant may be shown its own Record and is
never shown another's.

### The Rationale

The action schema gains a required string field, and the prompt's shape line shows it. A
response without it is the existing schema refusal — not a ViolationKind, one Repair spent
— which keeps the two tracks' definition of a valid response identical. Stored on the
Manager State row as a nullable column: null only for a Rolled Over Gameweek, whose refused
attempts already hold their bodies verbatim in the attempts record. Never scored. Never
rendered into any later context — read back, it would be the memory channel the track
deliberately does not have.

### What the freeze is

The FPL track pins no rendered-context sha; its freeze is the version string and the render
tests over the context builder. The amendment therefore moves those tests in the same
change, and the rehearsal — which replays build, call, validate and store over an archived
Gameweek — is what proves the amended loop whole before the Season runs it.

## Testing Decisions

### What makes a good test here

A test drives the seam the way the run does and asserts on what an Entrant or the record
would see — the exact rendered line, the stored row, the refusal and its kind. Numbers come
from the real reducer and the real scorer over seeded or archived data, never from a
hand-written row. Render assertions compare whole lines, the existing suite's own style, so
a drifted sentence fails as itself and not as a substring.

### What gets tested, at which seam

- **The pure render seam**: duties present and absent on the pool line; the record block's
  four states — named Gameweek, opening absence, post-Gap naming, Roll Over's standing
  Sheet — each as an expected string.
- **The Gameweek loop over real Postgres**: a scripted response carrying a Rationale lands
  on the Manager State row; one missing it is refused as the schema kind, costs one Repair,
  and succeeds on correction; a Roll Over stores null; the opening stores one per seat.
- **The fetch seam**: an archived bootstrap replayed through the fetch projects the three
  duty columns; a bootstrap whose player carries no duties projects nulls; the migration
  pair is covered by the schema and migration suites.
- **The gate**: the rehearsal suite passes over the amended template — the ADR's
  ship-or-freeze gate as a test result.
- **The seed**: exercises a seeded duty, stored Rationales, and the record block across the
  seeded Gameweeks, including after the seeded Gap and Roll Over.

### Prior art

The FPL loop suites (opening, running, starting the track) are the pattern for the tracer;
the context builder's own suite for the render strings; the FPL fetch suite for archived
replay; the rehearsal suite for the gate. The club-code slice is the pattern for the
projection migration.

## Out of Scope

- **Rendering the Rationale anywhere** — the dashboard's Entrant record page may want it
  later; that is its own decision with its own review.
- **Executing the duties backfill** — legitimate whenever a reader exists; no reader
  exists.
- **Any strategy or advice in the prompt**, any plan carried between Gameweeks, any other
  seat's totals — all rejected in ADR-0041 and none reopened here.
- **The Match track** — its Rationale, its schema and its contexts are untouched.
- **Next Season's version** — anything that misses the gate waits there, and nothing here
  pre-decides it.

## Further Notes

### Order of work, against a real clock

The Lock is 2026-08-21T17:30Z. The order that keeps the gate honest: the migration pair and
the fetch projection first (they are the club-code pattern and carry no template risk);
then the schema and storage of the Rationale; then the render — duties, then the record
block, moving the render tests with each sentence; the seed alongside; `fpl:rehearse` last,
over the whole amendment. If the gate is not green with margin before the cron takes over,
ship-or-freeze already says what happens, and the answer is not "hurry".

### What to verify early

- That the scorer's stored detail carries the armband and per-pick contributions for every
  seeded Gameweek shape — it is the one read the record block makes that no context read
  has made before.
- That the prompt's shape line and the schema agree on the Rationale to the byte, since the
  shape line is the only instruction an Entrant gets.
- That the rehearsal's archived Gameweek exercises the amended template at all — a
  rehearsal replaying a pre-amendment archive proves the old loop, not this one.
