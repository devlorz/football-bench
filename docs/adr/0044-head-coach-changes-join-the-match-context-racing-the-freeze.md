# Head Coach changes join the match context, racing the freeze

A club changing who picks its team is a stronger early-season signal than some
signings, and the context says nothing about it. The addition is decided; whether it
ships in the restarted versions (ADR-0042) is a race this ADR settles in advance, both
ways.

## The term is Head Coach

"Manager" is taken: on the FPL track a Manager is the Entrant's persona and Manager
State is what it carries between Gameweeks — `manager_states` is a table that has
nothing to do with coaches. The real club's bench is the **Head Coach**, in the
glossary with _manager_ as its avoided word, and everything named for this data —
table, section, source string — says head coach.

## Source and shape

The source is Wikipedia's season article per Competition — the "Managerial changes"
table of e.g. _2026–27 Premier League_ — read as raw wikitext through the same
machinery Squad Changes built (ADR-0031): one page per Competition, raw snapshot
stored, club names resolved through the existing identity map, validation that refuses
a page whose shape moved. What it yields is **events**: who left, the stated manner,
when, who arrived, when appointed. The context renders the Fixture's two clubs' events
the way the Squad Changes section does, dated, with no row meaning no change — absence
of the event is the fact, so an unchanged club costs no line.

A current-coach-per-club shape (twenty club pages, or a list page) was rejected: more
fetching for a weaker signal. The question the packet must answer is whether something
changed, and the events table is that question's native form.

## The race, settled both ways

The work is the largest piece of the restart — a migration, a fetch, a parser, a
section — under ADR-0042's hard clock. So the cutoff is written here: if it lands
before the restarted versions freeze, Head Coach changes are part of them; if it is
not ready roughly a day before the earliest restarted Lock, it stops being attempted,
the restart ships without it, and this section waits for the next version boundary.
Either outcome is this ADR executing, not this ADR failing — what is not permitted is
holding the restart for it, because a missed flip kills the whole amendment for the
Season (ADR-0042).
