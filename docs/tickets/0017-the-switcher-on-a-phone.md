# Ticket — The Competition switcher on a phone

Follows [ticket 0017](done/0017-the-dashboard-per-competition-shape.md), which built the
switcher and recorded this under "Left standing". Source:
[spec 0017](../specs/0017-the-dashboard-per-competition-shape.md). Decision:
[ADR-0039](../adr/0039-the-dashboard-gives-every-competition-its-own-path.md).

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

- [ ] At 320px with the four Competitions live today, and at 375px with five in
      `MATCH_PROMPT_COMPETITIONS`, every league's name renders on one line.
- [ ] The page still does not scroll sideways at either width — whatever absorbs the
      width, it is not the document.
- [ ] The current Competition is still announced with `aria-current="page"` and still a
      real link, whatever shape the control takes — ADR-0039's two requirements do not
      relax on a small screen.
- [ ] Every entry stays middle-clickable and copyable. If the control collapses behind
      something, what it collapses into is not a `<select>`.
- [ ] Any CSS goes in `overrides.css`. `modernist.css` is vendored and never edited
      (ADR-0033).
- [ ] Ticket 0017's "adds no CSS" box is a recorded deviation with four lines already
      standing against it. This ticket is where that stops being a deviation and becomes
      the switcher's design; say so where the rule is argued, so the next reader finds one
      account and not two.

**Why it is not urgent and not optional.** Spec 0017 says `SA`, `BL1` and `FL1` "appear
here with no further work in this area". Three of the four are now live and the sentence
has held for the widths most readers are on — but it is false at 320px today and false at
five leagues everywhere. Left alone, it is what a future reader trusts on the day they
open the fifth.
