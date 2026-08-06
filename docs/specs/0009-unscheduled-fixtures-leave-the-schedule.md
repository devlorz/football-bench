# Spec 0009 — Unscheduled Fixtures leave the schedule

**Status:** ready-for-agent
**Scope:** the FPL fetch and the FPL context's schedule read, so that a Fixture FPL has
withdrawn from the calendar stops masquerading as a scheduled one; lands before the FPL
track's first Lock
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:** [ADR 0001–0024](../adr/),
especially [ADR 0013](../adr/0013-a-postponed-fixture-keeps-its-original-prediction.md),
[ADR 0015](../adr/0015-a-fixture-owns-its-locked-gameweek.md) and
[ADR 0024](../adr/0024-an-unscheduled-fixture-leaves-the-stored-schedule.md)
**Siblings:** [spec 0006](./0006-fixtures-availability-detail-and-the-league-table-in-the-fpl-context.md)
(whose schedule section this makes honest; its stories 3 and 4 depend on this landing)

---

## Problem Statement

When FPL postpones a Fixture without naming a new date it sets the Fixture's `event` to
null, and the fetch stores nothing about it. A never-Locked row keeps its stale Gameweek
and kickoff, indistinguishable from a scheduled Fixture; a Locked row is flagged
`deferred`, a flag that also marks Fixtures legitimately moved to a new Gameweek and never
clears. So the FPL context's schedule section lists a withdrawn Fixture under a Gameweek
it will not be played in, and the Blank it creates — the fact a Chip decision most needs —
never renders as absence. Ticket 0006's schedule slice recorded this as its one known
limitation, unfixable where the schedule is read because the fetch stores nothing that
tells the two rows apart. The same stale rows leak beyond the context: the match track
selects prediction work by `coalesce(locked_in_gw, gw)`, so a phantom never-Locked row is
predicted, and gap-alerted, as if the match were still to be played.

## Solution

ADR 0024's split on the Lock, materialised by the fetch. A never-Locked Fixture FPL has
unscheduled is deleted — nothing refers to it, and the feed rebuilds it if FPL restores
it. A Locked Fixture FPL has unscheduled keeps its row, its Predictions and its `deferred`
flag, and gains `unscheduled = true`, a new column meaning exactly "currently off FPL's
calendar"; FPL naming a new date clears it. The schedule read excludes unscheduled rows,
so a withdrawn Fixture leaves the section and the Blank it creates renders as absence —
with no change to what the section says, only to which Fixtures truthfully belong in it.
`deferred` keeps its single ADR 0013 meaning throughout, and a post-Lock removal still
sets it.

---

## User Stories

1. As an Entrant, I want a Fixture FPL has withdrawn from the calendar to vanish from the
   schedule section, so that I never plan around a match that will not be played.
2. As an Entrant, I want the Blank such a withdrawal creates to render as the club's
   absence from that Gameweek's list, so that spec 0006's story 4 holds in the exact case
   that produces most Blanks.
3. As an Entrant, I want a withdrawn Fixture that FPL later restores to reappear under its
   new Gameweek — including the Double it may create there — so that the schedule tracks
   the calendar in both directions.
4. As an operator, I want a never-Locked Fixture FPL has unscheduled gone from the
   `fixtures` table, so that the match track's prediction run and gap alert stop treating
   a phantom row as work.
5. As an auditor, I want a Locked Fixture's row, Predictions, locked Gameweek and
   `deferred` history untouched by its withdrawal, so that ADR 0013's deferral story and
   every recorded fact survive unchanged.
6. As an auditor, I want context bodies already stored and hashed left exactly as they
   are, so that a Prompt Version remains a frozen pair even where an old body listed a
   since-withdrawn Fixture.

### Proving it

7. As a reviewer, I want a never-Locked Fixture verified to be deleted on withdrawal and
   re-inserted under its new Gameweek on restoration, so that deletion is proven safe and
   reversible through the feed.
8. As a reviewer, I want a Locked Fixture verified to keep its Prediction and gain
   `unscheduled` on withdrawal, and to clear it on rescheduling, so that the flag tracks
   the live calendar rather than accumulating like `deferred`.
