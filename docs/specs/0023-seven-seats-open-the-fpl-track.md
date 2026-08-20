# Spec 0023 — Seven seats open the FPL track

**Status:** ready-for-agent
**Scope:** the three seats ADR-0047 withdraws leave the FPL track's Season Roster and stay
in the record — a dated departure on the `models` row, a filter on the FPL track's roster
reads, and an expected size of its own for the guard that stands at the opening. The Match
track's ten are untouched.
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) — **Season Roster**, **Entrant**, **Base
Model**, **Track**, **Lock**, **Gameweek**, **Prompt Version**, **Exhibition Run**, **Gap**
**Decisions:** [ADR-0047](../adr/0047-three-seats-leave-the-fpl-track-before-its-first-lock.md),
with [ADR-0034](../adr/0034-the-roster-refreshes-to-ten-entrants-before-the-first-lock.md)
(the roster closes at the first Lock), ADR-0011 (no exclusion
within a track), ADR-0032 (Exhibition Runs), ADR-0003 (one Season path per Entrant)

Like [spec 0019](0019-amending-fpl-2026-27-v2-before-its-first-use.md) and
[spec 0022](0022-the-fixture-window-widens-to-eleven-gameweeks.md), this one runs against
the Season's first FPL Lock at **2026-08-21T17:30Z**. The deadline is not decoration here:
ADR-0034 closes the Season Roster at that Lock, and ADR-0047's own door is that until it
arrives there is no FPL Season to remove anybody from. A withdrawal decided after it is not
a withdrawal, and the alternative on the other side of the Lock is a Season that never
opened its FPL track at all.

**This spec has a gate before its first line of code**, and the gate can change its
central number. See the Solution.

---

## Problem Statement

The FPL track cannot open. Three attempts on the evening of 2026-08-20 refused, and the
same three seats produced no legal opening every time: two Base Models returned nothing at
all through a five-minute window and then a ten-minute one — no usage, no body, our own
abort — against a prompt the seats that answered read in about four and a half minutes; the
third answered inside the clock and spent its entire output ceiling on reasoning, 16,000 of
16,000 and then 32,000 of 32,000, with no content either time. The opening commits every
Entrant's Squad or none, so seven Base Models that produced a legal opening hold no Season
path because three did not.

Nothing in the codebase can say "this Base Model is not on this track". A track's roster is
a `models` read keyed on role and Prompt Version and nothing else; the size guard that
stands between a careless roster and a Season opened at the wrong count is one number
serving both tracks; and the only removal this project has ever performed deleted the rows,
which is unavailable here because the attempt store and the context store both reference
`models` and both hold last night's rows for all three seats. Those rows are the evidence
the decision is read from — a deletion would either be refused by the foreign keys or,
forced through, destroy it.

Underneath the outage is a vocabulary problem the glossary can no longer straddle. The
Season Roster was defined as one per track and, in the same breath, as one roster that both
tracks share. Both were true while both tracks seated the same Base Models. A track whose
comparisons are computed over seven while the other's are computed over ten cannot hold
both sentences at once.

## Solution

A withdrawn seat keeps everything it has and gains a date. The `models` row grows a
withdrawal timestamp, null for every seat that stands; the FPL track's roster reads take
"and not withdrawn"; the Match track's reads do not, which is what keeps ten seats
predicting Fixtures. The FPL track's expected roster size becomes a constant of its own, so
the guard that refuses a Season opened at the wrong count still bites — against the right
number.

The seat keeps its id, its Base Model, its attempts and its contexts. The record says when
it left and the ADR says why. The FPL track then opens for the seats that answered, and
every cross-track reading from here on carries two different n — which the glossary now
says out loud rather than leaving a reader to discover.

**The gate.** ADR-0047 asks to be read narrowly, and the narrow reading is a precondition
of this spec rather than a footnote to it. All three failing runs went out ten seats wide,
and the FPL job configuration's own comment records that every timeout Gap of the earlier
concurrency work came from a ten-wide burst and none from pre-flight, which calls one seat
at a time. One-at-a-time has not been tried. It is the lever aimed exactly at the two seats
that returned nothing, it costs about half an hour, and it stands against a decision that
cannot be undone this Season.

