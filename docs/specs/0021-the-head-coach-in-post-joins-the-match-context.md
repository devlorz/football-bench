# Spec 0021 — The Head Coach in post joins the match context

The match context names each club's **Head Coach**, read from the same season article the
**Head Coach Change** pipeline already fetches and archives, with that club's Changes
beneath the incumbent they explain. Source of every decision here:
[ADR-0045](../adr/0045-the-packet-names-who-picks-each-team-not-only-who-changed.md),
which overturns one sentence of
[ADR-0044](../adr/0044-head-coach-changes-join-the-match-context-racing-the-freeze.md) and
leaves the rest of it standing. Vocabulary: CONTEXT.md — including the two entries
ADR-0045 split apart, **Head Coach** and **Head Coach Change**.

This spec is bound to a Lock, not to a date. A context stored under a restarted Prompt
Version freezes it (ADR-0026) and both Competitions are asked one question (ADR-0038), so
this work belongs to whichever version boundary it reaches first: before the earliest
restarted Lock it is part of the restarted versions, and after it, it takes both
Competitions to the next boundary together. The one thing it may never do is land for the
Competition whose Lock falls later and not for the other.

## Problem Statement

The packet tells an Entrant who *changed*, never who is *in post*. For a club that kept
its Head Coach, nothing in the context names him at all — and the Season Roster is ten
Base Models with ten different training cutoffs, so that silence is filled differently by
each of them. One Entrant answers knowing who picks the team and another does not, and
the difference between their Predictions is the recency of their training data rather
than the forecasting the benchmark exists to measure.

The Change section does not close the hole, because it covers the current Season only: a
Head Coach appointed mid-2025-26 is missing from the table and missing from an older
model's memory alike. Deportivo Alavés is the case on the record as this is written —
Quique Sánchez Flores has been in post since before this Season, has no row in the
Changes table, and is named nowhere in the packet.

Separately, and only while the incumbents are absent, the Change section renders a bare
heading whenever neither club changed. That heading reads as a truncation rather than as
a "none", and it is indistinguishable from the state where the fetch has not landed — a
state that occurred in production on 2026-08-19, between migration 0032 and the first
fetch that populated it.

## Solution

- **The Head Coach is named for both clubs, every packet.** Read from the season
  article's per-club table — "Personnel and kits" in the Premier League, "Personnel and
  sponsorship" in La Liga — which is in bytes this pipeline already archives.
- **One section, not two.** Each club's incumbent, with that club's Changes under it
  where the Season has any. An Entrant assembles one fact in one place.
- **The bare heading dissolves.** Every club has a Head Coach, so no packet reaches a
  reader with a heading and nothing beneath it.
- **A fallback, should this not reach the freeze in time.** The Change section says
  `none recorded` — the Squad Changes section's own phrase for a direction with nothing
  in it — rather than a sentence asserting that neither club changed, which is false
  whenever a fetch has not landed.

## User Stories

### Reading who picks the team

1. As an Entrant, I want each club's Head Coach named in the packet, so that my read of
   the Fixture does not depend on whether my training data happens to be recent enough to
   know.
2. As an Entrant, I want the Head Coach named even when the club changed nobody this
   Season, so that the longest-serving coaches — the ones the Change table structurally
   cannot mention — are not the ones I am left guessing about.
3. As an Entrant, I want a club's Changes rendered beneath its incumbent, so that "who is
   in post" and "did that recently change" read as one fact rather than two sections.
4. As an analyst, I want the two Base Models with the oldest and newest cutoffs to be
   shown the same coaching facts, so that a Paired Difference between them measures
   forecasting rather than training-data recency.
5. As an Entrant, I want the incumbent stated as a plain name, so that it is a raw signal
   requiring synthesis and not a digest of anyone's forecast (ADR-0018, unmoved).

### What absence means, now that it means two things

6. As a reader of the packet, I want a club with no Head Coach named to be a visible Gap
   rather than a blank, because every club has one and a missing name is the record
   failing, not the world being quiet.
7. As an Entrant, I want a club with no Change to simply carry no Change lines under its
   incumbent, because keeping a Head Coach is ordinary and costs no sentence.
