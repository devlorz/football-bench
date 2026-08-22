# Ticket: The reasoning behind a Squad becomes readable

**What to build:** `/fpl/squads` shows the Rationale the selected Entrant gave for the
Gameweek it is showing, at the foot of the page under the Team Sheet it explains. Vocabulary: [CONTEXT.md](../../../CONTEXT.md) — **Entrant**, **Manager
State**, **Roll Over**, **Team Sheet**, **Settled**. Decisions:
[ADR-0041](../../adr/0041-duties-the-entrants-own-record-and-a-required-reason-join-fpl-2026-27-v2-before-its-first-use.md)
(the reason exists and what it may never be used for),
[ADR-0048](../../adr/0048-the-squads-page-shows-a-team-sheet-from-its-lock.md) (the Gameweek
this page shows).

**Blocked by:** None.

**Status:** done

Seven Base Models each wrote down why they picked the Squad they opened the Season with,
and every one of those sentences sits in `manager_states` where no page reads it. The Match
track has shown its Predictions' reasoning on the Fixtures page since spec 0011; the FPL
track collects the same thing under the same rule and shows none of it.

**The page it belongs on is the one showing the Squad it explains.** Since ADR-0048 that
page shows a Team Sheet from the moment its Lock stores it, which means that for the days
between a Lock and its settlement the pitch is drawn with every point still a dash. In
exactly that window the Rationale is the only thing on the page a reader can actually
read — the picks are made, the returns are unknown, and the reasoning is what there is.

**No new decision is being taken here, and that is worth stating.** ADR-0041 already
settled what the Rationale is — "the qualitative record beside the quantitative one, and
when a Season path goes wrong, the difference between observing a recovery and guessing at
one" — and the only thing spec 0019 left open was where it goes: "the dashboard's Entrant
record page may want it later; that is its own decision with its own review." This ticket
is that review, and it lands the sentence next to the Squad rather than in the history,
because a reason explains a decision and the decision is on this page.

**The boundary ADR-0041 draws stays exactly where it is.** "Never scored, and never
rendered into any later context" is about what reaches an *Entrant*: a rationale read back
into a Gameweek's context would make this track measure adherence to a remembered plan
rather than management. A human reading a page is not a context. Nothing in this ticket
touches the context builder, the prompt, or anything an Entrant is sent.

- [x] `FplSquadsEntrant` carries the Gameweek's Rationale, nullable.
- [x] The endpoint reads it from the Manager State it already selects at that Gameweek
      exactly — one more column on a read that is already there, not a second query beside
      it. That read carries the withdrawal filter (ADR-0047) and nothing about the roster
      changes.
- [x] Null is a Roll Over and the page says so rather than showing an empty panel: a Roll
      Over reached no legal action to explain, and the validation record beside it already
      reports the Roll Over as a fact.
- [x] The panel says what the sentence is and is not, in the words the Match track already
      uses: **"Rationale · display only, never scored"**. A reader who is not told this can
      reasonably assume the Entrant remembers what it wrote, and it does not.
- [x] It sits at the foot of the page, in its own full-width block **beneath** the row that
      already holds the Gameweek's Transfers and the validation record — not as a third
      column inside it. Those two are short and tabular and share a row well; a paragraph
      of reasoning in a third of 1440px is a gutter, and at 375px everything stacks anyway.
      Order on the page follows what a reader asks in order: what the Squad is, what changed
      and how the action landed, and then why.
- [x] The reasoning shown is the one for the Gameweek the page is showing, so it moves with
      the page from week to week: the Lock stores a Rationale per Gameweek and this always
      displays that Gameweek's. It is not a history — one Gameweek, the one on screen.
- [x] Switching Entrant in the picker switches the Rationale with everything else, without
      fetching: the body already carries every seat, and this is one more field on each.
- [x] Prior art followed rather than reinvented: the disclosure, the label and the meta line
      exist in `dashboard/src/pages/[competition]/fixtures.astro`. What differs is that this
      page shows one Entrant at a time, so there is no "close the one already open" to
      handle — the picker does that by construction.
- [x] Tests at the existing seams: the FPL squads API suite returns the Rationale for the
      Gameweek it answers with and null for a Rolled Over one; the FPL view suite covers the
      label and the Roll Over line. No new seam.
- [x] **The manual checklist is walked and recorded on this ticket**, per
      `dashboard/README.md`: nine steps, both themes, 1440px and 375px, against a seeded
      Postgres. A panel of prose is the one thing on this page that can push a 375px layout
      sideways, so step 7 is the one to read carefully.

## The manual checklist, walked

`dashboard/README.md` requires spec 0011's nine steps before a slice that touches a page
is complete, in both themes at 1440px and 375px. Walked 2026-08-23 against a local
Postgres seeded to "the design's". Pages walked: the FPL section's three, the match
leaderboard and Fixtures whose controls steps 2 and 4 name, and — for step 1 — every link
on both navs including `/overall` and the Competition switcher's four.