So: attempt the opening at concurrency one before anything is withdrawn. It is a paid run
and needs the user's explicit go-ahead with the call count and cost stated first. If the
two silent seats open, the withdrawal is the reasoning seat's alone, the FPL roster size in
this spec is nine rather than seven, and ADR-0047's table becomes the record of why the
other two looked broken. **Every other decision in this spec is unchanged by that
outcome** — which is why the size is derived rather than written down as a literal.

## User Stories

1. As the operator, I want an opening attempted one seat at a time before any Base Model is withdrawn, so that nobody leaves the Season on a failure that concurrency caused.
2. As the operator, I want that attempt's seat count and cost stated before it runs, so that I approve a spend rather than discover one.
3. As the operator, I want the withdrawal list to follow from that attempt's result, so that the record states what was measured rather than what was assumed the night before.
4. As a reader of the benchmark, I want a withdrawn seat's attempts and contexts to stay exactly where they are, so that the evidence a withdrawal rests on survives the withdrawal.
5. As a reader of the benchmark, I want a withdrawn seat's departure to carry a date, so that "it left" and "it was never here" are different facts.
6. As a reader of the benchmark, I want the FPL leaderboard to show only the seats that hold a Season path, so that a Base Model with no path is not displayed as an Entrant on nought points.
7. As a reader of the benchmark, I want the two tracks to be able to state different Entrant counts, so that a cross-track reading is not silently taken across two populations under one number.
8. As a reader of the benchmark, I want the withdrawal to be one whole-Season decision taken before the track opens, so that ADR-0011's rule still holds: a seat plays every Gameweek of its track's Season or is not on that track's roster at all.
9. As a reader of the benchmark, I want the class mix the withdrawal produces to be visible where the roster is described, so that the open-weight side losing three of its five is a stated cost and not a discovery.
10. As a reader of the benchmark, I want a withdrawn Base Model's only route back to be an Exhibition Run, so that ADR-0032's rule about what supports a claim of forecasting skill still holds.
11. As the operator, I want the FPL opening to refuse a roster of the wrong size, so that a Season path cannot begin against a population nobody decided on.
12. As the operator, I want that refusal measured against the FPL track's own expected size, so that opening a track of seven does not require removing the guard.
13. As the operator, I want the expected size derived from the roster and the withdrawal list rather than typed as a number, so that the gate's outcome — seven or nine — cannot leave the guard describing a roster that does not exist.
14. As the operator, I want the Match track's roster reads left alone, so that the ten seats that predict Fixtures keep predicting them, including the ones withdrawn from the other track.
15. As the operator, I want re-running the roster entry door to leave a withdrawn seat withdrawn, so that a routine re-seat cannot quietly reinstate a Base Model the Season removed.
16. As the operator, I want the withdrawal stamped by the same door that seats the roster, so that a fresh database and production reach the same state without a hand-run update that only one of them ever sees.
17. As the operator, I want the context renderer to show exactly the seats that will be called, so that what I read before a Lock is what the run reads.
18. As the operator, I want the FPL run's default concurrency to follow the FPL track's own size, so that the default stops describing a roster that no longer exists.
19. As the operator, I want the schema change applied to production before the first FPL run, so that the schema the code reads and the schema production holds are the same one.
20. As a developer, I want the withdrawn ids named in exactly one place beside their date and their reason, so that "who left, and when" is a fact in the codebase rather than a query against production.
21. As a developer, I want the Match track's size constant to say which track it now speaks for, so that the next reader does not carry the old both-tracks assumption into a new call site.
22. As a developer, I want the FPL rehearsal to keep running all ten of its behavioural seats, so that the withdrawal does not cost the rehearsal three of the behaviours it exists to prove.
23. As a developer, I want the guard's expected size to be an input the rehearsal can set, so that the rehearsal's seat script and the Season's roster stop being forced to be the same number.
24. As a developer, I want a test that fails if an FPL roster read omits the filter, so that the read site added next Season does not reinstate three seats by inattention.
25. As a developer, I want a test that a withdrawn seat's attempts and contexts survive the door, so that the foreign keys the whole decision rests on are checked rather than trusted.
26. As a future reader, I want the glossary's Season Roster entry to define a roster per track and to name the withdrawal field, so that the definition and the schema agree.

## Implementation Decisions

- **`models` gains a nullable withdrawal timestamp.** New migration, one column, no
  default and no backfill. Its comment carries ADR-0047's reason: this is a removal that
  must not delete, because the attempt store and the context store reference these rows and
  hold the evidence the removal is read from.
