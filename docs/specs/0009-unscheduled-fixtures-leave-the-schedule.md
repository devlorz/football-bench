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

When FPL postpones a Fixture without naming a new date, it withdraws the Fixture from its
calendar, and the fetch records nothing about the withdrawal. The stored row keeps the
Gameweek and kickoff it had, so the FPL context's schedule section lists a match that will
not be played under a Gameweek it will not be played in — and the Blank Gameweek the
withdrawal creates, the fact a Chip decision most needs, never renders as absence. Ticket
0006's schedule slice recorded this as its one known limitation, unfixable where the
schedule is read: a never-Locked stale row is indistinguishable from a scheduled one, and
`deferred` cannot stand in for "off the calendar" because it is monotone and also marks
Fixtures legitimately moved to a new Gameweek. The stale rows leak beyond the context: the
match track selects its prediction work through the same rows, so a phantom never-Locked
Fixture is predicted, and gap-alerted, as if the match were still to be played.

## Solution

The fetch tells an Unscheduled Fixture from a scheduled one, split on the Lock as ADR 0024
decides. A never-Locked Fixture FPL withdraws is deleted — nothing refers to it, and the
feed rebuilds it if FPL restores it. A Locked Fixture FPL withdraws keeps everything it
has — row, Predictions, locked Gameweek, `deferred` history — and is marked Unscheduled,
a live fact of the calendar that FPL naming a new date clears. The schedule read excludes
Unscheduled Fixtures, so a withdrawn match leaves the section, the Blank it creates
renders as a club's absence, and a restoration reappears under its new Gameweek — with no
change to what the section says, only to which Fixtures truthfully belong in it.

---

## User Stories

### The schedule tells the truth

1. As an Entrant, I want a Fixture FPL has withdrawn from the calendar to vanish from the
   schedule section, so that I never weigh a Transfer or captaincy on a match that will
   not be played.
2. As an Entrant, I want the Blank a withdrawal creates to render as the club's absence
   from that Gameweek's list, so that spec 0006's story 4 holds in the exact case that
   produces most Blanks.
3. As an Entrant, I want a withdrawn Fixture FPL later restores to reappear under its new
   Gameweek, so that the schedule tracks the calendar in both directions.
4. As an Entrant, I want the Double a restoration may create to render as the club
   appearing twice in its new Gameweek, so that Chip timing reads off the same raw list as
   ever.
5. As an Entrant, I want no "postponed" or "withdrawn" annotation anywhere, so that
   absence and repetition keep carrying the facts themselves, as ADR 0021 promises.
6. As an Entrant, I want the section's shape — six Gameweeks, kickoff order, home side
   first — unchanged, so that honesty costs no readability.

### The write path stays sane

7. As an operator, I want a never-Locked Fixture FPL withdraws gone from the stored
   schedule, so that the match track's prediction run stops treating a phantom row as
   work.
8. As an operator, I want the gap alert to stop naming a withdrawn, never-Locked Fixture,
   so that a page about a match that will never be played cannot happen.
9. As an operator, I want the fix to read only the fixtures feed the fetch already
   consumes, so that no new endpoint, no new fetch and no backfill enter the write path.
10. As an operator, I want observing the same withdrawal on every subsequent fetch to be a
    no-op, so that the daily cadence stays idempotent and manually re-runnable.
11. As an operator, I want a Fixture wrongly reported withdrawn by a transient feed glitch
    to heal itself, so that the next fetch rebuilds from the feed what the glitch removed.

### Nothing recorded is disturbed

12. As an auditor, I want a Locked Fixture's row, Predictions and locked Gameweek
    untouched by its withdrawal, so that the record of play survives whatever the calendar
    does.
13. As an auditor, I want `deferred` to keep its single meaning — was moved off its locked
    Gameweek after the Lock, monotone, per ADR 0013 — and a post-Lock withdrawal to still
    set it, so that no existing read of the flag changes truth value.
14. As an auditor, I want Unscheduled to mean the live calendar — set by withdrawal,
    cleared by rescheduling — so that the two flags answer different questions instead of
    one flag answering both badly.
15. As an auditor, I want every context body already stored and hashed left byte-for-byte
    alone, so that a Prompt Version remains a frozen pair even where an old body listed a
    since-withdrawn Fixture.

### Proving it

16. As a reviewer, I want a never-Locked Fixture verified to be deleted on withdrawal and
    re-inserted under its new Gameweek on restoration, so that deletion is proven safe and
    reversible through the feed.
17. As a reviewer, I want a Locked Fixture verified to keep its Prediction and gain the
    Unscheduled mark on withdrawal, and to clear it on rescheduling while `deferred` stays
    true, so that the flag's liveness is proven against `deferred`'s monotonicity.
18. As a reviewer, I want the existing deferral tests untouched and green, so that ADR
    0013's behaviour is proven unchanged rather than described as unchanged.
