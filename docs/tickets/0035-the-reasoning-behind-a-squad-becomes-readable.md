# Ticket: The reasoning behind a Squad becomes readable

**What to build:** `/fpl/squads` shows the Rationale the selected Entrant gave for the
Gameweek it is showing, at the foot of the page under the Team Sheet it explains. Vocabulary: [CONTEXT.md](../../CONTEXT.md) — **Entrant**, **Manager
State**, **Roll Over**, **Team Sheet**, **Settled**. Decisions:
[ADR-0041](../adr/0041-duties-the-entrants-own-record-and-a-required-reason-join-fpl-2026-27-v2-before-its-first-use.md)
(the reason exists and what it may never be used for),
[ADR-0048](../adr/0048-the-squads-page-shows-a-team-sheet-from-its-lock.md) (the Gameweek
this page shows).

**Blocked by:** None.

**Status:** ready-for-agent

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

- [ ] `FplSquadsEntrant` carries the Gameweek's Rationale, nullable.
- [ ] The endpoint reads it from the Manager State it already selects at that Gameweek
      exactly — one more column on a read that is already there, not a second query beside
      it. That read carries the withdrawal filter (ADR-0047) and nothing about the roster
      changes.
- [ ] Null is a Roll Over and the page says so rather than showing an empty panel: a Roll
      Over reached no legal action to explain, and the validation record beside it already
      reports the Roll Over as a fact.
- [ ] The panel says what the sentence is and is not, in the words the Match track already
      uses: **"Rationale · display only, never scored"**. A reader who is not told this can
      reasonably assume the Entrant remembers what it wrote, and it does not.
- [ ] It sits at the foot of the page, in its own full-width block **beneath** the row that
      already holds the Gameweek's Transfers and the validation record — not as a third
      column inside it. Those two are short and tabular and share a row well; a paragraph
      of reasoning in a third of 1440px is a gutter, and at 375px everything stacks anyway.
      Order on the page follows what a reader asks in order: what the Squad is, what changed
      and how the action landed, and then why.
- [ ] The reasoning shown is the one for the Gameweek the page is showing, so it moves with
      the page from week to week: the Lock stores a Rationale per Gameweek and this always
      displays that Gameweek's. It is not a history — one Gameweek, the one on screen.
- [ ] Switching Entrant in the picker switches the Rationale with everything else, without
      fetching: the body already carries every seat, and this is one more field on each.
- [ ] Prior art followed rather than reinvented: the disclosure, the label and the meta line
      exist in `dashboard/src/pages/[competition]/fixtures.astro`. What differs is that this
      page shows one Entrant at a time, so there is no "close the one already open" to
      handle — the picker does that by construction.
- [ ] Tests at the existing seams: the FPL squads API suite returns the Rationale for the
      Gameweek it answers with and null for a Rolled Over one; the FPL view suite covers the
      label and the Roll Over line. No new seam.
- [ ] **The manual checklist is walked and recorded on this ticket**, per
      `dashboard/README.md`: nine steps, both themes, 1440px and 375px, against a seeded
      Postgres. A panel of prose is the one thing on this page that can push a 375px layout
      sideways, so step 7 is the one to read carefully.

## Not in this ticket

**The Entrant record page.** A Season's worth of reasoning is a different screen with a
different question — this ticket answers "why this Squad", not "how has this Entrant
reasoned all Season". The day that question is asked, the field is already served.

**Rendering the Rationale into any context, ever.** Forbidden by ADR-0041 and not reopened.

**The Match track.** It has had this since spec 0011; this ticket copies it rather than
touching it.

**Storing anything new.** The sentence has been collected since the Season's first Lock.
This is a read and a panel.
