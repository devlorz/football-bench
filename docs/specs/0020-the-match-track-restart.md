# Spec 0020 — The match track restart

The match track restarts under one amended template: the Premier League's
`match/2026-27-v2` amended in place through ADR-0026's door — production holds no context
under it — and La Liga moved to `match-pd/2026-27-v2` from Gameweek 2, its used and
unamendable v1 keeping Gameweek 1 whole on the record. Source of every decision here:
[ADR-0042](../adr/0042-the-match-track-restarts-under-amended-prompt-versions.md) (the
restart), [ADR-0043](../adr/0043-base-rates-xg-rates-and-two-instruction-lines-join-the-restarted-match-versions.md)
(what the amendment carries), and
[ADR-0044](../adr/0044-head-coach-changes-join-the-match-context-racing-the-freeze.md)
(the race it may also carry). Vocabulary: CONTEXT.md — including the new **Head Coach**
entry and the Season Roster sentence ADR-0042 moved.

This spec exists under a deadline, so it says plainly what its ADRs decided. The gate is
the earliest restarted Lock — the Premier League's **2026-08-21T17:30Z**, or La Liga's
derived Gameweek 2 Lock if it falls earlier, a fact to verify first, not assume. The work
ships under the ship-or-freeze rule spec 0019 wrote down: whatever is frozen when that
Lock's prediction run fires is the Season's version, and a run that fires on the old text
freezes the old text — there is no second window. Head Coach changes carry their own
earlier cutoff (ADR-0044): not ready roughly a day before the gate, they stop being
attempted and the restart ships without them.

## Problem Statement

La Liga's Gameweek 1 locked on 2026-08-15 and froze `match-pd/2026-27-v1`; the Premier
League's first Lock is days away and its version has never rendered. A review of the
Gameweek 1 packet found what both versions leave out at exactly the point of the Season
where it costs most: the context gives an Entrant no anchor for turning a read of two
teams into a probability distribution beyond whatever prior its training data happens to
hold; the Prior-Season line carries points per game but nothing of the performance under
them; a club that changed the person picking its team says so nowhere; and the ask itself
leaves two things unsaid that every Entrant must guess — whether `score` means the likeliest
scoreline or an expectation rounded, and by what rule the probabilities are judged.

The template and builder are one code path for both Competitions (ADR-0038), so the
Premier League cannot be amended alone without La Liga's later Gameweeks re-rendering
changed under a frozen version. And the scorer selects seats by the Prompt Version the
code names, so the moment the constants move, La Liga's v1 seats — holding sixty
Predictions for a Gameweek already played — fall out of every scoring run forever, with
their numbers unwritten.

## Solution

Restart the match track, both Competitions together, under the amended template:

- **Gameweek 1 stays whole.** Scored under v1 before anything flips, then shown on the La
  Liga page as one frozen, labelled block — and never merged into the restarted scoring.
- **The amended question.** One base-rates line from the prior Season's top flight; xG
  for and against per game on the Prior-Season line; two instruction sentences, verbatim
  from ADR-0043.
- **The re-seat.** La Liga gets seats under `match-pd/2026-27-v2`; the Premier League's
  seats keep their version string, amended under them. The roster window is open until
  the gate — one expected use: the GLM seat may move to GLM 5.3 — and closes into
  ADR-0034's rule unchanged.
- **Head Coach changes**, if they win their race: a new pipeline in the Squad Changes
  mould, from Wikipedia's per-Competition managerial-changes table, rendered as dated
  events for the Fixture's two clubs.

## User Stories

### The restarted question

1. As an Entrant, I want one line stating the prior Season's home-win, draw and away-win
   shares, goals per match and the match count they cover, so that my distribution is
   anchored in this league's stored record rather than my training data's memory of it.
2. As an Entrant, I want the base rates computed from the top flight alone, so that the
   anchor is not diluted by a division nobody in the Fixture plays in.
3. As an Entrant in a Competition with no curated divisions, I want the base-rates line to
   say it is unavailable, so that absence is announced rather than rendered as a blank.
4. As an Entrant, I want the Prior-Season line to carry xG for and against per game —
   overall, home and away — beside the points per game it already carries, so that I can
   tell a side that earned its points from one that rode its luck.