19. As a reviewer, I want the schedule read verified to exclude an Unscheduled Fixture
    against a real database, so that the filter is proven where it runs.
20. As a reviewer, I want a stored, hashed context body verified to show the withdrawn
    Fixture's club nowhere in its Gameweek's list, so that the fix is proven at the seam
    the Entrant actually reads.

---

## Implementation Decisions

### The split is the Lock's, and the fetch materialises it

Per ADR 0024, the boundary the schema already draws. The fetch already isolates the
withdrawn Fixture ids each run; it gains a deletion of the never-Locked rows among them,
and the same post-Lock pass that today sets `deferred` also marks the Locked ones
Unscheduled. Like `deferred` under ADR 0013, the fact is materialised by the fetch, never
derived at read time — so schedule reads stay a plain filter, at the cost of depending on
a successful fetch, a dependency the daily cadence already carries.

### One column, one migration

`fixtures` gains `unscheduled`, boolean, not null, default false, in the next free
migration number. The default is correct for every existing row: a row FPL had already
withdrawn before this lands is exactly the stale row the next fetch will now delete or
mark. This deliberately relaxes spec 0006's "nothing new is stored" — that rule is why the
fix could not ship there — while keeping its spirit: no new endpoint, no new fetch, no
backfill.

### Unscheduled is live; `deferred` is history

Rescheduling clears the Unscheduled mark — the ordinary upsert of a scheduled Fixture
writes it false — because the flag reports the calendar as it stands, and a restored
Fixture must rejoin the schedule it rejoined. `deferred` is untouched in both directions:
a post-Lock withdrawal still sets it, and nothing ever clears it. The two flags answer
different questions, which is the whole decision.

### Deletion is safe by construction

The database refuses a Prediction until its Fixture is Locked (ADR 0015), so a
never-Locked row can have none; no other table holds a foreign key to the fixtures table;
and stored contexts are audit records keyed without reference to it, so a deletion orphans
no Prediction and rewrites no stored text. What deletion buys over flagging is that every
reader — the schedule, the prediction run, the gap alert — is right by default instead of
right only if it remembers a filter.

### The schedule read filters, and nothing else changes

The six-Gameweek read adds the Unscheduled exclusion and retires the doc comment that
recorded the limitation. Format, ordering and window are untouched: this spec changes
which rows are true, not how they render, so the Prompt Version `fpl/2026-27-v2` does not
change and no new freeze is needed.

## Testing Decisions

A good test asserts external behaviour at an existing seam — what the fetch leaves in the
database, what a stored context body says — never the private steps that produced it. No
new seam is introduced; the three existing ones cover the whole:

- **The fetch seam against a real Postgres** (prior art: the FPL fetch tests, including
  the two deferral tests this spec must leave green): withdrawal deletes a never-Locked
  row; restoration re-inserts it under its new Gameweek; withdrawal of a Locked row keeps
  row and Prediction, sets Unscheduled and `deferred`; rescheduling clears Unscheduled
  while `deferred` stays true; a repeated withdrawal observation is a no-op.
- **The schedule read against a real Postgres** (prior art: the six-Gameweek window
  tests): an Unscheduled row is excluded; the club's absence is the Blank.
- **The highest seam proves the whole:** `openFplGameweek` driven through HTTP and
  Postgres, asserting on a stored, hashed body in which the withdrawn Fixture's club
  appears nowhere in its Gameweek's list — spec 0006's story 4, end to end. Prior art:
  spec 0006's converging test.

## Out of Scope

- **Any annotation of the Blank or the withdrawal.** Absence carries the fact (ADR 0021);
  the section gains no marker of any kind.
- **`deferred` and the deferral story.** ADR 0013 stands untouched, including a post-Lock
  withdrawal setting the flag and its monotonicity.
- **Dashboards, previews and the dry run.** They read Locks and Predictions; nothing here
  changes what they show for played or Locked Fixtures.
- **The match track's context and prediction flow.** Both benefit from the deletion — no
  phantom work, no phantom gap — without a line of them changing.
- **Kickoff times and provisional dates.** A withdrawn Fixture has no date; when FPL
  assigns one, the ordinary schedule update handles it.

## Further Notes

**Sequencing is the one hard constraint.** This lands before the season's first FPL Lock,
or spec 0006's stories 3 and 4 are false in production for as long as it waits: the first
withdrawn Fixture would sit in a stored, hashed body under a Gameweek it will not be
played in, and a frozen pair is never edited after use.

**This spec closes ticket 0006's recorded limitation.** The ticket's note and the doc
comment on the schedule read both point here; the implementing ticket removes the comment
and annotates the note as closed.

**Document numbering was checked at merge time.** ADR 0024, spec 0009 and its ticket file
took the next free numbers after the schedule slice merged; parallel sessions renumber, so
re-check on merge.
