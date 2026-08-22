# Ticket — The Competition switcher on a phone

Follows [ticket 0017](0017-the-dashboard-per-competition-shape.md), which built the
switcher and recorded this under "Left standing". Source:
[spec 0017](../../specs/0017-the-dashboard-per-competition-shape.md). Decision:
[ADR-0039](../../adr/0039-the-dashboard-gives-every-competition-its-own-path.md).

Nothing is broken today. This ticket exists because the day it breaks is a day nobody will
be reading ticket 0017 — and that reasoning is why the two claims it was first written
with have now been replaced by measurements rather than left to be trusted.

---

## What this ticket said, and what is actually true

**Its trigger fired and nothing broke.** It said the work was "not *needed* until a third
Competition's Prompt Version is frozen". `match-sa/2026-27-v1` and `match-fl1/2026-27-v1`
were both frozen on 2026-08-21 (ticket 0034), and `competitionRoutes()` derives from
`MATCH_PROMPTS`, so the header has carried four Competitions since. It did not break. A
trigger that fires on a day nothing happens is not the trigger.

**And "five will not fit" is not what five does.** Measured in the built page at each width
on 2026-08-22, with the fifth segment injected into the DOM to stand for the Bundesliga:

| Width | Leagues | Switcher | Page scrolls sideways | Labels |
| --- | --- | --- | --- | --- |
| 375px | 4 (today) | 332px of 375 | no | whole, one line each |
| 375px | 5 | 343px of 375 | no | **break mid-name** |
| 320px | 4 (today) | 288px of 320 | no | **break mid-name** |

So the control never overflows and never costs a horizontal scroll: `.seg-opt` is free to
wrap its own text, and it does. What goes wrong is the text. At five leagues, and **at
four on a 320px phone today**, the labels fracture into "Premier / League", "Serie / A"
and "Ligue / 1" — a league's name broken across two lines inside its own segment.

That is a real defect and a smaller one than this ticket first described. It is also
already live for anyone reading on a 320px-wide phone, which no longer makes this
speculative work.

**What it changes about the fix.** This ticket was written expecting the control to have
to collapse into something on a small screen, and spent a box forbidding that something
from being a `<select>`. Nothing has to collapse: the symptom is a line break inside a
label, so `white-space: nowrap` on `.seg-opt` with `.seg` scrolling horizontally, or a
shorter label below some width, is the whole of it. Both live in `overrides.css` and
neither touches the header's structure. The `<select>` box stays anyway — it costs a line
and it is the thing a future reader would otherwise reach for.

## The switcher's labels do not break on a phone

**What to build:** a reader on a 320px phone sees each league's name whole, and still does
at five Competitions.

**Blocked by:** None — can start immediately. Not urgent: nothing overflows, nothing is
unreachable, and every ADR-0039 requirement below still holds as it stands. It is worth
doing before the Bundesliga opens rather than during it.

- [x] At 320px with the four Competitions live today, and at 375px with five in
      `MATCH_PROMPT_COMPETITIONS`, every league's name renders on one line.
- [x] The page still does not scroll sideways at either width — whatever absorbs the
      width, it is not the document.
- [x] The current Competition is still announced with `aria-current="page"` and still a
      real link, whatever shape the control takes — ADR-0039's two requirements do not
      relax on a small screen.
- [x] Every entry stays middle-clickable and copyable. If the control collapses behind
      something, what it collapses into is not a `<select>`.
- [x] Any CSS goes in `overrides.css`. `modernist.css` is vendored and never edited
      (ADR-0033).
- [x] Ticket 0017's "adds no CSS" box is a recorded deviation with four lines already
      standing against it. This ticket is where that stops being a deviation and becomes
      the switcher's design; say so where the rule is argued, so the next reader finds one
      account and not two.

**Why it is not urgent and not optional.** Spec 0017 says `SA`, `BL1` and `FL1` "appear
here with no further work in this area". Three of the four are now live and the sentence
has held for the widths most readers are on — but it is false at 320px today and false at
five leagues everywhere. Left alone, it is what a future reader trusts on the day they
open the fifth.

---

## What it built, and where the account lives

