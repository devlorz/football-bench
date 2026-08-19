# The packet names who picks each team, not only who changed

ADR-0044 admitted Head Coach changes and refused the incumbents, on this reason: "A
current-coach-per-club shape (twenty club pages, or a list page) was rejected: more
fetching for a weaker signal." The first half of that is false. Every season article the
Head Coach fetch already reads carries a per-club table naming all twenty managers — the
Premier League's under "Personnel and kits", La Liga's under "Personnel and sponsorship" —
so the incumbents are in bytes this pipeline archives today, and the cost is a second
parser rather than a second fetch. The rejection stands on nothing.

The second half is wrong for a reason ADR-0044 never weighed. The Season Roster is ten
Base Models with ten different training cutoffs, and who holds a job is exactly the fact
that moves with a cutoff. Where the packet is silent, one Entrant answers knowing who
picks the team and another does not, and the difference between their Predictions is the
recency of their training data rather than the forecasting this benchmark exists to
measure — a confound, not a signal. The changes table does not close this: it covers the
current Season only, so a Head Coach appointed mid-2025-26 is absent from it and absent
from an older model's memory alike. Alavés is the live case as this is written: Quique
Sánchez Flores has been in post since before this Season, the changes table has no row
for him, and nothing in the packet names him at all.

So the match context states each club's **Head Coach** outright, and the changes stay
where they are, beneath the incumbent that they explain.

## The section is one, and always populated

Both clubs' current Head Coach every time, with that club's changes under it where the
Season has any. One section and not two, because an Entrant is answering one question —
who picks this team, and did that recently change — and splitting it across two headings
makes it read two places to assemble one fact.

This dissolves the empty heading the changes section renders today, where neither club has
changed: every club has a Head Coach, so no packet reaches a reader with a heading and
nothing under it.

**Should this not land before the freeze**, the empty heading survives the Season and must
be fixed on its own terms: the section says `none recorded`, the phrase the Squad Changes
section already uses for a direction with nothing in it. Not "neither club has changed" —
that sentence asserts a fact about football and is false whenever a fetch has not landed,
as it silently was on 2026-08-19 between the migration and the first fetch. `none
recorded` describes the record instead of the world and is true in both states, which is
the property the packet needs and the reason the phrase already exists.

## What the incumbents cost that the changes did not

- **A second table shape, in two dialects.** The two articles name the section
  differently and write it differently: La Liga wraps its cells in `{{nobreak}}`, the
  Premier League does not, and neither dialect is one `cellSource` reads today. The shared
  `wikipedia/wikitext` module must learn it, which puts the edit under Squad Changes as
  well — so it lands with assertions of its own, the lesson the first extraction taught
  when it shipped widened and unpinned.
- **A weaker leakage guarantee, made checkable.** A change carries `dated_on` and a
  trigger refuses one dated after the Lock. The incumbents table carries no dates at all;
  it is the page's present tense. So the guarantee drops from "this fact is dated before
  the Lock" to "this row was stored before the Lock", and that must be enforced against
  the stored instant rather than assumed from the fetch's schedule.
- **Its own partition.** A new store beside `head_coach_changes` rather than a column
  within it: the existing rows are events with a direction and a date, an incumbent has
  neither, and folding them together would put a direction filter on every read of both.

## Consequences

- **CONTEXT.md splits the term.** **Head Coach** becomes the person in post; **Head Coach
  Change** is the event. The two now have separate stores, separate lines in the packet,
  and separate meanings of absence — no incumbent is a Gap, no change is ordinary.
- **The timing is bound to the earliest restarted Lock, not to a date.** A context stored
  under a restarted Prompt Version freezes it (ADR-0026), and both Competitions are asked
  one question (ADR-0038). If this lands before the first of the restarted Locks it is
  part of those versions; if it does not, it waits for the next version boundary and takes
  both Competitions there together. What is not available is landing it for one
  Competition whose Lock falls later — that is the split ADR-0038 refuses.
- **Both sha pins move whenever it lands**, and they are re-taken from real renders, not
  from a test's.
- ADR-0044 is not withdrawn. Its term, its source, its events shape and its cutoff
  discipline all stand; what falls is one sentence of its rejected options.