8. As an operator, I want the section absent entirely for a Competition and Season with no
   listed article, exactly as it is today, so that "we do not read this league" stays
   distinct from "this league changed nobody".
9. As an operator, I want the fallback `none recorded` wording ready and specified, so
   that if the incumbents miss the freeze the bare heading is still fixed rather than
   left standing for a Season.
10. As an analyst, I want the fallback phrased about the record rather than about
    football, so that it stays true whether nobody changed or nothing was fetched.

### The source, in two dialects

11. As an operator, I want the incumbents read from the season article already archived,
    so that this costs a parser and not a second fetch — the fact that overturns
    ADR-0044's rejection.
12. As an operator, I want both section titles recognised, because the two articles name
    the same table differently and neither is more correct.
13. As an operator, I want `{{nobreak}}` understood by the shared wikitext reader, because
    La Liga wraps its cells in it and the Premier League does not.
14. As a developer, I want that widening pinned by assertions of its own, because the
    shared reader is under Squad Changes as well and the last widening shipped unpinned
    and survived on luck.
15. As an operator, I want a table whose shape moved to refuse with the source named,
    exactly as the Change table does, so that a reordered column stops the parse rather
    than filing a captain as a coach.
16. As an operator, I want every club in the table resolved through the existing identity
    map, so that a spelling the results are not filed under fails loudly.

### Keeping it pre-Lock

17. As an analyst, I want each incumbent row to carry the instant it was observed, so that
    the guarantee is checkable rather than inferred from the fetch's schedule.
18. As an analyst, I want a row observed after the deadline the context is built for to be
    unrenderable, so that a coach sacked on the morning of the match cannot reach a packet
    that was supposed to predate the Lock.
19. As an analyst, I want the weaker guarantee stated where it is made, because this table
    carries no dates and "stored before the Lock" is a different promise from the Change
    table's "dated before the Lock".

### Proving it

20. As a developer, I want every sentence the section can now say covered at the pure
    render seam as a whole line — incumbent alone, incumbent with Changes, the Gap where
    no incumbent is stored, the section absent outside its gate, and the fallback wording.
21. As a developer, I want both archived season articles parsed by the incumbents parser
    in tests, so that both dialects and both section titles are proven on the real bytes.
22. As a developer, I want the shared wikitext reader's new `{{nobreak}}` handling asserted
    alongside the shapes it already pins, and the Squad Changes suites still green, so
    that the second pipeline is not disturbed by the second widening.
23. As a developer, I want the fetch seam to store the incumbents into the rendering
    Gameweek's partition and to refuse a moved shape with the source named.
24. As a developer, I want the migration covered by the schema, migration and rehearsal
    suites the way migration 0032 is.

## Implementation Decisions

### A store of its own, beside the Changes

A new per-Gameweek partition mirroring `head_coach_changes` in scoping and lifecycle —
Competition, Season, Gameweek, club — carrying the Head Coach's name and the instant the
row was observed, and nothing else. Not a column on the Changes table and not a row with
a third `direction`: those rows are events with a direction, a manner and a date, an
incumbent has none of the three, and folding them together would put a filter on every
read of both. Written by the same delete-then-insert over the whole partition the Changes
writer uses, scoped by Competition so one league's fetch cannot empty another's.

The `observed_at` column the Changes table already carries is the precedent for the
instant; here it is load-bearing rather than incidental, because it is the whole of the
pre-Lock guarantee.

### The parser reads a second table on the same page

One more parser over bytes already fetched: find the per-club table under either of the
two section titles, take the club column and the manager column, ignore the rest of the
row. Simpler than the Changes parser by a wide margin — one row per club, no rowspan to
carry, no manner and no dates — but under the same strictness: a header that does not
match refuses with the source named rather than parsing on, and a club that does not
resolve through the identity map stops the parse.

`SOURCE_COLUMNS`-style header pinning applies here too: the columns are quoted to detect
their movement and for no other purpose, and "Manager" is the source's word, quoted, while
everything the repo names is Head Coach.

### The shared reader learns one more wrapper