5. As an Entrant, I want an xG rate covering fewer matches than the record to announce its
   coverage, and a club with none — a promoted side, an Understat gap — to read
   unavailable, so that a partial sum is never dressed up as a season.
6. As an Entrant, I want to be told that `score` is the exact scoreline I judge most
   likely and not expected goals rounded, so that the two readings stop being a guess the
   benchmark scores me on.
7. As an Entrant, I want to be told my probabilities are scored with the ranked
   probability score over the ordered outcomes, so that I am judged on calibration rather
   than on ignorance of the rule.
8. As an analyst, I want the prompt to carry facts and the game's rules but never advice,
   so that what separates Entrants stays the reasoning (ADR-0018, unmoved).

### Keeping Gameweek 1 whole

9. As an analyst, I want La Liga's Gameweek 1 scored under v1 before the constants move,
   so that the record holds its Match Points, Bet Points and RPS and not just its
   Predictions.
10. As a reader of the La Liga page, I want one block labelled "Gameweek 1 — played under
    match-pd/2026-27-v1, before the restart" listing each v1 seat's Gameweek 1 numbers,
    so that the record is visible without pretending it is comparable.
11. As an analyst, I want the frozen block to carry no intervals and no Comparison
    Anchor, so that one Gameweek under a retired question supports no claim.
12. As a reader, I want the leaderboard proper to begin at Gameweek 2 with nothing of
    Gameweek 1 mixed in, so that no column holds numbers earned under two different
    questions.
13. As an operator, I want the v1 seats invisible to every run, alert and roster read
    after the flip, with the frozen block as the one surface that reads them by the
    retired version's name, so that retirement is a filter already in place and not a
    deletion.

### The re-seat and the roster window

14. As an operator, I want La Liga's restarted seats seeded from the v1 roster — same
    Base Models, providers and quantization pins under the new version string — so that
    the re-seat cannot silently become a roster change.
15. As an operator, I want the roster window open until the gate, so that the GLM seat
    can move to GLM 5.3 if the update lands in time — and whatever stands at the gate is
    the Season Roster for every Competition, one roster as ADR-0038 holds it.
16. As an operator, I want a Base Model arriving after the gate to be an Exhibition Run
    exactly as before, so that the restart is a window and not a precedent for doors.
17. As a reader of the code, I want the constants' comment corrected where it claims the
    Premier League's version has been used, so that the record and the database agree.

### Head Coach changes, racing the freeze

18. As an Entrant, I want a Fixture's context to state each of the two clubs' Head Coach
    changes — who left, the stated manner, who arrived, and when — so that the strongest
    early-season signal after signings stops being invisible.
19. As an Entrant, I want a club with no change to cost no line, so that the absence of
    the event is the fact and the section stays proportionate.
20. As an operator, I want the source page archived as a raw snapshot and its shape
    validated with refusal on drift, so that what an Entrant was shown is replayable and
    a moved table fails loudly, exactly as Squad Changes taught.
21. As an analyst, I want every rendered fact bounded by the deadline the context is
    built for, so that a sacking after the Lock can never leak backward into it.
22. As an operator, I want the cutoff executed as written — not ready a day before the
    gate, the restart ships without it and this section waits for the next version — so
    that the largest piece cannot hold the whole amendment hostage.

### The clock and the gate

23. As an operator, I want La Liga's derived Gameweek 2 Lock read from the store before
    the order of work is fixed, so that the gate is the earliest restarted Lock and not
    an assumption about it.
24. As an operator, I want the amendment landed as one reviewed change with the sha pins
    moved from real renders, so that the template moves once and freezes as reviewed.
25. As an operator, I want ship-or-freeze written down here, so that at the gate nobody
    improvises: frozen is the Season's, unfinished waits.

### Proving it

26. As a developer, I want every new sentence the context can say covered at the pure
    render seam as an expected string — base rates present, unavailable; xG rates full,
    partial, absent; the two instruction lines verbatim — so that a drifted sentence
    fails as itself.
27. As a developer, I want the Head Coach pipeline proven at the fetch seam by replaying
    archived wikitext — parsed events, refused drift, club-identity resolution — from the
    same bytes production reads.
