# Ticket: The one figure in the strip that is about next week

**What to build:** The Team Sheet stat strip names the Gameweek its Free Transfer count
belongs to, so a reader stops taking a figure about next week as a figure about the week on
screen. Vocabulary: [CONTEXT.md](../../CONTEXT.md) — **Manager State**, **Transfer**,
**Gameweek**.

**Blocked by:** None.

On the day the 2026/27 FPL track locked its opening Gameweek, every Team Sheet's strip read
`GW1 POINTS —  ·  SEASON TOTAL —  ·  SQUAD VALUE £99.0  ·  IN THE BANK £1.0  ·
FREE TRANSFERS 1  ·  CHIP None`. The real game grants no Free Transfer for the Gameweek an
Entrant opens in; the first one arrives for the Gameweek after. The page appears to say
otherwise.

Nothing behind the page is wrong. A Manager State is what an Entrant carries *between*
Gameweeks, and its Free Transfer count is what the next Gameweek opens with — the reducer's
own comment says so in those words, and the opening Gameweek's stored `1` is pinned by a
test whose comment states the rule the page seems to break. The Entrant-facing context
reads the count off the *previous* Gameweek's row and so shows each Entrant the allowance it
actually has. One place reads it forward and labels it as though it were not: the strip,
where five of the six cells are facts about the Gameweek in the heading and the sixth is a
fact about the one after it, all six in the same row of the same size in the same words.

The fix is the label, not the figure. The strip already knows its Gameweek — the first cell
spells `GW1 points` with it — so the count can name its own.

- [ ] The Free Transfers cell names the Gameweek the count opens rather than the Gameweek
      the strip is headed by, in the strip's own spelling of a Gameweek and short enough to
      sit in a six-cell row.
- [ ] The last Gameweek of a Season is answered rather than left to the arithmetic. There is
      no Gameweek 39 for GW38's count to open, and a cell promising one would be the page's
      new untrue sentence. Whatever the answer is — the tag dropped, the cell dashed, the
      count still shown under a plain word — the ticket makes it deliberately and says why
      in a comment.
- [ ] The pre-Season strip, whose Gameweek is null, keeps a label that reads as English
      rather than one with a hole where a number goes.
- [ ] The figure itself is untouched: no migration, no change to what `/fpl/squads` serves,
      no change to the reducer. The opening-Gameweek test that pins the stored `1` passes
      unedited, and so does every Manager State test around it.
- [ ] [ADR-0033](../adr/0033-the-fpl-track-joins-the-dashboard-as-its-own-section-under-fpl.md)
      records this as the twelfth deviation from the design handoff, which labels the cell
      plainly `Free transfers`. The reason is the one above: the handoff's prototype data
      never had an opening Gameweek in it, so the label was never read against the one week
      where the count and the heading disagree by the whole of the game's rule.
- [ ] Tests: the view test asserts the new label against a mid-Season Gameweek, the opening
      Gameweek, the last Gameweek of the Season, and the pre-Season null.

## Not in this ticket

**Reading the count off the previous Gameweek's row.** It looks like the tidier fix — every
cell would then be about the Gameweek on screen — and it is worse in the one place that
prompted this ticket: the opening Gameweek has no row behind it, so the cell would read `0`,
and nought is not what the opening Gameweek grants either. The opening is unlimited
Transfers, which is a third thing the cell has no way to say. It also contradicts what the
strip is for: [spec 0014](../specs/0014-fpl-track-dashboard.md) story 17 defines it as the
Manager State behind the Sheet, and the Manager State is the row at that Gameweek.

**Saying "unlimited" at the opening Gameweek.** The strip would then need to know that a
Gameweek is an opening, which the endpoint currently neither serves nor needs to — the
reducer reads it off an empty Squad, not off the calendar (ADR-0003). Worth doing the day a
reader asks what the opening allowance was; not worth a field for a label.
