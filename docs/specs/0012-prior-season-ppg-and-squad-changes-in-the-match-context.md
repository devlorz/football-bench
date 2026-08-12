# Spec 0012 — Prior-Season points per game and Squad Changes in the match context

**Status:** ready-for-agent
**Scope:** everything that must land before the 2026/27 Season's first Lock for the match
context to state each club's prior-Season points per game and the transfer window's real
squad movement, inside the same frozen Prompt Version, `match/2026-27-v2`
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) — note the new **Squad Change** entry ·
**Decisions:** [ADR 0001–0031](../adr/), especially
[ADR 0018](../adr/0018-raw-signals-only-in-the-entrant-context.md),
[ADR 0026](../adr/0026-a-prompt-version-no-context-has-used-may-still-be-amended.md),
[ADR 0030](../adr/0030-prior-season-points-per-game-joins-the-match-context-for-2026-27-v2.md)
and [ADR 0031](../adr/0031-squad-changes-join-the-match-context-for-2026-27-v2.md)
**Siblings:** [spec 0007](./0007-season-aggregates-and-the-league-table-in-the-match-context.md)
(the previous v2 amendment; landed) · [spec 0004](./0004-shots-and-xg-in-the-match-context.md)

---

## Problem Statement

The first full Gameweek 1 rehearsal run produced ninety Predictions, and for Brentford v
Spurs every one of the nine rationales reasoned from a squad that no longer exists: all
nine cited the 17th-place finish, eight cited the old squad's injuries, and none mentioned
any of the five players signed over the summer — £229.5m of movement the context never
stated. The silence is not a neutral gap. The roster's dated releases span February to
July 2026, straddling the summer window, so a silent context lets a later-cutoff Base
Model answer from pretraining while an earlier one cannot; the difference the leaderboard
attributes to the Base Model alone (ADR 0001) becomes partly a training-cutoff lottery.

Separately, a promoted club's prior season arrives as a bare rank — "1st in 2025-26
Championship" — which states where it finished and nothing about how hard it finished
there. The rate that would make two clubs' prior seasons comparable across divisions is
computable from rows the prediction path already loads, and is simply never rendered.

## Solution

Two additions, one amendment. Each club section gains one line under its prior-Season
final position line — points per game, overall and split by venue, from the stored record
of the division the sibling line already names. And the context gains a Squad Changes
section: each club's Signings and Departures for the current transfer window, read from
Wikipedia's per-window transfer list, fetched daily while relevant, archived
byte-for-byte, stored Gameweek-partitioned under the same pre-Lock discipline as the FPL
player snapshots, and rendered for exactly the Gameweeks whose deadline falls no more than
21 days after the window closes. Both ship inside `match/2026-27-v2` before its first use
(ADR 0026), with one SHA re-pin and one pre-flight, exactly as spec 0007's additions did.

---

## User Stories

### Prior-Season points per game

1. As an Entrant, I want each club's prior-Season points per game, so that two prior
   seasons are comparable as rates rather than as ranks.
2. As an Entrant, I want the overall figure split by home and away, so that a venue
   effect in last season's record is mine to find, not mine to guess.
3. As an Entrant, I want the figures computed from the division the final-position line
   names, so that a promoted club shows its real Championship season and never a blank.
4. As an Entrant, I want the line present every Gameweek, so that how far a finished
   season still matters is my judgment, not the builder's.
5. As an Entrant, I want rates stated to two decimals and never normalised across
   divisions, so that the cross-division reading stays mine (ADR 0018).

### Squad Changes — content

6. As an Entrant, I want each club's Signings with counterpart club and fee, so that a
   rebuilt squad is visible before its first result exists.
7. As an Entrant, I want each club's Departures too, so that a weakened squad is as
   visible as a strengthened one.
8. As an Entrant, I want loans included and labelled, so that a temporary arrival is
   distinguishable from a permanent one without being hidden.
9. As an Entrant, I want fees exactly as the public record states them — an amount,
   `free`, or `undisclosed` — so that absence of a number is a statement, never a zero.
10. As an Entrant, I want changes ordered by fee with free and undisclosed after, ties
    by date, so that the list reads in the same money-first convention as the FPL
    section's five highest-priced players.
11. As an Entrant, I want a club with no movement to read `none recorded`, so that an
    empty list is an assertion rather than a missing section.
12. As an Entrant, I want every Squad Change of the window visible whenever the section
    renders, so that a June Signing is as visible at the window's last render as at its
    first.

### Squad Changes — the render gate

13. As an Entrant, I want the section present from Gameweek 1 through Gameweek 5, so
    that the window's movement covers exactly the Gameweeks where current form cannot
    yet speak.
14. As an Entrant, I want deadline-day deals visible for three further Gameweeks after
    the window closes, so that late movement is not erased by the next deadline.