9. As a reviewer, I want the existing deferral tests untouched and green, so that
   `deferred`'s meaning is proven unchanged.
10. As a reviewer, I want a stored, hashed context body verified to render a withdrawn
    Fixture's Blank as absence, so that the fix is proven at the seam the Entrant reads.

---

## Implementation Decisions

### The split is the Lock's, and the fetch materialises it

Per ADR 0024. The fetch already computes the withdrawn Fixture ids
(`unscheduledFixtureIds` in `src/fpl/fetch-gameweek.ts`); it gains a delete of the
never-Locked rows among them, and the existing post-Lock update marks the Locked ones
`unscheduled = true` alongside the `deferred = true` it already writes. The scheduled-
fixture upsert sets `unscheduled = false`, which is what clears the flag when FPL restores
a date. Deletion is safe by construction: the database refuses a Prediction until its
Fixture is Locked (ADR 0015), and no other table references `fixtures`.

### One column, one migration

`fixtures.unscheduled boolean not null default false`, in the next free migration number.
This deliberately relaxes spec 0006's "nothing new is stored" — that rule is why the fix
could not ship there — but keeps its spirit: no new endpoint, no new fetch, no backfill.
The default is correct for every existing row, because a row FPL had already withdrawn
before this lands is exactly the stale row the next fetch will now delete or mark.

### The schedule read filters, nothing else changes

`schedule` in `src/fpl/fpl-gameweek-context.ts` adds `and not unscheduled` to its read and
drops the doc comment recording the limitation. The section's format, ordering and
six-Gameweek window are untouched — this spec changes which rows are true, not how they
render, so the Prompt Version `fpl/2026-27-v2` does not change.

### Stored bodies stay frozen

Contexts are audit records with no foreign key to `fixtures`. A body stored before a
withdrawal keeps listing the Fixture it truthfully saw; a never-Locked row's deletion
orphans no Prediction and rewrites no stored text. Landing before the first FPL Lock is
what guarantees no FPL-track body is ever stored with a phantom Fixture in it.

## Testing Decisions

Behaviour at existing seams, per the standing rule; no new seam is needed:

- **The fetch seam against a real Postgres** (prior art:
  `test/fetch-fpl-gameweek.test.ts`): withdrawal deletes a never-Locked row; restoration
  re-inserts it under its new Gameweek; withdrawal of a Locked row keeps row and
  Prediction, sets `unscheduled` and `deferred`; rescheduling clears `unscheduled` while
  `deferred` stays true. The existing deferral tests (`:292`, `:378`) run unchanged.
- **The schedule read against a real Postgres** (prior art: the six-Gameweek window
  tests): an unscheduled row is excluded; the club's absence is the Blank.
- **The highest seam proves the whole:** `openFplGameweek` storing a hashed body in which
  a withdrawn Fixture's club appears nowhere in its Gameweek's list — spec 0006's story 4,
  end to end.

## Out of Scope

- **Any annotation of the Blank or the withdrawal.** Absence carries the fact (ADR 0021);
  the section gains no "postponed" marker.
- **`deferred` and the deferral story.** ADR 0013 stands untouched, including a post-Lock
  withdrawal setting the flag.
- **Dashboards, previews and the dry run.** They read `locked_in_gw` and Predictions;
  nothing here changes what they show for played or Locked Fixtures.
- **The match track's context and prediction flow.** They benefit from the deletion (no
  phantom work) without changing.

## Further Notes

**Sequencing is the one hard constraint.** This lands before the season's first FPL Lock,
or spec 0006's stories 3 and 4 are false in production for as long as it waits: the first
withdrawn Fixture would sit in a stored, hashed body under a Gameweek it will not be
played in.

**This spec closes ticket 0006's recorded limitation.** The ticket's note and the doc
comment on the schedule read both point here; the implementing ticket removes the comment
and annotates the note as closed.

**Document numbering was checked at merge time.** ADR 0024, spec 0009 and its ticket file
took the next free numbers after the schedule slice merged; parallel sessions renumber, so
re-check on merge.
