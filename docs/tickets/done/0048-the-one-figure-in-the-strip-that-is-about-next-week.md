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

- [x] The Free Transfers cell names the Gameweek the count opens rather than the Gameweek
      the strip is headed by, in the strip's own spelling of a Gameweek and short enough to
      sit in a six-cell row.
- [x] The last Gameweek of a Season is answered rather than left to the arithmetic. There is
      no Gameweek 39 for GW38's count to open, and a cell promising one would be the page's
      new untrue sentence. Whatever the answer is — the tag dropped, the cell dashed, the
      count still shown under a plain word — the ticket makes it deliberately and says why
      in a comment.
- [x] The pre-Season strip, whose Gameweek is null, keeps a label that reads as English
      rather than one with a hole where a number goes.
- [x] The figure itself is untouched: no migration, no change to what `/fpl/squads` serves,
      no change to the reducer. The opening-Gameweek test that pins the stored `1` passes
      unedited, and so does every Manager State test around it.
- [x] [ADR-0033](../adr/0033-the-fpl-track-joins-the-dashboard-as-its-own-section-under-fpl.md)
      records this as the twelfth deviation from the design handoff, which labels the cell
      plainly `Free transfers`. The reason is the one above: the handoff's prototype data
      never had an opening Gameweek in it, so the label was never read against the one week
      where the count and the heading disagree by the whole of the game's rule.
- [x] Tests: the view test asserts the new label against a mid-Season Gameweek, the opening
      Gameweek, the last Gameweek of the Season, and the pre-Season null.
- [x] Spec 0011's nine-step manual checklist recorded below: walked against the design seed
      in both themes at 1440px and 375px, by a scripted Chromium driving real input.

**Manual acceptance record** (spec 0011 §"The pages", required by `dashboard/README.md`
before a slice that touches a page is complete). Walked 2026-08-23 against the design seed
on a scratch local Postgres (`football_bench_acceptance`; the standing local base
untouched), `astro dev` on :4321 proxying the read API on :8787, by a scripted Chromium
with real clicks and keys at 1440px and 375px. The JSON report and the screenshots are in
`/tmp/acceptance/`.

The walk changed the label. The first spelling, `GW6 free transfers`, wraps to two lines
in the six-cell row at 1440px — the cell's label line is 122px wide and every other label
in the row is one line — which is the "short enough to sit in a six-cell row" this ticket
requires. The label is `Free for GW6`: the Gameweek named in the strip's own spelling,
"free" kept because it is the word that tells these Transfers from the paid ones, the noun
given way because it does not fit. The strip was read cell by cell off the DOM and
photographed at 1440px and 375px in both themes: six cells, one line per label,
`GW5 POINTS 57 · SEASON TOTAL 294 · SQUAD VALUE £98.5 · IN THE BANK £1.5 · FREE FOR GW6 5
· CHIP None`.

The width was then walked across the band the six-cell row lives in, 761–1200px. From
1200px up every label keeps one line; below that the strip wraps — at 1000px `Season
total` and `Free for GW6` together, at 900px five of the six labels, and at 761px the
page scrolls sideways. `Season total` is untouched by this ticket, so that band was
already the row's state before the label changed, and the new label is narrower than the
`Free transfers` it replaced: it fits wherever the old one fit. The band is a gap in the
strip's own responsive design — no breakpoint between the 760px collapse and the desktop
row — and is out of this ticket's scope; it wants a ticket of its own.

| # | Step | 1440 light | 1440 dark | 375 light | 375 dark |
|---|------|-----------|----------|----------|---------|
| 1 | Nav links reach their page and mark themselves current | pass | pass | pass | pass |
| 2 | View toggle: URL updates, reload holds, replaceState not pushState | pass | pass | pass | pass |
| 3 | Picking an Entrant redraws the Sheet; URL updates; reload holds | pass | pass | pass | pass |
| 4 | The rationale opens and closes | pass | pass | pass | pass |
| 5 | Theme toggle flips both ways and holds across a nav and a reload | pass | pass | pass | pass |
| 6 | Tab reaches the controls; one ring, the accent | pass | pass | pass | pass |
| 7 | 375px: nav collapses, menu closes on pick, no sideways scroll | n/a | n/a | pass | pass |
| 8 | Read API stopped: one error line, no spinner | pass | pass | pass | pass |
| 9 | Pre-season seed: the pre-Season state, not an emptied page | pass | pass | pass | pass |

Every cell was walked — the matrix is not a claim of coverage but the log of one; the
`n/a` cells are step 7's at 1440px, where there is no collapse to walk because the nav is
bare. Step 2 has no sort control to walk on the FPL section, so its analogue was walked
twice in every cell: the leaderboard's Table/Race variant (`?view=race`, reload holds,
`history.length` unchanged through the toggle, Back leaves the page) and the squads page's
own Pitch/List (`?view=list`, reload holds, the list rendered). Step 4's "closes the one
already open" half belongs to a page with several disclosures; the squads page has one,
and it opens and closes. Step 6's Tab walk reached the nav links, the burger at 375px,
the theme toggle and the picker buttons, every one ringed in its theme's own accent —
read off the strip's accent cell, not assumed: `rgb(127, 46, 168)` in light and
`rgb(169, 92, 205)` in dark. Step 7's strip at 375px is the design's two-column mobile
grid with every label still on one line, and the page does not scroll sideways. Step 8
was walked with the read API stopped and all three FPL pages loaded in every cell; each
showed its own single error line ("The FPL ranking could not be read…", "The Team Sheets
could not be read…", "The Entrant record could not be read…") and no loading block
remained visible.

Step 9 found the pre-Season strip does not exist: re-seeded to the pre-season stop, all
three pages in every cell render their pre-Season blocks — "No Team Sheet locked" on the
squads page, "No Gameweek settled" on the other two — so no cell renders for any label
to misspell. The plain-word null-Gameweek label this ticket asks for is therefore reached
only through the view module's seam, where the unit test pins it — as the GW38 plain word
is, the seed stopping at GW5.

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