15. As an Entrant, I want the winter window to reopen the section under the same rule,
    so that the January cutoff lottery is closed the same way August's was.
16. As an Entrant, I want the section absent mid-season, so that a stale list is never
    presented as current.

### Fairness and audit

17. As an auditor, I want every Entrant of a Fixture handed the identical context text,
    stored and hashed exactly as before, so that "it saw only this" stays verifiable.
18. As an auditor, I want nothing recorded under any earlier hash touched, so that a
    Prompt Version remains a frozen pair (ADR 0026).
19. As an auditor, I want every fetched Wikipedia response archived byte-for-byte with
    its per-row citations inside, so that what the pipeline read is reconstructible and
    a community edit is auditable after the fact.
20. As an auditor, I want each Gameweek's Squad Change rows stamped with when they were
    observed and refused by the database itself at or after that Gameweek's Lock, so
    that pre-Lock provenance is a database guarantee, not an application promise.
21. As an analyst, I want no digested signal in either addition — no rating, no
    normalisation, no forecast — so that ADR 0018's line holds.
22. As an analyst, I want a Signing that never appears in the club's FPL player
    partition to be findable by query, so that fabricated edits have a standing
    cross-check.

### Operating it

23. As an operator, I want the Wikipedia fetch to ride the existing daily fetch while
    the section renders, so that deadline-day movement reaches the next Gameweek's
    context without a new schedule.
24. As an operator, I want an unknown club spelling to fail the fetch loudly, naming
    the spelling, so that a rename surfaces months before it can silently thin a
    context (the Understat alias precedent).
25. As an operator, I want missing Squad Change data to degrade the context to a stated
    absence and never block the write path, so that a lost section costs one Gameweek's
    enrichment rather than a permanent Gap.
26. As an operator, I want the PPG line to read only from data the loader already
    loads, so that half the amendment carries no migration, no fetch and no query.
27. As an operator, I want pre-flight re-run 9/9 against the extended context before
    the first Lock, so that the denser prompt cannot surprise an Entrant into malformed
    output on opening day.

### Proving it

28. As a reviewer, I want the PPG lines verified against hand-computed figures from the
    stored 2025-26 record, including a promoted club's Championship figures, so that
    the arithmetic is checked rather than described.
29. As a reviewer, I want the render gate verified by arithmetic at its boundaries —
    GW5 in, GW6 out, GW26 in, GW27 out, and GW19's one-day winter case — so that the
    frozen constants are pinned by tests, not by prose.
30. As a reviewer, I want the parser verified against the real archived page bytes, so
    that the fixture proves the format Wikipedia actually publishes, not the format we
    remember it publishing.
31. As a reviewer, I want ordering, loan labels, `none recorded` and the stated-absence
    form each asserted on the rendered string, so that every shape the section can take
    exists in a test before it exists in production.

---

## Implementation Decisions

### One amendment, or none

Both additions ship together inside `match/2026-27-v2` under ADR 0026's boundary: the
freeze binds at first use, the freeze counts (`contexts`, `predictions`, `attempts`) are
re-verified zero immediately before merge, the pinned SHA moves once, and pre-flight runs
once against the final text. If the first Lock arrives first, the work ships as a v3 and
this spec's scope statement is wrong — re-verify, do not assume.

### The PPG line is builder-only

One sibling line under the prior-Season final position line, both clubs, every Gameweek:

```
Prior-Season final position: 17th in 2025-26 Premier League; promoted: no.
Prior-Season points per game: 1.08 overall, 0.79 home, 1.37 away.
```

Two decimals; computed at render time from the prior-Season rows of the division the
sibling line names, which the context data loader already loads for the form lines. No
migration, no query change, no new source. Championship figures are never normalised;
the division is named one line above (ADR 0030).

### Squad Change is a new noun, and a new pipeline

Vocabulary per CONTEXT.md: a **Squad Change** — a **Signing** or a **Departure** — is a
fact about a real club, never an Entrant action; *Transfer* remains the FPL track's word.

The source is English Wikipedia's per-window transfer list page (summer 2026 now, winter
2026-27 in January): raw wikitext, one document per window, permanent transfers and the
loans section both parsed. The daily fetch pulls it on days when any upcoming deadline
falls inside the render gate, archives every response byte-for-byte under a
window-scoped source name, and parses rows for the twenty Premier League clubs through a
pinned club-name alias table on the Understat pattern — an unknown spelling is a
validation error naming it, at fetch time, before anything is stored.

A row is player name, counterpart club, fee verbatim, and a loan flag. Deliberately no
position and no player identity join: a cross-source player match against the FPL names
is the highest-risk piece of every alternative considered and buys one parenthesis.

