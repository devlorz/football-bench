# The squads page shows a Team Sheet from its Lock, not from its settlement

`/fpl/squads` read the latest **Settled** Gameweek. On the day the Season's FPL track
opened — seven Team Sheets locked, fifteen players apiece, every one of them a decision a
Base Model had just made — the page said "Team Sheets appear once a Gameweek has been
scored" and showed nothing, and would have gone on saying it for the days between the Lock
and the settlement. That is the stretch a reader most wants to look at: the picks are made,
the matches have not been played, and nobody yet knows who was right.

So the page shows the Team Sheets of the **latest Gameweek any of them was locked for**,
and the points beside them arrive when the Gameweek settles.

## What decides which Gameweek

The latest Gameweek `manager_states` holds a row for, and not the latest deadline that has
passed. The two usually agree and the difference is the point: an action run by hand before
a deadline stores a Manager State, and the Sheet it stored is a fact about the Season the
moment it exists. A page keyed on the deadline would hold it back for no reason a reader
could name.

Read against the four states the Season actually moves through:

| | The page shows |
|---|---|
| Gameweek locked, not yet played | that Gameweek's Sheets, every point a dash |
| Gameweek settled | that Gameweek's Sheets with their points |
| Next Gameweek locked | the next Gameweek's Sheets, points blank again |
| Next Gameweek's action run by hand before its deadline | the next Gameweek's Sheets, at once |

**The previous Gameweek's points leave the page when the next Sheet is locked.** That is
accepted rather than overlooked: this screen is "Latest squads", spec 0014 describes it as
"the Team Sheet each Entrant locked for the current Gameweek", and the Gameweek's returns
are what the leaderboard and the Entrant record are for. A screen that showed last week
because this week has no points yet would be answering a question the other two already
answer.

## What it costs, and what it does not

`FplSquadPlayer.points` was `number` and documented as never null, on the reasoning that a
Gameweek settles for every player on a Sheet or not at all. It is `number | null` now, and
the guard that reasoning produced is kept exactly where it was aimed: at a Gameweek that
*has* been scored, a player on a Sheet with no points row is still a broken record and the
read still refuses it. What tells the two apart is whether the Gameweek has any settled
player points at all — none is a Gameweek that has not settled, and every one is a Gameweek
that has.

The header stops saying `settled` over a Gameweek nobody has scored: the word follows the
data, `GW2 locked` until the points exist. The ranking still says settled, because a
ranking is what settling produces.

## Considered options

- **Showing the latest settled Gameweek, and the latest locked one only while nothing has
  settled**, was rejected. It fixes the empty page on the Season's first day and leaves
  every later Lock waiting, which is the same complaint five days later; and it makes the
  rule two rules, chosen by a state a reader cannot see.
- **Gating on the deadline rather than on the stored state** was rejected: it would hide a
  Sheet that exists, and the run that stores one by hand before a deadline is a real path
  (ADR-0011's manual close).
- **A Gameweek picker on the page**, so both the locked Sheet and the settled one are
  reachable, was not rejected on merit — it is simply larger than this decision, needing a
  parameter on the endpoint and a control on the page. The day a reader asks for last
  week's Sheet, that is the shape to build.
- **Leaving it as it was** was rejected by the day it was found: a public page that says
  nothing for five days about a Season that has begun is not reporting the Season.