| # | Step | Result |
| --- | --- | --- |
| 1 | Nav reaches each page and marks itself current | **Pass** — `aria-current` moves with the page on all seven FPL/match nav links, `/overall`, and each of PL/PD/SA/FL1 on the Competition nav |
| 2 | Sort control reorders, ranks recompute, URL updates, reload holds, Back leaves | **Pass** — `/pl?sort=bet`: Kimi 2→5, Claude 3→2, DeepSeek 7→8; reload holds `bet` checked; Back left to the previous page. (The FPL leaderboard has no sort; its Table/Race/Cards variant was walked too — `?view=cards` holds over reload) |
| 3 | Picking an Entrant redraws, URL updates, reload holds | **Pass** — `/fpl/squads?entrant=kimi`: Sheet, strip, Transfers, validation and the Rationale all redraw, no fetch; `/fpl/entrants?entrant=kimi`: heading, pressed row and the 38-cell Chip strip redraw; both hold over reload |
| 4 | Opening a rationale closes the one already open | **Pass** — `/pl/fixtures`: one panel unhidden, one Hide, one `aria-expanded="true"` after a second Why. The squads page's single disclosure needs no cross-close: the picker replaces the sentence, an open panel carrying the new Entrant's sentence with its `aria-label` following |
| 5 | Theme toggle flips both ways, holds across nav and reload | **Pass** — light↔dark↔light on `/fpl/squads`, then dark held across a nav to `/fpl` and a reload |
| 6 | Tab reaches every control, focus ring is the accent | **Pass** — on `/fpl/squads`: 3 nav links, theme toggle, all 9 picker buttons, the view radios (entered at the checked one, arrowed within — native radio behaviour) and the Why button; every stop `rgb(169, 92, 205)`/`rgb(127, 46, 168)` per theme, never the UA default |
| 7 | 375px: nav collapses, link closes it, one column, tables scroll inside, no sideways scroll | **Pass** — burger opens the nav and a link closes it; `.fplscoped` and `.fplbelow` one column (`.fplstrip` two, the FPL design's own mobile layout); the list view's `.fpllist` scrolls inside its `.fplscroll` wrapper (`overflow-x: auto`, wrapper wider than the viewport) and the page never scrolls sideways — `scrollWidth` 375 on a 375 viewport, pitch and list both, with the Rationale panel open 343px and the sentence wrapping inside it |
| 8 | Worker stopped: one error line, no spinner | **Pass** — on `/fpl`, `/fpl/squads`, `/fpl/entrants`, `/pl`, `/pl/fixtures`: each its one line, and nothing rendering (`#ranking` on `/pl` hidden with the skeletons inside it; no `offsetParent` on any skeleton) |
| 9 | Pre-season seed: pre-season state | **Pass** — `/fpl` "no Gameweek settled · 9 entrants"; `/fpl/squads` the no-Team-Sheet-locked block; `/fpl/entrants` "An Entrant's record appears once a Gameweek has been scored"; `/pl` zero scored fixtures over the entered seats; `/pl/fixtures` the pending banner. (One first load of `/fpl/entrants` raced the dev API's compile and showed the error line; the settled reload shows the pre-season state and the endpoint answers 200.) |

Both themes were walked at both widths, the Rationale panel open in each of the four
combinations.

The panel's three states were each read against a record stopped at the Lock the state
lives at (the seed's own `fplThrough`, the same recipe the API suite's fixtures use).
Gameweek 3: Kimi's Roll Over shows the line with the disclosure hidden — no Why over a
Gameweek that reached no action to explain — and a neighbour's Why opens its sentence with
the meta line, the validation block beside both reporting `Rolled over: Yes`/`No`.
Gameweek 4: MiniMax, which Gapped that Gameweek (ADR-0011), gets **nothing** — no Why, no
Roll Over line, the panel closed beside a validation block that says `—`, which is the
state ADR-0048 opened by showing a locked Gameweek a seat may have stored nothing for.
The Roll Over line is decided on `rolledOver` and never on the null beside it, because a
Gapped seat's null is the absence of a Gameweek rather than one that rolled. The label
and the meta line are `dashboard/src/rationale.ts`'s one spelling, baked into this page's
built HTML and passed into the Fixtures page's inline script through `define:vars`. The
database was re-seeded to the design's stage afterwards.

## Not in this ticket

**The Entrant record page.** A Season's worth of reasoning is a different screen with a
different question — this ticket answers "why this Squad", not "how has this Entrant
reasoned all Season". The day that question is asked, the field is already served.

**Rendering the Rationale into any context, ever.** Forbidden by ADR-0041 and not reopened.

**The Match track.** It has had this since spec 0011; this ticket copies it rather than
touching it.

**Storing anything new.** The sentence has been collected since the Season's first Lock.
This is a read and a panel.
