# Spec 0022 — The Fixture window widens to eleven Gameweeks

`SCHEDULE_GAMEWEEKS` goes from 6 to 11 — this Gameweek and the ten ahead — and the section's
frozen heading is rewritten by hand to match. Same Prompt Version `fpl/2026-27-v2`, amended
in place through the door ADR-0026 holds open for a version no context has used. Source of
every decision here:
[ADR-0046](../adr/0046-the-fixture-window-widens-to-eleven-gameweeks-before-the-first-fpl-lock.md).
Vocabulary: CONTEXT.md — **Chip**, **Double Gameweek**, **Blank Gameweek**, **Unscheduled**.

Like [spec 0019](0019-amending-fpl-2026-27-v2-before-its-first-use.md), this one exists
under a deadline and ships under ADR-0041's **ship-or-freeze rule**. The Season's first FPL
Lock is **2026-08-21T17:30Z**. Whatever is frozen when the Lock arrives is the Season's
version. Nobody holds the Season for this — it is a constant and a sentence, and if it is
not ready it is not worth a delayed Lock.

Spec 0006's six-Gameweek sentences are superseded by this spec rather than edited, the same
way ADR-0046 supersedes ADR-0021 rather than amending it. They are, in full: its Solution
paragraph ("the current Gameweek and the five after it"), user story 2 ("the five Gameweeks
ahead"), user story 5 ("read six Gameweeks without untangling them"), user story 23 ("within
the six-Gameweek window"), its implementation decision "The schedule is raw and six
Gameweeks wide", and its testing note naming the six-Gameweek fixture window. Its user
stories 3 and 4 — the Double read off repetition, the Blank read off absence — are not
superseded by anything here: they say what the section refuses to annotate, and a wider
window does not touch that.

## Problem Statement

The FPL context shows an Entrant this Gameweek and the five after it, and then stops. That
window is shorter than the decision it was built to inform.

A Chip is a bet on a Gameweek that has not arrived. A Wildcard is played weeks before the
squad it builds is meant to pay. A Bench Boost or a Triple Captain is aimed at a Double
Gameweek that FPL announces long before it falls inside six Gameweeks. So the Entrant is
handed a Chip decision and shown a schedule that ends before the Gameweek the Chip is for —
it can see that it holds a Wildcard, and cannot see the fixture run that would justify
spending it. The same blindness applies to a Blank Gameweek: the Entrant cannot plan around
a week its players do not play until that week is nearly here.

The data is not missing. The daily fetch already stores the whole Season's Fixtures. The
context simply declines to read them.

Once the Season's first Lock stores a context, `fpl/2026-27-v2` freezes and the Entrants
spend a full Season making Chip decisions blind to the Gameweeks they are for.

## Solution

Widen the window to **eleven Gameweeks — this Gameweek and the ten ahead** — inside the same
Prompt Version, before its first use.

Nothing else about the section moves:

- The lines stay raw. One Fixture per line, under the Gameweek heading it belongs to.
- A club with two lines in a Gameweek still has a Double and a club with none still has a
  Blank, and **neither is annotated** (ADR-0018, ADR-0021). The wider window makes them
  easier to spot; reading them off the list is still the Entrant's work.
- An Unscheduled Fixture is still off the calendar and so out of the window, and the Blank
  that leaves still carries the fact by itself (ADR-0024).
- Near the season's end the window is simply whatever the calendar still holds — fewer
  Gameweeks, and the section shorter without saying why.

The section heading is rewritten **by hand**, from "this Gameweek and the five ahead" to
"this Gameweek and the ten ahead". It is not derived from the constant, and ADR-0021's
reason for that stands: this text is half of a frozen Prompt Version, and a sentence that
rewrote itself when a later decision widened a window would change a frozen pair without
anyone deciding to. Rewriting it by hand is what makes this a deliberate edit.

Same version string, same ten seats, no roster re-entry.

## User Stories

### Seeing the Gameweek a Chip is for

1. As an Entrant, I want the schedule to reach ten Gameweeks ahead of this one, so that a
   Chip I am deciding to play now can be aimed at a Gameweek I can actually see.
2. As an Entrant holding a Wildcard, I want the fixture run of the squad I would build to
   be visible when I build it, so that the rebuild is priced against real Fixtures rather
   than a guess about what comes after the window.
3. As an Entrant holding a Bench Boost or a Triple Captain, I want a Double Gameweek FPL
   has already announced to appear in my schedule while the Chip is still unspent, so that
   the timing decision is made against the calendar rather than against memory.
4. As an Entrant, I want a Blank Gameweek two months out to be visible in the list, so that
   I can plan Transfers toward it instead of discovering it the week it lands.
5. As an Entrant, I want the ten Gameweeks ahead to arrive as raw Fixture lines with no
   Double or Blank pointed out, so that the reading is still mine to do and the context has
   not quietly started analysing for me.
6. As an Entrant, I want each Gameweek in the wider window to carry its own heading and its
   Fixtures under it in kickoff order, so that a longer list stays as readable as the short
   one was.
7. As an Entrant in the last Gameweeks of the Season, I want the window to be whatever the
   calendar still holds, so that the section shortens on its own rather than claiming
   Gameweeks that do not exist.
8. As an Entrant, I want an Unscheduled Fixture to stay out of the wider window exactly as
   it stayed out of the narrow one, so that widening the horizon does not resurrect matches
   FPL has withdrawn.
9. As an Entrant, I want the wider window to contain the Premier League's Fixtures only, so
   that a longer read does not start handing me another Competition's calendar.

### The heading tells the truth

10. As an Entrant, I want the section heading to say "this Gameweek and the ten ahead", so
    that the sentence introducing the list describes the list I was given.
11. As a maintainer, I want that heading to be a hand-edited literal rather than a phrase
    interpolated from `SCHEDULE_GAMEWEEKS`, so that frozen text cannot rewrite itself when a
    later decision widens a window.
12. As an analyst, I want the widened heading and the widened window to change together in
    one commit, so that no archived context can exist whose heading and body disagree about
    how far ahead it reaches.

### The amendment window

13. As a maintainer, I want the first step of the work to be checking whether production
    holds a `contexts` row for track `fpl`, so that I learn the version is already frozen
    before I write a line rather than after.
14. As a maintainer, I want ADR-0046 and this spec both void for 2026-27 if such a row
    exists, so that a frozen Prompt Version is never amended underneath a Season already
    using it.
15. As a maintainer, I want the widening to ship under ADR-0041's ship-or-freeze gate —
    merged, `fpl:rehearse` green, the pre-cron checklist walked before the Lock's cron takes
    over — so that the Season is not held for a constant and a sentence.
16. As a maintainer, I want the Prompt Version string to stay `fpl/2026-27-v2`, so that the
    amendment does not force a roster re-entry for a change of this size.

### Cost and the data behind it

17. As an operator, I want the wider window to cost no new fetch and no new stored data, so
    that the change is a `between` in one query against rows the daily fetch already writes.
18. As an operator, I want the real token cost read from `attempts.tokens_in` after the
    first Gameweek rather than estimated in advance, per spec 0003's standing rule, so that
    the figure on record is measured.
19. As an operator, I want the added cost to be roughly fifty Fixture lines and five
    Gameweek headings against a context already near 26k tokens, so that the widening is
    understood as a few percent rather than a doubling.

### Proving it

20. As a maintainer, I want the rendered heading asserted as a whole line, so that a drifted
    sentence fails as itself rather than as a substring.
21. As a maintainer, I want the eleven-Gameweek window proved on a body the Gameweek loop
    actually stored, so that the constant is shown driving the real query rather than only
    the pure renderer.
22. As a maintainer, I want both edges of the wider window named — the Gameweek just played
    and gone, and the Gameweek one too far — so that the window is proved bounded on both
    sides and not merely long.
23. As a maintainer, I want the existing Unscheduled and Blank assertions to keep passing
    unchanged in substance, so that widening the window is shown not to have disturbed what
    the section refuses to say.
24. As a maintainer, I want `fpl:rehearse` green over the amended template before merge, so
    that the ADR's gate is a test result rather than an intention.

## Implementation Decisions

### The change is one constant and one sentence

`SCHEDULE_GAMEWEEKS` in the FPL track's context builder goes from `6` to `11`. The query
that reads the schedule already derives its upper bound from the constant, so no read is
edited: the window widens because the constant did.

Three doc comments say "the five after it" and all three move with the constant — the
constant's own, the `schedule` field's on `BuildFplTrackContextOptions`, and the
`schedule()` docstring in the FPL Gameweek context module. The third is the one to
remember: that module's query is correct at any width and its code is untouched, which is
exactly how a sentence describing a six-Gameweek window survives a change to eleven.

The section heading is a literal in the context builder and is edited by hand to "Fixtures,
this Gameweek and the ten ahead:". The comment above it — explaining why it is spelled out
rather than interpolated — stays and is the reason the edit is manual. Do not replace the
literal with a template built from the constant; ADR-0021 settled that and ADR-0046
reaffirmed it.

### Nothing about the section's shape moves

Raw lines, one per Fixture, grouped under `Gameweek N` headings, ordered by Gameweek then
kickoff then fixture id. No Double or Blank annotation. Kickoff still renders as the date
alone. The `not unscheduled` filter and the `competition = 'PL'` filter stay exactly as
they are. A window the calendar has run out of still carries fewer Gameweeks and says
nothing about it.

### Nothing new is fetched and nothing new is stored

The daily fetch already stores the whole Season's Fixtures when it runs without a requested
Gameweek. The wider read finds rows that are already there. No migration, no schema change,
no new column, no new fetch path.

### The Prompt Version does not change

`fpl/2026-27-v2` is amended in place. No new version string, no roster re-entry, no seat
churn. The freeze that moves is the render tests, which are the FPL track's pin.

### The gate is a precondition, not a step

Before any code is written, read production for a `contexts` row on track `fpl`. If one
exists the version is frozen, this spec is void for 2026-27, and the widening waits for v3.
No npm script answers this — `context:show:fpl` builds a fresh context out of the database
and never reads the stored ones — so the check is a direct read of the table. It was read on
2026-08-20 and returned zero, which is what lets this spec exist; it is read once more
before the first edit, because the fact it establishes has an expiry date of
2026-08-21T17:30Z.

## Testing Decisions

### What makes a good test here

A test drives the seam the way the run does and asserts on what an Entrant or the record
would see — the exact rendered line, the stored body. Render assertions compare whole lines
joined together, the existing suite's own style, so a drifted sentence fails as itself and
not as a substring. Nothing asserts on `SCHEDULE_GAMEWEEKS` directly: a test that read the
constant back would pass for any value and prove nothing about the window an Entrant sees.

### What gets tested, at which seam

No new seams. Both changes land on seams the suite already drives, and the work is to widen
what those seams assert.

- **The pure render seam** — the FPL track context builder's own suite. The heading line as
  an expected string, and a schedule shorter than eleven Gameweeks rendering as itself with
  no explanation, which is the season's-end case. Its scripted schedule holds six Gameweeks,
  so at eleven both of that suite's window cases become the same case. Either the script
  widens or the surviving test says outright that a short window is all this seam proves —
  the window is the query's, and it is proved over Postgres.
- **The Gameweek loop over real Postgres** — the opening-a-Gameweek suite. A seeded schedule
  is read through the real query onto a stored `contexts` body, and the assertion names
  Gameweeks `n` through `n + 10` in order under their headings. Both edges are named: the
  Gameweek before the window, and the Gameweek one past it.
- **The track's opening** — the start-the-track suite, whose stored body carries the same
  heading. An assertion update, not a new case.
- **The existing Unscheduled and Blank cases** — kept, with their assertions extended to the
  wider window. Their statements do not change: the withdrawn Fixture is absent and nothing
  says why.

### The fixture seed has to grow

The opening suite's seeded schedule currently ends at Gameweek 8, which is where its
"a Gameweek too far" edge lives. With the window at eleven and the loop opening Gameweek 2,
Gameweek 8 falls *inside* the window and that edge stops being an edge. The seed extends
through **Gameweek 13** — Gameweeks 3–13 scheduled and Fixtures stored against them — so
that Gameweek 12 is the last one inside and Gameweek 13 is the one too far. Without this,
the far edge is untested and the test passes for a window of any length ≥ 7.

### Prior art

The FPL track context builder's suite is the pattern for the render strings; the
opening-a-Gameweek suite for the seeded-Postgres tracer and its two-edge assertion style;
the rehearsal suite for the gate.

## Out of Scope

- **Annotating the Blanks and Doubles the wider window now exposes.** Rejected in ADR-0046.
  Making them easier to spot is the point; pointing at them is not (ADR-0018).
- **The whole remaining season.** Rejected, as in ADR-0021. At Gameweek 1 that is 380
  Fixture lines describing a squad the Entrant will have turned over twice, in a section
  whose size is an accident of the date.
- **Deriving the heading from the constant.** Rejected; ADR-0021 settled it and ADR-0046
  reaffirmed it.
- **A v3 of the Prompt Version.** This is an in-place amendment before first use.
- **Editing ADR-0021 or spec 0006.** Both are superseded in place by ADR-0046 and this spec
  respectively. A record that grows after merge stops being a record.
- **Any Match track change.** The Match track's own fixture horizon is untouched.
- **Widening any other section of the FPL context.** Only the schedule moves.
- **Defending eleven to the token.** Eleven is a judgment, not a derivation: it covers a
  Wildcard played for a Double roughly two months out and stops short of describing a squad
  that no longer exists.

## Further Notes

### Order of work, against a real clock

1. Read production for a `contexts` row on track `fpl`. If one exists, stop — the version is
   frozen and this spec is void for 2026-27.
2. Change the constant and the heading literal in one commit.
3. Extend the opening suite's fixture seed through Gameweek 13 and widen the window
   assertions, both edges.
4. Update the pure render and track-opening assertions to the new heading.
5. `npm run context:show:fpl` against production: eleven Gameweeks under the new heading,
   read off the real calendar rather than a seeded one. It calls no Base Model and costs
   nothing.
6. `fpl:rehearse` green, pre-cron checklist walked, merged before **2026-08-21T17:30Z**.

If step 6 cannot be reached before the Lock, the Season freezes at six and the widening
waits for v3. Nobody holds the Season for this.

### What to verify early

That production holds no FPL context. Everything else in this spec is cheap; that one fact
decides whether the spec exists at all, and ADR-0046 calls checking it the first step of the
work rather than a formality.

### The real cost lands after the first Gameweek

Roughly fifty additional Fixture lines and five additional Gameweek headings, against a
context ADR-0020 already put near 26k tokens — on the order of 3%. Per spec 0003's standing
rule the figure that goes on record is read from `attempts.tokens_in` after the first
Gameweek, not the estimate above.
