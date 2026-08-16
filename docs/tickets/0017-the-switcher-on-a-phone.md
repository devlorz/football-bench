# Ticket — The Competition switcher on a phone

Follows [ticket 0017](done/0017-the-dashboard-per-competition-shape.md), which built the
switcher and recorded this under "Left standing". Source:
[spec 0017](../specs/0017-the-dashboard-per-competition-shape.md). Decision:
[ADR-0039](../adr/0039-the-dashboard-gives-every-competition-its-own-path.md).

Nothing is broken today. This ticket exists because the day it breaks is a day nobody will
be reading ticket 0017: the trigger is a Competition's Prompt Version being frozen, which
is an edit to one constant and a deploy, not an occasion to reread a finished ticket.

---

## The switcher does not collapse on a phone

**What to build:** A reader on a phone can use the Competition switcher at five leagues,
the way they can at two. Today `overrides.css` hides the three nav links below 760px and
puts them behind the burger, and the switcher is a different element in the header, so it
stays in the bar and wraps. Two leagues wrap and nothing breaks. Five will not fit.

**Blocked by:** None — can start immediately. It is not *needed* until a third
Competition's Prompt Version is frozen, which is when the header first holds more than it
can. Doing it before is doing it calmly.

- [ ] At 375px wide with five Competitions in `MATCH_PROMPT_COMPETITIONS`, the header is
      the shape the design gives it and the switcher is reachable.
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
here with no further work in this area", which is true of everything else in that spec and
false of this. Left alone, the sentence is what a future reader trusts on the day they
open the third league.