28. As a developer, I want the frozen block proven at the dashboard's read seam over a
    seeded store holding both versions, so that the one deliberate read of retired seats
    is a test's result and the accidental ones stay impossible.
29. As a developer, I want the two versions' coexistence covered — v1 seats out of every
    roster read, v2 seats in — in the suite that already proves Competitions do not
    contaminate each other.
30. As an operator, I want the amended template dry-run over La Liga's Gameweek 1 and set
    beside the sixty v1 Predictions already on the record, so that the amendment's first
    contact with real Base Models happens off the record and before the gate, not at it.

## Implementation Decisions

### One amendment, scored first

The scorer selects seats by the Prompt Version the code names for the Competition, so the
order is a correctness rule, not a preference: La Liga's Gameweek 1 is scored under v1 —
its Fixtures' results fetched and stored, the scoring run completed — before the
constants move. The flip itself is one reviewed change: the shared template amended, the
Premier League's entry keeping its version string, La Liga's entry moving to
`match-pd/2026-27-v2`, both sha pins re-pinned from real renders read by eye (the
`context:show` discipline the constants' own comment records), and the false "has been
used" sentence in that comment corrected on the way through.

### The base-rates line is builder-only

Computed where the league table already is, from the prior Season's top-flight stored
results and nothing else: the three outcome shares, goals per match, and the match count,
once per context — an anchor is league-wide, not a per-team fact. A Competition with no
curated divisions renders the unavailable sentence in the family the table section
already uses. No new data, no migration.

### The xG rates extend a line that exists

Appended to the Prior-Season points-per-game line, computed over the same club-Season
matches that line already selects, under the form lines' both-or-nothing rule: a match
counts only when both sides' figure is stored, short coverage is announced, zero coverage
reads unavailable. A promoted club is unavailable by nature — Understat carries no second
division — the same explicit gap its stored history already produces. No new data, no
migration.

### The two instruction sentences

Exactly as ADR-0043 fixes them, in the closing instruction block beside the shape rules
they qualify:

> score is the exact final scoreline you judge most likely — not expected goals rounded.

> Probabilities are scored with the ranked probability score over the ordered outcomes
> Home, Draw, Away; lower is better.

### Head Coach is a new noun and a new pipeline, in the Squad Changes mould

A `head_coach_changes` store partitioned per rendering Gameweek like `squad_changes`,
written by a fetch that reads one Wikipedia season article per Competition — its
managerial-changes table, as raw wikitext, snapshot stored, club names resolved through
the existing identity map, shape drift refused with the source named. The section renders
the Fixture's two clubs' events dated, in the Squad Changes section's manner; no row
means no change, and outside its gate the section is absent rather than empty. Everything
is named head coach — the glossary holds "manager" for the FPL track.

The cutoff is ADR-0044's and is restated here as an order-of-work fact: this pipeline is
built last, behind everything the gate requires, and abandoned without ceremony if it is
not ready a day before the gate.

### The frozen block is one deliberate read

The La Liga page gains one block, labelled exactly "Gameweek 1 — played under
match-pd/2026-27-v1, before the restart", listing each v1 seat's Gameweek 1 Match Points,
Bet Points and RPS from the stored scores — no intervals, no Anchor, no season totals.
Its read names the retired version explicitly; every other read path keeps filtering by
the standing version and therefore never sees a v1 seat again. The block renders from
stored scores only — absent scores would mean the ordering rule above was broken, and the
block saying so beats the block guessing.

### The re-seat and the window

New `models` rows under `match-pd/2026-27-v2`, copied from the v1 seats — Base Model,
provider, quantization pin — through the same seeding door production seats have always
entered by. The Premier League's rows do not move. Until the gate, a seat under either
restarted version may change (the GLM 5.3 case); at the gate, ADR-0034 resumes
unchanged.

## Testing Decisions

### What makes a good test here

A test drives the seam the way the run does and asserts whole rendered lines or stored
rows — the existing suites' own style, so a drifted sentence fails as itself and not as a
substring. Numbers come from stored results the test seeded, never from a hand-written
aggregate beside the code that computes it.

### What gets tested, at which seam

- **The pure render seam** — the match context builder's suite: the base-rates line from
  seeded prior-Season results, and its unavailable sentence; the xG rates full, partial
  (coverage announced) and unavailable, including the promoted-club shape; the two
  instruction sentences verbatim in the rendered packet; the Head Coach section's events,
  its no-change silence, and its absence outside the gate.
- **The fetch seam** — archived-wikitext replay in the Squad Changes suite's pattern:
  parsed events land as rows under the right partition; a page whose table moved is
  refused with the source named; club identities resolve through the existing map.
- **The dashboard's read seam** — over a store seeded with both versions: the frozen
  block returns the v1 seats' Gameweek 1 numbers under the exact label; the leaderboard
  and every roster-shaped endpoint return only v2 seats.
- **Coexistence** — the contamination suites gain the two-versions case: v1 seats out of
  prediction runs, gap alerts and rosters; v2 seats in; Exhibition replay of Gameweek 1
  still resolving v1's stored contexts.

### Prior art

The historical-context builder suite for render strings; the Squad Changes fetch suite
for archived wikitext replay and refusal; the squad-changes context suite for the section
shape; the dashboard competition-view and read-api suites for the block; the
competition-coexistence and contamination suites for the version boundary.

## Out of Scope

- **Per-player prior-Season minutes and points per game** — deferred by ADR-0043 to the
  next version boundary; nothing here pre-builds it.
- **Reference odds** — a Reference Line outside the context, on its own clock, blocked by
  nothing here.
- **Any coaching sentence** — "hold to the base rate" was rejected in ADR-0043 and is not
  reopened.
- **Merging Gameweek 1 into the restarted scoring**, in any column, ever.
- **The FPL track** — its template, schema and contexts are untouched; its own amendment
  is spec 0019's.
- **Dashboard work beyond the frozen block** — the per-competition shape (spec 0017)
  stands.
- **Next Season's version** — whatever misses the gate waits there, and nothing here
  pre-decides it.

## Further Notes

### A ready-made A/B bench, off the record

La Liga's Gameweek 1 is the one Gameweek that ever gets both questions asked of it: sixty
v1 Predictions made before results were known sit on the record, and the as-of discipline
means the amended builder can render exactly the packet those Fixtures would have carried.
The comparison runs through the dry-run harness — archived snapshots replayed into a
scratch store, real Base Models called, nothing written to the record — and off the
record it must stay, three ways at once: the context identity admits one stored body per
Fixture, a Gameweek 1 Prediction under a v2 seat would leak into the restarted scoring
the spec forbids ever merging, and a run after results is ADR-0032's accepted objection
however small the recall risk four days on.

Read it for what six Fixtures can say. RPS deltas at that size are noise; what the bench
actually measures is what ADR-0026's dry opening measured — Repair and format failures,
the incoherence rate under the new sentences, whether the base-rates anchor is picked up
at all. It gates nothing: it is the cheap look before the gate, not a condition of it.

### Order of work, against a real clock

Read La Liga's derived Gameweek 2 Lock first — it, not the Premier League's
2026-08-21T17:30Z, may be the gate. Then in order: fetch results and score La Liga's
Gameweek 1 under v1; the three zero-data additions and the instruction lines, moving the
render tests with each sentence; the dry-run bench over Gameweek 1, whose findings can
still move a sentence cheaply; the flip — constants, sha pins from real renders, the
corrected comment — and the re-seat; the frozen block; Head Coach last, racing its
cutoff. If the gate is not green with margin, ship-or-freeze already says what happens,
and the answer is not "hurry".

### What to verify early

- That La Liga's Gameweek 1 results are stored and scoreable now — the scoring window
  closes at the flip, and a missing result discovered at flip time is the one failure
  this order cannot absorb.
- That prior-Season Understat rows exist for both Competitions' top flights in
  production, since the xG rates render from them and an empty store renders a page of
  "unavailable" nobody intended.
- That both season articles' managerial-changes tables exist and parse today, before the
  Head Coach pipeline is committed to — a source that fails its first read loses the race
  on the spot.
- That La Liga's Gameweek 1 snapshots cover what the dry-run bench replays — a dry run
  replays bytes and invents none, so a snapshot the fetch never stored is a bench that
  cannot be built.
- That the GLM 5.3 decision has an owner and a deadline in someone's calendar, because
  the roster window closes with the gate whether or not anyone chose.
