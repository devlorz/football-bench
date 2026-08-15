# Squad Changes join the match context for 2026-27-v2

> Amended 2026-08-15 by ticket 7 of spec 0016, the ticket that took this to a second
> Competition. Everything below was written from the English page and describes it
> correctly. English Wikipedia publishes a country's transfer list in **two formats**, and
> Spain's shares none of the English one's structure: no wikitable, one section per club
> holding two `{{fs player}}` lists, and **no date column and no fee column anywhere on
> it**. Three sentences below are therefore English-only statements of fact rather than
> rules a second league broke:
>
> - "each fee row carrying its own BBC or club-site citation" — Spain's rows cite the
>   signing club, and they are not fee rows because there are no fees.
> - "A row is player, counterpart club, and fee exactly as the page states it" — **stands
>   exactly as written**, and for Spain what the page states is nothing, so the fee is
>   null and the line reads "fee not stated". The rule did the work; it is the page that
>   is different.
> - "ties by date" — Spain files no move under a date, so `dated_on` is null there
>   (migration 0027) and the order falls through to player and then counterpart club, by
>   code point. `window.since` would have fit the column and would have been this pipeline
>   asserting a date nobody published, which the fee rule above already refuses.
>
> Two things below are narrowed from one to per-Competition rather than changed: the
> **window** (Spain opened its 2026 summer on 1 July where England opened on 15 June, so
> the same June deadline gates one league and not the other) and the **alias table** (a
> flat one would resolve a club from the wrong country as confidently as from the right
> one). The 21-day gate, the frozen close dates, the membership rule, the pre-Lock
> triggers and the archive-every-response discipline are unchanged and apply to both.
>
> The text below stands as written and as decided. This records what a second country's
> page turned out to be, with the page in front of us; it is not a claim that the original
> meant this. If any of it is wrong, the code is what should move.

The first full Gameweek 1 run (local, 2026-08-12) produced ninety Predictions, and for
Brentford v Spurs all nine rationales reasoned from the squad that no longer exists: every
one cited the 17th-place finish and the old squad's injuries, and none mentioned any of the
five players signed over the summer — the context never told them. That silence is not a
neutral gap. The roster's dated releases span February to July 2026, straddling the summer
window, so a silent context lets a later-cutoff Base Model answer from pretraining while an
earlier one cannot. The difference ADR-0001 attributes to the Base Model alone stops being
that; it becomes a training-cutoff lottery. So the context states the window's ins and outs
for both clubs.

A **Squad Change** is a real club's **Signing** or **Departure** as the public record
states it (CONTEXT.md). The name is chosen against the glossary: a *Transfer* is the FPL
track's fantasy swap and a *Squad* is the fantasy fifteen, and this concept is neither — a
fact about a club, never an Entrant action.

## Source and pipeline

The source is English Wikipedia's per-window transfer list
(`List of English football transfers summer 2026`, winter's own page in January): raw
wikitext, one `curl`-able document per window, each fee row carrying its own BBC or
club-site citation inside the bytes. The daily fetch pulls it while the section renders and
archives every response byte-for-byte in `raw_snapshots` under
`wikipedia:squad-changes:<window>`, so provenance travels with the evidence. Club spellings
resolve through a pinned alias table on the Understat pattern: an unknown spelling is a
validation error naming it at fetch time, a stated absence at build time, and never a
blocked write path — a permanent Gap costs more than a missing section.

A row is player, counterpart club, and fee exactly as the page states it (`£92.5m`,
`free`, `undisclosed`); loans are included and labelled `(loan)`. No position field: that
would take fuzzy player-matching against `fpl_players`, and single-source rows keep the
parse honest. Rows are stored Gameweek-partitioned with `observed_at` under the same
pre-Lock triggers as `fpl_players` — the discipline migrations 0006 and 0007 paid for once
already.

## Membership and the render gate, decided separately

A Squad Change belongs to a **window**: everything dated since the previous window closed,
which is the pages' own scope (summer's opens 2 February 2026). Membership carries no
recency test — a June signing is as visible at the window's last render as at its first.

The section renders for a Gameweek iff its deadline is at most **21 days after the window
closes**, with the close dates frozen as constants: `2026-09-01` (published) and
`2027-02-02` (customary; unannounced at freeze). Against the stored deadlines that means
summer renders for Gameweeks 1-5 (GW5 is close +17, GW6 is +39) and winter through
Gameweek 26 (+18; GW27 is +25) — deadline-day deals stay visible for exactly three
Gameweeks after either close, and every boundary sits three or more days from the cutoff,
so a ±2-day drift in the winter announcement changes nothing.

## Presentation

Its own section after the FPL-derived player context, one block per club, `In:` and `Out:`
lines ordered by fee descending with `free`/`undisclosed` after, ties by date — the FPL
section's highest-priced ordering, not a new convention. An empty list renders
`none recorded`; missing data renders a stated absence.

Ships as one amendment to `match/2026-27-v2` with ADR-0030, under ADR-0026's boundary,
before Gameweek 1's Lock.

## Considered options

- **transfermarkt-datasets (and its Kaggle mirror)** was rejected on evidence, 2026-08-12:
  the 2026-08-05 refresh was missing three of the five Spurs signings outright, still
  placed Mateus Fernandes at West Ham, and carried a zero or empty fee on 91 of 100 summer
  arrivals at Premier League clubs, with loan returns indistinguishable from signings. A
  list that looks complete while missing most of the window is worse than no list.
- **Scraping transfermarkt.com directly** was rejected: the site blocks the fetcher, and a
  scraper in a scheduled workflow is a standing terms-of-service argument.
- **API-Football** was rejected: its transfer data is Transfermarkt-derived — the same
  staleness behind a new credential.
- **Recency-based membership** (changes within N days of the deadline) was rejected by
  arithmetic: N=45 at Gameweek 1 cuts at 7 July and hides all five Spurs signings — dated
  5 June to 6 July — on the first day the section exists for.
- **Hard-coded Gameweek sets** were rejected: winter's Gameweek numbers are not knowable
  at freeze, because blank and rescheduled Gameweeks shift them.
- **K=28** was rejected: winter would gain a fourth post-close Gameweek that summer does
  not get, and GW28 would sit two days from the cutoff against an unannounced close date.

## Consequences

- Gameweek 19's deadline (2 January) may fall a day inside the winter window; a
  near-empty winter section that early is the rule working, not a bug.
- A free agent signed outside a window is invisible once the gate closes — a known,
  accepted loss; current form absorbs it.
- Wikipedia is community-edited. Every fetch is archived byte-for-byte, and a Signing that
  never subsequently appears in the club's `fpl_players` partition is a standing
  cross-check that flags fabrication.
- The FPL track's context (`fpl/2026-27-v2`) is untouched; giving its Entrants the same
  section would be that version's own amendment under ADR-0026.
- Fee ordering is a mild ranking, accepted for consistency with the FPL section's price
  ordering rather than introduced as a new judgment.
