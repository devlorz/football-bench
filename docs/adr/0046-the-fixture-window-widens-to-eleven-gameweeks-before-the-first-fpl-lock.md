# The Fixture window widens to eleven Gameweeks before the first FPL Lock

ADR-0021 gave the FPL context a raw schedule of this Gameweek and the five after it, and
called anything longer dead data: "a horizon beyond the next few Gameweeks has nowhere to
appear in a decision made now." That sentence is wrong about the one decision class the
same ADR named as its reason for showing any schedule at all. A Chip is a bet on a
Gameweek that has not arrived: a Wildcard is played weeks before the squad it builds is
meant to pay, and a Bench Boost or Triple Captain is timed at a Double that FPL announces
long before it falls inside six Gameweeks. A context that stops at five ahead hands the
Entrant a Chip decision and hides the Gameweek the Chip is for.

So the window widens: **`SCHEDULE_GAMEWEEKS` goes from 6 to 11 — this Gameweek and the ten
ahead** — inside the same frozen Prompt Version `fpl/2026-27-v2`, through the door ADR-0026
holds open for a version no context has used. Nothing else about the section moves. The
lines stay raw, a club with two lines in a Gameweek still has a Double and a club with none
still has a Blank, and neither is annotated (ADR-0018, ADR-0021). Near the season's end the
window is simply whatever the calendar still holds, as it already was.

The section heading is rewritten by hand, from "this Gameweek and the five ahead" to "this
Gameweek and the ten ahead". ADR-0021's reason for spelling the number in words rather than
interpolating the constant stands and is what makes this a deliberate edit: frozen text
does not get to rewrite itself when a later decision widens a window.

## This ADR ships under the same gate as ADR-0041, or not at all

The Season's first FPL Lock is **2026-08-21T17:30Z**, and the freeze binds at first use.
Two conditions, both of which must hold at merge:

- **Production holds no FPL context.** If a `contexts` row for track `fpl` exists, the
  version is frozen, this ADR is void for 2026-27, and the widening waits for v3. Checking
  this is the first step of the work, not a formality.
- **ADR-0041's ship-or-freeze rule.** Merged, `fpl:rehearse` green and the pre-cron
  checklist walked before the Lock's cron takes over. Whatever is frozen when the Lock
  arrives is the Season's version. Nobody holds the Season for this — it is a constant and
  a sentence, and if it is not ready it is not worth a delayed Lock.

## Cost

Roughly fifty additional Fixture lines and five additional Gameweek headings, against a
context that ADR-0020 already put near 26k tokens: on the order of 3%, and the schedule is
the cheapest section in the context per fact it carries. Per spec 0003's standing rule the
real figure is read from `attempts.tokens_in` after the first Gameweek rather than
estimated here.

The data costs nothing to reach. The daily fetch already stores the whole Season's Fixtures
when it runs without a requested Gameweek, so the wider read finds rows that are already
there; the window is a `between` in one query, driven by the same constant.

## Considered options

- **Leaving the window at six and waiting for v3** was rejected on ADR-0026's own
  arithmetic: v2's first use is still ahead, so waiting spends a full Season of Chip
  decisions made blind to buy nothing, in exchange for a change that is one constant and
  one sentence.
- **Amending ADR-0021** was rejected by ADR-0021's own line — a decision record that grows
  after merge stops being a record. Its rejection of a longer horizon stands as what was
  decided then; this ADR is what supersedes it, and the reason is written above rather than
  edited into the older document. Spec 0006's six-Gameweek sentences are superseded the same
  way rather than rewritten.
- **The whole remaining season** stays rejected, as in ADR-0021. At Gameweek 1 that is 380
  Fixture lines, most of them describing a squad the Entrant will have turned over twice
  before they are played, and the horizon shrinks every week — a section whose size is an
  accident of the date.
- **Annotating the Blanks and Doubles the wider window now exposes** was rejected. The
  wider window makes them easier to spot, which is the point; reading them off the list is
  still the Entrant's work (ADR-0018).
- **Deriving the heading from the constant** was rejected — see above; ADR-0021 settled it.
- **Eight, or ten, or twelve.** Eleven is a judgment, not a derivation: it covers a Wildcard
  played for a Double roughly two months out, which is the longest horizon a Chip decision
  actually reaches, and it stops well short of the point where added lines describe a squad
  that no longer exists. The cost is small enough that the exact number is not worth
  defending to the token.