- **No constraint tying the column to the Entrant role.** It means "this seat left its
  track's Season Roster"; a Reference Line has no roster to leave, and a guard for a state
  nobody can reach is a guard nothing has ever seen bite.
- **The roster module gains an FPL expected size and a withdrawal list.** The list names
  each withdrawn seat id with the date it left and a one-line reading of why, in the voice
  the roster's own entries carry. It is the single place the ids appear: the door writes
  from it, the guard is sized from it, the tests read from it.
- **The FPL expected size is derived, not written.** It is the roster's length less the
  withdrawal list's. This is what makes the gate cheap: if the one-at-a-time run opens the
  two silent seats, the list shrinks to one entry and the size becomes nine with no other
  edit, and a fourth withdrawal next Season cannot leave the guard stale.
- **The Match track's size constant keeps its number and gains a track.** Its doc comment
  says it is the Match track's size and points at the FPL one. The value does not move.
- **The FPL entry door stamps the withdrawal; the migration does not.** After the seats are
  upserted, the FPL door writes the date onto the seats named in the withdrawal list and
  leaves every other seat's null. Chosen over a data statement in the migration because the
  door is idempotent, already owns the FPL seat rows, and is run against a fresh database
  and production alike — so both arrive at the same state without a hand-run update.
- **The shared seat upsert is untouched and does not mention the column.** That is what
  makes a re-run of either door incapable of clearing a withdrawal, which is story 15.
- **The FPL roster reads take "and not withdrawn".** **Six** read sites, counted from the
  code rather than from the shape of the sentence: the opening's Entrant query
  (`startFplTrack`), the context renderer's seat query (`context:show:fpl`), and **four**
  in the dashboard — `fplLeaderboard`, `fplSquads`, and two inside `fplEntrants`, which
  reads the Manager State replay and the entrant names as separate queries. The dashboard's
  four are exactly the four places `FPL_PROMPT_VERSION` is passed to a query in
  `read-api.ts`, which is the check to re-run when this list is next read.
- **The Gameweek run's read is deliberately not filtered.** It reads by id from the
  started-roster record, and that record is already the record of which seats hold a Season
  path: a withdrawn seat never opened, so it is not in the list. A filter there would state
  the same fact twice in a place then free to disagree with itself.
- **The Match track's reads are not filtered.** A track's withdrawal is a fact about that
  track's row; the FPL seat and the Match seat for one Base Model are different rows, so a
  date on one says nothing about the other.
- **The opening's count guard takes its expected size as an option**, defaulting to the FPL
  expected size. This is the one new interface in the spec and it exists for a real
  collision: the FPL rehearsal seats ten *behavioural* seats — idle, trader, wildcard,
  free-hit, bench-boost, triple-captain, repaired, rolled-over, three-at-the-back, faller —
  under the FPL Prompt Version in a throwaway database and then calls the opening. A guard
  hard-wired to the Season's size would either break the rehearsal or cost it three of the
  behaviours it was built to prove. The rehearsal passes its own seat count.
- **The rehearsal's verifier counts its seats, not the Season Roster.** Its two uses of the
  Match size constant become the rehearsal seat script's length, which is what they always
  meant — a rehearsal seat is a behaviour, not a Base Model, and the coupling was an
  accident that the divergence has now exposed.
- **The FPL job's default concurrency becomes the FPL expected size.** The default means
  "the whole track at once", and the old number no longer is. It stays a default; the
  environment override is the lever the gate turns on.
- **Nothing is deleted.** No `models` row, no attempt, no context. The earlier roster ADR
  could delete because no stored fact referenced its rows; last night's do.
- **No Prompt Version moves and no context changes.** The withdrawal is about who is asked,
  not about what they are asked. Both tracks' versions stay frozen.
- **The glossary edit ships with the code.** CONTEXT.md's Season Roster entry is amended to
  define a roster per track, to name the withdrawal field, and to say that a seat plays
  every Gameweek of its track's Season or is not on that track's roster at all. It is
  already written and uncommitted; it belongs in this spec's commit, not after it.

## Testing Decisions

A good test here names an external behaviour and nothing else: who the door seats, who the
guard admits, who a read returns, what the page shows. No test should reach into a private
helper or assert on SQL text. Every seam below already exists except the structural check
in the last bullet, which is a new test file rather than a new production seam.