Three declarations in `overrides.css`, inside the one 760px breakpoint and scoped to `.nav`
so the Leaderboard's sort control — the other `.seg` — is untouched: `.nav .seg-opt
{ white-space: nowrap }` keeps a league's name whole; `overflow-x: auto` on `.nav .seg`
makes the control, not the document, the thing that gives ground (the automatic minimum a
scroll container zeroes is what lets the row give it any); and `padding: 4px;
margin-block: -4px` on the same element buys the focus ring its offset back — the
scrollport clips at its padding box, and the ring's outer edge stands 4px out, its 2px
`outline-offset` gap plus the 2px the outline itself is thick. Spec 0011's story 48 holds
unrelaxed: 2px accent at 2px offset, measured whole at 6× on the built page. `max-width`
was tried and deleted: with the automatic minimum already zeroed it measured inert.

**Scoped to the breakpoint because the unconditional version hid a league on a laptop.**
Above 760px the header is one flex line, and a control that can shrink to nothing was
squeezed into it: measured at 1024px, "Serie A" was cut to an S and "Ligue 1" was gone
entirely, with no scrollbar to say anything was hidden — a worse defect than the wrapped
name it replaced, in the band most laptops sit in. Inside the breakpoint the control has
its own row and the width comes from there. Above it the header is what it always was:
measured at 1024px and 1280px on `/pl`, every name is whole and untruncated — and wrapped
across two lines inside its own segment, the band's own defect, recorded below.

This ticket is also where spec 0017's "adds no CSS" clause stops being a deviation and
becomes the switcher's design. The chosen-segment rule that stood against the clause as a
recorded deviation and the rules above are one design, and it lives in `overrides.css`;
ADR-0039, spec 0017 and ticket 0017's first file each say so in one line and point here,
so this file is the one account.

## Measured after the fix, as before it

The same measurements the table above records for the defect, taken again on the built
page on 2026-08-22 with the rules above in — the fifth segment injected as before, widths
read off screenshots and the document check a horizontal wheel on the body leaving the
pixels byte-identical:

| Width | Leagues | Switcher | Page scrolls sideways | Labels |
| --- | --- | --- | --- | --- |
| 320px | 4 (today) | ~300px of 320, scrolls inside itself | no | whole, one line each |
| 375px | 5 | ~340px of 375, scrolls inside itself | no | whole, one line each |
| 1024px | 4 (today) | fits its row, nothing hidden | no | whole, untruncated; wrapped in this band |
| 1280px | 4 (today) | fits, nothing hidden | no | whole, untruncated; wrapped in this band |

At 320px with five the same holds. The entries beyond the cut are reachable — a wheel on
the control scrolls it and shows them whole.

**The band above the breakpoint keeps the defect this ticket fixes below it**, and two
facts measured on 2026-08-22 belong to whoever takes it. On `/pl` at 1024px and 1280px
every segment renders its name at 57.4px and wraps it to two lines. Forcing the 13px
Modernist drew its `.seg-opt` at does not clear the wrap on its own — the names still
want more width than the line has, so wrapping the header's line is the shape of the fix.
And the segments render at 14px rather than that 13px because Modernist's own
`.nav a { font-size: 14px }` (0,1,1) outranks its `.seg-opt { font-size: 13px }` (0,1,0)
— the switcher sits 8% larger than the segmented control the design system drew, a
divergence worth settling when that ticket decides the band.

## The walkthrough

Spec 0011 §"The pages", all nine, both themes, at 1440px and 375px, walked by hand on
2026-08-22 against the README's stack — `astro dev` over `dev:api`, on a scratch database
seeded with `seed -- "the design's"`; the standing local database was read, not reseeded.
All nine hold:

1. The nav links and the switcher's entries each reach their page and mark themselves
   current (`aria-current="page"` on exactly the one being read).
2. The sort control reorders the ranking — Bet points: Grok, Claude, Gemini; Match points:
   Grok, Kimi, Claude — the URL takes `?sort=bet`, a reload holds the choice, and Back
   returns to the page rather than stepping through sort choices.
3. The Entrant picker redraws every figure and writes the URL, and a reload holds it:
   picking Grok moves `?entrant=` to `grok-4` and redraws his record (Match points 309 →
   325 under the seed's numbers), and the reload returns the same selection, URL and
   figures. **Walked against seat ids reshaped to the production form** — the seed gives
   every Match seat an id ending `/v1`, so under the slug rule all nine collapse to
   `v1` and no pick can move anything; the scratch database's ids were renamed to the
   shape production seats carry — `match/<slug>` for the Premier League,
   `match-<code>/<slug>` for every other Competition, as `season-roster.ts` writes them —
   before this check was walked. The seed's id shape is the finding, not the page: it
   cannot exercise the picker's URL state as it stands, and fixing it is a change to the
   seed's own id derivations and the tests that assert them — noted for its own ticket.
4. Opening one rationale closes the one already open — `aria-expanded` flips, exactly one
   panel visible.
5. The theme toggles both ways and holds across a navigation and a reload.
6. Tab reaches the switcher's entries and the ring is the 2px accent one at 2px offset,
   drawn outside the segment and whole — its 2px gap and 2px thickness both inside the
   scrollport, read off a 6× close-up of the first segment's corner — verified at 375px
   in both themes (the current, accent-filled segment included) and at 1440px.
7. At 375px the burger opens the collapsed nav and picking a link closes it, the grids
   stack one column, the per-Gameweek table scrolls inside its wrapper (the GW column
   scrolls out, the later columns in), and the page does not scroll sideways.
8. With the API stopped, each of the four pages shows its one error line and no skeleton
   block (the loading nodes stay in the DOM, hidden).
9. On a database re-seeded to its pre-season stage, each page shows its own pre-season
   state in both themes: the leaderboard its panel with the entered Entrants and the
   Gameweek 1 lock, the Fixtures page "No predictions stored" with the note that both
   runs sit behind the deadline, the Entrant record "No settled gameweeks", and `/overall`
   "The table fills once a league has been scored". A first load that races the API
   starting shows the error line instead: nothing retries, by design.