`{{nobreak}}` joins the templates `cellSource` strips. It lands with its own assertions in
the shared reader's suite, and the Squad Changes suites are run to prove the second
pipeline is unmoved — the discipline the first extraction's review established after that
widening shipped pinned by nothing and passed on luck.

### One section, and what it says

The section renders each club in turn: the club, its Head Coach, then its Change lines
where the Season has any, in the manner the Change section already uses. A club with no
stored incumbent renders as an announced Gap rather than a blank line, because every club
has a Head Coach and a missing one is the record failing. The section stays absent for a
Competition and Season with no listed article.

Rendering is bounded by the deadline the context is built for: an incumbent row observed
after that instant is not read, which is where the weaker guarantee is enforced.

### The fallback, if the freeze arrives first

A single branch in the Change section: where the partition holds nothing for either club,
the section reads `none recorded` rather than a heading with nothing under it. The phrase
is the Squad Changes section's, unchanged, and it is chosen over a sentence asserting that
neither club changed because that sentence is false whenever a fetch has not landed. This
is the whole of the work in that case, and it is worth landing on its own.

## Testing Decisions

### What makes a good test here

A test asserts whole rendered lines or whole stored rows, drives the seam the way the run
drives it, and reads its numbers from data the test seeded rather than from a hand-written
expectation beside the code that computes it. Fetch paths replay archived bytes; nothing
in this spec's suites reaches the network.

### What gets tested, at which seam

Every seam below already exists; this spec adds no new ones.

- **The pure render seam** — the Head Coach context builder's suite: incumbent alone,
  incumbent with Changes beneath, the Gap where no incumbent is stored, the section absent
  outside its gate, an incumbent observed after the deadline left unread, and the fallback
  wording.
- **The parser seam** — over both archived season articles: both section titles, both
  markup dialects, all twenty clubs each, a moved header refused with the source named, an
  unresolvable club stopping the parse.
- **The shared wikitext seam** — `{{nobreak}}` pinned beside the shapes already pinned,
  including the edge where it must not eat text that merely looks like a wrapper.
- **The fetch seam** — archived replay: rows land in the rendering Gameweek's partition,
  the partition is scoped by Competition, the bytes are archived before they are read.
- **The schema seam** — the migration covered by the schema, migration and rehearsal
  suites as migration 0032 is.

### Prior art

The Head Coach Change pipeline is the mould for all of it: its fetch suite for archived
replay and refusal, its parser suite for the two dialects, its context suite for the
section's render, and migration 0032 for the store and its coverage. The Squad Changes
suites are the regression check on the shared reader.

## Out of Scope

- **Everything else in the personnel table** — captains, kit manufacturers, sponsors. The
  table carries them; the packet has no question they answer.
- **Competitions with no listed season article.** The gate is the article list, unchanged.
- **The FPL track**, whose context and template this does not touch.
- **Backfilling incumbents into Gameweeks already rendered.** A stored context is what an
  Entrant was shown, and nothing rewrites one.
- **Re-pinning the sha constants**, which belongs to whichever version boundary this
  reaches and is that boundary's work, not this spec's.
- **Any statement about a coach beyond his name** — tenure length, record, style. Those
  are digests, and ADR-0018 keeps them out.

## Further Notes

### Order of work, against a Lock

Read the earliest restarted Lock before anything else; it, not a date, decides whether
this belongs to the restarted versions or to the next boundary. Then in order: the shared
reader's `{{nobreak}}` widening with its assertions and the Squad Changes suites green,
because it is the edit that can disturb a shipped pipeline; the migration; the parser over
both archived articles; the fetch; the section, moving the render tests with each sentence
it can say. The fallback branch is independent of all of it and can land first or alone.

### What to verify early

- That both season articles still carry the per-club table under the two titles, read from
  raw wikitext rather than the rendered page — the mistake made once already on this
  pipeline, where the rendered page showed six columns and the wikitext had seven.
- That the identity map resolves every club in both personnel tables, since it was built
  against the Change tables and has only ever been asked about clubs that changed.
- That an incumbent row and a Change row for the same club and Gameweek render together in
  the order the section promises, over production data, before the pins move.
