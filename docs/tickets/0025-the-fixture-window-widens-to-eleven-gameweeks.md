# Ticket: The Fixture window widens to eleven Gameweeks

Carried out of
[spec 0022](../specs/0022-the-fixture-window-widens-to-eleven-gameweeks.md), whose source is
[ADR-0046](../adr/0046-the-fixture-window-widens-to-eleven-gameweeks-before-the-first-fpl-lock.md).
Vocabulary: [CONTEXT.md](../../CONTEXT.md) — **Chip**, **Double Gameweek**,
**Blank Gameweek**, **Unscheduled**, **Entrant**.

One ticket rather than several because it cannot be cut and stay green. Changing the
constant reddens the render assertions in three suites at once, and spec 0022's twelfth
user story forbids a commit in which the heading and the body disagree about how far ahead
the section reaches. The blast radius is two source lines, three stale doc comments and
three test files — small enough that expand–contract would be ceremony.

**The gate this ticket sits behind.** Read production for a `contexts` row on track `fpl`
**first, before writing a line**. If one exists the Prompt Version is frozen, ADR-0046 is
void for 2026-27, and this ticket closes unbuilt to wait for v3. No npm script answers
this: `context:show:fpl` builds a fresh context out of the database and never reads the
stored ones, so the check is a direct read of the table — `select count(*) from contexts
where track = 'fpl'`. It was read on 2026-08-20 and returned zero, which is what opens
this ticket. ADR-0046 calls it the first step of the work rather than a formality, so it
is read once more before the first edit; a count that has moved since means the Season
started without us.

**What it costs to not have.** A Chip is a bet on a Gameweek that has not arrived. A
Wildcard is played weeks before the squad it builds is meant to pay; a Bench Boost or a
Triple Captain is aimed at a Double Gameweek FPL announces long before it falls inside six
Gameweeks. At six the context hands an Entrant a Chip decision and hides the Gameweek the
Chip is for. The Fixtures are already stored — the daily fetch writes the whole Season when
it runs without a requested Gameweek — so the context is declining to read rows it already
has.

**Why the clock matters.** ADR-0041's ship-or-freeze rule binds: merged, `fpl:rehearse`
green, and the pre-cron checklist walked before the Lock's cron takes over. The Season's
first FPL Lock is **2026-08-21T17:30Z**, and whatever is frozen when it arrives is the
Season's version. Nobody holds the Season for this — it is a constant and a sentence, and
if it is not ready it is not worth a delayed Lock.

**Blocked by:** None — can start immediately, subject to the production gate above.

- [ ] Production holds no `contexts` row for track `fpl`, read from the table directly
      before any code is written — no npm script reports this. If one exists, stop here
      and close this ticket unbuilt.
- [ ] `SCHEDULE_GAMEWEEKS` reads 11 rather than 6. The schedule query already derives its
      upper bound from the constant, so no read is edited — the window widens because the
      constant did.
- [ ] **Every doc comment that says "the five after it" moves with it**, including the one
      in the file no code edit touches: the constant's own comment and the
      `BuildFplTrackContextOptions.schedule` comment in the context builder, and the
      `schedule()` docstring in the FPL Gameweek context module, whose query is correct
      and whose sentence would be left describing a window it no longer reads.
- [ ] The section heading is **hand-edited** to "Fixtures, this Gameweek and the ten
      ahead:". It stays a literal. The comment above it explaining why it is spelled out
      rather than interpolated stays too, and is the reason the edit is manual — frozen
      text does not get to rewrite itself when a later decision widens a window (ADR-0021,
      reaffirmed by ADR-0046).
- [ ] The constant and the heading move in the same commit, so no archived context can
      exist whose heading and body disagree.
- [ ] **The opening suite's fixture seed extends through Gameweek 13.** It currently ends
      at Gameweek 8, which is where its "a Gameweek too far" edge lives. With the window at
      eleven and the loop opening Gameweek 2, Gameweek 8 falls *inside* the window and that
      edge stops being an edge. Gameweeks 3–13 scheduled with Fixtures stored against them
      makes Gameweek 12 the last one inside and Gameweek 13 the one too far. Without this
      the far edge is untested and the test passes for a window of any length ≥ 7.
- [ ] The Gameweek loop over real Postgres proves the wider window on a body it actually
      stored: Gameweeks `n` through `n + 10` named in order under their headings, and
      **both** edges named — the Gameweek before the window and the Gameweek one past it.
- [ ] The pure render seam asserts the new heading as a whole line, and a schedule shorter
      than eleven Gameweeks still renders as itself with no explanation, which is the
      season's-end case. Its scripted schedule holds six Gameweeks, so at eleven both of
      that suite's window cases become the same case — either widen the script or say in
      the surviving test that the short window is now the only thing this seam proves,
      because the window itself is the query's and is proved over Postgres.
- [ ] The track's opening suite carries the same heading on its stored body. An assertion
      update, not a new case.
- [ ] Nothing asserts on `SCHEDULE_GAMEWEEKS` directly. A test that read the constant back
      would pass for any value and prove nothing about the window an Entrant sees.
- [ ] The existing Unscheduled and Blank cases still pass, their assertions extended to the
      wider window and their statements unchanged: the withdrawn Fixture is absent and
      nothing anywhere says why (ADR-0024, ADR-0018).
- [ ] `npm run context:show:fpl` against production renders eleven Gameweeks under the new
      heading. It calls no Base Model and costs nothing, and it is the only step here that
      reads the real calendar rather than a seeded one.
- [ ] `fpl:rehearse` green over the amended template, and the pre-cron checklist walked,
      before the Lock's cron takes over. The gate is a test result rather than an intention.

## Not in this ticket

Annotating the Doubles and Blanks the wider window now exposes — making them easier to spot
is the point, pointing at them is not (ADR-0018). Deriving the heading from the constant,
which ADR-0021 settled and ADR-0046 reaffirmed. Any new Prompt Version: `fpl/2026-27-v2` is
amended in place, same ten seats, no roster re-entry. Any migration, schema change, or new
fetch path — the rows are already stored. Editing ADR-0021 or spec 0006, both of which are
superseded rather than rewritten. Any Match track change, and any other section of the FPL
context. Reading the real token cost from `attempts.tokens_in`, which is spec 0003's
standing rule and happens after the first Gameweek has run, not as build work here.