Rows are stored Gameweek-partitioned with an observation timestamp, guarded by the same
two database triggers the FPL player snapshots earned in migrations 0006/0007: a row
observed at or after its Gameweek's Lock is refused, and a deadline correction cannot
move a Lock across an existing partition. A fetch replaces only its own Gameweek's
partition.

### Membership and the gate are separate rules

Membership: every Squad Change dated since the previous window closed — the page's own
scope. No recency filter of any kind; the rejected alternative (changes within N days of
the deadline) hides all five of the motivating Spurs signings at Gameweek 1.

Gate: the section renders for a Gameweek iff its deadline is at most 21 days after the
window's close, with the closes frozen as constants — `2026-09-01` published,
`2027-02-02` customary. Against the stored deadlines: summer renders GW1–5, winter
renders through GW26, deadline-day deals persist exactly three Gameweeks after either
close, and every Gameweek sits three or more days from a cutoff (ADR 0031).

### Presentation

A new section after the FPL-derived player context, one block per club:

```
Squad changes since 2 Feb 2026:

Spurs
In: Tonali (from Newcastle, £92.5m), Mateus Fernandes (from West Ham, £85m),
    Van Hecke (from Brighton, £52m), Senesi (from Bournemouth, free),
    Robertson (from Liverpool, free)
Out: Solomon (to West Ham, £5m)
```

Fee-descending, `free`/`undisclosed` after amounts, ties by date; `(loan)` where the
page says so; `none recorded` for an empty club; a stated absence when data is missing.
Exact wording fixed at freeze time, as spec 0007 fixed its line wording.

### Failure semantics

The Understat pattern exactly: loud validation failure at the fetch boundary, explicit
degradation at the build boundary, and no path by which missing Squad Change data blocks
a Prediction. A permanent Gap costs more than a missing section.

---

## Testing Decisions

A good test asserts external behaviour at an existing seam. This change touches three,
all established, none new:

- **The pure context builder** — data in, string out, asserted exactly. Prior art: the
  historical-context tests. Carries: hand-computed PPG lines including a promoted
  club's Championship figures; every Squad Change rendering (ordering, loan label,
  `none recorded`, stated absence); and the gate as a pure function of deadline against
  the frozen constants — GW5/GW6 and GW26/GW27 boundaries and GW19's one-day winter
  case asserted by arithmetic.
- **The fetch seam** — archived bytes in, stored rows or a named validation error out.
  Prior art: the Understat fetch tests and the archive-replay fixtures. The parser's
  fixture is a real archived copy of the Wikipedia page, pinned by checksum, so the
  test proves the published format; an unknown club spelling must fail naming the
  spelling; a re-fetch must replace only its own Gameweek partition.
- **The schema seam** — the two triggers refused by the database itself, asserted the
  way the FPL snapshot triggers are: a row observed at the Lock is refused, a deadline
  move across an existing partition is refused.

The existing contract test pins the frozen pair's SHA; it moves once, with this
amendment, and pre-flight (9/9, `ok: true`) is the final gate before the first Lock.
Parser internals, query shapes and builder structure are implementation details and are
not tested.

## Out of Scope

- **The FPL track's context.** `fpl/2026-27-v2` is untouched; giving its Entrants a
  Squad Change section is that version's own amendment under ADR 0026.
- **Player positions on Squad Change rows**, and any cross-source player-identity join.
- **transfermarkt-datasets, its Kaggle mirror, transfermarkt.com scraping, and
  API-Football** — rejected on evidence recorded in ADR 0031.
- **Free agents signed outside a window** once the gate is closed — a known, accepted
  loss; current form absorbs it.
- **Manager information, days rest, European fixtures, and `reference-elo`** — each a
  separate decision with its own unresolved source or provenance question; Elo is
  excluded from the context permanently by ADR 0018 and belongs on the Reference Line
  side.
- **Any digested signal** — ratings, normalisations, forecasts (ADR 0018).
- **Any change to Lock enforcement, Fill semantics, the scoring path or the prompt
  envelope.**

## Further Notes

**The deadline is the first Lock: 2026-08-21 17:30 UTC.** The gate constants and the
winter behaviour freeze with the amendment — winter cannot be added later without a v3,
which is why it is decided here (ADR 0026, ADR 0031).

**The winter close constant is customary, not published.** `2027-02-02` may drift by a
day or two when announced; every winter deadline sits three or more days from the
cutoff, so the drift changes nothing. If the announcement lands further than that,
re-run the boundary arithmetic before concluding anything.

**Cost is measured, not estimated.** The section is bounded (a busy window is a few
hundred tokens per club); read the real per-call figure from recorded attempts after
Gameweek 1, per spec 0003's rule.

**Document numbering must be checked at merge time.** Spec 0012 and ADRs 0030/0031
follow the tree this was drafted in; the 0016/0017 collision is the precedent for
renumbering before merge.
