# Ticket: A Team Sheet is readable the moment it is locked

**What to build:** `/fpl/squads` shows the Team Sheets of the latest Gameweek any of them
was locked for, with the points arriving when the Gameweek settles. Source:
[ADR-0048](../adr/0048-the-squads-page-shows-a-team-sheet-from-its-lock.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md) — **Team Sheet**, **Manager State**, **Lock**, **Settled**.

**Blocked by:** None.

**Status:** done

On the day the Season's FPL track opened, seven Team Sheets were locked and the page said
"Team Sheets appear once a Gameweek has been scored". It would have said it for five days.
The Sheets are the decisions this benchmark exists to record, and they are complete the
moment the Lock stores them.

- [x] The Gameweek the page shows is the latest one `manager_states` holds a row for, read
      from the states and not from a deadline — an action run by hand before a deadline
      stores a Sheet, and the Sheet is a fact as soon as it exists.
- [x] A Gameweek with no settled player points serves every Sheet whole — the fifteen, the
      armband, the formation, the Selling Prices, the bank — with the points null.
- [x] `FplSquadPlayer.points` admits null, and its comment says which state that is.
- [x] The guard that refuses a settled Gameweek missing one player's points is kept and
      aimed where it was: it fires when the Gameweek has settled and one player is missing,
      not when nobody has points at all. The two are told apart by whether the Gameweek has
      any settled player points.
- [x] The header's word follows the data: `GW2 locked` until the points exist, `GW2 settled`
      after. The ranking's header is untouched, because a ranking is what settling produces.
- [x] The page renders a null point as the view's own dash rather than a nought — nought is
      a return, and a player who has not kicked a ball has not had one.
- [x] The pre-Season block says what it now means: no Team Sheet locked yet, rather than no
      Gameweek scored yet.
- [x] Tests: a Gameweek locked and unscored serves whole Sheets with null points; a settled
      Gameweek missing one player's points still refuses; the existing Free Hit, Hit and
      Roll Over fixtures still read their own Gameweek.

## What the work turned up

**`manager_states` is insert-only, enforced by a trigger** (`before update or delete`,
migration 0001). Three fixtures had been rewinding a Season by deleting `scores` past a
Gameweek while leaving the Manager States of the Gameweek after it — a hybrid world that
was invisible while the page read the settled Gameweek and became the whole question once
it read the locked one. They could not be fixed by deleting the states, because the record
refuses it.

So `seedSeason` gained `fplThrough`: the last FPL Gameweek to write a Manager State for. A
suite that wants Gameweek 4's Sheet stops the seed there rather than deleting back to it,
which is the difference between describing a moment in the Season and editing one.

## Not in this ticket

**A Gameweek picker**, so a reader can go back to a settled Sheet after the next one locks.
Weighed in ADR-0048 and left: it needs a parameter on the endpoint and a control on the
page, and nobody has asked for last week's Sheet yet.

**The leaderboard and the Entrant record.** Both are about what settling produced, and both
correctly wait for it.

**Partial coverage.** If a manual run stored a Sheet for some seats and not others, the page
would show that Gameweek with the rest blank. No run does that today — the Lock writes the
whole board or none of it — and the day one might, it is a decision about what a half-locked
Gameweek means rather than a rendering detail.