- **The roster entry door** — prior art: the existing season-roster suite, which already
  drives both doors against a real Postgres. New cases: the FPL door leaves the standing
  seats' withdrawal null and the withdrawn seats dated; a second run neither clears a date
  nor moves it; a withdrawn seat carrying an attempt row and a context row still carries
  both afterwards and its `models` row is still there; the Match door leaves all ten Match
  seats' withdrawal null, including the Base Models withdrawn from the other track. The
  third of these is the test that checks the foreign keys the decision rests on rather than
  trusting them.
- **The FPL opening** — prior art: the existing start-track suite. New cases: an opening
  proceeds with the expected number of standing seats and commits that many Manager States;
  a database still holding every seat unwithdrawn is refused; the refusal names the
  expected size and the size found, and the expected size it names is the FPL one.
- **The dashboard's FPL reads** — prior art: the existing FPL API suites (leaderboard,
  squads, entrants) and the FPL view suite. All four endpoints return only the standing
  seats when the fixture withdraws three, and the view's entrant-count line reads the same
  number. The Match entrants suite reads ten from the same fixture, which is the assertion
  that catches a filter applied one table too widely.
- **The schema** — prior art: the existing migrations suite. The column exists, is
  nullable, and has no default.
- **The rehearsal** — prior art: the existing rehearsal runner and verifier suites. They
  must still run all ten behavioural seats and still verify against ten. These are the
  tests that fail if the guard is hard-wired rather than defaulted, which is why they are
  named here rather than left to recompile.
- **One structural test, new, for story 24.** It asserts that every Entrant read filtered
  on the FPL Prompt Version also carries the withdrawal filter, with the Gameweek run's
  by-id read named as the single exception and its reason inline. Its whole value is in the
  read site nobody has written yet; without it the filter is a convention, and a convention
  decays.
- The full suite exceeds five minutes and runs in the background; the touched files stay
  fast and are what to run while working.

## Out of Scope

- **A reasoning cap for the ceiling-bound seat.** ADR-0047 rejects it here rather than
  dismissing it: the request envelope carries no such parameter, it is shared by both
  tracks and pre-flight, and adding one for a single seat changes the terms that seat plays
  under against the other nine. Its own ADR, its own measurement, and the first thing to
  reach for next Season.
- **A third raise of the output ceiling.** Rejected by the previous ticket's own sentence,
  on two data points showing the seat spending whatever it is given rather than needing a
  particular number.
- **Reinstating a withdrawn seat.** There is no path and this spec does not build one. The
  roster closes at the first Lock and a withdrawn Base Model returns only as an Exhibition
  Run. Nothing here needs a write that clears the date, so nothing writes one.
- **Withdrawal on the Match track.** The column would work there and no Match seat is being
  withdrawn, so no Match read is filtered. The day one is, that is its own ADR.
- **Opening the FPL track at a later Gameweek, and not opening it at all.** Both were
  weighed and rejected in ADR-0047; neither is reopened here.
- **The path that misreports a ceiling failure.** Still open from the previous ticket: the
  action call checks for absent content before it checks the finish reason, so a ceiling
  that takes the content with it is recorded as a provider fault rather than against the
  truncation kind. It changes no outcome here, only the honesty of the record.
- **Running the gate itself, and writing its report.** Operational work, sequenced below
  and recorded in `docs/reports`, not here.

## Further Notes

**Order of work, against a real clock.** The gate first — ask, then run the opening one
seat at a time, then read the result. The withdrawal list follows from it and everything
else follows from the list. If the Lock arrives before the code is ready, the ship-or-freeze
rule applies as it did to specs 0019 and 0022, with one difference worth stating plainly:
here the frozen alternative is an FPL track that does not open this Season.

**The gate is a paid run and the spend is the user's call.** State seats × Fixtures, the
resulting call count and a rough cost, then wait. Killing it mid-flight recovers nothing.

**Production needs the schema change applied before the first FPL run**, and this project
has a recurring history of merged migrations that were never applied. Diff production's
migration record against the repository's before trusting any gate, then run the roster
entry door so the dates land where the reads look for them.

**The costs, restated because this code is what makes them true.** The FPL track ranks
seven Base Models and the Match track ten, so every cross-track reading carries two
different n and the dashboard shows both. The class mix moves from three Frontier, two
first-party and five open-weight to three, two and two — the open-weight side, which is the
side this benchmark exists to keep in the picture, loses three of its five. And it is
irreversible for the Season.
